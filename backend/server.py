"""FieldCRM SaaS multi-tenant backend."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Query, Response, Body
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
import os
import io
import json
import uuid
import logging
import pandas as pd

from models import (
    Tenant, TenantTheme, TenantLabels, Plan, User, Attendance, LocationPing, Visit,
    SalesEntry, CollectionEntry, DCR, Enquiry, Product, Order, OrderItem, Notification,
    FileRecord, PlatformSettings, now_iso, gen_id,
    AreaNode, Role, LeaveRequest, Target, PERMISSION_MODULES,
    CustomField, CUSTOM_FIELD_MODULES, CUSTOM_FIELD_TYPES,
    Crop, AdvisoryEntry, SeasonalAdvisory, UserFavorite, RecentView,
    ADVISORY_TYPES,
    LegalDocument, LEGAL_KINDS,
    PushToken, PUSH_PLATFORMS,
    FirebaseProject, TenantFirebaseConfig, TenantFirebaseApp,
    FIREBASE_APP_PLATFORMS, FIREBASE_APP_MODES, FIREBASE_PROJECT_MAX_APPS,
)
from auth import (
    make_token, decode_token, get_current_user, require_roles,
    expected_otp, is_super_admin_phone, SUPER_ADMIN_PHONE, SUPER_ADMIN_OTP, DEMO_OTP,
    is_reviewer_phone, REVIEWER_PHONE, REVIEWER_TENANT_SLUG, set_session_validator,
)
import storage_util as storage
from seed import seed_all
import tenant_resolver
import s3_presign
import fcm_service
import firebase_provisioning


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("fieldcrm")


def require_env(keys: List[str]) -> None:
    """Fail fast if any required env var is missing or blank.

    Blocking startup here guarantees the container crashes visibly instead of
    booting with silent dev-defaults. See /app/documentation/environment-variables.md.
    """
    missing = [k for k in keys if not os.environ.get(k, "").strip()]
    if missing:
        msg = (
            "FATAL: missing required environment variables: "
            + ", ".join(missing)
            + ". Copy backend/.env.example → backend/.env and fill in values."
        )
        logger.error(msg)
        raise RuntimeError(msg)


require_env([
    "MONGO_URL",
    "DB_NAME",
    "JWT_SECRET",
    "JWT_ALGO",
    "JWT_TTL_HOURS",
    "CORS_ORIGINS",
    "APP_NAME",
    "SUPER_ADMIN_PHONE",
    "SUPER_ADMIN_OTP",
    "DEMO_OTP",
])

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="FieldCRM SaaS API")
api = APIRouter(prefix="/api")

# ---------------- Startup ----------------
async def ensure_indexes():
    """Create unique indexes so multi-worker seed races cannot produce duplicates."""
    await db.tenants.create_index("slug", unique=True)
    await db.tenants.create_index("id", unique=True)
    # Phase 2 — sparse unique index for custom_domain (nulls allowed).
    await db.tenants.create_index(
        "custom_domain",
        unique=True,
        partialFilterExpression={"custom_domain": {"$type": "string"}},
    )
    await db.plans.create_index("code", unique=True)
    await db.plans.create_index("id", unique=True)
    # Phone is unique WITHIN a tenant (super_admin has tenant_id=None so we allow one SA per phone)
    await db.users.create_index([("tenant_id", 1), ("phone", 1)], unique=True)
    await db.users.create_index("id", unique=True)
    await db.roles.create_index([("tenant_id", 1), ("name", 1)], unique=True)
    await db.areas.create_index("id", unique=True)
    await db.products.create_index("id", unique=True)
    await db.visits.create_index("id", unique=True)
    await db.sales.create_index("id", unique=True)
    await db.collections.create_index("id", unique=True)
    await db.orders.create_index("id", unique=True)
    await db.leaves.create_index("id", unique=True)
    await db.targets.create_index([("tenant_id", 1), ("user_id", 1), ("month", 1)], unique=True)
    await db.attendance.create_index([("tenant_id", 1), ("user_id", 1), ("date", 1)], unique=True)
    await db.locations.create_index([("tenant_id", 1), ("user_id", 1), ("timestamp", 1)])
    await db.custom_fields.create_index([("tenant_id", 1), ("module", 1), ("field_key", 1)], unique=True)
    await db.crops.create_index([("tenant_id", 1), ("name", 1)])
    await db.advisory_entries.create_index([("tenant_id", 1), ("type", 1)])
    await db.advisory_entries.create_index([("tenant_id", 1), ("crop_ids", 1)])
    await db.seasonal_advisories.create_index([("tenant_id", 1), ("is_published", 1)])
    await db.user_favorites.create_index([("user_id", 1), ("entity_id", 1)], unique=True)
    await db.recent_views.create_index([("user_id", 1), ("viewed_at", -1)])
    # Phase 3 — Legal docs: one row per (tenant, kind, version). Multiple versions allowed; latest published is served.
    await db.legal_docs.create_index([("tenant_id", 1), ("kind", 1), ("version", -1)])
    await db.legal_docs.create_index([("tenant_id", 1), ("kind", 1), ("is_published", 1)])
    # Phase 5 — Push tokens: dedupe by (user, token); look up by tenant for broadcasts.
    await db.push_tokens.create_index([("user_id", 1), ("token", 1)], unique=True)
    await db.push_tokens.create_index([("tenant_id", 1)])
    # Phase 8 — Per-tenant Firebase config + Firebase projects
    await db.firebase_projects.create_index("project_id", unique=True)
    await db.tenant_firebase_config.create_index("tenant_id", unique=True)


async def _hydrate_cloud_credentials():
    """Phase 8 — Load AWS credentials saved via Super Admin UI into the S3 module.
    Safe on empty DB — silently no-ops when no doc exists yet.
    """
    doc = await db.platform_settings.find_one({"key": "aws_credentials"})
    if not doc:
        return
    creds = doc.get("value") or {}
    if isinstance(creds, dict) and creds:
        s3_presign.apply_runtime_credentials({
            "AWS_ACCESS_KEY_ID": creds.get("aws_access_key_id", ""),
            "AWS_SECRET_ACCESS_KEY": creds.get("aws_secret_access_key", ""),
            "AWS_REGION": creds.get("aws_region", ""),
            "AWS_S3_BUCKET": creds.get("aws_bucket_name", ""),
            "AWS_PUBLIC_MEDIA_HOST": creds.get("aws_public_media_host", ""),
        })
        logger.info("AWS credentials loaded from DB (bucket=%s)", creds.get("aws_bucket_name"))


# Phase 4 — Session revocation: reject tokens issued before user.token_revoked_after.
async def _session_validator(payload: dict) -> None:
    uid = payload.get("sub")
    if not uid:
        return
    u = await db.users.find_one(
        {"id": uid},
        {"is_active": 1, "deleted_at": 1, "token_revoked_after": 1},
    )
    if not u:
        raise HTTPException(401, "User no longer exists")
    if u.get("deleted_at"):
        raise HTTPException(401, "Account deleted")
    if not u.get("is_active", True):
        raise HTTPException(401, "Account disabled")
    revoked_after = u.get("token_revoked_after")
    iat = payload.get("iat")
    if revoked_after and iat:
        # `iat` is a numeric Unix timestamp per PyJWT; convert revoked_after ISO → epoch.
        try:
            from datetime import datetime as _dt
            rev_ts = _dt.fromisoformat(revoked_after.replace("Z", "+00:00")).timestamp()
            iat_ts = float(iat) if not isinstance(iat, (int, float)) else iat
            if iat_ts < rev_ts:
                raise HTTPException(401, "Session revoked, please sign in again")
        except HTTPException:
            raise
        except Exception:
            # Malformed timestamps should never silently allow access.
            raise HTTPException(401, "Session state invalid")


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    set_session_validator(_session_validator)  # Phase 4 — attach revocation check to all Bearer requests.
    await _hydrate_cloud_credentials()  # Phase 8 — load AWS keys from DB if present.
    try:
        await seed_all(db)
    except Exception as e:
        # Race conditions during multi-worker seeding are expected; duplicates are rejected by unique indexes.
        logger.warning(f"Seed skipped/partial: {e}")
    try:
        storage.init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.warning(f"Storage init deferred: {e}")
    logger.info("FieldCRM API ready")


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------------- Helpers ----------------
def clean(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc.pop("_id")
    return doc


async def resolve_tenant_by_slug(slug: str) -> dict:
    t = await db.tenants.find_one({"slug": slug, "is_active": True})
    if not t:
        # Phase 2 — self-heal signal: a machine-readable code lets the frontend
        # detect a stale localStorage slug and redirect to landing/root.
        raise HTTPException(404, detail={"code": "tenant_not_found", "message": "Tenant not found or inactive"})
    return clean(t)


async def current_tenant_id(user: dict, x_tenant_slug: Optional[str] = None) -> str:
    """For super admin: tenant id resolved from header. For others: from JWT."""
    if user.get("role") == "super_admin":
        if not x_tenant_slug:
            raise HTTPException(400, "X-Tenant-Slug header required")
        t = await resolve_tenant_by_slug(x_tenant_slug)
        return t["id"]
    tid = user.get("tid")
    if not tid:
        raise HTTPException(400, "Missing tenant in token")
    return tid


# ---------------- Auth ----------------
class OtpRequestIn(BaseModel):
    phone: str
    tenant_slug: Optional[str] = None
    channel: str = "sms"
    role_hint: Optional[str] = None  # "customer" for shop login


class OtpVerifyIn(BaseModel):
    phone: str
    otp: str
    tenant_slug: Optional[str] = None
    role_hint: Optional[str] = None


@api.post("/auth/request-otp")
async def request_otp(payload: OtpRequestIn):
    phone = payload.phone.strip()
    if not phone or len(phone) < 6:
        raise HTTPException(400, "Invalid phone")
    is_sa = is_super_admin_phone(phone)
    # For MVP: just log and return (frontend shows mock OTP)
    otp = expected_otp(phone)
    logger.info(f"[MOCK OTP] phone={phone} otp={otp} channel={payload.channel}")
    return {
        "ok": True,
        "is_super_admin": is_sa,
        "mock_otp": otp,  # exposed in MVP so users can see it on screen
        "channel": payload.channel,
        "message": "OTP sent (mock).",
    }


@api.post("/auth/verify-otp")
async def verify_otp(payload: OtpVerifyIn):
    phone = payload.phone.strip()
    if payload.otp != expected_otp(phone):
        raise HTTPException(401, "Invalid OTP")

    # Super admin path
    if is_super_admin_phone(phone):
        sa = await db.users.find_one({"phone": phone, "role": "super_admin"})
        if not sa:
            raise HTTPException(404, "Super admin not provisioned")
        sa = clean(sa)
        token = make_token(sa["id"], None, "super_admin", phone)
        return {"token": token, "user": sa, "tenant": None}

    # Phase 4 — Universal reviewer bypass (App Store / Play Store).
    # The reviewer number always logs into the demo tenant as a tenant_admin.
    # The seeded user is fetched (or created idempotently) here to keep the
    # reviewer experience identical across environments.
    if is_reviewer_phone(phone):
        rt = await db.tenants.find_one({"slug": REVIEWER_TENANT_SLUG, "is_active": True})
        if not rt:
            raise HTTPException(503, "Reviewer tenant not provisioned")
        rt = clean(rt)
        ru = await db.users.find_one({"phone": REVIEWER_PHONE, "tenant_id": rt["id"]})
        if not ru:
            reviewer = User(
                tenant_id=rt["id"], phone=REVIEWER_PHONE, name="App Store Reviewer",
                role="tenant_admin", is_active=True, email="reviewer@localappstore.in",
            )
            await db.users.insert_one(reviewer.model_dump())
            ru = reviewer.model_dump()
        else:
            # If a prior soft-delete happened, un-delete reviewer (App Store re-audits happen).
            if ru.get("deleted_at") or not ru.get("is_active", True):
                await db.users.update_one(
                    {"id": ru["id"]},
                    {"$set": {"deleted_at": None, "is_active": True, "token_revoked_after": None, "updated_at": now_iso()}},
                )
                ru = await db.users.find_one({"id": ru["id"]})
        ru = clean(ru)
        token = make_token(ru["id"], rt["id"], ru["role"], phone)
        return {"token": token, "user": ru, "tenant": rt}

    # Tenant user path
    if not payload.tenant_slug:
        raise HTTPException(400, "tenant_slug required")
    tenant = await resolve_tenant_by_slug(payload.tenant_slug)

    role_filter: Dict[str, Any] = {"phone": phone, "tenant_id": tenant["id"]}
    hint = payload.role_hint
    if hint in ("customer", "dealer"):
        role_filter["role"] = hint
    else:
        role_filter["role"] = {"$in": ["tenant_admin", "manager", "employee"]}

    user = await db.users.find_one(role_filter)
    if not user:
        # Auto-register customer (Farmer) self-registration
        if hint == "customer":
            # Guard against a same-phone collision with a different role (e.g. dealer).
            # Without this, insert_one hits the (tenant_id, phone) unique index and 500s.
            clash = await db.users.find_one({"tenant_id": tenant["id"], "phone": phone})
            if clash:
                raise HTTPException(
                    409,
                    detail={
                        "code": "phone_role_conflict",
                        "message": "This phone is already registered in this tenant under a different role. Please use the correct login tab.",
                        "existing_role": clash.get("role"),
                    },
                )
            new_user = User(tenant_id=tenant["id"], phone=phone, name=f"Customer {phone[-4:]}",
                            role="customer", is_active=True)
            await db.users.insert_one(new_user.model_dump())
            user = new_user.model_dump()
        else:
            raise HTTPException(404, "User not found in this tenant. Ask your admin to add you.")
    user = clean(user)
    if not user.get("is_active", True):
        raise HTTPException(403, "User disabled")
    token = make_token(user["id"], tenant["id"], user["role"], phone)
    return {"token": token, "user": user, "tenant": tenant}


@api.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["sub"]})
    if not u:
        raise HTTPException(404, "User not found")
    u = clean(u)
    tenant = None
    if u.get("tenant_id"):
        t = await db.tenants.find_one({"id": u["tenant_id"]})
        tenant = clean(t) if t else None
    return {"user": u, "tenant": tenant}


# ---------------- Public: Tenant lookup ----------------
@api.get("/public/tenants/by-slug/{slug}")
async def public_tenant(slug: str):
    t = await db.tenants.find_one({"slug": slug, "is_active": True})
    if not t:
        # Phase 2 — self-heal: match resolve_tenant_by_slug so frontend can detect stale slugs uniformly.
        raise HTTPException(404, detail={"code": "tenant_not_found", "message": "Tenant not found or inactive"})
    t = clean(t)
    # Only return public-safe fields
    return {
        "id": t["id"],
        "slug": t["slug"],
        "name": t["name"],
        "business_type": t.get("business_type"),
        "logo_path": t.get("logo_path"),
        "theme": t.get("theme"),
        "labels": t.get("labels"),
        "default_language": t.get("default_language", "en"),
    }


@api.get("/public/demo-credentials")
async def demo_creds():
    """Expose demo credentials so the login screen can render quick-login chips."""
    return {
        "super_admin": {"phone": SUPER_ADMIN_PHONE, "otp": SUPER_ADMIN_OTP},
        "demo_tenant": "demo",
        "demo_otp": DEMO_OTP,
        "users": [
            {"label": "Tenant Admin", "phone": "9000000001", "role": "tenant_admin"},
            {"label": "Manager", "phone": "9000000002", "role": "manager"},
            {"label": "Employee", "phone": "9000000003", "role": "employee"},
            {"label": "Dealer", "phone": "9000000004", "role": "dealer"},
            {"label": "Customer (Farmer)", "phone": "9000000007", "role": "customer"},
        ],
    }


# ---------------- Phase 2: Subdomain / custom-domain resolver ----------------
@api.get("/public/tenant-resolve")
async def public_tenant_resolve(
    host: Optional[str] = Query(None, description="Hostname to resolve; falls back to X-Forwarded-Host / Host headers."),
    x_forwarded_host: Optional[str] = Header(None, alias="X-Forwarded-Host"),
    request_host: Optional[str] = Header(None, alias="Host"),
):
    """Resolve a tenant from a Host header, custom_domain, or `<slug>.<ROOT_DOMAIN>`.

    Used by the frontend on boot to auto-select the tenant based on the current URL
    without requiring the user to type a slug or click a landing tile.

    Response shape:
        { "tenant": { public_view } | null,
          "matched_by": "custom_domain" | "subdomain" | null,
          "host": "<normalized host>",
          "root_domain": "<configured root>" }
    """
    raw = host or x_forwarded_host or request_host or ""
    normalized = tenant_resolver.normalize_host(raw)
    root = (os.environ.get("ROOT_DOMAIN") or "").strip().lower()
    result = await tenant_resolver.resolve_tenant_from_host(db, normalized)
    matched_by: Optional[str] = None
    if result:
        if result.get("custom_domain") and result["custom_domain"] == normalized:
            matched_by = "custom_domain"
        elif tenant_resolver.parse_host_to_slug(normalized, root) == result.get("slug"):
            matched_by = "subdomain"
    return {
        "tenant": result,
        "matched_by": matched_by,
        "host": normalized,
        "root_domain": root or None,
    }


# ---------------- Super Admin: Tenants & Plans ----------------
@api.get("/super/tenants")
async def list_tenants(user: dict = Depends(require_roles("super_admin"))):
    docs = await db.tenants.find().sort("created_at", -1).to_list(1000)
    out = []
    for t in docs:
        t = clean(t)
        # Stats
        emp_count = await db.users.count_documents({"tenant_id": t["id"], "role": {"$in": ["employee", "manager"]}})
        dealer_count = await db.users.count_documents({"tenant_id": t["id"], "role": "dealer"})
        customer_count = await db.users.count_documents({"tenant_id": t["id"], "role": "customer"})
        t["stats"] = {"employees": emp_count, "dealers": dealer_count, "customers": customer_count}
        out.append(t)
    return out


class TenantIn(BaseModel):
    slug: str
    name: str
    business_type: str = "Agriculture"
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    plan_id: Optional[str] = None
    primary: str = "#2C5E43"
    secondary: str = "#D35400"
    customer_label: str = "Customer"
    dealer_label: str = "Dealer"
    default_language: str = "en"
    admin_phone: Optional[str] = None
    admin_name: Optional[str] = None
    logo_path: Optional[str] = None  # Phase 9 — uploaded via /api/files/upload before this call


@api.post("/super/tenants")
async def create_tenant(payload: TenantIn, user: dict = Depends(require_roles("super_admin"))):
    if await db.tenants.find_one({"slug": payload.slug}):
        raise HTTPException(400, "Slug already exists")
    t = Tenant(
        slug=payload.slug.lower(),
        name=payload.name,
        business_type=payload.business_type,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        address=payload.address,
        plan_id=payload.plan_id,
        logo_path=payload.logo_path,
        plan_status="active",
        trial_ends_at=(datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        theme=TenantTheme(primary=payload.primary, secondary=payload.secondary,
                          primary_hover=payload.primary),
        labels=TenantLabels(
            customer=payload.customer_label,
            customer_plural=payload.customer_label + "s",
            dealer=payload.dealer_label,
            dealer_plural=payload.dealer_label + "s",
        ),
        default_language=payload.default_language,
    )
    # Phase 5 — Auto-assign a Firebase shard (round-robin, capacity 15).
    shard_counts_agg = await db.tenants.aggregate([
        {"$group": {"_id": "$fcm_shard_id", "n": {"$sum": 1}}},
    ]).to_list(100)
    shard_counts = {int(x["_id"] or 1): int(x["n"]) for x in shard_counts_agg if x["_id"] is not None}
    t.fcm_shard_id = fcm_service.pick_shard_for_new_tenant(shard_counts)
    await db.tenants.insert_one(t.model_dump())
    # Auto create admin user
    if payload.admin_phone:
        admin = User(tenant_id=t.id, phone=payload.admin_phone, role="tenant_admin",
                     name=payload.admin_name or "Admin")
        await db.users.insert_one(admin.model_dump())
    return clean(t.model_dump())


class TenantUpdateIn(BaseModel):
    name: Optional[str] = None
    business_type: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    plan_id: Optional[str] = None
    plan_status: Optional[str] = None
    is_active: Optional[bool] = None
    google_maps_api_key: Optional[str] = None
    order_approval_flow: Optional[str] = None
    catalog_mode: Optional[str] = None
    features: Optional[Dict[str, bool]] = None
    logo_path: Optional[str] = None  # Phase 9


@api.patch("/super/tenants/{tenant_id}")
async def update_tenant_super(tenant_id: str, payload: TenantUpdateIn,
                              user: dict = Depends(require_roles("super_admin"))):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    res = await db.tenants.update_one({"id": tenant_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Tenant not found")
    t = await db.tenants.find_one({"id": tenant_id})
    tenant_resolver.invalidate_all()
    return clean(t)


@api.delete("/super/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, user: dict = Depends(require_roles("super_admin"))):
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"is_active": False, "updated_at": now_iso()}})
    tenant_resolver.invalidate_all()
    return {"ok": True}


@api.get("/super/plans")
async def list_plans_super(user: dict = Depends(require_roles("super_admin"))):
    docs = await db.plans.find().to_list(100)
    return [clean(d) for d in docs]


class PlanIn(BaseModel):
    name: str
    code: str
    price_monthly: float = 0
    price_yearly: float = 0
    max_employees: int = 10
    max_managers: int = 2
    max_dealers: int = 100
    max_products: int = 100
    storage_mb: int = 500
    gps_tracking: bool = True
    reports_enabled: bool = True
    push_notifications: bool = True
    customer_app_enabled: bool = True
    is_active: bool = True


@api.post("/super/plans")
async def create_plan(payload: PlanIn, user: dict = Depends(require_roles("super_admin"))):
    p = Plan(**payload.model_dump())
    await db.plans.insert_one(p.model_dump())
    return clean(p.model_dump())


@api.patch("/super/plans/{plan_id}")
async def update_plan(plan_id: str, payload: PlanIn, user: dict = Depends(require_roles("super_admin"))):
    await db.plans.update_one({"id": plan_id}, {"$set": payload.model_dump()})
    p = await db.plans.find_one({"id": plan_id})
    return clean(p)


@api.delete("/super/plans/{plan_id}")
async def delete_plan(plan_id: str, user: dict = Depends(require_roles("super_admin"))):
    await db.plans.delete_one({"id": plan_id})
    return {"ok": True}


@api.get("/super/analytics")
async def super_analytics(user: dict = Depends(require_roles("super_admin"))):
    total_tenants = await db.tenants.count_documents({})
    active_tenants = await db.tenants.count_documents({"is_active": True})
    total_users = await db.users.count_documents({})
    total_orders = await db.orders.count_documents({})
    total_visits = await db.visits.count_documents({})
    plans_count = await db.plans.count_documents({"is_active": True})
    return {
        "totals": {
            "tenants": total_tenants,
            "active_tenants": active_tenants,
            "users": total_users,
            "orders": total_orders,
            "visits": total_visits,
            "plans": plans_count,
        }
    }


# ---------------- Super Admin: Platform Settings ----------------
@api.get("/super/settings")
async def get_settings(user: dict = Depends(require_roles("super_admin"))):
    s = await db.platform_settings.find_one({"id": "platform"})
    if not s:
        s = PlatformSettings().model_dump()
        await db.platform_settings.insert_one(s)
    return clean(s)


class SettingsIn(BaseModel):
    aws_s3_enabled: Optional[bool] = None
    aws_s3_bucket: Optional[str] = None
    aws_s3_region: Optional[str] = None
    aws_s3_access_key: Optional[str] = None
    aws_s3_secret_key: Optional[str] = None
    sms_provider: Optional[str] = None
    sms_api_key: Optional[str] = None
    sms_sender_id: Optional[str] = None
    whatsapp_enabled: Optional[bool] = None


@api.patch("/super/settings")
async def update_settings(payload: SettingsIn, user: dict = Depends(require_roles("super_admin"))):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.platform_settings.update_one({"id": "platform"}, {"$set": updates}, upsert=True)
    s = await db.platform_settings.find_one({"id": "platform"})
    return clean(s)


# ---------------- Tenant Admin: Tenant branding / labels ----------------
@api.get("/tenant/profile")
async def tenant_profile(user: dict = Depends(require_roles("tenant_admin", "manager", "employee", "customer", "dealer"))):
    t = await db.tenants.find_one({"id": user["tid"]})
    if not t:
        raise HTTPException(404, "Tenant not found")
    return clean(t)


class TenantBrandIn(BaseModel):
    name: Optional[str] = None
    business_type: Optional[str] = None
    theme: Optional[Dict[str, str]] = None
    labels: Optional[Dict[str, str]] = None
    default_language: Optional[str] = None
    logo_path: Optional[str] = None
    google_maps_api_key: Optional[str] = None
    order_approval_flow: Optional[str] = None
    catalog_mode: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    custom_domain: Optional[str] = None  # Phase 2 — subdomain routing


@api.patch("/tenant/profile")
async def update_tenant_profile(payload: TenantBrandIn, user: dict = Depends(require_roles("tenant_admin"))):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    # Phase 2: normalize custom_domain (lowercase, strip). Additive; never rejects.
    if "custom_domain" in updates:
        cd = (updates["custom_domain"] or "").strip().lower()
        updates["custom_domain"] = cd or None
        if cd:
            # Enforce uniqueness — a domain may only bind to one tenant.
            clash = await db.tenants.find_one({"custom_domain": cd, "id": {"$ne": user["tid"]}})
            if clash:
                raise HTTPException(409, "custom_domain already in use by another tenant")
    updates["updated_at"] = now_iso()
    await db.tenants.update_one({"id": user["tid"]}, {"$set": updates})
    t = await db.tenants.find_one({"id": user["tid"]})
    # Bust resolver cache — any host bound to this tenant becomes stale.
    tenant_resolver.invalidate_all()
    return clean(t)


# ---------------- Users (employees / managers / customers within tenant) ----------------
class UserIn(BaseModel):
    phone: str
    name: str
    role: str  # tenant_admin | manager | employee | dealer | customer
    email: Optional[str] = None
    employee_code: Optional[str] = None
    manager_id: Optional[str] = None
    area: Optional[str] = None
    role_id: Optional[str] = None
    area_node_id: Optional[str] = None
    business_name: Optional[str] = None
    dealer_code: Optional[str] = None
    address: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    gst_number: Optional[str] = None
    assigned_employee_id: Optional[str] = None
    credit_limit: float = 0
    outstanding_amount: float = 0
    farm_size_acres: Optional[float] = None
    crops: Optional[str] = None
    custom_data: Dict[str, Any] = {}


def _user_query(role_filter, tenant_id):
    q: Dict[str, Any] = {"tenant_id": tenant_id}
    if role_filter:
        q["role"] = role_filter if isinstance(role_filter, str) else {"$in": role_filter}
    return q


@api.get("/tenant/users")
async def list_users(role: Optional[str] = None,
                     manager_id: Optional[str] = None,
                     assigned_employee_id: Optional[str] = None,
                     user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if role:
        q["role"] = {"$in": role.split(",")} if "," in role else role
    if manager_id:
        q["manager_id"] = manager_id
    if assigned_employee_id:
        q["assigned_employee_id"] = assigned_employee_id
    # Manager can only see own team
    if user["role"] == "manager":
        q["$or"] = [{"manager_id": user["sub"]}, {"id": user["sub"]}]
    docs = await db.users.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]


@api.post("/tenant/users")
async def create_user(payload: UserIn, user: dict = Depends(require_roles("tenant_admin"))):
    # phone unique within tenant
    if await db.users.find_one({"tenant_id": user["tid"], "phone": payload.phone}):
        raise HTTPException(400, "Phone already exists in this tenant")
    u = User(tenant_id=user["tid"], **payload.model_dump())
    await db.users.insert_one(u.model_dump())
    return clean(u.model_dump())


@api.patch("/tenant/users/{user_id}")
async def update_user(user_id: str, payload: UserIn, user: dict = Depends(require_roles("tenant_admin"))):
    updates = payload.model_dump()
    await db.users.update_one({"id": user_id, "tenant_id": user["tid"]}, {"$set": updates})
    u = await db.users.find_one({"id": user_id})
    return clean(u)


@api.delete("/tenant/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_roles("tenant_admin"))):
    await db.users.update_one({"id": user_id, "tenant_id": user["tid"]}, {"$set": {"is_active": False}})
    return {"ok": True}


# Self profile update for customers/dealers (used by shop PWA self-signup)
class SelfProfileIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    business_name: Optional[str] = None
    address: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    gst_number: Optional[str] = None
    farm_size_acres: Optional[float] = None
    crops: Optional[str] = None
    my_crops: Optional[List[str]] = None
    custom_data: Optional[Dict[str, Any]] = None
    dealer_code: Optional[str] = None


@api.patch("/me/profile")
async def update_my_profile(payload: SelfProfileIn, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    # Server-side validation of required visible_to_customer custom fields
    if updates.get("custom_data") is not None and user.get("role") in ("customer", "dealer"):
        module = "customer" if user["role"] == "customer" else "dealer"
        req_fields = await db.custom_fields.find({
            "tenant_id": user["tid"], "module": module,
            "is_active": True, "required": True, "visible_to_customer": True,
        }).to_list(200)
        cd = updates["custom_data"]
        for f in req_fields:
            v = cd.get(f["field_key"])
            empty = v is None or v == "" or (isinstance(v, list) and len(v) == 0)
            if empty:
                raise HTTPException(400, f"'{f['label']}' is required")
    await db.users.update_one({"id": user["sub"]}, {"$set": updates})
    u = await db.users.find_one({"id": user["sub"]})
    return clean(u)


# ---------------- Products ----------------
class ProductIn(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    use_case: Optional[str] = None
    suitable_for: Optional[str] = None
    dosage: Optional[str] = None
    packing: Optional[str] = None
    mrp: float = 0
    price: float = 0
    stock: Optional[int] = None
    image_path: Optional[str] = None
    is_active: bool = True
    custom_data: Dict[str, Any] = {}


@api.get("/tenant/products")
async def list_products(q: Optional[str] = None,
                        category: Optional[str] = None,
                        user: dict = Depends(require_roles("tenant_admin", "manager", "employee", "customer", "dealer"))):
    query: Dict[str, Any] = {"tenant_id": user["tid"], "is_active": True}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    if category:
        query["category"] = category
    docs = await db.products.find(query).sort("name", 1).to_list(2000)
    return [clean(d) for d in docs]


@api.post("/tenant/products")
async def create_product(payload: ProductIn, user: dict = Depends(require_roles("tenant_admin"))):
    p = Product(tenant_id=user["tid"], **payload.model_dump())
    await db.products.insert_one(p.model_dump())
    return clean(p.model_dump())


@api.patch("/tenant/products/{pid}")
async def update_product(pid: str, payload: ProductIn, user: dict = Depends(require_roles("tenant_admin"))):
    await db.products.update_one({"id": pid, "tenant_id": user["tid"]}, {"$set": payload.model_dump()})
    p = await db.products.find_one({"id": pid})
    return clean(p)


@api.delete("/tenant/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_roles("tenant_admin"))):
    await db.products.update_one({"id": pid, "tenant_id": user["tid"]}, {"$set": {"is_active": False}})
    return {"ok": True}


# ---------------- Attendance ----------------
class CheckInIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    photo_path: Optional[str] = None


@api.post("/employee/checkin")
async def check_in(payload: CheckInIn, user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.attendance.find_one({"tenant_id": user["tid"], "user_id": user["sub"], "date": today})
    if existing and existing.get("check_in_at"):
        raise HTTPException(400, "Already checked in today")
    udoc = await db.users.find_one({"id": user["sub"]})
    rec = Attendance(
        tenant_id=user["tid"], user_id=user["sub"],
        user_name=(udoc or {}).get("name", ""),
        date=today,
        check_in_at=now_iso(),
        check_in_lat=payload.lat, check_in_lng=payload.lng,
        check_in_address=payload.address, check_in_photo_path=payload.photo_path,
    )
    await db.attendance.insert_one(rec.model_dump())
    return clean(rec.model_dump())


class CheckOutIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None


@api.post("/employee/checkout")
async def check_out(payload: CheckOutIn, user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rec = await db.attendance.find_one({"tenant_id": user["tid"], "user_id": user["sub"], "date": today})
    if not rec:
        raise HTTPException(400, "Check in first")
    await db.attendance.update_one(
        {"id": rec["id"]},
        {"$set": {
            "check_out_at": now_iso(),
            "check_out_lat": payload.lat,
            "check_out_lng": payload.lng,
            "check_out_address": payload.address,
        }})
    out = await db.attendance.find_one({"id": rec["id"]})
    return clean(out)


@api.get("/employee/attendance/today")
async def my_today_attendance(user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rec = await db.attendance.find_one({"tenant_id": user["tid"], "user_id": user["sub"], "date": today})
    return clean(rec) if rec else None


@api.get("/attendance")
async def list_attendance(user_id: Optional[str] = None,
                          date: Optional[str] = None,
                          date_from: Optional[str] = None,
                          date_to: Optional[str] = None,
                          user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if user["role"] == "employee":
        q["user_id"] = user["sub"]
    elif user_id:
        q["user_id"] = user_id
    if date:
        q["date"] = date
    elif date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        q["date"] = date_q
    docs = await db.attendance.find(q).sort("date", -1).to_list(2000)
    return [clean(d) for d in docs]


# ---------------- Location Ping ----------------
class LocationPingIn(BaseModel):
    lat: float
    lng: float


@api.post("/employee/location")
async def ping_location(payload: LocationPingIn, user: dict = Depends(require_roles("employee", "manager"))):
    lp = LocationPing(tenant_id=user["tid"], user_id=user["sub"], lat=payload.lat, lng=payload.lng)
    await db.locations.insert_one(lp.model_dump())
    return {"ok": True}


@api.get("/locations")
async def list_locations(user_id: str, date: Optional[str] = None,
                         user: dict = Depends(require_roles("tenant_admin", "manager"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"], "user_id": user_id}
    if date:
        # filter by date prefix
        q["timestamp"] = {"$regex": f"^{date}"}
    docs = await db.locations.find(q).sort("timestamp", 1).to_list(5000)
    return [clean(d) for d in docs]


# ---------------- Visits ----------------
class VisitIn(BaseModel):
    party_type: str = "dealer"  # dealer | customer
    dealer_id: Optional[str] = None
    dealer_name: str = ""
    dealer_code: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: str = ""
    visit_date: str
    visit_time: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    orders_discussion: Optional[str] = None
    collection_discussion: Optional[str] = None
    next_followup_date: Optional[str] = None
    photo_path: Optional[str] = None
    remarks: Optional[str] = None
    custom_data: Dict[str, Any] = {}


@api.post("/visits")
async def create_visit(payload: VisitIn, user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    udoc = await db.users.find_one({"id": user["sub"]})
    v = Visit(tenant_id=user["tid"], employee_id=user["sub"],
              employee_name=(udoc or {}).get("name", ""), **payload.model_dump())
    await db.visits.insert_one(v.model_dump())
    return clean(v.model_dump())


@api.get("/visits")
async def list_visits(employee_id: Optional[str] = None, dealer_id: Optional[str] = None,
                      customer_id: Optional[str] = None,
                      party_type: Optional[str] = None,
                      date_from: Optional[str] = None, date_to: Optional[str] = None,
                      user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if user["role"] == "employee":
        q["employee_id"] = user["sub"]
    elif employee_id:
        q["employee_id"] = employee_id
    if dealer_id:
        q["dealer_id"] = dealer_id
    if customer_id:
        q["customer_id"] = customer_id
    if party_type:
        q["party_type"] = party_type
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        q["visit_date"] = date_q
    docs = await db.visits.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]


# ---------------- Sales / Collections / DCR / Enquiry ----------------
class SalesIn(BaseModel):
    dealer_id: Optional[str] = None
    dealer_name: str = ""
    product_id: Optional[str] = None
    product_name: str = ""
    quantity: float = 0
    unit_price: float = 0
    value: float = 0
    sale_date: str
    remarks: Optional[str] = None


@api.post("/sales")
async def create_sale(payload: SalesIn, user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    udoc = await db.users.find_one({"id": user["sub"]})
    s = SalesEntry(tenant_id=user["tid"], employee_id=user["sub"],
                   employee_name=(udoc or {}).get("name", ""), **payload.model_dump())
    if not s.value and s.quantity and s.unit_price:
        s.value = s.quantity * s.unit_price
    await db.sales.insert_one(s.model_dump())
    return clean(s.model_dump())


@api.get("/sales")
async def list_sales(employee_id: Optional[str] = None, dealer_id: Optional[str] = None,
                     date_from: Optional[str] = None, date_to: Optional[str] = None,
                     user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if user["role"] == "employee":
        q["employee_id"] = user["sub"]
    elif employee_id:
        q["employee_id"] = employee_id
    if dealer_id:
        q["dealer_id"] = dealer_id
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        q["sale_date"] = date_q
    docs = await db.sales.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]


class CollectionIn(BaseModel):
    dealer_id: Optional[str] = None
    dealer_name: str = ""
    amount: float
    collection_date: str
    payment_mode: str = "Cash"
    transaction_ref: Optional[str] = None
    remarks: Optional[str] = None
    receipt_photo_path: Optional[str] = None


@api.post("/collections")
async def create_collection(payload: CollectionIn,
                             user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    udoc = await db.users.find_one({"id": user["sub"]})
    c = CollectionEntry(tenant_id=user["tid"], employee_id=user["sub"],
                        employee_name=(udoc or {}).get("name", ""), **payload.model_dump())
    await db.collections.insert_one(c.model_dump())
    # Reduce dealer outstanding
    if c.dealer_id:
        await db.users.update_one({"id": c.dealer_id, "tenant_id": user["tid"]},
                                  {"$inc": {"outstanding_amount": -c.amount}})
    return clean(c.model_dump())


@api.get("/collections")
async def list_collections(employee_id: Optional[str] = None, dealer_id: Optional[str] = None,
                           payment_mode: Optional[str] = None,
                           date_from: Optional[str] = None, date_to: Optional[str] = None,
                           user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if user["role"] == "employee":
        q["employee_id"] = user["sub"]
    elif employee_id:
        q["employee_id"] = employee_id
    if dealer_id:
        q["dealer_id"] = dealer_id
    if payment_mode:
        q["payment_mode"] = payment_mode
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        q["collection_date"] = date_q
    docs = await db.collections.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]


class DCRIn(BaseModel):
    date: str
    area_covered: Optional[str] = None
    dealers_visited: int = 0
    customers_met: int = 0
    orders_booked: int = 0
    collections_made: float = 0
    remarks: Optional[str] = None


@api.post("/dcr")
async def create_dcr(payload: DCRIn, user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    udoc = await db.users.find_one({"id": user["sub"]})
    d = DCR(tenant_id=user["tid"], employee_id=user["sub"],
            employee_name=(udoc or {}).get("name", ""), **payload.model_dump())
    await db.dcr.insert_one(d.model_dump())
    return clean(d.model_dump())


@api.get("/dcr")
async def list_dcr(employee_id: Optional[str] = None, date_from: Optional[str] = None,
                   date_to: Optional[str] = None,
                   user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if user["role"] == "employee":
        q["employee_id"] = user["sub"]
    elif employee_id:
        q["employee_id"] = employee_id
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        q["date"] = date_q
    docs = await db.dcr.find(q).sort("date", -1).to_list(2000)
    return [clean(d) for d in docs]


class EnquiryIn(BaseModel):
    customer_id: Optional[str] = None  # optional link to Farmer user record
    customer_name: str
    mobile: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    photo_path: Optional[str] = None
    assigned_employee_id: Optional[str] = None
    source: str = "tenant"
    custom_data: Dict[str, Any] = {}


@api.post("/enquiries")
async def create_enquiry(payload: EnquiryIn,
                          user: dict = Depends(require_roles("employee", "manager", "tenant_admin", "customer"))):
    assigned_name = None
    if payload.assigned_employee_id:
        emp = await db.users.find_one({"id": payload.assigned_employee_id})
        assigned_name = emp.get("name") if emp else None
    e = Enquiry(tenant_id=user["tid"], created_by=user["sub"],
                assigned_employee_name=assigned_name, **payload.model_dump())
    if user["role"] == "customer":
        e.source = "customer"
        # Enquiry from a customer PWA -> link to their own user record
        if not e.customer_id:
            e.customer_id = user["sub"]
    await db.enquiries.insert_one(e.model_dump())
    return clean(e.model_dump())


@api.get("/enquiries")
async def list_enquiries(status: Optional[str] = None,
                         assigned_employee_id: Optional[str] = None,
                         user: dict = Depends(require_roles("tenant_admin", "manager", "employee", "customer"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if user["role"] == "employee":
        q["$or"] = [{"assigned_employee_id": user["sub"]}, {"created_by": user["sub"]}]
    elif user["role"] == "customer":
        q["created_by"] = user["sub"]
    elif assigned_employee_id:
        q["assigned_employee_id"] = assigned_employee_id
    if status:
        q["status"] = status
    docs = await db.enquiries.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]


class EnquiryPatch(BaseModel):
    status: Optional[str] = None
    assigned_employee_id: Optional[str] = None
    followup_notes: Optional[str] = None


@api.patch("/enquiries/{eid}")
async def patch_enquiry(eid: str, payload: EnquiryPatch,
                        user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if payload.assigned_employee_id:
        emp = await db.users.find_one({"id": payload.assigned_employee_id})
        if emp:
            updates["assigned_employee_name"] = emp.get("name")
    await db.enquiries.update_one({"id": eid, "tenant_id": user["tid"]}, {"$set": updates})
    e = await db.enquiries.find_one({"id": eid})
    return clean(e)


# ---------------- Orders (Customer/Dealer ordering) ----------------
class OrderItemIn(BaseModel):
    product_id: str
    quantity: float


class OrderIn(BaseModel):
    items: List[OrderItemIn]
    remarks: Optional[str] = None
    expected_delivery_date: Optional[str] = None


@api.post("/orders")
async def create_order(payload: OrderIn, user: dict = Depends(require_roles("customer", "dealer"))):
    if not payload.items:
        raise HTTPException(400, "Order must have items")
    tenant = await db.tenants.find_one({"id": user["tid"]})
    if (tenant or {}).get("catalog_mode") == "enquiry_only":
        raise HTTPException(400, "This tenant only accepts enquiries — direct ordering is disabled. Please submit an enquiry instead.")
    cust = await db.users.find_one({"id": user["sub"]})
    if not cust:
        raise HTTPException(404, "Customer/Dealer not found")
    items: List[OrderItem] = []
    total = 0.0
    for it in payload.items:
        p = await db.products.find_one({"id": it.product_id, "tenant_id": user["tid"]})
        if not p:
            raise HTTPException(400, f"Product {it.product_id} not found")
        line = OrderItem(product_id=p["id"], product_name=p["name"],
                         quantity=it.quantity, unit_price=p.get("price", 0),
                         total=it.quantity * p.get("price", 0))
        total += line.total
        items.append(line)
    flow = (tenant or {}).get("order_approval_flow", "direct")
    initial_status = "submitted" if flow != "direct" else "approved"
    order = Order(tenant_id=user["tid"], customer_id=cust["id"],
                  customer_name=cust.get("name", ""),
                  dealer_code=cust.get("dealer_code"),
                  assigned_employee_id=cust.get("assigned_employee_id"),
                  items=items, total_value=total,
                  status=initial_status,
                  remarks=payload.remarks,
                  expected_delivery_date=payload.expected_delivery_date)
    doc = order.model_dump()
    doc["items"] = [i.model_dump() if hasattr(i, "model_dump") else i for i in doc["items"]]
    await db.orders.insert_one(doc)
    return clean(doc)


@api.get("/orders")
async def list_orders(status: Optional[str] = None, customer_id: Optional[str] = None,
                      user: dict = Depends(require_roles("tenant_admin", "manager", "employee", "customer", "dealer"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if user["role"] in ("customer", "dealer"):
        q["customer_id"] = user["sub"]
    elif user["role"] == "employee":
        q["assigned_employee_id"] = user["sub"]
    elif customer_id:
        q["customer_id"] = customer_id
    if status:
        q["status"] = status
    docs = await db.orders.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]


class OrderStatusIn(BaseModel):
    status: str
    rejection_reason: Optional[str] = None


@api.patch("/orders/{oid}")
async def update_order(oid: str, payload: OrderStatusIn,
                        user: dict = Depends(require_roles("tenant_admin", "manager", "employee", "customer", "dealer"))):
    updates: Dict[str, Any] = {"status": payload.status, "updated_at": now_iso()}
    if payload.rejection_reason:
        updates["rejection_reason"] = payload.rejection_reason
    if payload.status == "approved":
        updates["approved_by"] = user["sub"]
        updates["approved_at"] = now_iso()
    if user["role"] in ("customer", "dealer") and payload.status not in ["cancelled", "draft"]:
        raise HTTPException(403, "You can only cancel your orders")
    await db.orders.update_one({"id": oid, "tenant_id": user["tid"]}, {"$set": updates})
    o = await db.orders.find_one({"id": oid})
    return clean(o)


# ---------------- Notifications ----------------
class NotifyIn(BaseModel):
    title: str
    body: str
    user_id: Optional[str] = None
    role: Optional[str] = None
    type: str = "info"


@api.post("/notifications")
async def create_notification(payload: NotifyIn,
                               user: dict = Depends(require_roles("tenant_admin", "manager"))):
    n = Notification(tenant_id=user["tid"], **payload.model_dump())
    await db.notifications.insert_one(n.model_dump())
    return clean(n.model_dump())


@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    q: Dict[str, Any] = {"tenant_id": user.get("tid")}
    q["$or"] = [
        {"user_id": user["sub"]},
        {"role": user["role"]},
        {"$and": [{"user_id": None}, {"role": None}]},
    ]
    docs = await db.notifications.find(q).sort("created_at", -1).to_list(200)
    return [clean(d) for d in docs]


@api.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid}, {"$set": {"is_read": True}})
    return {"ok": True}


# ---------------- Files ----------------
@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...),
                       purpose: str = Form("general"),
                       user: dict = Depends(get_current_user)):
    data = await file.read()
    tenant_id = user.get("tid") or "platform"
    path = storage.build_path(tenant_id, purpose, file.filename or "file")
    ctype = file.content_type or storage.guess_content_type(file.filename or "")
    result = storage.put_object(path, data, ctype)
    rec = FileRecord(tenant_id=user.get("tid"), user_id=user.get("sub"),
                     storage_path=result["path"], original_filename=file.filename or "",
                     content_type=ctype, size=result.get("size", len(data)),
                     purpose=purpose)
    await db.files.insert_one(rec.model_dump())
    return {"path": result["path"], "url": f"/api/files/view?path={result['path']}", "size": rec.size}


@api.get("/files/view")
async def view_file(path: str, auth: Optional[str] = Query(None),
                    authorization: Optional[str] = Header(None)):
    # Allow img tag use via ?auth=token
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "Missing auth")
    decode_token(token)  # validates
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ctype = storage.get_object(path)
    return Response(content=data, media_type=rec.get("content_type") or ctype)


# ---------------- Import / Export (Excel/CSV) ----------------
@api.get("/export/{resource}")
async def export_resource(resource: str, fmt: str = "xlsx",
                          user: dict = Depends(require_roles("tenant_admin", "manager"))):
    coll_map = {
        "users": db.users, "products": db.products, "visits": db.visits,
        "sales": db.sales, "collections": db.collections, "attendance": db.attendance,
        "enquiries": db.enquiries, "orders": db.orders, "dcr": db.dcr,
    }
    coll = coll_map.get(resource)
    if coll is None:
        raise HTTPException(400, "Unknown resource")
    docs = await coll.find({"tenant_id": user["tid"]}, {"_id": 0}).to_list(10000)
    df = pd.DataFrame(docs)
    if df.empty:
        df = pd.DataFrame([{"info": "no data"}])
    buf = io.BytesIO()
    if fmt == "csv":
        df.to_csv(buf, index=False)
        media = "text/csv"
        ext = "csv"
    else:
        df.to_excel(buf, index=False, engine="openpyxl") if False else df.to_excel(buf, index=False)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"
    buf.seek(0)
    return StreamingResponse(buf, media_type=media,
                             headers={"Content-Disposition": f"attachment; filename={resource}.{ext}"})


@api.post("/import/{resource}")
async def import_resource(resource: str, file: UploadFile = File(...),
                          user: dict = Depends(require_roles("tenant_admin"))):
    data = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(data))
        else:
            df = pd.read_excel(io.BytesIO(data))
    except Exception as e:
        raise HTTPException(400, f"Parse error: {e}")
    inserted = 0
    rows = df.fillna("").to_dict(orient="records")
    for r in rows:
        if resource == "users":
            try:
                u = User(tenant_id=user["tid"],
                         phone=str(r.get("phone", "")),
                         name=str(r.get("name", "")),
                         role=str(r.get("role", "customer")),
                         email=str(r.get("email") or "") or None,
                         business_name=str(r.get("business_name") or "") or None,
                         dealer_code=str(r.get("dealer_code") or "") or None,
                         village=str(r.get("village") or "") or None,
                         district=str(r.get("district") or "") or None,
                         state=str(r.get("state") or "") or None)
                if not u.phone:
                    continue
                if await db.users.find_one({"tenant_id": user["tid"], "phone": u.phone}):
                    continue
                await db.users.insert_one(u.model_dump())
                inserted += 1
            except Exception:
                continue
        elif resource == "products":
            try:
                p = Product(tenant_id=user["tid"],
                            name=str(r.get("name", "")),
                            code=str(r.get("code") or "") or None,
                            category=str(r.get("category") or "") or None,
                            description=str(r.get("description") or "") or None,
                            mrp=float(r.get("mrp") or 0),
                            price=float(r.get("price") or 0),
                            stock=int(r.get("stock") or 0) if str(r.get("stock") or "").strip() else None,
                            packing=str(r.get("packing") or "") or None)
                if not p.name:
                    continue
                await db.products.insert_one(p.model_dump())
                inserted += 1
            except Exception:
                continue
    return {"inserted": inserted, "total": len(rows)}


# ---------------- Analytics ----------------
@api.get("/analytics/tenant")
async def tenant_analytics(user: dict = Depends(require_roles("tenant_admin", "manager"))):
    tid = user["tid"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    employees = await db.users.count_documents({"tenant_id": tid, "role": {"$in": ["employee", "manager"]}, "is_active": True})
    dealers = await db.users.count_documents({"tenant_id": tid, "role": "dealer", "is_active": True})
    customers = await db.users.count_documents({"tenant_id": tid, "role": "customer", "is_active": True})
    products = await db.products.count_documents({"tenant_id": tid, "is_active": True})
    attendance_today = await db.attendance.count_documents({"tenant_id": tid, "date": today})
    visits_total = await db.visits.count_documents({"tenant_id": tid})

    sales_agg = await db.sales.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": None, "sum": {"$sum": "$value"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    coll_agg = await db.collections.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": None, "sum": {"$sum": "$amount"}}}
    ]).to_list(1)
    out_agg = await db.users.aggregate([
        {"$match": {"tenant_id": tid, "role": "dealer"}},
        {"$group": {"_id": None, "sum": {"$sum": "$outstanding_amount"}}}
    ]).to_list(1)
    orders_total = await db.orders.count_documents({"tenant_id": tid})
    orders_pending = await db.orders.count_documents({"tenant_id": tid, "status": "submitted"})
    enq_open = await db.enquiries.count_documents({"tenant_id": tid, "status": {"$in": ["new", "in_progress", "followup"]}})

    # Sales trend last 7 days
    from collections import defaultdict
    sales_docs = await db.sales.find({"tenant_id": tid}, {"_id": 0, "sale_date": 1, "value": 1}).to_list(5000)
    trend: Dict[str, float] = defaultdict(float)
    for s in sales_docs:
        trend[s.get("sale_date", "")] += s.get("value", 0)
    last_7 = []
    for i in range(6, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        last_7.append({"date": d, "value": trend.get(d, 0)})

    # Top employees by sales
    top_emp = await db.sales.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": "$employee_id", "name": {"$last": "$employee_name"}, "total": {"$sum": "$value"}}},
        {"$sort": {"total": -1}},
        {"$limit": 5},
    ]).to_list(5)

    return {
        "kpis": {
            "employees": employees,
            "dealers": dealers,
            "customers": customers,
            "products": products,
            "attendance_today": attendance_today,
            "visits_total": visits_total,
            "sales_total": (sales_agg[0]["sum"] if sales_agg else 0),
            "sales_count": (sales_agg[0]["count"] if sales_agg else 0),
            "collections_total": (coll_agg[0]["sum"] if coll_agg else 0),
            "outstanding_total": (out_agg[0]["sum"] if out_agg else 0),
            "orders_total": orders_total,
            "orders_pending": orders_pending,
            "enquiries_open": enq_open,
        },
        "sales_trend": last_7,
        "top_employees": [{"user_id": e["_id"], "name": e.get("name"), "total": e["total"]} for e in top_emp],
    }


# ---------------- Health ----------------
@api.get("/")
async def root():
    return {"app": "FieldCRM SaaS", "status": "ok"}


@api.get("/health")
async def health():
    return {"ok": True, "time": now_iso()}


# ==================== PHASE 2 ====================

# ---------------- Phase 2: Area Hierarchy ----------------
async def _get_descendant_area_ids(tenant_id: str, root_id: Optional[str]) -> List[str]:
    """Return [root_id] + all descendants."""
    if not root_id:
        return []
    ids = [root_id]
    docs = await db.areas.find({"tenant_id": tenant_id, "path": root_id}).to_list(10000)
    ids.extend([d["id"] for d in docs])
    return ids


async def _user_scope_area_ids(user: dict) -> Optional[List[str]]:
    """Returns the list of area_node_ids this user can see, or None for unrestricted."""
    if user["role"] in ("super_admin", "tenant_admin"):
        return None
    udoc = await db.users.find_one({"id": user["sub"]})
    if not udoc or not udoc.get("area_node_id"):
        return None
    return await _get_descendant_area_ids(user["tid"], udoc["area_node_id"])


class AreaIn(BaseModel):
    name: str
    type: str  # country | state | district | area
    parent_id: Optional[str] = None
    code: Optional[str] = None


@api.get("/areas")
async def list_areas(user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    docs = await db.areas.find({"tenant_id": user["tid"], "is_active": True}).to_list(5000)
    return [clean(d) for d in docs]


@api.post("/areas")
async def create_area(payload: AreaIn, user: dict = Depends(require_roles("tenant_admin"))):
    if payload.type not in ("country", "state", "district", "area"):
        raise HTTPException(400, "Invalid area type")
    path: List[str] = []
    if payload.parent_id:
        parent = await db.areas.find_one({"id": payload.parent_id, "tenant_id": user["tid"]})
        if not parent:
            raise HTTPException(400, "Parent not found")
        path = list(parent.get("path", [])) + [parent["id"]]
    node = AreaNode(tenant_id=user["tid"], name=payload.name, type=payload.type,
                    parent_id=payload.parent_id, path=path, code=payload.code)
    await db.areas.insert_one(node.model_dump())
    return clean(node.model_dump())


@api.patch("/areas/{aid}")
async def update_area(aid: str, payload: AreaIn, user: dict = Depends(require_roles("tenant_admin"))):
    updates = {"name": payload.name, "code": payload.code}
    await db.areas.update_one({"id": aid, "tenant_id": user["tid"]}, {"$set": updates})
    a = await db.areas.find_one({"id": aid})
    return clean(a)


@api.delete("/areas/{aid}")
async def delete_area(aid: str, user: dict = Depends(require_roles("tenant_admin"))):
    # also disable descendants
    await db.areas.update_many(
        {"$or": [{"id": aid}, {"path": aid}], "tenant_id": user["tid"]},
        {"$set": {"is_active": False}},
    )
    return {"ok": True}


# ---------------- Phase 2: Custom Roles ----------------
@api.get("/permission-modules")
async def list_permission_modules(user: dict = Depends(get_current_user)):
    return {"modules": PERMISSION_MODULES}


@api.get("/roles")
async def list_roles(user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    docs = await db.roles.find({"tenant_id": user["tid"], "is_active": True}).to_list(200)
    return [clean(d) for d in docs]


class RoleIn(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: Dict[str, Dict[str, bool]] = {}
    is_default: bool = False


@api.post("/roles")
async def create_role(payload: RoleIn, user: dict = Depends(require_roles("tenant_admin"))):
    r = Role(tenant_id=user["tid"], **payload.model_dump())
    await db.roles.insert_one(r.model_dump())
    return clean(r.model_dump())


@api.patch("/roles/{rid}")
async def update_role(rid: str, payload: RoleIn, user: dict = Depends(require_roles("tenant_admin"))):
    await db.roles.update_one({"id": rid, "tenant_id": user["tid"]}, {"$set": payload.model_dump()})
    r = await db.roles.find_one({"id": rid})
    return clean(r)


@api.delete("/roles/{rid}")
async def delete_role(rid: str, user: dict = Depends(require_roles("tenant_admin"))):
    await db.roles.update_one({"id": rid, "tenant_id": user["tid"]}, {"$set": {"is_active": False}})
    return {"ok": True}


# ---------------- Custom Fields (per-tenant, per-module) ----------------
class CustomFieldIn(BaseModel):
    module: str
    field_key: str
    label: str
    type: str
    options: List[str] = []
    required: bool = False
    order: int = 0
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    visible_to_customer: bool = True


class CustomFieldPatchIn(BaseModel):
    label: Optional[str] = None
    type: Optional[str] = None
    options: Optional[List[str]] = None
    required: Optional[bool] = None
    order: Optional[int] = None
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    is_active: Optional[bool] = None
    visible_to_customer: Optional[bool] = None


@api.get("/custom-fields")
async def list_custom_fields(module: Optional[str] = None,
                              user: dict = Depends(get_current_user)):
    """List custom fields for the caller's tenant. Anyone in tenant can read (needed to render forms)."""
    if not user.get("tid"):
        raise HTTPException(400, "Missing tenant")
    q: Dict[str, Any] = {"tenant_id": user["tid"], "is_active": True}
    if module:
        q["module"] = module
    docs = await db.custom_fields.find(q).sort([("module", 1), ("order", 1)]).to_list(500)
    return [clean(d) for d in docs]


@api.post("/custom-fields")
async def create_custom_field(payload: CustomFieldIn,
                               user: dict = Depends(require_roles("tenant_admin"))):
    if payload.module not in CUSTOM_FIELD_MODULES:
        raise HTTPException(400, f"Invalid module. Must be one of {CUSTOM_FIELD_MODULES}")
    if payload.type not in CUSTOM_FIELD_TYPES:
        raise HTTPException(400, f"Invalid type. Must be one of {CUSTOM_FIELD_TYPES}")
    if payload.type in ("dropdown", "radio", "checkbox") and not payload.options:
        raise HTTPException(400, f"{payload.type} field requires options")
    key = payload.field_key.strip().lower().replace(" ", "_")
    if not key or not key.replace("_", "").isalnum():
        raise HTTPException(400, "field_key must be alphanumeric/underscore")
    existing = await db.custom_fields.find_one({"tenant_id": user["tid"], "module": payload.module, "field_key": key})
    if existing:
        if existing.get("is_active"):
            raise HTTPException(400, f"Field '{key}' already exists on {payload.module} module")
        # Reactivate soft-deleted field with fresh config
        updates = {**payload.model_dump(), "field_key": key, "is_active": True, "updated_at": now_iso()}
        await db.custom_fields.update_one({"id": existing["id"]}, {"$set": updates})
        cf = await db.custom_fields.find_one({"id": existing["id"]})
        return clean(cf)
    cf = CustomField(tenant_id=user["tid"], **{**payload.model_dump(), "field_key": key})
    await db.custom_fields.insert_one(cf.model_dump())
    return clean(cf.model_dump())


@api.patch("/custom-fields/{cfid}")
async def update_custom_field(cfid: str, payload: CustomFieldPatchIn,
                               user: dict = Depends(require_roles("tenant_admin"))):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    if updates.get("type") and updates["type"] not in CUSTOM_FIELD_TYPES:
        raise HTTPException(400, "Invalid type")
    updates["updated_at"] = now_iso()
    res = await db.custom_fields.update_one({"id": cfid, "tenant_id": user["tid"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Custom field not found")
    cf = await db.custom_fields.find_one({"id": cfid})
    return clean(cf)


@api.delete("/custom-fields/{cfid}")
async def delete_custom_field(cfid: str,
                               user: dict = Depends(require_roles("tenant_admin"))):
    await db.custom_fields.update_one({"id": cfid, "tenant_id": user["tid"]},
                                      {"$set": {"is_active": False, "updated_at": now_iso()}})
    return {"ok": True}


@api.get("/custom-fields/modules")
async def custom_field_modules(user: dict = Depends(get_current_user)):
    return {"modules": CUSTOM_FIELD_MODULES, "types": CUSTOM_FIELD_TYPES}


# ============================================================
# Crop Health Advisor (industry-specific, opt-in per tenant)
# ============================================================

def _require_crop_advisor(tenant: Optional[dict]):
    """Ensures the tenant has the crop_advisor feature enabled."""
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if not (tenant.get("features") or {}).get("crop_advisor"):
        raise HTTPException(403, "Crop Advisor module is not enabled for this tenant")


# ---- Crops ----
class CropIn(BaseModel):
    name: str
    scientific_name: Optional[str] = None
    image_path: Optional[str] = None
    description: Optional[str] = None
    season: Optional[str] = None
    is_active: bool = True
    order: int = 0


@api.get("/crops")
async def list_crops(user: dict = Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": user["tid"]})
    _require_crop_advisor(tenant)
    docs = await db.crops.find({"tenant_id": user["tid"], "is_active": True}).sort([("order", 1), ("name", 1)]).to_list(500)
    return [clean(d) for d in docs]


@api.post("/crops")
async def create_crop(payload: CropIn, user: dict = Depends(require_roles("tenant_admin"))):
    tenant = await db.tenants.find_one({"id": user["tid"]})
    _require_crop_advisor(tenant)
    c = Crop(tenant_id=user["tid"], **payload.model_dump())
    await db.crops.insert_one(c.model_dump())
    return clean(c.model_dump())


@api.patch("/crops/{cid}")
async def update_crop(cid: str, payload: CropIn, user: dict = Depends(require_roles("tenant_admin"))):
    updates = {**payload.model_dump(exclude_none=True), "updated_at": now_iso()}
    res = await db.crops.update_one({"id": cid, "tenant_id": user["tid"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Crop not found")
    doc = await db.crops.find_one({"id": cid})
    return clean(doc)


@api.delete("/crops/{cid}")
async def delete_crop(cid: str, user: dict = Depends(require_roles("tenant_admin"))):
    await db.crops.update_one({"id": cid, "tenant_id": user["tid"]}, {"$set": {"is_active": False}})
    return {"ok": True}


# ---- Advisory Entries (Diseases | Pests | Deficiencies) ----
class AdvisoryEntryIn(BaseModel):
    type: str
    name: str
    scientific_name: Optional[str] = None
    crop_ids: List[str] = []
    category: Optional[str] = None
    severity: str = "medium"
    short_description: Optional[str] = None
    description: Optional[str] = None
    season: Optional[str] = None
    symptoms: List[str] = []
    causes: Optional[str] = None
    spread: List[str] = []
    weather: Dict[str, Any] = {}
    prevention: List[str] = []
    organic_treatment: Optional[str] = None
    bio_control: Optional[str] = None
    natural_remedies: Optional[str] = None
    chemical_treatment: Dict[str, Any] = {}
    safety: Dict[str, Any] = {}
    faqs: List[Dict[str, str]] = []
    photos: List[Dict[str, Any]] = []
    documents: List[Dict[str, Any]] = []
    product_ids: List[str] = []
    keywords: List[str] = []
    is_published: bool = True


@api.get("/advisory-entries")
async def list_advisory(type: Optional[str] = None,
                        crop_id: Optional[str] = None,
                        q: Optional[str] = None,
                        limit: int = 100,
                        offset: int = 0,
                        published_only: bool = True,
                        user: dict = Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": user["tid"]})
    _require_crop_advisor(tenant)
    query: Dict[str, Any] = {"tenant_id": user["tid"]}
    if type:
        if type not in ADVISORY_TYPES:
            raise HTTPException(400, "Invalid type")
        query["type"] = type
    if crop_id:
        query["crop_ids"] = crop_id
    if published_only and user["role"] not in ("tenant_admin",):
        query["is_published"] = True
    if q:
        rex = {"$regex": q, "$options": "i"}
        query["$or"] = [
            {"name": rex}, {"scientific_name": rex},
            {"symptoms": rex}, {"keywords": rex},
            {"short_description": rex},
        ]
    total = await db.advisory_entries.count_documents(query)
    docs = await db.advisory_entries.find(query).sort([("updated_at", -1)]).skip(offset).limit(limit).to_list(limit)
    return {"total": total, "items": [clean(d) for d in docs]}


@api.get("/advisory-entries/{aid}")
async def get_advisory(aid: str, user: dict = Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": user["tid"]})
    _require_crop_advisor(tenant)
    doc = await db.advisory_entries.find_one_and_update(
        {"id": aid, "tenant_id": user["tid"]},
        {"$inc": {"view_count": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(404, "Not found")
    await db.recent_views.insert_one(RecentView(
        tenant_id=user["tid"], user_id=user["sub"],
        entity_type="advisory", entity_id=aid,
    ).model_dump())
    return clean(doc)


@api.post("/advisory-entries")
async def create_advisory(payload: AdvisoryEntryIn, user: dict = Depends(require_roles("tenant_admin"))):
    tenant = await db.tenants.find_one({"id": user["tid"]})
    _require_crop_advisor(tenant)
    if payload.type not in ADVISORY_TYPES:
        raise HTTPException(400, f"Invalid type. Use one of {ADVISORY_TYPES}")
    e = AdvisoryEntry(tenant_id=user["tid"], **payload.model_dump())
    await db.advisory_entries.insert_one(e.model_dump())
    return clean(e.model_dump())


@api.patch("/advisory-entries/{aid}")
async def update_advisory(aid: str, payload: AdvisoryEntryIn, user: dict = Depends(require_roles("tenant_admin"))):
    updates = {**payload.model_dump(), "updated_at": now_iso()}
    res = await db.advisory_entries.update_one({"id": aid, "tenant_id": user["tid"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    doc = await db.advisory_entries.find_one({"id": aid})
    return clean(doc)


@api.delete("/advisory-entries/{aid}")
async def delete_advisory(aid: str, user: dict = Depends(require_roles("tenant_admin"))):
    await db.advisory_entries.delete_one({"id": aid, "tenant_id": user["tid"]})
    return {"ok": True}


# ---- Seasonal Advisories ----
class SeasonalAdvisoryIn(BaseModel):
    title: str
    message: str
    severity: str = "medium"
    crop_ids: List[str] = []
    states: List[str] = []
    districts: List[str] = []
    regions: List[str] = []
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    is_published: bool = True


@api.get("/seasonal-advisories")
async def list_seasonal(active_only: bool = False, user: dict = Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": user["tid"]})
    _require_crop_advisor(tenant)
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if user["role"] != "tenant_admin":
        q["is_published"] = True
    if active_only:
        today = date.today().isoformat()
        q["$and"] = [
            {"$or": [{"valid_from": None}, {"valid_from": {"$lte": today}}]},
            {"$or": [{"valid_to": None}, {"valid_to": {"$gte": today}}]},
        ]
    docs = await db.seasonal_advisories.find(q).sort([("created_at", -1)]).to_list(200)
    return [clean(d) for d in docs]


@api.post("/seasonal-advisories")
async def create_seasonal(payload: SeasonalAdvisoryIn, user: dict = Depends(require_roles("tenant_admin"))):
    tenant = await db.tenants.find_one({"id": user["tid"]})
    _require_crop_advisor(tenant)
    s = SeasonalAdvisory(tenant_id=user["tid"], created_by=user["sub"], **payload.model_dump())
    await db.seasonal_advisories.insert_one(s.model_dump())
    return clean(s.model_dump())


@api.patch("/seasonal-advisories/{sid}")
async def update_seasonal(sid: str, payload: SeasonalAdvisoryIn, user: dict = Depends(require_roles("tenant_admin"))):
    res = await db.seasonal_advisories.update_one({"id": sid, "tenant_id": user["tid"]},
                                                   {"$set": {**payload.model_dump(), "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    doc = await db.seasonal_advisories.find_one({"id": sid})
    return clean(doc)


@api.delete("/seasonal-advisories/{sid}")
async def delete_seasonal(sid: str, user: dict = Depends(require_roles("tenant_admin"))):
    await db.seasonal_advisories.delete_one({"id": sid, "tenant_id": user["tid"]})
    return {"ok": True}


# ---- Favorites & Recent Views ----
class FavoriteIn(BaseModel):
    entity_type: str  # advisory | crop
    entity_id: str


@api.get("/favorites")
async def list_favorites(entity_type: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: Dict[str, Any] = {"user_id": user["sub"]}
    if entity_type:
        q["entity_type"] = entity_type
    docs = await db.user_favorites.find(q).sort([("created_at", -1)]).to_list(200)
    return [clean(d) for d in docs]


@api.post("/favorites/toggle")
async def toggle_favorite(payload: FavoriteIn, user: dict = Depends(get_current_user)):
    existing = await db.user_favorites.find_one({
        "user_id": user["sub"], "entity_type": payload.entity_type, "entity_id": payload.entity_id
    })
    if existing:
        await db.user_favorites.delete_one({"id": existing["id"]})
        return {"favorited": False}
    fav = UserFavorite(tenant_id=user["tid"], user_id=user["sub"],
                       entity_type=payload.entity_type, entity_id=payload.entity_id)
    await db.user_favorites.insert_one(fav.model_dump())
    return {"favorited": True, "id": fav.id}


@api.get("/recent-views")
async def list_recent_views(limit: int = 20, entity_type: Optional[str] = None,
                             user: dict = Depends(get_current_user)):
    q: Dict[str, Any] = {"user_id": user["sub"]}
    if entity_type:
        q["entity_type"] = entity_type
    docs = await db.recent_views.find(q).sort([("viewed_at", -1)]).limit(limit).to_list(limit)
    # Dedup by entity_id keeping most recent
    seen = set()
    out = []
    for d in docs:
        if d["entity_id"] in seen:
            continue
        seen.add(d["entity_id"])
        out.append(clean(d))
    return out


# ---- Crop advisor: my_crops selection ----
class MyCropsIn(BaseModel):
    crop_ids: List[str]


@api.patch("/me/my-crops")
async def set_my_crops(payload: MyCropsIn, user: dict = Depends(get_current_user)):
    # Validate crop_ids belong to this tenant
    if payload.crop_ids:
        valid = await db.crops.count_documents({
            "tenant_id": user["tid"], "id": {"$in": payload.crop_ids}, "is_active": True,
        })
        if valid != len(set(payload.crop_ids)):
            raise HTTPException(400, "Some crop_ids are invalid for this tenant")
    await db.users.update_one({"id": user["sub"]}, {"$set": {"my_crops": payload.crop_ids}})
    u = await db.users.find_one({"id": user["sub"]})
    return clean(u)


# ---- Super Admin: toggle tenant features ----
class TenantFeaturesIn(BaseModel):
    features: Dict[str, bool]


@api.patch("/super-admin/tenants/{tid}/features")
async def super_set_tenant_features(tid: str, payload: TenantFeaturesIn,
                                     _sa: dict = Depends(require_roles("super_admin"))):
    doc = await db.tenants.find_one({"id": tid})
    if not doc:
        raise HTTPException(404, "Tenant not found")
    current = doc.get("features") or {}
    current.update(payload.features)
    await db.tenants.update_one({"id": tid}, {"$set": {"features": current, "updated_at": now_iso()}})
    doc = await db.tenants.find_one({"id": tid})
    return clean(doc)


# ---- Public: search & disease/pest count for a crop (used by crop dashboard) ----
@api.get("/crops/{cid}/summary")
async def crop_summary(cid: str, user: dict = Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": user["tid"]})
    _require_crop_advisor(tenant)
    counts: Dict[str, int] = {}
    for t in ADVISORY_TYPES:
        counts[t] = await db.advisory_entries.count_documents({
            "tenant_id": user["tid"], "crop_ids": cid, "type": t, "is_published": True
        })
    # Aggregate recommended products via advisory entries for this crop
    prod_ids: set = set()
    async for a in db.advisory_entries.find({"tenant_id": user["tid"], "crop_ids": cid, "is_published": True},
                                             {"product_ids": 1}):
        for pid in a.get("product_ids") or []:
            prod_ids.add(pid)
    products = []
    if prod_ids:
        async for p in db.products.find({"tenant_id": user["tid"], "id": {"$in": list(prod_ids)}}):
            products.append(clean(p))
    return {"counts": counts, "products": products}


@api.get("/my-permissions")
async def my_permissions(user: dict = Depends(get_current_user)):
    """Returns the effective permissions of the logged-in user."""
    # Built-in roles bypass custom permissions (full access in their scope)
    if user["role"] in ("super_admin", "tenant_admin"):
        return {"permissions": {m: {"read": True, "write": True} for m in PERMISSION_MODULES}}
    udoc = await db.users.find_one({"id": user["sub"]})
    if user["role"] == "manager":
        # managers default: read+write on all except roles/branding (admin-only)
        default = {m: {"read": True, "write": True} for m in PERMISSION_MODULES}
        default["roles"] = {"read": False, "write": False}
        default["branding"] = {"read": False, "write": False}
        # Overlay custom role (so a manager can be restricted just like an employee)
        if udoc and udoc.get("role_id"):
            role = await db.roles.find_one({"id": udoc["role_id"]})
            if role and role.get("permissions"):
                for k, v in role["permissions"].items():
                    default[k] = v
        return {"permissions": default}
    if user["role"] == "employee":
        # default: write on field entries, read on others
        default = {m: {"read": False, "write": False} for m in PERMISSION_MODULES}
        for m in ("visits", "sales", "collections", "dcr", "enquiries", "dealers", "customers", "products", "leaves"):
            default[m] = {"read": True, "write": True}
        default["reports"] = {"read": False, "write": False}
        # Overlay custom role
        if udoc and udoc.get("role_id"):
            role = await db.roles.find_one({"id": udoc["role_id"]})
            if role and role.get("permissions"):
                for k, v in role["permissions"].items():
                    default[k] = v
        return {"permissions": default}
    if user["role"] == "customer":
        return {"permissions": {
            "products": {"read": True, "write": False},
            "orders": {"read": True, "write": True},
            "enquiries": {"read": True, "write": True},
        }}
    if user["role"] == "dealer":
        return {"permissions": {
            "products": {"read": True, "write": False},
            "orders": {"read": True, "write": True},
        }}
    return {"permissions": {}}


# ---------------- Phase 2: Leaves ----------------
class LeaveIn(BaseModel):
    leave_type: str = "casual"
    from_date: str
    to_date: str
    reason: Optional[str] = None


def _days_between(d1: str, d2: str) -> float:
    a = datetime.fromisoformat(d1)
    b = datetime.fromisoformat(d2)
    return float((b - a).days + 1)


async def _is_in_hierarchy_above(tenant_id: str, candidate_id: str, employee_id: str) -> bool:
    """True if candidate is the employee's manager or any ancestor manager, or tenant_admin."""
    cand = await db.users.find_one({"id": candidate_id, "tenant_id": tenant_id})
    if not cand:
        return False
    if cand["role"] == "tenant_admin":
        return True
    # walk up employee's manager chain
    current = await db.users.find_one({"id": employee_id, "tenant_id": tenant_id})
    visited = set()
    while current and current.get("manager_id") and current["manager_id"] not in visited:
        visited.add(current["manager_id"])
        if current["manager_id"] == candidate_id:
            return True
        current = await db.users.find_one({"id": current["manager_id"], "tenant_id": tenant_id})
    return False


@api.post("/leaves")
async def apply_leave(payload: LeaveIn,
                      user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    days = _days_between(payload.from_date, payload.to_date)
    if days <= 0:
        raise HTTPException(400, "Invalid date range")
    udoc = await db.users.find_one({"id": user["sub"]})
    lr = LeaveRequest(tenant_id=user["tid"], employee_id=user["sub"],
                      employee_name=(udoc or {}).get("name", ""), days=days,
                      **payload.model_dump())
    await db.leaves.insert_one(lr.model_dump())
    return clean(lr.model_dump())


@api.get("/leaves")
async def list_leaves(employee_id: Optional[str] = None, status: Optional[str] = None,
                      mine: bool = False,
                      user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if mine or user["role"] == "employee":
        q["employee_id"] = user["sub"]
    elif user["role"] == "manager":
        # show direct reports + own
        team = await db.users.find({"tenant_id": user["tid"], "manager_id": user["sub"]}).to_list(2000)
        team_ids = [u["id"] for u in team] + [user["sub"]]
        q["employee_id"] = {"$in": team_ids}
        if employee_id:
            q["employee_id"] = employee_id
    elif employee_id:
        q["employee_id"] = employee_id
    if status:
        q["status"] = status
    docs = await db.leaves.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]


class LeaveDecisionIn(BaseModel):
    status: str  # approved | rejected
    comments: Optional[str] = None


@api.patch("/leaves/{lid}")
async def decide_leave(lid: str, payload: LeaveDecisionIn,
                       user: dict = Depends(require_roles("manager", "tenant_admin"))):
    lr = await db.leaves.find_one({"id": lid, "tenant_id": user["tid"]})
    if not lr:
        raise HTTPException(404, "Leave not found")
    if payload.status not in ("approved", "rejected", "cancelled"):
        raise HTTPException(400, "Invalid status")
    # Check approver authority: direct manager or anyone above in hierarchy
    if user["role"] != "tenant_admin":
        allowed = await _is_in_hierarchy_above(user["tid"], user["sub"], lr["employee_id"])
        if not allowed:
            raise HTTPException(403, "You are not in the approval chain for this employee")
    approver = await db.users.find_one({"id": user["sub"]})
    await db.leaves.update_one({"id": lid}, {"$set": {
        "status": payload.status,
        "approver_id": user["sub"],
        "approver_name": (approver or {}).get("name", ""),
        "approver_comments": payload.comments,
        "decided_at": now_iso(),
    }})
    out = await db.leaves.find_one({"id": lid})
    return clean(out)


# ---------------- Phase 2: Targets ----------------
class TargetIn(BaseModel):
    user_id: str
    month: str  # YYYY-MM
    sales_target: float


@api.post("/targets")
async def set_target(payload: TargetIn, user: dict = Depends(require_roles("tenant_admin", "manager"))):
    udoc = await db.users.find_one({"id": payload.user_id, "tenant_id": user["tid"]})
    if not udoc:
        raise HTTPException(404, "Employee not found")
    existing = await db.targets.find_one({"tenant_id": user["tid"], "user_id": payload.user_id, "month": payload.month})
    if existing:
        await db.targets.update_one({"id": existing["id"]},
            {"$set": {"sales_target": payload.sales_target, "updated_at": now_iso(), "set_by": user["sub"]}})
        out = await db.targets.find_one({"id": existing["id"]})
        return clean(out)
    t = Target(tenant_id=user["tid"], user_id=payload.user_id,
               user_name=udoc.get("name", ""), month=payload.month,
               sales_target=payload.sales_target, set_by=user["sub"])
    await db.targets.insert_one(t.model_dump())
    return clean(t.model_dump())


@api.get("/targets")
async def list_targets(month: Optional[str] = None, user_id: Optional[str] = None,
                       user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    q: Dict[str, Any] = {"tenant_id": user["tid"]}
    if user["role"] == "employee":
        q["user_id"] = user["sub"]
    elif user_id:
        q["user_id"] = user_id
    if month:
        q["month"] = month
    docs = await db.targets.find(q).sort("month", -1).to_list(500)
    return [clean(d) for d in docs]


@api.get("/targets/progress")
async def target_progress(month: Optional[str] = None,
                          user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    """Returns target vs actual for the user (or each user under manager/admin scope)."""
    month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    month_start = f"{month}-01"
    # next month start
    y, m = map(int, month.split("-"))
    if m == 12:
        nm = f"{y+1}-01-01"
    else:
        nm = f"{y}-{m+1:02d}-01"

    # Determine target users
    if user["role"] == "employee":
        user_ids = [user["sub"]]
    elif user["role"] == "manager":
        team = await db.users.find({"tenant_id": user["tid"], "manager_id": user["sub"]}).to_list(2000)
        user_ids = [u["id"] for u in team] + [user["sub"]]
    else:  # tenant_admin
        all_emp = await db.users.find({"tenant_id": user["tid"],
                                        "role": {"$in": ["employee", "manager"]}}).to_list(5000)
        user_ids = [u["id"] for u in all_emp]

    rows = []
    for uid in user_ids:
        udoc = await db.users.find_one({"id": uid})
        target = await db.targets.find_one({"tenant_id": user["tid"], "user_id": uid, "month": month})
        sales_agg = await db.sales.aggregate([
            {"$match": {"tenant_id": user["tid"], "employee_id": uid,
                        "sale_date": {"$gte": month_start, "$lt": nm}}},
            {"$group": {"_id": None, "sum": {"$sum": "$value"}}},
        ]).to_list(1)
        actual = sales_agg[0]["sum"] if sales_agg else 0
        tgt = (target or {}).get("sales_target", 0)
        rows.append({
            "user_id": uid,
            "user_name": (udoc or {}).get("name", ""),
            "role": (udoc or {}).get("role", ""),
            "month": month,
            "target": tgt,
            "actual": actual,
            "percent": round((actual / tgt * 100), 1) if tgt > 0 else 0,
        })
    return {"month": month, "rows": rows}


# ---------------- Phase 2: Batch Sync (Offline) ----------------
class BatchSyncItem(BaseModel):
    type: str  # visit | sales | collection | dcr | enquiry | location
    payload: Dict[str, Any]
    client_id: Optional[str] = None  # local UUID for dedup


@api.post("/sync/batch")
async def sync_batch(items: List[BatchSyncItem],
                     user: dict = Depends(require_roles("employee", "manager", "tenant_admin"))):
    """Bulk apply queued offline entries."""
    udoc = await db.users.find_one({"id": user["sub"]})
    uname = (udoc or {}).get("name", "")
    results = []
    for it in items:
        try:
            t = it.type
            p = it.payload or {}
            if t == "visit":
                v = Visit(tenant_id=user["tid"], employee_id=user["sub"], employee_name=uname, **p)
                await db.visits.insert_one(v.model_dump())
                results.append({"client_id": it.client_id, "ok": True, "id": v.id})
            elif t == "sales":
                if "value" not in p or not p["value"]:
                    p["value"] = float(p.get("quantity", 0)) * float(p.get("unit_price", 0))
                s = SalesEntry(tenant_id=user["tid"], employee_id=user["sub"], employee_name=uname, **p)
                await db.sales.insert_one(s.model_dump())
                results.append({"client_id": it.client_id, "ok": True, "id": s.id})
            elif t == "collection":
                c = CollectionEntry(tenant_id=user["tid"], employee_id=user["sub"], employee_name=uname, **p)
                await db.collections.insert_one(c.model_dump())
                if c.dealer_id:
                    await db.users.update_one({"id": c.dealer_id}, {"$inc": {"outstanding_amount": -c.amount}})
                results.append({"client_id": it.client_id, "ok": True, "id": c.id})
            elif t == "dcr":
                d = DCR(tenant_id=user["tid"], employee_id=user["sub"], employee_name=uname, **p)
                await db.dcr.insert_one(d.model_dump())
                results.append({"client_id": it.client_id, "ok": True, "id": d.id})
            elif t == "enquiry":
                e = Enquiry(tenant_id=user["tid"], created_by=user["sub"], **p)
                await db.enquiries.insert_one(e.model_dump())
                results.append({"client_id": it.client_id, "ok": True, "id": e.id})
            elif t == "location":
                lp = LocationPing(tenant_id=user["tid"], user_id=user["sub"],
                                  lat=p["lat"], lng=p["lng"], timestamp=p.get("timestamp") or now_iso())
                await db.locations.insert_one(lp.model_dump())
                results.append({"client_id": it.client_id, "ok": True, "id": lp.id})
            else:
                results.append({"client_id": it.client_id, "ok": False, "error": f"unknown type {t}"})
        except Exception as e:
            results.append({"client_id": it.client_id, "ok": False, "error": str(e)})
    return {"synced": sum(1 for r in results if r["ok"]), "total": len(results), "results": results}


# ---------------- Phase 2: GPS Route with Clustered Stops ----------------
def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    import math
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@api.get("/gps/track")
async def gps_track(user_id: str, date: str,
                    user: dict = Depends(require_roles("tenant_admin", "manager", "employee"))):
    """Returns pings + clustered stops + activities (visits/enquiries) at each stop."""
    # employees can only see their own track
    if user["role"] == "employee" and user_id != user["sub"]:
        raise HTTPException(403, "Forbidden")

    pings = await db.locations.find({
        "tenant_id": user["tid"], "user_id": user_id,
        "timestamp": {"$regex": f"^{date}"},
    }).sort("timestamp", 1).to_list(10000)

    # Cluster consecutive pings within 50m
    stops = []
    current = None
    for p in pings:
        if current is None:
            current = {"lat": p["lat"], "lng": p["lng"], "start": p["timestamp"], "end": p["timestamp"], "count": 1}
        else:
            d = _haversine_m(current["lat"], current["lng"], p["lat"], p["lng"])
            if d <= 50:
                current["end"] = p["timestamp"]
                current["count"] += 1
                # running centroid
                current["lat"] = (current["lat"] * (current["count"] - 1) + p["lat"]) / current["count"]
                current["lng"] = (current["lng"] * (current["count"] - 1) + p["lng"]) / current["count"]
            else:
                stops.append(current)
                current = {"lat": p["lat"], "lng": p["lng"], "start": p["timestamp"], "end": p["timestamp"], "count": 1}
    if current:
        stops.append(current)

    # Compute durations and attach activities (visits + enquiries created during stop window with nearby lat/lng)
    for s in stops:
        try:
            s["duration_min"] = round((datetime.fromisoformat(s["end"]) - datetime.fromisoformat(s["start"])).total_seconds() / 60, 1)
        except Exception:
            s["duration_min"] = 0
        s["activities"] = []
    visits = await db.visits.find({
        "tenant_id": user["tid"], "employee_id": user_id, "visit_date": date,
    }).to_list(1000)
    for v in visits:
        if v.get("lat") is None or v.get("lng") is None:
            continue
        # find nearest stop within 200m
        best, best_d = None, 1e9
        for s in stops:
            d = _haversine_m(s["lat"], s["lng"], v["lat"], v["lng"])
            if d < best_d:
                best, best_d = s, d
        if best and best_d <= 200:
            best["activities"].append({
                "type": "visit",
                "title": v.get("dealer_name") or v.get("customer_name") or "Visit",
                "id": v["id"],
            })

    # Attendance summary
    att = await db.attendance.find_one({"tenant_id": user["tid"], "user_id": user_id, "date": date})

    total_dist = 0.0
    for i in range(1, len(pings)):
        total_dist += _haversine_m(pings[i - 1]["lat"], pings[i - 1]["lng"], pings[i]["lat"], pings[i]["lng"])

    return {
        "user_id": user_id, "date": date,
        "pings": [{"lat": p["lat"], "lng": p["lng"], "timestamp": p["timestamp"]} for p in pings],
        "stops": stops,
        "distance_m": round(total_dist, 1),
        "attendance": clean(att) if att else None,
    }


@api.get("/gps/live")
async def gps_live(user: dict = Depends(require_roles("tenant_admin", "manager"))):
    """Latest location of all currently checked-in employees (admin/manager view)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Find users with active attendance
    att = await db.attendance.find({"tenant_id": user["tid"], "date": today,
                                     "check_in_at": {"$ne": None},
                                     "check_out_at": None}).to_list(2000)
    out = []
    for a in att:
        last_ping = await db.locations.find_one(
            {"tenant_id": user["tid"], "user_id": a["user_id"]},
            sort=[("timestamp", -1)])
        if last_ping:
            out.append({
                "user_id": a["user_id"],
                "user_name": a.get("user_name", ""),
                "lat": last_ping["lat"],
                "lng": last_ping["lng"],
                "timestamp": last_ping["timestamp"],
                "check_in_at": a.get("check_in_at"),
            })
        else:
            # Fallback to check-in location
            if a.get("check_in_lat") is not None:
                out.append({
                    "user_id": a["user_id"],
                    "user_name": a.get("user_name", ""),
                    "lat": a["check_in_lat"],
                    "lng": a["check_in_lng"],
                    "timestamp": a.get("check_in_at"),
                    "check_in_at": a.get("check_in_at"),
                })
    return {"items": out}


# ==================== END PHASE 2 ====================


# ==================== PHASE 3: S3 UPLOADS + LEGAL DOCS ====================
class PresignIn(BaseModel):
    filename: str
    content_type: Optional[str] = None
    module: Optional[str] = None  # dealer | customer | product | enquiry | visit | legal | ...


@api.post("/uploads/presign")
async def presign_upload(payload: PresignIn, user: dict = Depends(get_current_user)):
    """Return a presigned PUT URL for direct S3 upload from the browser/app.

    503 with a clear message if S3 env vars are unset — the rest of the app
    continues to work with the existing Emergent Object Storage flow.
    """
    if not s3_presign.is_configured():
        raise HTTPException(503, "S3 uploads not configured on this environment")
    key = s3_presign.build_key(user.get("tid"), user.get("sub"), payload.module, payload.filename)
    try:
        info = s3_presign.presign_put(key, payload.content_type)
    except s3_presign.S3NotConfigured as e:
        raise HTTPException(503, str(e))
    return info


# ---- Legal documents (Privacy / Terms / Refund / Shipping / About / Contact) ----
class LegalUpsertIn(BaseModel):
    kind: str
    title: Optional[str] = None
    content_md: str = ""
    publish: bool = False


def _validate_kind(kind: str) -> None:
    if kind not in LEGAL_KINDS:
        raise HTTPException(400, f"Invalid kind. Must be one of: {', '.join(LEGAL_KINDS)}")


async def _resolve_public_tenant_id(
    slug: Optional[str], host_hdr: Optional[str], xfh_hdr: Optional[str]
) -> Optional[str]:
    if slug:
        t = await db.tenants.find_one({"slug": slug, "is_active": True}, {"id": 1})
        if t:
            return t["id"]
    host = tenant_resolver.normalize_host(xfh_hdr or host_hdr)
    if host:
        t = await tenant_resolver.resolve_tenant_from_host(db, host)
        if t:
            return t["id"]
    return None


@api.get("/public/legal/{kind}")
async def public_legal(
    kind: str,
    slug: Optional[str] = Query(None),
    x_tenant_slug: Optional[str] = Header(None, alias="X-Tenant-Slug"),
    request_host: Optional[str] = Header(None, alias="Host"),
    x_forwarded_host: Optional[str] = Header(None, alias="X-Forwarded-Host"),
):
    """Return the latest published legal doc for a tenant.

    Tenant resolution order: `?slug=` → `X-Tenant-Slug` header → Host header (custom domain / subdomain).
    Returns 404 with `code=legal_not_found` when the tenant has never published this kind — the frontend
    should render a platform-default fallback in that case.
    """
    _validate_kind(kind)
    tenant_id = await _resolve_public_tenant_id(slug or x_tenant_slug, request_host, x_forwarded_host)
    if not tenant_id:
        raise HTTPException(404, detail={"code": "tenant_not_resolved", "message": "Tenant could not be resolved"})
    doc = await db.legal_docs.find_one(
        {"tenant_id": tenant_id, "kind": kind, "is_published": True},
        sort=[("version", -1)],
    )
    if not doc:
        raise HTTPException(404, detail={"code": "legal_not_found", "kind": kind, "tenant_id": tenant_id})
    doc = clean(doc)
    return {
        "kind": doc["kind"],
        "title": doc.get("title") or kind.capitalize(),
        "content_md": doc.get("content_md", ""),
        "version": doc.get("version", 1),
        "published_at": doc.get("published_at"),
    }


@api.get("/admin/legal")
async def list_legal(user: dict = Depends(require_roles("tenant_admin"))):
    """List all legal doc versions for the current tenant (admin view)."""
    docs = await db.legal_docs.find({"tenant_id": user["tid"]}).sort("updated_at", -1).to_list(500)
    return [clean(d) for d in docs]


@api.get("/admin/legal/{kind}/latest")
async def get_legal_latest(kind: str, user: dict = Depends(require_roles("tenant_admin"))):
    _validate_kind(kind)
    doc = await db.legal_docs.find_one(
        {"tenant_id": user["tid"], "kind": kind}, sort=[("version", -1)]
    )
    if not doc:
        return {"kind": kind, "title": "", "content_md": "", "version": 0, "is_published": False}
    return clean(doc)


@api.post("/admin/legal")
async def upsert_legal(payload: LegalUpsertIn, user: dict = Depends(require_roles("tenant_admin"))):
    """Create a new version. If publish=True, marks it published and returns it.

    Publishing atomically demotes prior versions of the same kind so only the
    newest published row is served publicly.
    """
    _validate_kind(payload.kind)
    latest = await db.legal_docs.find_one(
        {"tenant_id": user["tid"], "kind": payload.kind}, sort=[("version", -1)]
    )
    next_version = int((latest or {}).get("version", 0)) + 1
    doc = LegalDocument(
        tenant_id=user["tid"],
        kind=payload.kind,
        title=payload.title or payload.kind.capitalize(),
        content_md=payload.content_md,
        version=next_version,
        is_published=bool(payload.publish),
        published_at=now_iso() if payload.publish else None,
        updated_by=user["sub"],
    )
    if payload.publish:
        await db.legal_docs.update_many(
            {"tenant_id": user["tid"], "kind": payload.kind, "is_published": True},
            {"$set": {"is_published": False, "updated_at": now_iso()}},
        )
    await db.legal_docs.insert_one(doc.model_dump())
    return clean(doc.model_dump())


@api.post("/admin/legal/{doc_id}/publish")
async def publish_legal(doc_id: str, user: dict = Depends(require_roles("tenant_admin"))):
    doc = await db.legal_docs.find_one({"id": doc_id, "tenant_id": user["tid"]})
    if not doc:
        raise HTTPException(404, "Legal doc not found")
    await db.legal_docs.update_many(
        {"tenant_id": user["tid"], "kind": doc["kind"], "is_published": True},
        {"$set": {"is_published": False, "updated_at": now_iso()}},
    )
    await db.legal_docs.update_one(
        {"id": doc_id},
        {"$set": {"is_published": True, "published_at": now_iso(), "updated_at": now_iso()}},
    )
    d = await db.legal_docs.find_one({"id": doc_id})
    return clean(d)


@api.delete("/admin/legal/{doc_id}")
async def delete_legal(doc_id: str, user: dict = Depends(require_roles("tenant_admin"))):
    r = await db.legal_docs.delete_one({"id": doc_id, "tenant_id": user["tid"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Legal doc not found")
    return {"ok": True}


# ==================== END PHASE 3 ====================


# ==================== PHASE 4: SOFT-DELETE + SESSION REVOCATION ====================
# Order statuses that count as "active" (non-terminal) — a user with any of these
# open orders cannot self-delete until they are resolved.
_ACTIVE_ORDER_STATUSES = ("draft", "submitted", "approved", "packed", "dispatched")


async def _has_active_orders(tenant_id: str, user_id: str) -> bool:
    n = await db.orders.count_documents({
        "tenant_id": tenant_id,
        "customer_id": user_id,
        "status": {"$in": list(_ACTIVE_ORDER_STATUSES)},
    })
    return n > 0


@api.post("/auth/me/delete")
async def delete_my_account(user: dict = Depends(get_current_user)):
    """Soft-delete the authenticated user (App Store / Play Store compliance).

    Strict guards:
      * Reject if `outstanding_amount > 0` (customers / dealers).
      * Reject if there is any active (non-terminal) order for this user.

    On success: sets `is_active=false`, `deleted_at=now`, `token_revoked_after=now`.
    All existing JWTs for this user become invalid on the next request.

    Reviewer bypass: the App Store reviewer account (phone 9898989898) is
    prevented from self-deleting so reviewers can traverse the app repeatedly.
    """
    uid = user["sub"]
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "User not found")
    if u.get("phone") == REVIEWER_PHONE:
        raise HTTPException(403, detail={"code": "reviewer_no_self_delete", "message": "Reviewer account cannot be deleted"})
    if u.get("role") == "super_admin":
        raise HTTPException(403, detail={"code": "super_admin_no_self_delete", "message": "Super admin cannot self-delete via this endpoint"})

    outstanding = float(u.get("outstanding_amount") or 0)
    if outstanding > 0:
        raise HTTPException(
            409,
            detail={"code": "outstanding_balance",
                    "message": f"Settle outstanding balance of {outstanding} before deleting your account.",
                    "outstanding_amount": outstanding},
        )

    tid = u.get("tenant_id")
    if tid and await _has_active_orders(tid, uid):
        raise HTTPException(
            409,
            detail={"code": "active_orders",
                    "message": "You have active orders. Wait for them to be delivered or cancelled before deleting your account."},
        )

    ts = now_iso()
    await db.users.update_one(
        {"id": uid},
        {"$set": {"is_active": False, "deleted_at": ts, "token_revoked_after": ts, "updated_at": ts}},
    )
    return {"ok": True, "deleted_at": ts}


@api.post("/auth/logout-all")
async def logout_all(user: dict = Depends(get_current_user)):
    """Revoke every JWT ever issued to this user (self-service kill switch)."""
    ts = now_iso()
    await db.users.update_one({"id": user["sub"]}, {"$set": {"token_revoked_after": ts}})
    return {"ok": True, "revoked_after": ts}


# ==================== END PHASE 4 ====================


# ==================== PHASE 5: FCM SHARDED PUSH ====================
class PushRegisterIn(BaseModel):
    token: str
    platform: str = "android"  # ios | android | web
    device_label: Optional[str] = None


@api.post("/push/register")
async def push_register(payload: PushRegisterIn, user: dict = Depends(get_current_user)):
    """Upsert an FCM registration token for the authenticated user's device.

    Silent no-op safe: this only stores the token; the actual FCM shard config
    can arrive later and everything just starts working.
    """
    if payload.platform not in PUSH_PLATFORMS:
        raise HTTPException(400, f"Invalid platform. Must be one of: {', '.join(PUSH_PLATFORMS)}")
    tid = user.get("tid")
    if not tid:
        raise HTTPException(400, "Push tokens are tenant-scoped; super_admin has no tenant")
    now = now_iso()
    doc = await db.push_tokens.find_one({"user_id": user["sub"], "token": payload.token})
    if doc:
        await db.push_tokens.update_one(
            {"id": doc["id"]},
            {"$set": {"last_seen_at": now, "platform": payload.platform, "device_label": payload.device_label}},
        )
        return {"ok": True, "id": doc["id"], "updated": True}
    pt = PushToken(
        tenant_id=tid, user_id=user["sub"], token=payload.token,
        platform=payload.platform, device_label=payload.device_label,
    )
    await db.push_tokens.insert_one(pt.model_dump())
    return {"ok": True, "id": pt.id, "updated": False}


class PushUnregisterIn(BaseModel):
    token: str


@api.post("/push/unregister")
async def push_unregister(payload: PushUnregisterIn, user: dict = Depends(get_current_user)):
    r = await db.push_tokens.delete_one({"user_id": user["sub"], "token": payload.token})
    return {"ok": True, "removed": r.deleted_count}


async def _dispatch_to_tenant(tenant_id: str, title: str, body: str,
                              data: Optional[Dict[str, str]] = None,
                              user_ids: Optional[List[str]] = None) -> Dict[str, object]:
    """Look up the tenant's Firebase config (Phase 8) or shard (Phase 5) and dispatch.

    Preference order:
      1. `tenant_firebase_config` DB doc with android or ios app — use its Firebase project.
      2. Env-based `FCM_SHARD_<tenant.fcm_shard_id>_*` fallback.
    """
    tenant = await db.tenants.find_one({"id": tenant_id}, {"fcm_shard_id": 1})
    if not tenant:
        return {"sent": 0, "failed": 0, "disabled": "tenant not found", "tokens_targeted": 0}
    shard = int(tenant.get("fcm_shard_id") or 1)
    q: Dict[str, object] = {"tenant_id": tenant_id}
    if user_ids:
        q["user_id"] = {"$in": user_ids}
    tokens = [d["token"] for d in await db.push_tokens.find(q, {"token": 1}).to_list(5000)]

    # --- Phase 8: prefer per-tenant Firebase config from DB ---
    tfc = await db.tenant_firebase_config.find_one({"tenant_id": tenant_id})
    if tfc:
        app_meta = tfc.get("android") or tfc.get("ios")
        proj_id_ref = (app_meta or {}).get("firebase_project_id")
        if proj_id_ref:
            fp = await db.firebase_projects.find_one({"id": proj_id_ref})
            if fp and fp.get("service_account_json") and fp.get("project_id"):
                result = fcm_service.send_to_tokens(
                    shard, tokens, title, body, data,
                    service_account_json=fp["service_account_json"],
                    project_id=fp["project_id"],
                )
                result["tokens_targeted"] = len(tokens)
                result["source"] = "tenant_firebase_config"
                result["firebase_project_id"] = fp["project_id"]
                return result

    # --- Phase 5 fallback: env-based shard ---
    result = fcm_service.send_to_tokens(shard, tokens, title, body, data)
    result["tokens_targeted"] = len(tokens)
    result["shard_id"] = shard
    result["source"] = "env_shard"
    return result


class PushTestIn(BaseModel):
    title: str = "Test notification"
    body: str = "Hello from FieldCRM"
    data: Optional[Dict[str, str]] = None
    user_ids: Optional[List[str]] = None  # Optional filter; default: entire tenant


@api.post("/admin/push/test")
async def push_test(
    payload: PushTestIn = Body(default_factory=PushTestIn),
    user: dict = Depends(require_roles("tenant_admin")),
):
    """Send a test push to (a subset of) the tenant's devices.

    Returns fcm_service dispatch result — including `disabled` when the shard's
    Firebase project credentials are not yet configured.
    """
    return await _dispatch_to_tenant(
        tenant_id=user["tid"], title=payload.title, body=payload.body,
        data=payload.data, user_ids=payload.user_ids,
    )


@api.get("/admin/push/status")
async def push_status(user: dict = Depends(require_roles("tenant_admin"))):
    """Diagnostic: shard configured?, token count for this tenant."""
    tenant = await db.tenants.find_one({"id": user["tid"]}, {"fcm_shard_id": 1})
    shard = int((tenant or {}).get("fcm_shard_id") or 1)
    tokens = await db.push_tokens.count_documents({"tenant_id": user["tid"]})
    return {
        "shard_id": shard,
        "shard_configured": fcm_service.is_shard_configured(shard),
        "configured_shards": fcm_service.configured_shards(),
        "shard_capacity": fcm_service.SHARD_CAPACITY,
        "tokens_registered": tokens,
    }


@api.get("/super/push/shards")
async def super_push_shards(user: dict = Depends(require_roles("super_admin"))):
    """Overview of shard usage — used by super-admin to plan onboarding."""
    agg = await db.tenants.aggregate([
        {"$group": {"_id": "$fcm_shard_id", "count": {"$sum": 1}, "tenants": {"$push": "$slug"}}},
        {"$sort": {"_id": 1}},
    ]).to_list(200)
    rows = [
        {
            "shard_id": int(row["_id"] or 1),
            "tenant_count": row["count"],
            "tenants": row["tenants"],
            "configured": fcm_service.is_shard_configured(int(row["_id"] or 1)),
            "capacity": fcm_service.SHARD_CAPACITY,
            "remaining": max(0, fcm_service.SHARD_CAPACITY - row["count"]),
        }
        for row in agg
    ]
    return {"shards": rows, "configured_shards": fcm_service.configured_shards()}


# ==================== END PHASE 5 ====================


# ==================== PHASE 8: CLOUD CREDENTIALS + PER-TENANT FIREBASE ====================
class AwsCredentialsIn(BaseModel):
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str
    aws_bucket_name: str
    aws_public_media_host: Optional[str] = ""


def _mask(secret: str) -> str:
    if not secret:
        return ""
    if len(secret) <= 8:
        return "***"
    return f"{secret[:4]}…{secret[-4:]}"


@api.get("/super/aws-credentials")
async def get_aws_credentials(user: dict = Depends(require_roles("super_admin"))):
    """Return currently-saved AWS creds with the secret masked. Never leaks the raw secret."""
    doc = await db.platform_settings.find_one({"key": "aws_credentials"})
    v = (doc or {}).get("value") or {}
    return {
        "configured": s3_presign.is_configured(),
        "aws_access_key_id": v.get("aws_access_key_id", ""),
        "aws_secret_access_key_masked": _mask(v.get("aws_secret_access_key", "")),
        "aws_region": v.get("aws_region", ""),
        "aws_bucket_name": v.get("aws_bucket_name", ""),
        "aws_public_media_host": v.get("aws_public_media_host", ""),
    }


@api.put("/super/aws-credentials")
async def put_aws_credentials(payload: AwsCredentialsIn,
                              user: dict = Depends(require_roles("super_admin"))):
    """Store AWS credentials in DB and immediately apply them at runtime.

    After a successful save, `/api/uploads/presign` starts working without a
    server restart. Bucket + region are validated by calling `head_bucket`.
    """
    value = payload.model_dump()
    # Persist first so we can reload on restart even if head_bucket fails now.
    await db.platform_settings.update_one(
        {"key": "aws_credentials"},
        {"$set": {"value": value, "updated_at": now_iso(), "updated_by": user["sub"]}},
        upsert=True,
    )
    # Apply at runtime
    s3_presign.apply_runtime_credentials({
        "AWS_ACCESS_KEY_ID": payload.aws_access_key_id,
        "AWS_SECRET_ACCESS_KEY": payload.aws_secret_access_key,
        "AWS_REGION": payload.aws_region,
        "AWS_S3_BUCKET": payload.aws_bucket_name,
        "AWS_PUBLIC_MEDIA_HOST": payload.aws_public_media_host or "",
    })
    # Best-effort connectivity test (do not fail the save on network hiccups).
    verify: Dict[str, object] = {"attempted": False}
    try:
        client = s3_presign._client()  # noqa - internal ok for validation
        client.head_bucket(Bucket=payload.aws_bucket_name)
        verify = {"attempted": True, "ok": True}
    except Exception as e:
        verify = {"attempted": True, "ok": False, "error": str(e)[:250]}
    return {"ok": True, "configured": s3_presign.is_configured(), "verify": verify}


# ---- Firebase projects (Super Admin CRUD) ----
class FirebaseProjectIn(BaseModel):
    name: str
    project_id: str
    service_account_json: Dict[str, Any]


@api.get("/super/firebase-projects")
async def list_firebase_projects(user: dict = Depends(require_roles("super_admin"))):
    """List Firebase projects with usage counters and remote app counts (best effort)."""
    rows = await db.firebase_projects.find().sort("created_at", -1).to_list(200)
    out = []
    for r in rows:
        r = clean(r)
        r.pop("service_account_json", None)  # do not leak the raw JSON
        # count tenant bindings for this project
        used = await db.tenant_firebase_config.count_documents({
            "$or": [
                {"android.firebase_project_id": r["id"]},
                {"ios.firebase_project_id": r["id"]},
            ]
        })
        r["tenants_bound"] = used
        r["remaining_apps"] = max(0, r.get("max_apps", FIREBASE_PROJECT_MAX_APPS) - r.get("apps_provisioned", 0))
        out.append(r)
    return out


@api.post("/super/firebase-projects")
async def create_firebase_project(payload: FirebaseProjectIn,
                                  user: dict = Depends(require_roles("super_admin"))):
    if not payload.service_account_json or not isinstance(payload.service_account_json, dict):
        raise HTTPException(400, "service_account_json must be a JSON object")
    if payload.service_account_json.get("type") != "service_account":
        raise HTTPException(400, "Provided JSON is not a Google service-account key")
    # Enforce uniqueness on project_id
    clash = await db.firebase_projects.find_one({"project_id": payload.project_id})
    if clash:
        raise HTTPException(409, "A Firebase project with this project_id already exists")
    fp = FirebaseProject(
        name=payload.name, project_id=payload.project_id,
        service_account_json=payload.service_account_json,
    )
    # Best-effort app count refresh so the UI shows real capacity immediately.
    listing = firebase_provisioning.list_apps(payload.project_id, payload.service_account_json)
    if listing.get("ok"):
        fp.apps_provisioned = int(listing["total"])
    await db.firebase_projects.insert_one(fp.model_dump())
    out = clean(fp.model_dump())
    out.pop("service_account_json", None)
    out["listing"] = listing
    return out


@api.delete("/super/firebase-projects/{fp_id}")
async def delete_firebase_project(fp_id: str, user: dict = Depends(require_roles("super_admin"))):
    bound = await db.tenant_firebase_config.count_documents({
        "$or": [
            {"android.firebase_project_id": fp_id},
            {"ios.firebase_project_id": fp_id},
        ]
    })
    if bound:
        raise HTTPException(409, f"{bound} tenant(s) still bound to this project; unbind first")
    r = await db.firebase_projects.delete_one({"id": fp_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Firebase project not found")
    return {"ok": True}


@api.post("/super/firebase-projects/{fp_id}/refresh")
async def refresh_firebase_project(fp_id: str, user: dict = Depends(require_roles("super_admin"))):
    """Re-count remote apps via the Firebase Management API and update `apps_provisioned`."""
    fp = await db.firebase_projects.find_one({"id": fp_id})
    if not fp:
        raise HTTPException(404, "Firebase project not found")
    listing = firebase_provisioning.list_apps(fp["project_id"], fp["service_account_json"])
    if not listing.get("ok"):
        raise HTTPException(502, detail={"code": "firebase_api_error", "message": listing.get("error")})
    await db.firebase_projects.update_one(
        {"id": fp_id},
        {"$set": {"apps_provisioned": int(listing["total"]), "updated_at": now_iso()}},
    )
    return {"ok": True, **listing}


# ---- Per-tenant Firebase config ----
class TenantAppExistingIn(BaseModel):
    """Bring-your-own Firebase app — admin pastes app_id + config file text."""
    platform: str  # "android" | "ios"
    firebase_project_id: Optional[str] = None  # our FirebaseProject.id if the project is registered
    app_id: str
    package_name: Optional[str] = None
    config_json: Optional[str] = None  # raw google-services.json / GoogleService-Info.plist text


class TenantAppProvisionIn(BaseModel):
    """Auto-provision a new app under the given FirebaseProject.id."""
    platform: str  # "android" | "ios"
    firebase_project_id: str  # our FirebaseProject.id
    package_or_bundle: Optional[str] = None  # override; else derived from tenant slug


async def _load_tfc(tenant_id: str) -> Dict[str, Any]:
    doc = await db.tenant_firebase_config.find_one({"tenant_id": tenant_id})
    if not doc:
        return {"tenant_id": tenant_id, "android": None, "ios": None}
    d = clean(doc)
    # Guarantee both platform keys are present (may be None) so callers can rely on the shape.
    d.setdefault("android", None)
    d.setdefault("ios", None)
    return d


@api.get("/super/tenants/{tenant_id}/firebase-config")
async def get_tenant_firebase_config(tenant_id: str,
                                     user: dict = Depends(require_roles("super_admin"))):
    tenant = await db.tenants.find_one({"id": tenant_id}, {"slug": 1, "name": 1})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    cfg = await _load_tfc(tenant_id)
    return {"tenant": {"id": tenant_id, "slug": tenant.get("slug"), "name": tenant.get("name")}, **cfg}


@api.put("/super/tenants/{tenant_id}/firebase-config")
async def upsert_tenant_firebase_config_existing(
    tenant_id: str, payload: TenantAppExistingIn,
    user: dict = Depends(require_roles("super_admin")),
):
    """Save existing Firebase app details for one platform of a tenant.

    Backward compat: the tenant may already have the other platform provisioned;
    this endpoint only touches the platform in the payload.
    """
    if payload.platform not in FIREBASE_APP_PLATFORMS:
        raise HTTPException(400, "platform must be 'android' or 'ios'")
    if not (await db.tenants.find_one({"id": tenant_id})):
        raise HTTPException(404, "Tenant not found")
    app_entry = TenantFirebaseApp(
        platform=payload.platform, mode="existing",
        firebase_project_id=payload.firebase_project_id,
        app_id=payload.app_id, package_name=payload.package_name,
        config_json=payload.config_json,
    )
    await db.tenant_firebase_config.update_one(
        {"tenant_id": tenant_id},
        {"$set": {payload.platform: app_entry.model_dump(), "updated_at": now_iso()},
         "$setOnInsert": {"id": gen_id(), "tenant_id": tenant_id}},
        upsert=True,
    )
    return await _load_tfc(tenant_id)


@api.post("/super/tenants/{tenant_id}/firebase-config/provision")
async def provision_tenant_firebase_app(
    tenant_id: str, payload: TenantAppProvisionIn,
    user: dict = Depends(require_roles("super_admin")),
):
    """Real-time provision one Firebase app for a tenant.

    * If the Firebase project is out of capacity → 409.
    * If Google's API is unreachable / errors → the request stores mode='auto'
      with `provisioning_error` set so the UI can show the reason and offer
      the user a "retry" or a "paste existing config" fallback (option "c").
    """
    if payload.platform not in FIREBASE_APP_PLATFORMS:
        raise HTTPException(400, "platform must be 'android' or 'ios'")
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    fp = await db.firebase_projects.find_one({"id": payload.firebase_project_id})
    if not fp:
        raise HTTPException(404, "Firebase project not found — upload its service account first")
    if fp.get("apps_provisioned", 0) >= fp.get("max_apps", FIREBASE_PROJECT_MAX_APPS):
        raise HTTPException(409, detail={
            "code": "firebase_capacity_exhausted",
            "message": f"Project '{fp['name']}' is at {fp.get('apps_provisioned')}/{fp.get('max_apps')} apps. Upload another Firebase project.",
        })

    # Derive package name / bundle id from tenant slug if the caller didn't pass one.
    slug = (tenant.get("slug") or "tenant").lower()
    clean_slug = "".join(c for c in slug if c.isalnum())
    default_bundle = f"in.localappstore.fieldcrm.{clean_slug or 'app'}"
    package_or_bundle = payload.package_or_bundle or default_bundle
    display_name = f"{tenant.get('name') or slug} ({payload.platform})"

    result = firebase_provisioning.create_app(
        project_id=fp["project_id"],
        service_account_json=fp["service_account_json"],
        platform=payload.platform,
        package_or_bundle=package_or_bundle,
        display_name=display_name,
    )

    app_entry = TenantFirebaseApp(
        platform=payload.platform,
        mode="auto",
        firebase_project_id=fp["id"],
        package_name=package_or_bundle,
        app_id=result.get("app_id") if result.get("ok") else None,
        config_json=result.get("config_json") if result.get("ok") else None,
        provisioned_at=now_iso() if result.get("ok") else None,
        provisioning_error=None if result.get("ok") else result.get("error"),
    )
    await db.tenant_firebase_config.update_one(
        {"tenant_id": tenant_id},
        {"$set": {payload.platform: app_entry.model_dump(), "updated_at": now_iso()},
         "$setOnInsert": {"id": gen_id(), "tenant_id": tenant_id}},
        upsert=True,
    )
    if result.get("ok"):
        await db.firebase_projects.update_one(
            {"id": fp["id"]},
            {"$inc": {"apps_provisioned": 1}, "$set": {"updated_at": now_iso()}},
        )
    tfc = await _load_tfc(tenant_id)
    return {"ok": bool(result.get("ok")), "result": result, "config": tfc}


@api.delete("/super/tenants/{tenant_id}/firebase-config/{platform}")
async def unbind_tenant_firebase_app(
    tenant_id: str, platform: str,
    user: dict = Depends(require_roles("super_admin")),
):
    if platform not in FIREBASE_APP_PLATFORMS:
        raise HTTPException(400, "platform must be 'android' or 'ios'")
    await db.tenant_firebase_config.update_one(
        {"tenant_id": tenant_id},
        {"$unset": {platform: ""}, "$set": {"updated_at": now_iso()}},
    )
    return await _load_tfc(tenant_id)


# ---- Super Admin: per-tenant test push ----
class SuperPushTestIn(BaseModel):
    title: str = "Test notification"
    body: str = "Hello from FieldCRM"
    data: Optional[Dict[str, str]] = None
    user_ids: Optional[List[str]] = None
    # If no real device tokens are stored, we can still exercise the Firebase
    # send path by passing a synthetic token; useful for smoke tests.
    dry_run_token: Optional[str] = None


@api.post("/super/tenants/{tenant_id}/push/test")
async def super_push_test(tenant_id: str,
                          payload: SuperPushTestIn = Body(default_factory=SuperPushTestIn),
                          user: dict = Depends(require_roles("super_admin"))):
    tenant = await db.tenants.find_one({"id": tenant_id}, {"id": 1, "slug": 1})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if payload.dry_run_token:
        # Inject one synthetic token so the send path exercises real credentials.
        await db.push_tokens.update_one(
            {"user_id": f"__super_dry__{tenant_id}", "token": payload.dry_run_token},
            {"$set": {"tenant_id": tenant_id, "platform": "android",
                      "device_label": "super-admin dry-run",
                      "last_seen_at": now_iso()},
             "$setOnInsert": {"id": gen_id(), "created_at": now_iso()}},
            upsert=True,
        )
    return await _dispatch_to_tenant(
        tenant_id=tenant_id, title=payload.title, body=payload.body,
        data=payload.data, user_ids=payload.user_ids,
    )


# ==================== END PHASE 8 ====================


# Include routes & CORS
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
