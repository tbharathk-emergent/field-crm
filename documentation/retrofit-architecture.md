# FieldCRM Retrofit Architecture — 7-Phase Reference

**Status:** Phases 1–6 shipped LIVE. Phase 7 (this doc + full regression) is complete as of Feb 8, 2026.

**Golden rule (applied throughout):** additive only. No column removals, no business-logic rewrites. Every new field defaults to `null` / empty / benign so existing rows and existing tenants keep working exactly as before.

---

## Phase 1 — Environment Variable Discipline (Block G)

| Artifact | Location |
|----------|----------|
| Env template (backend) | `/app/backend/.env.example` |
| Env template (frontend) | `/app/frontend/.env.example` |
| Fail-fast validator | `require_env([...])` in `/app/backend/server.py` |
| Reference doc | `/app/documentation/environment-variables.md` |

**Behaviour**
- Startup raises `RuntimeError` if any required var is missing/blank (MONGO_URL, DB_NAME, JWT_SECRET, JWT_ALGO, JWT_TTL_HOURS, CORS_ORIGINS, APP_NAME, SUPER_ADMIN_PHONE, SUPER_ADMIN_OTP, DEMO_OTP).
- Optional vars: `EMERGENT_LLM_KEY`, `AWS_*` (Phase 3), `FCM_SHARD_*` (Phase 5), `ROOT_DOMAIN` (Phase 2).
- `auth.py` loads `.env` early so it works even when imported before `server.py` fires its own `load_dotenv()`.

---

## Phase 2 — Multi-Tenant Subdomain Resolver (Block A) — **SHIPPED LIVE**

| Artifact | Location |
|----------|----------|
| Resolver module | `/app/backend/tenant_resolver.py` |
| Endpoint | `GET /api/public/tenant-resolve?host=<host>` |
| Model field | `Tenant.custom_domain: Optional[str]` |
| Index | `tenants.custom_domain` sparse-unique |
| Frontend hook | `AppContext.resolveHostTenant()` on boot |
| Admin UI | Tenant Admin → Branding → Custom Domain input |

**Resolution order**
1. Cache hit on normalized host (TTL: `TENANT_CACHE_TTL_SECONDS`, default 300s).
2. Mongo lookup on `custom_domain`.
3. `<slug>.<ROOT_DOMAIN>` subdomain.
4. Negative cache the miss (60s).

**Self-heal**: 404s from `/public/tenants/by-slug/:slug` and internal lookups return `{code: "tenant_not_found"}`; frontend drops the stale slug from localStorage.

**Cache invalidation** wired into `PATCH /tenant/profile`, `PATCH /super/tenants/:id`, `DELETE /super/tenants/:id`.

---

## Phase 3 — S3 Direct Upload + Legal CRUD (Blocks C & E)

### S3 Presign
| Artifact | Location |
|----------|----------|
| Module | `/app/backend/s3_presign.py` |
| Endpoint | `POST /api/uploads/presign` |
| Env vars | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_S3_PRESIGN_TTL_SECONDS` |

**Behaviour**: Returns SigV4 PUT URL. When any env var is missing → **503 "S3 uploads not configured on this environment"**. Key layout: `tenant/<tid>/<module>/<user>/<uuid>-<safe-name>`.

### Legal CRUD (`/legal/:kind`)
| Endpoint | Purpose |
|----------|---------|
| `GET /api/public/legal/{kind}` | Serve latest published doc for tenant (via slug/header/host) |
| `GET /api/admin/legal` | List all versions (tenant admin) |
| `GET /api/admin/legal/{kind}/latest` | Editor bootstrap |
| `POST /api/admin/legal` | Create version, optional publish (atomic demotion of prior versions) |
| `POST /api/admin/legal/{id}/publish` | Publish a draft |
| `DELETE /api/admin/legal/{id}` | Remove a version |

**Kinds**: `privacy`, `terms`, `refund`, `shipping`, `about`, `contact`.

**Frontend**
- Public route `/legal/:kind` and `/t/:slug/legal/:kind` with empty-state fallback.
- Tenant Admin page `/t/:slug/admin/legal` (per-kind tabs, Save Draft / Publish).
- Customer Account page surfaces Privacy / Terms / Refund / Contact links.

---

## Phase 4 — Soft-Delete + Session Revocation + Reviewer Bypass (Block D)

### Session validation
- Registered on startup via `auth.set_session_validator(_session_validator)`.
- Every Bearer request rejects: user deleted, user disabled, `iat < token_revoked_after`.

### Endpoints
| Endpoint | Behaviour |
|----------|-----------|
| `POST /api/auth/me/delete` | Soft-delete self with strict guards |
| `POST /api/auth/logout-all` | Bump `token_revoked_after` — kills every issued JWT |

### Delete guards (409 with machine-readable `code`)
- `outstanding_balance` — any `outstanding_amount > 0`.
- `active_orders` — any Order in `draft / submitted / approved / packed / dispatched`.
- Reviewer (`9898989898`) and super-admin cannot self-delete.

### Reviewer bypass (App Store / Play Store universal)
- Phone `9898989898` + OTP `123456` → **no tenant slug required**. Logs in as `tenant_admin` of the `demo` tenant. Auto-seeded + auto-reactivated on every audit.

### Frontend
- Customer Account page → **Delete My Account** button with confirm dialog.

---

## Phase 5 — FCM Sharded Push + Capacitor Build (Block B)

### Sharding
| Artifact | Location |
|----------|----------|
| Module | `/app/backend/fcm_service.py` |
| Constant | `SHARD_CAPACITY = 15` tenants per Firebase project |
| Model field | `Tenant.fcm_shard_id: int = 1` (auto-assigned round-robin at create) |
| Env vars per shard | `FCM_SHARD_<i>_PROJECT_ID`, `FCM_SHARD_<i>_CREDENTIALS_JSON` |

### Endpoints
| Endpoint | Purpose |
|----------|---------|
| `POST /api/push/register` | Upsert an FCM token per user-device |
| `POST /api/push/unregister` | Remove a token |
| `POST /api/admin/push/test` | Tenant admin dispatches test push through tenant's shard |
| `GET /api/admin/push/status` | Diagnostic: shard configured?, token count |
| `GET /api/super/push/shards` | Overview: per-shard tenant list, remaining capacity |

**Send policy**: `send_to_tokens()` never raises. Missing shard config → `{sent: 0, disabled: "…"}`. firebase-admin absence → same benign response.

### Capacitor per-tenant build
```bash
./capacitor-build.sh <tenant-slug> [ios|android|both]
```

- Fetches tenant JSON, derives `appId = in.localappstore.fieldcrm.<slug>`, emits branded `capacitor.config.ts`.
- Drops shard-appropriate `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from env-provided paths.
- Output: `/app/dist/tenants/<slug>` — open with `yarn cap open ios` / `yarn cap open android`.
- Idempotent — rerun refreshes config + assets.

---

## Phase 6 — iOS Safe-Area CSS (Block H)

| Artifact | Location |
|----------|----------|
| Meta tags | `/app/frontend/public/index.html` — `viewport-fit=cover`, `apple-mobile-web-app-capable` |
| CSS vars | `--sa-top`, `--sa-right`, `--sa-bottom`, `--sa-left` in `index.css` |
| Utilities | `.safe-pt`, `.safe-pb`, `.safe-px`, `.safe-mb`, `.safe-inset-x`, `.fixed-bottom-safe` |
| Sonner | Toast containers shifted by safe-area on all four positions |
| Shells | `MobileShell` + `MobileAdminShell` apply `.safe-pt` (header) and `.safe-pb` (bottom nav) |

---

## Phase 7 — Full Regression

- **146 / 146 backend pytest cases green.**
- Fixed one pre-existing 500-error bug: customer auto-register now returns 409 `{code: "phone_role_conflict"}` instead of leaking a `DuplicateKeyError` when the phone is already registered under a different role in the same tenant.
- Fixed one pre-existing test using dealer phone as customer.
- Restored the demo tenant name (`Akshara Agro`) via super-admin PATCH.
- No console errors on landing / login / legal / admin routes at desktop + iPhone viewports.

---

## Quick Test Credentials

| Role | Phone | OTP | Notes |
|------|-------|-----|-------|
| Super Admin | 9858558555 | 557725 | No tenant slug |
| Reviewer (App/Play Store) | 9898989898 | 123456 | Universal — no tenant slug needed, cannot self-delete |
| Tenant Admin (demo) | 9000000001 | 123456 | Ravi Kumar |
| Manager | 9000000002 | 123456 | Suresh Reddy |
| Employee | 9000000003 | 123456 | Anil Sharma |
| Dealer | 9000000004 | 123456 | Ramesh Naidu |
| Customer (Farmer) | 9000000007 | 123456 | Venkat Rao |

---

## Files added / modified across the retrofit

**New backend modules**
- `tenant_resolver.py` (Phase 2)
- `s3_presign.py` (Phase 3)
- `fcm_service.py` (Phase 5)

**New / updated docs**
- `documentation/environment-variables.md`
- `documentation/retrofit-architecture.md` (this file)

**New / updated frontend**
- `pages/Legal.jsx` (public)
- `pages/TenantAdmin/LegalDocs.jsx` (admin CRUD)
- `context/AppContext.jsx` (host-based tenant self-heal + resolveHostTenant)
- `pages/TenantAdmin/Branding.jsx` (Custom Domain input)
- `pages/Customer/Account.jsx` (Legal links + Delete My Account)
- `components/Layout/MobileShell.jsx` + `MobileAdminShell.jsx` (safe-area classes)
- `index.css` (Phase 6 safe-area system)
- `public/index.html` (viewport-fit=cover)

**New scripts**
- `capacitor-build.sh` — per-tenant iOS + Android build automation

**New pytest suites**
- `tests/test_phase2_subdomain.py` — 9 cases
- `tests/test_phase34_uploads_legal_delete.py` — 11 cases
- `tests/test_phase5_fcm.py` — 12 cases
