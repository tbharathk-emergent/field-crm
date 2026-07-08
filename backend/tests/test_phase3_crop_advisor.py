"""Phase 3.0 backend tests: Crop Health Advisor module.

Covers crops CRUD, advisory entries CRUD/search/filter, view-count increment,
seasonal advisories, favorites toggle, recent-views, my-crops, crop summary,
super-admin feature toggle, and /me/profile custom-fields required validation.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TENANT = "demo"

SEEDED_CROPS = {"Paddy", "Cotton", "Chilli", "Tomato", "Groundnut",
                "Maize", "Banana", "Mango", "Onion", "Turmeric"}


# ---------- helpers ----------
def _login(phone, otp="123456", role_hint=None, tenant_slug=TENANT):
    body = {"phone": phone, "otp": otp}
    if tenant_slug:
        body["tenant_slug"] = tenant_slug
    if role_hint:
        body["role_hint"] = role_hint
    return requests.post(f"{API}/auth/verify-otp", json=body, timeout=30)


def _sess(phone, role_hint=None, tenant_slug=TENANT):
    r = _login(phone, role_hint=role_hint, tenant_slug=tenant_slug)
    assert r.status_code == 200, f"login {phone} failed: {r.status_code} {r.text}"
    data = r.json()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    s.user_id = data["user"]["id"]
    s.user = data["user"]
    s.tid = data["user"].get("tenant_id")
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


@pytest.fixture(scope="module")
def super_admin():
    r = requests.post(f"{API}/auth/verify-otp",
                      json={"phone": "9858558555", "otp": "557725"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo_tid(admin):
    r = admin.get(f"{API}/tenant/profile")
    assert r.status_code == 200
    return r.json()["id"]


# ---------- Tenant profile / feature flag ----------
class TestTenantFeatures:
    def test_demo_tenant_has_crop_advisor_enabled(self, admin):
        r = admin.get(f"{API}/tenant/profile")
        assert r.status_code == 200, r.text
        prof = r.json()
        assert "features" in prof
        assert prof["features"].get("crop_advisor") is True

    def test_super_admin_toggle_disable_and_reenable(self, super_admin, admin, demo_tid, employee):
        # Disable
        r = super_admin.patch(f"{API}/super-admin/tenants/{demo_tid}/features",
                              json={"features": {"crop_advisor": False}})
        assert r.status_code == 200, r.text
        assert r.json()["features"].get("crop_advisor") is False
        # Now /api/crops should return 403 for tenant user
        r2 = employee.get(f"{API}/crops")
        assert r2.status_code == 403, r2.text
        # Re-enable
        r3 = super_admin.patch(f"{API}/super-admin/tenants/{demo_tid}/features",
                               json={"features": {"crop_advisor": True}})
        assert r3.status_code == 200
        assert r3.json()["features"].get("crop_advisor") is True
        r4 = employee.get(f"{API}/crops")
        assert r4.status_code == 200

    def test_non_super_admin_toggle_forbidden(self, admin, demo_tid):
        r = admin.patch(f"{API}/super-admin/tenants/{demo_tid}/features",
                        json={"features": {"crop_advisor": True}})
        assert r.status_code == 403, r.text


# ---------- Crops ----------
class TestCrops:
    def test_list_seeded_crops(self, employee):
        r = employee.get(f"{API}/crops")
        assert r.status_code == 200, r.text
        crops = r.json()
        names = {c["name"] for c in crops}
        missing = SEEDED_CROPS - names
        assert not missing, f"Missing crops: {missing}. Got: {names}"
        # No _id in any doc
        for c in crops:
            assert "_id" not in c

    def test_create_crop_admin(self, admin):
        payload = {"name": f"TEST_Crop_{uuid.uuid4().hex[:6]}", "season": "Kharif"}
        r = admin.post(f"{API}/crops", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == payload["name"]
        assert "id" in created
        # cleanup
        admin.delete(f"{API}/crops/{created['id']}")

    def test_create_crop_forbidden_for_employee(self, employee):
        r = employee.post(f"{API}/crops", json={"name": "TEST_Nope"})
        assert r.status_code == 403


# ---------- Advisory Entries ----------
@pytest.fixture(scope="module")
def paddy_id(employee):
    r = employee.get(f"{API}/crops")
    for c in r.json():
        if c["name"] == "Paddy":
            return c["id"]
    pytest.skip("Paddy not seeded")


class TestAdvisoryEntries:
    def test_disease_filter(self, employee):
        r = employee.get(f"{API}/advisory-entries", params={"type": "disease"})
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        names = [i["name"] for i in items]
        assert any("Rice Blast" in n for n in names), f"got: {names}"

    def test_pest_filter(self, employee):
        r = employee.get(f"{API}/advisory-entries", params={"type": "pest"})
        assert r.status_code == 200
        assert any("Pink Bollworm" in i["name"] for i in r.json()["items"])

    def test_deficiency_filter(self, employee):
        r = employee.get(f"{API}/advisory-entries", params={"type": "deficiency"})
        assert r.status_code == 200
        assert any("Nitrogen" in i["name"] for i in r.json()["items"])

    def test_filter_by_crop_id_paddy(self, employee, paddy_id):
        r = employee.get(f"{API}/advisory-entries", params={"crop_id": paddy_id})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) > 0
        for it in items:
            assert paddy_id in (it.get("crop_ids") or []), it

    def test_search_q_blast(self, employee):
        r = employee.get(f"{API}/advisory-entries", params={"q": "blast"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert any("Rice Blast" in i["name"] for i in items)

    def test_invalid_type(self, employee):
        r = employee.get(f"{API}/advisory-entries", params={"type": "bogus"})
        assert r.status_code == 400

    def test_view_increments_count_and_recent(self, employee):
        r = employee.get(f"{API}/advisory-entries", params={"type": "disease"})
        entry = r.json()["items"][0]
        aid = entry["id"]
        c0 = entry.get("view_count", 0)
        # Call detail twice
        r1 = employee.get(f"{API}/advisory-entries/{aid}")
        assert r1.status_code == 200
        c1 = r1.json()["view_count"]
        r2 = employee.get(f"{API}/advisory-entries/{aid}")
        c2 = r2.json()["view_count"]
        assert c2 == c1 + 1 == c0 + 2, f"c0={c0} c1={c1} c2={c2}"
        # Recent views records
        rv = employee.get(f"{API}/recent-views")
        assert rv.status_code == 200
        ids = [x["entity_id"] for x in rv.json()]
        assert aid in ids

    def test_crud_admin_and_403_others(self, admin, employee, paddy_id):
        payload = {"type": "disease", "name": f"TEST_Adv_{uuid.uuid4().hex[:5]}",
                   "crop_ids": [paddy_id], "severity": "medium",
                   "symptoms": ["s1", "s2"],
                   "faqs": [{"q": "Q1", "a": "A1"}],
                   "product_ids": [], "photos": [], "documents": []}
        # Non-admin cannot create
        r = employee.post(f"{API}/advisory-entries", json=payload)
        assert r.status_code == 403
        r = admin.post(f"{API}/advisory-entries", json=payload)
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        # Non-admin cannot patch
        r = employee.patch(f"{API}/advisory-entries/{aid}", json={**payload, "name": "X"})
        assert r.status_code == 403
        # Admin patches
        payload["name"] = payload["name"] + "_upd"
        r = admin.patch(f"{API}/advisory-entries/{aid}", json=payload)
        assert r.status_code == 200
        assert r.json()["name"].endswith("_upd")
        # Non-admin cannot delete
        r = employee.delete(f"{API}/advisory-entries/{aid}")
        assert r.status_code == 403
        r = admin.delete(f"{API}/advisory-entries/{aid}")
        assert r.status_code == 200


# ---------- Seasonal Advisories ----------
class TestSeasonal:
    def test_create_and_list(self, admin, employee):
        r = admin.post(f"{API}/seasonal-advisories", json={
            "title": f"TEST_Season_{uuid.uuid4().hex[:5]}",
            "message": "Rain expected",
            "severity": "high",
            "valid_from": "2020-01-01", "valid_to": "2099-12-31",
        })
        assert r.status_code == 200, r.text
        sid = r.json()["id"]

        # active_only=true should include it (dates cover today)
        r2 = employee.get(f"{API}/seasonal-advisories", params={"active_only": "true"})
        assert r2.status_code == 200
        assert any(s["id"] == sid for s in r2.json())

        # Cleanup
        admin.delete(f"{API}/seasonal-advisories/{sid}")

    def test_unpublished_hidden_for_non_admin(self, admin, employee):
        r = admin.post(f"{API}/seasonal-advisories", json={
            "title": f"TEST_Hidden_{uuid.uuid4().hex[:5]}",
            "message": "hidden", "is_published": False,
        })
        sid = r.json()["id"]
        emp_list = employee.get(f"{API}/seasonal-advisories").json()
        assert not any(s["id"] == sid for s in emp_list)
        admin_list = admin.get(f"{API}/seasonal-advisories").json()
        assert any(s["id"] == sid for s in admin_list)
        admin.delete(f"{API}/seasonal-advisories/{sid}")


# ---------- Favorites ----------
class TestFavorites:
    def test_toggle_add_and_remove(self, employee):
        eid = f"TEST-{uuid.uuid4().hex[:8]}"
        r1 = employee.post(f"{API}/favorites/toggle",
                           json={"entity_type": "advisory", "entity_id": eid})
        assert r1.status_code == 200 and r1.json()["favorited"] is True
        # In list
        favs = employee.get(f"{API}/favorites").json()
        assert any(f["entity_id"] == eid for f in favs)
        # Toggle again removes
        r2 = employee.post(f"{API}/favorites/toggle",
                           json={"entity_type": "advisory", "entity_id": eid})
        assert r2.status_code == 200 and r2.json()["favorited"] is False
        favs2 = employee.get(f"{API}/favorites").json()
        assert not any(f["entity_id"] == eid for f in favs2)


# ---------- My Crops ----------
class TestMyCrops:
    def test_patch_my_crops_persists(self, customer, employee):
        r = employee.get(f"{API}/crops")
        crop_ids = [c["id"] for c in r.json()[:3]]
        r2 = customer.patch(f"{API}/me/my-crops", json={"crop_ids": crop_ids})
        assert r2.status_code == 200, r2.text
        assert set(r2.json().get("my_crops", [])) == set(crop_ids)


# ---------- Crop summary ----------
class TestCropSummary:
    def test_paddy_summary(self, employee, paddy_id):
        r = employee.get(f"{API}/crops/{paddy_id}/summary")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "counts" in data
        for k in ("disease", "pest", "deficiency"):
            assert k in data["counts"]
        assert data["counts"]["disease"] >= 1  # Rice Blast
        assert isinstance(data.get("products"), list)


# ---------- /me/profile custom-fields validation ----------
class TestMeProfileCustomFieldValidation:
    def test_required_visible_field_blocks_and_then_passes(self, admin, customer):
        key = f"license_{uuid.uuid4().hex[:5]}"
        # Create required visible field on customer module
        r = admin.post(f"{API}/custom-fields", json={
            "module": "customer", "field_key": key, "label": "License No",
            "type": "text", "required": True, "visible_to_customer": True,
        })
        assert r.status_code == 200, r.text
        cfid = r.json()["id"]
        try:
            # Missing key should 400
            r2 = customer.patch(f"{API}/me/profile", json={"custom_data": {}})
            assert r2.status_code == 400, r2.text
            assert "License No" in r2.text
            # Empty value: 400
            r3 = customer.patch(f"{API}/me/profile", json={"custom_data": {key: ""}})
            assert r3.status_code == 400
            # Providing succeeds
            r4 = customer.patch(f"{API}/me/profile", json={"custom_data": {key: "LIC-123"}})
            assert r4.status_code == 200, r4.text
            assert r4.json()["custom_data"].get(key) == "LIC-123"
        finally:
            admin.delete(f"{API}/custom-fields/{cfid}")
