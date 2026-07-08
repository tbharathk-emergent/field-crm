"""Pydantic models for FieldCRM SaaS platform."""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict
import uuid


def gen_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Tenant / Plan ----------
class Plan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    name: str
    code: str  # free_trial | monthly | yearly | custom
    price_monthly: float = 0.0
    price_yearly: float = 0.0
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
    created_at: str = Field(default_factory=now_iso)


class TenantTheme(BaseModel):
    primary: str = "#2C5E43"
    secondary: str = "#D35400"
    primary_hover: str = "#1e422f"


class TenantLabels(BaseModel):
    customer: str = "Customer"  # what we call end customer (Farmer/Customer/Patient etc.)
    customer_plural: str = "Customers"
    dealer: str = "Dealer"
    dealer_plural: str = "Dealers"
    product: str = "Product"
    product_plural: str = "Products"
    employee: str = "Employee"
    area: str = "Area"
    visit: str = "Visit"
    collection: str = "Collection"
    sales: str = "Sales"


class Tenant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    slug: str  # e.g. "demo", "akshara"
    name: str  # e.g. "Akshara Agro"
    business_type: str = "Agriculture"  # Agriculture | FMCG | Pharma | Manufacturing | Service | Other
    logo_path: Optional[str] = None  # storage path
    theme: TenantTheme = Field(default_factory=TenantTheme)
    labels: TenantLabels = Field(default_factory=TenantLabels)
    default_language: str = "en"
    plan_id: Optional[str] = None
    plan_status: str = "trial"  # trial | active | expired | disabled
    trial_ends_at: Optional[str] = None
    is_active: bool = True
    google_maps_api_key: Optional[str] = None  # tenant-level placeholder
    order_approval_flow: str = "direct"  # direct | sales_exec | manager | admin
    catalog_mode: str = "direct"  # direct (show prices, cart+checkout) | enquiry_only (hide prices, enquiry flow)
    features: Dict[str, bool] = Field(default_factory=lambda: {"crop_advisor": False})
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    # Phase 2 — Subdomain / custom-domain routing. Additive: defaults null; existing rows untouched.
    custom_domain: Optional[str] = None  # e.g. "portal.acme.com" — lowercase, no protocol, no path
    # Phase 5 — Firebase shard assignment. Additive: existing rows get shard 1 lazily.
    fcm_shard_id: int = 1
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ---------- User / Auth ----------
# "dealer" = B2B distributor/retailer, "customer" = B2C end-user (Farmer)
ROLE = Literal["super_admin", "tenant_admin", "manager", "employee", "dealer", "customer"]


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: Optional[str] = None  # null for super_admin
    phone: str
    name: str = ""
    email: Optional[str] = None
    role: str = "employee"
    role_id: Optional[str] = None  # custom role with permissions (Phase 2)
    employee_code: Optional[str] = None
    manager_id: Optional[str] = None  # only for employees
    area: Optional[str] = None
    area_node_id: Optional[str] = None  # Phase 2 - assignment in area hierarchy
    leave_balance: float = 12.0  # days/year, Phase 2
    is_active: bool = True
    profile_photo_path: Optional[str] = None
    language: str = "en"
    # customer fields
    business_name: Optional[str] = None
    dealer_code: Optional[str] = None
    address: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    gst_number: Optional[str] = None
    assigned_employee_id: Optional[str] = None
    credit_limit: float = 0.0
    outstanding_amount: float = 0.0
    # farmer-specific (role="customer")
    farm_size_acres: Optional[float] = None
    crops: Optional[str] = None  # comma-separated (legacy freeform)
    my_crops: List[str] = []  # crop_ids the farmer has selected in Crop Advisor
    # Custom fields (tenant-defined) → {field_key: value}
    custom_data: Dict[str, Any] = {}
    # Phase 4 — Soft-delete + session revocation (additive, defaults null).
    deleted_at: Optional[str] = None
    # Any JWT with iat < token_revoked_after is rejected. Bump on logout-all / password change / self-delete.
    token_revoked_after: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class OtpRequest(BaseModel):
    phone: str
    tenant_slug: Optional[str] = None
    channel: str = "sms"  # sms | whatsapp


class OtpVerify(BaseModel):
    phone: str
    otp: str
    tenant_slug: Optional[str] = None


# ---------- Attendance ----------
class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    user_id: str
    user_name: str = ""
    date: str  # YYYY-MM-DD
    check_in_at: Optional[str] = None
    check_in_lat: Optional[float] = None
    check_in_lng: Optional[float] = None
    check_in_address: Optional[str] = None
    check_in_photo_path: Optional[str] = None
    check_out_at: Optional[str] = None
    check_out_lat: Optional[float] = None
    check_out_lng: Optional[float] = None
    check_out_address: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ---------- Location ping (GPS history) ----------
class LocationPing(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    user_id: str
    lat: float
    lng: float
    timestamp: str = Field(default_factory=now_iso)


# ---------- Visit / Sales / Collection / DCR / Enquiry ----------
class Visit(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    employee_id: str
    employee_name: str = ""
    party_type: str = "dealer"  # dealer | customer
    dealer_id: Optional[str] = None
    dealer_name: str = ""
    dealer_code: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: str = ""
    visit_date: str  # YYYY-MM-DD
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
    created_at: str = Field(default_factory=now_iso)


class SalesEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    employee_id: str
    employee_name: str = ""
    dealer_id: Optional[str] = None
    dealer_name: str = ""
    product_id: Optional[str] = None
    product_name: str = ""
    quantity: float = 0.0
    unit_price: float = 0.0
    value: float = 0.0
    sale_date: str
    remarks: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class CollectionEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    employee_id: str
    employee_name: str = ""
    dealer_id: Optional[str] = None
    dealer_name: str = ""
    amount: float = 0.0
    collection_date: str
    payment_mode: str = "Cash"  # Cash | UPI | Bank Transfer | Cheque | Other
    transaction_ref: Optional[str] = None
    remarks: Optional[str] = None
    receipt_photo_path: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class DCR(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    employee_id: str
    employee_name: str = ""
    date: str
    area_covered: Optional[str] = None
    dealers_visited: int = 0
    customers_met: int = 0
    orders_booked: int = 0
    collections_made: float = 0.0
    remarks: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class Enquiry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    customer_id: Optional[str] = None  # link to users(role="customer") if selected
    customer_name: str
    mobile: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    photo_path: Optional[str] = None
    assigned_employee_id: Optional[str] = None
    assigned_employee_name: Optional[str] = None
    status: str = "new"  # new | in_progress | followup | closed
    followup_notes: Optional[str] = None
    source: str = "tenant"  # tenant | customer
    created_by: Optional[str] = None
    custom_data: Dict[str, Any] = {}
    created_at: str = Field(default_factory=now_iso)


# ---------- Product ----------
class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    use_case: Optional[str] = None
    suitable_for: Optional[str] = None
    dosage: Optional[str] = None
    packing: Optional[str] = None
    mrp: float = 0.0
    price: float = 0.0
    stock: Optional[int] = None
    image_path: Optional[str] = None
    is_active: bool = True
    custom_data: Dict[str, Any] = {}
    created_at: str = Field(default_factory=now_iso)


# ---------- Order ----------
class OrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit_price: float
    total: float


class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    customer_id: str
    customer_name: str = ""
    dealer_code: Optional[str] = None
    assigned_employee_id: Optional[str] = None
    items: List[OrderItem] = []
    total_value: float = 0.0
    status: str = "submitted"  # draft | submitted | approved | rejected | packed | dispatched | delivered | cancelled
    expected_delivery_date: Optional[str] = None
    remarks: Optional[str] = None
    rejection_reason: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ---------- Notification ----------
class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    user_id: Optional[str] = None  # null = broadcast
    role: Optional[str] = None  # broadcast to a role
    title: str
    body: str
    type: str = "info"  # info | success | warning | error | announcement
    is_read: bool = False
    created_at: str = Field(default_factory=now_iso)


# ---------- File ----------
class FileRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None
    storage_path: str
    original_filename: str
    content_type: str
    size: int = 0
    purpose: str = "general"
    is_deleted: bool = False
    created_at: str = Field(default_factory=now_iso)


# ---------- Platform Settings (Super Admin) ----------
class PlatformSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "platform"
    aws_s3_enabled: bool = False
    aws_s3_bucket: Optional[str] = None
    aws_s3_region: Optional[str] = None
    aws_s3_access_key: Optional[str] = None
    aws_s3_secret_key: Optional[str] = None
    sms_provider: str = "mock"  # mock | pingbix | twilio
    sms_api_key: Optional[str] = None
    sms_sender_id: Optional[str] = None
    whatsapp_enabled: bool = False
    updated_at: str = Field(default_factory=now_iso)



# ---------- Phase 2: Area Hierarchy ----------
# type: country | state | district | area
class AreaNode(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    name: str
    type: str  # country | state | district | area
    parent_id: Optional[str] = None
    path: List[str] = []  # ancestor IDs from root → self.parent
    code: Optional[str] = None
    is_active: bool = True
    created_at: str = Field(default_factory=now_iso)


# ---------- Phase 2: Custom Roles & Permissions ----------
PERMISSION_MODULES = [
    "visits", "sales", "collections", "dcr", "enquiries", "orders",
    "dealers", "customers", "products", "employees", "reports", "gps", "leaves",
    "targets", "announcements", "areas", "roles", "branding",
]


class Role(BaseModel):
    """Custom role within a tenant. Built-in roles (tenant_admin, manager, employee)
    bypass these permissions; custom roles refine an employee's access."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    name: str
    description: Optional[str] = None
    # { module: { "read": bool, "write": bool } }
    permissions: Dict[str, Dict[str, bool]] = {}
    is_active: bool = True
    is_default: bool = False
    created_at: str = Field(default_factory=now_iso)


# ---------- Phase 2: Leaves ----------
class LeaveRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    employee_id: str
    employee_name: str = ""
    leave_type: str = "casual"  # casual | sick | earned | unpaid
    from_date: str  # YYYY-MM-DD
    to_date: str
    days: float = 1.0
    reason: Optional[str] = None
    status: str = "pending"  # pending | approved | rejected | cancelled
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    approver_comments: Optional[str] = None
    decided_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ---------- Phase 2: Targets ----------
class Target(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    user_id: str  # employee whose target this is
    user_name: str = ""
    month: str  # YYYY-MM
    sales_target: float = 0.0
    set_by: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ---------- Custom Fields (Tenant-defined, per-module) ----------
CUSTOM_FIELD_MODULES = ["dealer", "customer", "product", "enquiry", "visit"]
CUSTOM_FIELD_TYPES = ["text", "number", "textarea", "dropdown", "radio", "checkbox", "date"]


class CustomField(BaseModel):
    """Tenant-defined custom field attached to a module (dealer/customer/product/enquiry/visit).
    Values are stored on the target record in the `custom_data` dict keyed by `field_key`."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    module: str  # dealer | customer | product | enquiry | visit
    field_key: str  # snake_case unique per (tenant, module)
    label: str
    type: str  # text | number | textarea | dropdown | radio | checkbox | date
    options: List[str] = []  # for dropdown | radio | checkbox
    required: bool = False
    order: int = 0
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    is_active: bool = True
    visible_to_customer: bool = True  # if False, customer PWA self-signup hides it
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)



# ============================================================
# Crop Health Advisor (Industry-specific module, opt-in per tenant)
# ============================================================
ADVISORY_TYPES = ["disease", "pest", "deficiency"]
ADVISORY_CATEGORIES = ["fungal", "viral", "bacterial", "pest", "nutrient_deficiency"]
PHOTO_STAGES = ["healthy", "early", "medium", "advanced", "closeup"]


class Crop(BaseModel):
    """Master list of crops that a tenant supports (Paddy, Cotton, ...)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    name: str  # e.g. "Paddy"
    scientific_name: Optional[str] = None
    image_path: Optional[str] = None
    description: Optional[str] = None
    season: Optional[str] = None  # e.g. "Kharif", "Rabi", "Summer"
    is_active: bool = True
    order: int = 0
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class AdvisoryPhoto(BaseModel):
    stage: str = "closeup"  # healthy | early | medium | advanced | closeup
    label: Optional[str] = None
    path: str
    caption: Optional[str] = None


class AdvisoryDocument(BaseModel):
    name: str
    path: str
    doc_type: str = "pdf"  # pdf | image | other
    size_kb: Optional[int] = None


class ChemicalTreatment(BaseModel):
    product_name: Optional[str] = None
    active_ingredient: Optional[str] = None
    dosage: Optional[str] = None
    water_quantity: Optional[str] = None
    spray_interval: Optional[str] = None
    max_applications: Optional[str] = None
    waiting_period: Optional[str] = None


class WeatherConditions(BaseModel):
    temperature: Optional[str] = None
    humidity: Optional[str] = None
    rainfall: Optional[str] = None
    season: Optional[str] = None


class SafetyInstructions(BaseModel):
    ppe: List[str] = []
    dos: List[str] = []
    donts: List[str] = []
    first_aid: Optional[str] = None
    storage: Optional[str] = None


class FAQItem(BaseModel):
    q: str
    a: str


class AdvisoryEntry(BaseModel):
    """Unified entity for Disease | Pest | Nutrient Deficiency.
    `type` field distinguishes them. Content is 100% DB-driven."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    type: str  # disease | pest | deficiency
    name: str
    scientific_name: Optional[str] = None
    crop_ids: List[str] = []  # affected crops
    category: Optional[str] = None  # fungal | viral | bacterial | pest | nutrient_deficiency
    severity: str = "medium"  # low | medium | high | critical
    short_description: Optional[str] = None
    description: Optional[str] = None
    season: Optional[str] = None
    symptoms: List[str] = []
    causes: Optional[str] = None
    spread: List[str] = []  # wind | water | seed | soil | insects | other
    weather: WeatherConditions = Field(default_factory=WeatherConditions)
    prevention: List[str] = []
    organic_treatment: Optional[str] = None
    bio_control: Optional[str] = None
    natural_remedies: Optional[str] = None
    chemical_treatment: ChemicalTreatment = Field(default_factory=ChemicalTreatment)
    safety: SafetyInstructions = Field(default_factory=SafetyInstructions)
    faqs: List[FAQItem] = []
    photos: List[AdvisoryPhoto] = []
    documents: List[AdvisoryDocument] = []
    product_ids: List[str] = []  # mapped product recommendations
    keywords: List[str] = []  # for search
    is_published: bool = True
    view_count: int = 0
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class SeasonalAdvisory(BaseModel):
    """Admin-published seasonal alert. Can be targeted by crop, state, district."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    title: str
    message: str
    severity: str = "medium"  # low | medium | high | critical
    crop_ids: List[str] = []
    states: List[str] = []
    districts: List[str] = []
    regions: List[str] = []
    valid_from: Optional[str] = None  # YYYY-MM-DD
    valid_to: Optional[str] = None
    is_published: bool = True
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class UserFavorite(BaseModel):
    """User's bookmarked advisory entries."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    user_id: str
    entity_type: str  # advisory | crop
    entity_id: str
    created_at: str = Field(default_factory=now_iso)


class RecentView(BaseModel):
    """Automatic recently-viewed history."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    user_id: str
    entity_type: str
    entity_id: str
    viewed_at: str = Field(default_factory=now_iso)


# ---------- Phase 5 — Push tokens for FCM ----------
PUSH_PLATFORMS = ("ios", "android", "web")


class PushToken(BaseModel):
    """FCM registration token per user-device.

    A user may have multiple tokens (one per device). Deduped by (user_id, token).
    The tenant's `fcm_shard_id` determines which Firebase project to dispatch through.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    user_id: str
    token: str
    platform: str = "android"  # one of PUSH_PLATFORMS
    device_label: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    last_seen_at: str = Field(default_factory=now_iso)


# ---------- Phase 8 — Per-tenant Firebase config + Cloud Credentials ----------
# One Android + one iOS app per tenant. Each Firebase project holds ≤30 apps
# → ~15 tenants per Firebase project.

FIREBASE_APP_PLATFORMS = ("android", "ios")
FIREBASE_APP_MODES = ("existing", "auto")  # existing = uploaded by admin; auto = provisioned by us
FIREBASE_PROJECT_MAX_APPS = 30


class FirebaseProject(BaseModel):
    """A Firebase project the platform can provision apps into.

    `service_account_json` is stored as-is (base64 is not needed since Mongo
    handles JSON). Restrict this collection to super-admin reads/writes.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    name: str  # human label, e.g. "Shard-1 (Follo)"
    project_id: str  # Google Cloud / Firebase project ID
    service_account_json: Dict[str, Any] = {}
    apps_provisioned: int = 0  # counter; we bump on each auto-create + refresh from API on demand
    max_apps: int = FIREBASE_PROJECT_MAX_APPS
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class TenantFirebaseApp(BaseModel):
    """One Firebase app (Android or iOS) for a tenant."""
    model_config = ConfigDict(extra="ignore")
    platform: str  # "android" | "ios"
    mode: str = "existing"  # "existing" | "auto"
    firebase_project_id: Optional[str] = None  # FirebaseProject.id, when auto or when known
    app_id: Optional[str] = None  # e.g. "1:1234:android:abc"
    package_name: Optional[str] = None  # Android package or iOS bundleId
    config_json: Optional[str] = None  # google-services.json (Android) or GoogleService-Info.plist XML (iOS)
    provisioned_at: Optional[str] = None
    provisioning_error: Optional[str] = None  # last failure message if auto-provision hit trouble
    updated_at: str = Field(default_factory=now_iso)


class TenantFirebaseConfig(BaseModel):
    """Per-tenant Firebase configuration — up to two apps (android + ios).

    Backward-compat: if a tenant has no doc here, the legacy env-based
    `Tenant.fcm_shard_id` is used. This document is authoritative when present.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    android: Optional[TenantFirebaseApp] = None
    ios: Optional[TenantFirebaseApp] = None
    updated_at: str = Field(default_factory=now_iso)


# ---------- Phase 3 — Legal Documents (Privacy / T&C / Refund / Shipping / About) ----------
LEGAL_KINDS = ("privacy", "terms", "refund", "shipping", "about", "contact")


class LegalDocument(BaseModel):
    """Per-tenant legal documents. Multiple versions per kind allowed;
    only the latest with `is_published=True` is served publicly.

    Additive: existing tenants have zero rows here — the public GET returns 404
    with a fallback marker so the frontend can render a platform default.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=gen_id)
    tenant_id: str
    kind: str  # one of LEGAL_KINDS
    title: str = ""
    content_md: str = ""  # markdown body
    version: int = 1
    is_published: bool = False
    published_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    updated_by: Optional[str] = None

