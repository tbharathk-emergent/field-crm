"""Phase 3 backend tests: Dealer vs Customer split, party_type visits, enquiries, orders."""
import os
import uuid
from datetime import datetime, timezone
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TENANT = "demo"


def _login(phone, otp="123456", role_hint=None, tenant_slug=TENANT):
    body = {"phone": phone, "otp": otp}
    if tenant_slug:
        body["tenant_slug"] = tenant_slug
    if role_hint:
        body["role_hint"] = role_hint
    return requests.post(f"{API}/auth/verify-otp", json=body, timeout=30)


def _sess(phone, role_hint=None):
    r = _login(phone, role_hint=role_hint)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    s.user_id = data["user"]["id"]
    s.user = data["user"]
    return s


@pytest.fixture(scope="module")
def admin():
    return _sess("9000000001")


@pytest.fixture(scope="module")
def employee():
    return _sess("9000000003")


# ----- Tenant users role filter -----
class TestUserRoleFilter:
    def test_dealers_only(self, admin):
        r = admin.get(f"{API}/tenant/users", params={"role": "dealer"})
        assert r.status_code == 200, r.text
        users = r.json()
        phones = {u["phone"] for u in users}
        assert "9000000004" in phones and "9000000006" in phones
        # No farmers
        assert "9000000007" not in phones and "9000000008" not in phones
        for u in users:
            assert u["role"] == "dealer"
            # dealer_code should exist (may be None but present)
            assert "dealer_code" in u or u.get("dealer_code") is not None

    def test_customers_only(self, admin):
        r = admin.get(f"{API}/tenant/users", params={"role": "customer"})
        assert r.status_code == 200, r.text
        users = r.json()
        phones = {u["phone"] for u in users}
        assert "9000000007" in phones and "9000000008" in phones
        assert "9000000004" not in phones and "9000000006" not in phones
        # farm fields should be set for at least Venkat Rao / Saraswati Bai
        venkat = next((u for u in users if u["phone"] == "9000000007"), None)
        assert venkat is not None
        assert venkat.get("farm_size_acres") is not None
        assert venkat.get("crops") is not None
        assert not venkat.get("dealer_code")

    def test_create_dealer_and_customer(self, admin):
        dph = f"91{uuid.uuid4().int % 10**8:08d}"
        r = admin.post(f"{API}/tenant/users", json={
            "phone": dph, "name": "TEST_Dealer1", "role": "dealer",
            "dealer_code": "TDLR01", "business_name": "TEST Krishi"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "dealer"
        assert d.get("dealer_code") == "TDLR01"

        cph = f"92{uuid.uuid4().int % 10**8:08d}"
        r = admin.post(f"{API}/tenant/users", json={
            "phone": cph, "name": "TEST_Farmer1", "role": "customer",
            "farm_size_acres": 4.5, "crops": "Cotton"
        })
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["role"] == "customer"
        assert c.get("farm_size_acres") == 4.5

        # cleanup
        admin.delete(f"{API}/tenant/users/{d['id']}")
        admin.delete(f"{API}/tenant/users/{c['id']}")


# ----- Auth role_hint -----
class TestAuthRoleHint:
    def test_dealer_login(self):
        r = _login("9000000004", role_hint="dealer")
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "dealer"

    def test_customer_login(self):
        r = _login("9000000007", role_hint="customer")
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "customer"

    def test_customer_auto_register(self):
        # unknown phone with customer hint should auto-register
        ph = f"93{uuid.uuid4().int % 10**8:08d}"
        r = _login(ph, role_hint="customer")
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "customer"

    def test_dealer_unknown_no_autoreg(self):
        ph = f"94{uuid.uuid4().int % 10**8:08d}"
        r = _login(ph, role_hint="dealer")
        # dealers should not auto-register — expect 404 (or 401/403)
        assert r.status_code in (401, 403, 404), f"expected non-200 got {r.status_code} {r.text}"


# ----- Visits party_type -----
class TestVisits:
    def test_dealer_visit(self, employee, admin):
        dealers = admin.get(f"{API}/tenant/users", params={"role": "dealer"}).json()
        d = dealers[0]
        payload = {
            "party_type": "dealer",
            "dealer_id": d["id"],
            "dealer_name": d["name"],
            "visit_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "lat": 17.4, "lng": 78.5,
            "notes": "TEST_dvisit",
        }
        r = employee.post(f"{API}/visits", json=payload)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v.get("party_type") == "dealer"

    def test_customer_visit(self, employee, admin):
        custs = admin.get(f"{API}/tenant/users", params={"role": "customer"}).json()
        c = custs[0]
        payload = {
            "party_type": "customer",
            "customer_id": c["id"],
            "customer_name": c["name"],
            "visit_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "lat": 17.4, "lng": 78.5,
            "notes": "TEST_cvisit",
        }
        r = employee.post(f"{API}/visits", json=payload)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v.get("party_type") == "customer"

    def test_filter_by_party_type(self, employee):
        r = employee.get(f"{API}/visits", params={"party_type": "customer"})
        assert r.status_code == 200
        for v in r.json():
            assert v.get("party_type") == "customer"
        r = employee.get(f"{API}/visits", params={"party_type": "dealer"})
        assert r.status_code == 200
        for v in r.json():
            assert v.get("party_type") == "dealer"


# ----- Enquiries -----
class TestEnquiries:
    def test_employee_creates_enquiry_with_customer_id(self, employee, admin):
        custs = admin.get(f"{API}/tenant/users", params={"role": "customer"}).json()
        c = custs[0]
        r = employee.post(f"{API}/enquiries", json={
            "customer_id": c["id"],
            "customer_name": c["name"],
            "customer_phone": c["phone"],
            "product_interest": "TEST_Fertilizer",
            "notes": "TEST",
        })
        assert r.status_code == 200, r.text
        e = r.json()
        assert e.get("customer_id") == c["id"]

    def test_customer_creates_enquiry_auto_sets_id(self):
        cust = _sess("9000000007", role_hint="customer")
        r = cust.post(f"{API}/enquiries", json={
            "customer_name": cust.user["name"],
            "customer_phone": cust.user["phone"],
            "product_interest": "TEST_Seed",
        })
        assert r.status_code == 200, r.text
        e = r.json()
        assert e.get("customer_id") == cust.user_id


# ----- Orders -----
class TestOrders:
    def _make_order(self, sess):
        prods = sess.get(f"{API}/tenant/products").json()
        assert prods, "no products"
        p = prods[0]
        return {
            "items": [{"product_id": p["id"], "product_name": p["name"],
                       "quantity": 1, "unit_price": p.get("price", 100)}],
            "total": p.get("price", 100),
        }

    def test_customer_can_order(self):
        cust = _sess("9000000007", role_hint="customer")
        r = cust.post(f"{API}/orders", json=self._make_order(cust))
        assert r.status_code == 200, r.text

    def test_dealer_can_order(self):
        dealer = _sess("9000000004", role_hint="dealer")
        r = dealer.post(f"{API}/orders", json=self._make_order(dealer))
        assert r.status_code == 200, r.text


# ----- Permissions & analytics -----
class TestPerms:
    def test_admin_perms_include_customers(self, admin):
        r = admin.get(f"{API}/my-permissions")
        assert r.status_code == 200
        perms = r.json()["permissions"]
        assert "customers" in perms
        assert perms["customers"]["read"] and perms["customers"]["write"]

    def test_employee_perms_customers(self, employee):
        r = employee.get(f"{API}/my-permissions")
        assert r.status_code == 200
        perms = r.json()["permissions"]
        assert "customers" in perms
        assert perms["customers"]["read"] is True
        assert perms["customers"]["write"] is True

    def test_permission_modules_has_customers(self, admin):
        r = admin.get(f"{API}/permission-modules")
        assert r.status_code == 200
        assert "customers" in r.json()["modules"]

    def test_analytics_dealers_customers(self, admin):
        r = admin.get(f"{API}/analytics/tenant")
        assert r.status_code == 200, r.text
        data = r.json()
        kpis = data.get("kpis", data)
        assert "dealers" in kpis
        assert "customers" in kpis
        assert kpis["dealers"] >= 2
        assert kpis["customers"] >= 2
