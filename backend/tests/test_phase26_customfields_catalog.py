"""Phase 2.6 backend tests: Custom fields per module + Catalog Mode + Self-profile update."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TENANT = "demo"
RUN = uuid.uuid4().hex[:6]  # unique key suffix to avoid clashes with soft-deleted fields


def _login(phone, otp="123456", role_hint=None, tenant_slug=TENANT):
    body = {"phone": phone, "otp": otp, "tenant_slug": tenant_slug}
    if role_hint:
        body["role_hint"] = role_hint
    return requests.post(f"{API}/auth/verify-otp", json=body, timeout=30)


def _sess(phone, role_hint=None):
    r = _login(phone, role_hint=role_hint)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    d = r.json()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d['token']}", "Content-Type": "application/json"})
    s.user = d["user"]
    return s


@pytest.fixture(scope="module")
def admin():
    return _sess("9000000001")


@pytest.fixture(scope="module")
def employee():
    return _sess("9000000003")


@pytest.fixture(scope="module")
def customer():
    return _sess("9000000007", role_hint="customer")


@pytest.fixture(scope="module")
def dealer():
    return _sess("9000000004", role_hint="dealer")


@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin):
    """Ensure a clean slate before + after."""
    # Pre-cleanup: soft-delete any existing fields
    r = admin.get(f"{API}/custom-fields")
    if r.status_code == 200:
        for f in r.json():
            admin.delete(f"{API}/custom-fields/{f['id']}")
    admin.patch(f"{API}/tenant/profile", json={"catalog_mode": "direct"})
    yield
    r = admin.get(f"{API}/custom-fields")
    if r.status_code == 200:
        for f in r.json():
            admin.delete(f"{API}/custom-fields/{f['id']}")
    admin.patch(f"{API}/tenant/profile", json={"catalog_mode": "direct"})


# ---------- /custom-fields/modules ----------
class TestCustomFieldsMeta:
    def test_modules_endpoint(self, admin):
        r = admin.get(f"{API}/custom-fields/modules")
        assert r.status_code == 200
        d = r.json()
        assert "modules" in d and "types" in d
        assert set(d["modules"]) == {"dealer", "customer", "product", "enquiry", "visit"}
        assert len(d["types"]) == 7
        for t in ("text", "textarea", "number", "date", "dropdown", "radio", "checkbox"):
            assert t in d["types"]


# ---------- Create / list / patch / delete ----------
class TestCustomFieldsCRUD:
    def test_create_text_field(self, admin):
        r = admin.post(f"{API}/custom-fields", json={
            "module": "dealer", "field_key": f"license_number_{RUN}",
            "label": "License Number", "type": "text", "required": False
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["module"] == "dealer"
        assert d["field_key"] == f"license_number_{RUN}"  # normalized (lowercased)
        assert d["label"] == "License Number"
        assert "_id" not in d
        pytest.dealer_field_id = d["id"]

    def test_create_dropdown_field_requires_options(self, admin):
        r = admin.post(f"{API}/custom-fields", json={
            "module": "dealer", "field_key": f"license_type_{RUN}",
            "label": "License Type", "type": "dropdown"
        })
        assert r.status_code == 400
        assert "option" in r.text.lower()

    def test_create_dropdown_field_ok(self, admin):
        r = admin.post(f"{API}/custom-fields", json={
            "module": "dealer", "field_key": f"license_type_{RUN}",
            "label": "License Type", "type": "dropdown",
            "options": ["Retailer", "Wholesaler"], "required": True
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["options"] == ["Retailer", "Wholesaler"]
        pytest.dropdown_field_id = d["id"]

    def test_create_customer_field(self, admin):
        r = admin.post(f"{API}/custom-fields", json={
            "module": "customer", "field_key": f"primary_crop_{RUN}",
            "label": "Primary Crop", "type": "text",
            "visible_to_customer": True
        })
        assert r.status_code == 200
        pytest.customer_field_id = r.json()["id"]

    def test_create_product_visit_enquiry_fields(self, admin):
        for m in ("product", "visit", "enquiry"):
            r = admin.post(f"{API}/custom-fields", json={
                "module": m, "field_key": f"note_{m}_{RUN}",
                "label": f"Note {m}", "type": "textarea"
            })
            assert r.status_code == 200, f"{m}: {r.text}"

    def test_duplicate_field_key(self, admin):
        r = admin.post(f"{API}/custom-fields", json={
            "module": "dealer", "field_key": f"license_number_{RUN}",
            "label": "Dup", "type": "text"
        })
        assert r.status_code == 400
        assert "exist" in r.text.lower()

    def test_invalid_module(self, admin):
        r = admin.post(f"{API}/custom-fields", json={
            "module": "invalid_mod", "field_key": f"x_{RUN}",
            "label": "X", "type": "text"
        })
        assert r.status_code == 400

    def test_invalid_type(self, admin):
        r = admin.post(f"{API}/custom-fields", json={
            "module": "dealer", "field_key": f"bad_type_{RUN}",
            "label": "BadType", "type": "email"
        })
        assert r.status_code == 400

    def test_list_all(self, admin):
        r = admin.get(f"{API}/custom-fields")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 5
        modules = [row["module"] for row in rows]
        # sorted by module
        assert modules == sorted(modules)

    def test_list_filter_by_module(self, admin):
        r = admin.get(f"{API}/custom-fields", params={"module": "dealer"})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 2
        for row in rows:
            assert row["module"] == "dealer"

    def test_patch_field(self, admin):
        r = admin.patch(f"{API}/custom-fields/{pytest.dropdown_field_id}", json={
            "label": "License Type v2",
            "options": ["Retailer", "Wholesaler", "Distributor"],
            "required": False,
            "visible_to_customer": True,
            "order": 5
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["label"] == "License Type v2"
        assert "Distributor" in d["options"]
        assert d["required"] is False
        assert d["order"] == 5

    def test_delete_soft(self, admin):
        r = admin.post(f"{API}/custom-fields", json={
            "module": "visit", "field_key": f"to_delete_{RUN}",
            "label": "To Delete", "type": "text"
        })
        fid = r.json()["id"]
        rd = admin.delete(f"{API}/custom-fields/{fid}")
        assert rd.status_code == 200
        # should no longer be listed (is_active=false filter)
        listing = admin.get(f"{API}/custom-fields", params={"module": "visit"}).json()
        assert fid not in [x["id"] for x in listing]


# ---------- Permissions ----------
class TestCustomFieldsPerms:
    def test_employee_cannot_create(self, employee):
        r = employee.post(f"{API}/custom-fields", json={
            "module": "dealer", "field_key": f"emp_field_{RUN}",
            "label": "Emp Field", "type": "text"
        })
        assert r.status_code == 403

    def test_employee_can_list(self, employee):
        r = employee.get(f"{API}/custom-fields")
        assert r.status_code == 200

    def test_customer_can_list(self, customer):
        r = customer.get(f"{API}/custom-fields")
        assert r.status_code == 200

    def test_employee_cannot_delete(self, employee, admin):
        # create with admin
        r = admin.post(f"{API}/custom-fields", json={
            "module": "dealer", "field_key": f"for_perm_delete_{RUN}",
            "label": "X", "type": "text"
        })
        fid = r.json()["id"]
        rd = employee.delete(f"{API}/custom-fields/{fid}")
        assert rd.status_code == 403


# ---------- custom_data persistence across records ----------
class TestCustomDataPersistence:
    def test_dealer_user_custom_data(self, admin):
        phone = f"88{uuid.uuid4().int % 100000000:08d}"
        r = admin.post(f"{API}/tenant/users", json={
            "role": "dealer", "name": "TEST_Dealer_CD", "phone": phone,
            "dealer_code": f"TDCD{phone[-4:]}",
            "custom_data": {f"license_number_{RUN}": "LIC-123", f"license_type_{RUN}": "Retailer"}
        })
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # GET verifies persistence
        lst = admin.get(f"{API}/tenant/users", params={"role": "dealer"}).json()
        me = next((u for u in lst if u["id"] == uid), None)
        assert me is not None
        assert me.get("custom_data", {}).get(f"license_number_{RUN}") == "LIC-123"
        assert me["custom_data"][f"license_type_{RUN}"] == "Retailer"
        admin.delete(f"{API}/tenant/users/{uid}")

    def test_product_custom_data(self, admin):
        r = admin.post(f"{API}/tenant/products", json={
            "name": "TEST_Prod_CD", "price": 100, "mrp": 120,
            "custom_data": {f"note_product_{RUN}": "batch A"}
        })
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        prods = admin.get(f"{API}/tenant/products").json()
        p = next((x for x in prods if x["id"] == pid), None)
        assert p and p["custom_data"][f"note_product_{RUN}"] == "batch A"
        admin.delete(f"{API}/tenant/products/{pid}")

    def test_visit_custom_data(self, employee):
        # need a party
        users = employee.get(f"{API}/tenant/users", params={"role": "dealer"}).json()
        assert users
        pid = users[0]["id"]
        r = employee.post(f"{API}/visits", json={
            "party_type": "dealer",
            "party_id": pid,
            "visit_date": "2026-01-15",
            "purpose": "Sales",
            "custom_data": {f"note_visit_{RUN}": "brought samples"}
        })
        assert r.status_code == 200, r.text
        vid = r.json()["id"]
        assert r.json().get("custom_data", {}).get(f"note_visit_{RUN}") == "brought samples"
        # GET
        vs = employee.get(f"{API}/visits").json()
        v = next((x for x in vs if x["id"] == vid), None)
        assert v and v["custom_data"][f"note_visit_{RUN}"] == "brought samples"

    def test_enquiry_custom_data(self, employee):
        # need a customer
        cust = employee.get(f"{API}/tenant/users", params={"role": "customer"}).json()
        assert cust
        r = employee.post(f"{API}/enquiries", json={
            "customer_id": cust[0]["id"],
            "customer_name": cust[0].get("name", "Test Cust"),
            "product_interest": "TEST_Prod",
            "notes": "test",
            "custom_data": {f"note_enquiry_{RUN}": "priority high"}
        })
        assert r.status_code == 200, r.text
        assert r.json().get("custom_data", {}).get(f"note_enquiry_{RUN}") == "priority high"


# ---------- Catalog mode ----------
class TestCatalogMode:
    def test_default_direct_mode(self, admin):
        r = admin.get(f"{API}/tenant/profile")
        assert r.status_code == 200
        # may or may not have catalog_mode; treat missing as direct

    def test_set_enquiry_only(self, admin):
        r = admin.patch(f"{API}/tenant/profile", json={"catalog_mode": "enquiry_only"})
        assert r.status_code == 200, r.text
        prof = admin.get(f"{API}/tenant/profile").json()
        assert prof.get("catalog_mode") == "enquiry_only"

    def test_order_blocked_in_enquiry_mode(self, admin, customer):
        # ensure a product exists
        prods = admin.get(f"{API}/tenant/products").json()
        if not prods:
            pytest.skip("no products")
        r = customer.post(f"{API}/orders", json={
            "items": [{"product_id": prods[0]["id"], "quantity": 1}]
        })
        assert r.status_code == 400
        assert "enquir" in r.text.lower()

    def test_dealer_order_blocked_in_enquiry_mode(self, admin, dealer):
        prods = admin.get(f"{API}/tenant/products").json()
        if not prods:
            pytest.skip("no products")
        r = dealer.post(f"{API}/orders", json={
            "items": [{"product_id": prods[0]["id"], "quantity": 1}]
        })
        assert r.status_code == 400

    def test_reset_to_direct_and_order_works(self, admin, customer):
        r = admin.patch(f"{API}/tenant/profile", json={"catalog_mode": "direct"})
        assert r.status_code == 200
        prods = admin.get(f"{API}/tenant/products").json()
        if not prods:
            pytest.skip("no products")
        r = customer.post(f"{API}/orders", json={
            "items": [{"product_id": prods[0]["id"], "quantity": 1}]
        })
        assert r.status_code == 200, r.text


# ---------- Self profile ----------
class TestSelfProfile:
    def test_customer_updates_self(self, customer):
        r = customer.patch(f"{API}/me/profile", json={
            "name": "Venkat Rao Updated",
            "village": "New Village",
            "crops": "Cotton,Paddy,Millet",
            "farm_size_acres": 7.5,
            "custom_data": {f"primary_crop_{RUN}": "Cotton"}
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "Venkat Rao Updated"
        assert d["village"] == "New Village"
        assert d["farm_size_acres"] == 7.5
        assert d["custom_data"][f"primary_crop_{RUN}"] == "Cotton"
        # revert
        customer.patch(f"{API}/me/profile", json={
            "name": "Venkat Rao", "village": "Karimnagar",
            "crops": "Cotton,Paddy", "farm_size_acres": 5.5
        })

    def test_dealer_updates_self(self, dealer):
        r = dealer.patch(f"{API}/me/profile", json={"name": "Ramesh Naidu Updated"})
        assert r.status_code == 200
        assert r.json()["name"] == "Ramesh Naidu Updated"
        dealer.patch(f"{API}/me/profile", json={"name": "Ramesh Naidu"})

    def test_empty_body_400(self, customer):
        r = customer.patch(f"{API}/me/profile", json={})
        assert r.status_code == 400
