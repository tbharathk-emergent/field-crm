"""FieldCRM backend regression tests (pytest)."""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fieldforce-hub-11.preview.emergentagent.com").rstrip("/")
# Fallback to frontend env if not set
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

SUPER_PHONE = "9858558555"
SUPER_OTP = "557725"
ADMIN_PHONE = "9000000001"
MANAGER_PHONE = "9000000002"
EMP_PHONE = "9000000003"
CUST_PHONE = "9000000004"
DEMO_OTP = "123456"
TENANT_SLUG = "demo"


# ---------- helpers ----------
def _verify(phone, otp, tenant_slug=None, role_hint=None):
    payload = {"phone": phone, "otp": otp}
    if tenant_slug:
        payload["tenant_slug"] = tenant_slug
    if role_hint:
        payload["role_hint"] = role_hint
    r = requests.post(f"{API}/auth/verify-otp", json=payload, timeout=15)
    return r


@pytest.fixture(scope="session")
def super_token():
    r = _verify(SUPER_PHONE, SUPER_OTP)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    r = _verify(ADMIN_PHONE, DEMO_OTP, TENANT_SLUG)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def emp_token():
    r = _verify(EMP_PHONE, DEMO_OTP, TENANT_SLUG)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def cust_token():
    r = _verify(CUST_PHONE, DEMO_OTP, TENANT_SLUG, "customer")
    assert r.status_code == 200, r.text
    return r.json()


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Health & Public ----------
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_demo_credentials():
    r = requests.get(f"{API}/public/demo-credentials", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["super_admin"]["phone"] == SUPER_PHONE
    assert any(u["role"] == "tenant_admin" for u in j["users"])


def test_public_tenant_lookup():
    r = requests.get(f"{API}/public/tenants/by-slug/{TENANT_SLUG}", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["name"] == "Akshara Agro"
    assert j["slug"] == "demo"
    assert "theme" in j and "labels" in j


# ---------- Auth ----------
def test_request_otp_super_admin():
    r = requests.post(f"{API}/auth/request-otp", json={"phone": SUPER_PHONE}, timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["is_super_admin"] is True
    assert j["mock_otp"] == SUPER_OTP


def test_verify_otp_super_admin(super_token):
    assert isinstance(super_token, str) and len(super_token) > 0


def test_verify_otp_invalid():
    r = _verify(SUPER_PHONE, "000000")
    assert r.status_code == 401


# ---------- Super Admin ----------
def test_super_tenants_list(super_token):
    r = requests.get(f"{API}/super/tenants", headers=H(super_token), timeout=10)
    assert r.status_code == 200
    tenants = r.json()
    assert any(t["slug"] == "demo" for t in tenants)


def test_super_plans(super_token):
    r = requests.get(f"{API}/super/plans", headers=H(super_token), timeout=10)
    assert r.status_code == 200
    plans = r.json()
    assert len(plans) >= 4


def test_super_analytics(super_token):
    r = requests.get(f"{API}/super/analytics", headers=H(super_token), timeout=10)
    assert r.status_code == 200
    assert "totals" in r.json()


def test_super_create_tenant(super_token):
    slug = f"test{int(time.time())}"
    payload = {"slug": slug, "name": "TEST Tenant", "primary": "#123456"}
    r = requests.post(f"{API}/super/tenants", json=payload, headers=H(super_token), timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["slug"] == slug
    # Verify it's listed
    r2 = requests.get(f"{API}/super/tenants", headers=H(super_token))
    assert any(t["slug"] == slug for t in r2.json())
    # Cleanup
    requests.delete(f"{API}/super/tenants/{j['id']}", headers=H(super_token))


# ---------- Tenant Admin ----------
def test_tenant_admin_login(admin_token):
    import jwt as pyjwt
    decoded = pyjwt.decode(admin_token, options={"verify_signature": False})
    assert decoded.get("tid")
    assert decoded.get("role") == "tenant_admin"


def test_tenant_profile(admin_token):
    r = requests.get(f"{API}/tenant/profile", headers=H(admin_token), timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert "labels" in j


def test_tenant_users_list(admin_token):
    r = requests.get(f"{API}/tenant/users", headers=H(admin_token), timeout=10)
    assert r.status_code == 200
    assert len(r.json()) >= 4


def test_tenant_update_label_persists(admin_token):
    # Set a custom label and verify GET sees it
    r = requests.patch(f"{API}/tenant/profile",
                       json={"labels": {"customer": "Farmer", "customer_plural": "Farmers",
                                        "dealer": "Dealer", "dealer_plural": "Dealers"}},
                       headers=H(admin_token), timeout=10)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/tenant/profile", headers=H(admin_token))
    assert r2.json()["labels"]["customer"] == "Farmer"
    # restore
    requests.patch(f"{API}/tenant/profile",
                   json={"labels": {"customer": "Customer", "customer_plural": "Customers",
                                    "dealer": "Dealer", "dealer_plural": "Dealers"}},
                   headers=H(admin_token))


def test_user_crud(admin_token):
    phone = f"99{int(time.time())%100000000:08d}"
    payload = {"phone": phone, "name": "TEST Emp", "role": "employee"}
    r = requests.post(f"{API}/tenant/users", json=payload, headers=H(admin_token), timeout=10)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    # update
    r2 = requests.patch(f"{API}/tenant/users/{uid}",
                       json={"phone": phone, "name": "TEST Emp Updated", "role": "employee"},
                       headers=H(admin_token))
    assert r2.status_code == 200
    assert r2.json()["name"] == "TEST Emp Updated"
    # delete (soft)
    r3 = requests.delete(f"{API}/tenant/users/{uid}", headers=H(admin_token))
    assert r3.status_code == 200


def test_product_crud(admin_token):
    r = requests.get(f"{API}/tenant/products", headers=H(admin_token), timeout=10)
    assert r.status_code == 200
    assert len(r.json()) >= 1
    # create
    r2 = requests.post(f"{API}/tenant/products",
                      json={"name": "TEST Product", "price": 100, "mrp": 120},
                      headers=H(admin_token))
    assert r2.status_code == 200
    pid = r2.json()["id"]
    # patch
    r3 = requests.patch(f"{API}/tenant/products/{pid}",
                       json={"name": "TEST Product 2", "price": 110, "mrp": 120},
                       headers=H(admin_token))
    assert r3.status_code == 200
    # delete
    r4 = requests.delete(f"{API}/tenant/products/{pid}", headers=H(admin_token))
    assert r4.status_code == 200


# ---------- Employee flows ----------
def test_employee_checkin_flow(emp_token):
    tok = emp_token["token"]
    # checkin
    r = requests.post(f"{API}/employee/checkin", json={"lat": 12.9, "lng": 77.5}, headers=H(tok), timeout=10)
    # may fail if already checked in
    assert r.status_code in (200, 400)
    # today
    r2 = requests.get(f"{API}/employee/attendance/today", headers=H(tok))
    assert r2.status_code == 200
    assert r2.json() is not None
    # checkout
    r3 = requests.post(f"{API}/employee/checkout", json={"lat": 12.9, "lng": 77.5}, headers=H(tok))
    assert r3.status_code in (200, 400)


def test_employee_visits_sales_collections_dcr_enquiries(emp_token):
    tok = emp_token["token"]
    today = time.strftime("%Y-%m-%d")
    # visit
    r = requests.post(f"{API}/visits", json={"dealer_name": "TEST Dealer", "visit_date": today}, headers=H(tok))
    assert r.status_code == 200, r.text
    # sale
    r2 = requests.post(f"{API}/sales", json={"dealer_name": "TEST D", "product_name": "TP", "quantity": 2, "unit_price": 50, "sale_date": today}, headers=H(tok))
    assert r2.status_code == 200
    # collection
    r3 = requests.post(f"{API}/collections", json={"dealer_name": "TEST D", "amount": 500, "collection_date": today}, headers=H(tok))
    assert r3.status_code == 200
    # dcr
    r4 = requests.post(f"{API}/dcr", json={"date": today, "dealers_visited": 2}, headers=H(tok))
    assert r4.status_code == 200
    # enquiry
    r5 = requests.post(f"{API}/enquiries", json={"customer_name": "TEST C"}, headers=H(tok))
    assert r5.status_code == 200
    # listing
    for ep in ["visits", "sales", "collections", "dcr", "enquiries"]:
        rl = requests.get(f"{API}/{ep}", headers=H(tok))
        assert rl.status_code == 200, ep
        assert len(rl.json()) >= 1, ep


def test_role_isolation_employee_sees_only_own_visits(emp_token, admin_token):
    tok = emp_token["token"]
    r = requests.get(f"{API}/visits", headers=H(tok))
    assert r.status_code == 200
    emp_id = emp_token["user"]["id"]
    for v in r.json():
        assert v["employee_id"] == emp_id


# ---------- Customer flow ----------
def test_customer_order_flow(cust_token, admin_token):
    tok = cust_token["token"]
    # Get product
    prods = requests.get(f"{API}/tenant/products", headers=H(admin_token)).json()
    assert prods, "No products seeded"
    pid = prods[0]["id"]
    r = requests.post(f"{API}/orders",
                     json={"items": [{"product_id": pid, "quantity": 2}]},
                     headers=H(tok), timeout=10)
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    # GET orders
    r2 = requests.get(f"{API}/orders", headers=H(tok))
    assert r2.status_code == 200
    assert any(o["id"] == oid for o in r2.json())
    # Cancel
    r3 = requests.patch(f"{API}/orders/{oid}", json={"status": "cancelled"}, headers=H(tok))
    assert r3.status_code == 200
    assert r3.json()["status"] == "cancelled"


def test_customer_cannot_approve_order(cust_token, admin_token):
    tok = cust_token["token"]
    prods = requests.get(f"{API}/tenant/products", headers=H(admin_token)).json()
    r = requests.post(f"{API}/orders", json={"items": [{"product_id": prods[0]["id"], "quantity": 1}]}, headers=H(tok))
    oid = r.json()["id"]
    rb = requests.patch(f"{API}/orders/{oid}", json={"status": "approved"}, headers=H(tok))
    assert rb.status_code == 403


# ---------- Analytics & Export ----------
def test_tenant_analytics(admin_token):
    r = requests.get(f"{API}/analytics/tenant", headers=H(admin_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert "kpis" in j and "sales_trend" in j and "top_employees" in j
    assert len(j["sales_trend"]) == 7


def test_export_products_csv(admin_token):
    r = requests.get(f"{API}/export/products?fmt=csv", headers=H(admin_token), timeout=15)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")


# ---------- Notifications ----------
def test_notifications(admin_token, emp_token):
    r = requests.post(f"{API}/notifications",
                     json={"title": "TEST", "body": "hi", "role": "employee"},
                     headers=H(admin_token))
    assert r.status_code == 200
    # employee fetches
    r2 = requests.get(f"{API}/notifications", headers=H(emp_token["token"]))
    assert r2.status_code == 200
    assert any(n["title"] == "TEST" for n in r2.json())
