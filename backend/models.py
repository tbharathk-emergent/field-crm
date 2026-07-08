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
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
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
    crops: Optional[str] = None  # comma-separated
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
