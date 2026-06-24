"""FieldCRM Phase 2 backend tests: areas, roles, permissions, leaves, targets, sync, GPS."""
import os
import uuid
from datetime import datetime, timezone, timedelta
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fieldforce-hub-11.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TENANT_SLUG = "demo"


def _login(phone: str, otp: str = "123456", role_hint: str = None, tenant_slug: str = TENANT_SLUG):
    body = {"phone": phone, "otp": otp}
    if tenant_slug:
        body["tenant_slug"] = tenant_slug
    if role_hint:
        body["role_hint"] = role_hint
    r = requests.post(f"{API}/auth/verify-otp", json=body, timeout=30)
    assert r.status_code == 200, f"login failed for {phone}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_session():
    data = _login("9000000001")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    s.user_id = data["user"]["id"]
    return s


@pytest.fixture(scope="module")
def manager_session():
    data = _login("9000000002")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    s.user_id = data["user"]["id"]
    return s


@pytest.fixture(scope="module")
def employee_session():
    data = _login("9000000003")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    s.user_id = data["user"]["id"]
    return s


@pytest.fixture(scope="module")
def employee2_session():
    data = _login("9000000005")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    s.user_id = data["user"]["id"]
    return s


# ---------------- Areas ----------------
class TestAreas:
    def test_list_areas_seeded(self, admin_session):
        r = admin_session.get(f"{API}/areas")
        assert r.status_code == 200
        areas = r.json()
        names = {a["name"] for a in areas}
        expected = {"India", "Telangana", "Andhra Pradesh", "Hyderabad", "Warangal",
                    "Karimnagar", "Hyderabad North", "Hyderabad South"}
        missing = expected - names
        assert not missing, f"missing seeded areas: {missing}; got: {names}"
        assert len(areas) >= 8

    def test_create_child_area(self, admin_session):
        # list, find Hyderabad (district)
        areas = admin_session.get(f"{API}/areas").json()
        hyd = next((a for a in areas if a["name"] == "Hyderabad" and a["type"] == "district"), None)
        assert hyd, "Hyderabad district not found"
        payload = {"name": f"TEST_Area_{uuid.uuid4().hex[:6]}", "type": "area", "parent_id": hyd["id"]}
        r = admin_session.post(f"{API}/areas", json=payload)
        assert r.status_code == 200, r.text
        node = r.json()
        assert node["parent_id"] == hyd["id"]
        # path must include all ancestors
        assert hyd["id"] in node["path"]
        for anc in hyd.get("path", []):
            assert anc in node["path"]
        # cleanup
        admin_session.delete(f"{API}/areas/{node['id']}")

    def test_update_and_delete_area(self, admin_session):
        # create then patch then delete
        areas = admin_session.get(f"{API}/areas").json()
        hyd = next(a for a in areas if a["name"] == "Hyderabad" and a["type"] == "district")
        node = admin_session.post(f"{API}/areas", json={"name": "TEST_DelMe", "type": "area",
                                                         "parent_id": hyd["id"]}).json()
        r = admin_session.patch(f"{API}/areas/{node['id']}", json={
            "name": "TEST_Renamed", "type": "area", "parent_id": hyd["id"], "code": "T1"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Renamed"
        r = admin_session.delete(f"{API}/areas/{node['id']}")
        assert r.status_code == 200


# ---------------- Roles & Permissions ----------------
class TestRoles:
    def test_seeded_roles(self, admin_session):
        r = admin_session.get(f"{API}/roles")
        assert r.status_code == 200
        names = {x["name"] for x in r.json()}
        assert "Sales Executive" in names
        assert "Read-Only Observer" in names

    def test_permission_modules(self, admin_session):
        r = admin_session.get(f"{API}/permission-modules")
        assert r.status_code == 200
        mods = r.json()["modules"]
        assert isinstance(mods, list) and len(mods) >= 5
        assert "visits" in mods

    def test_create_role_with_permissions(self, admin_session):
        payload = {
            "name": f"TEST_Role_{uuid.uuid4().hex[:6]}",
            "description": "test custom",
            "permissions": {"visits": {"read": True, "write": True},
                            "reports": {"read": True, "write": False}},
        }
        r = admin_session.post(f"{API}/roles", json=payload)
        assert r.status_code == 200, r.text
        role = r.json()
        assert role["permissions"]["visits"]["write"] is True
        # cleanup
        admin_session.delete(f"{API}/roles/{role['id']}")

    def test_my_permissions_admin(self, admin_session):
        r = admin_session.get(f"{API}/my-permissions")
        assert r.status_code == 200
        perms = r.json()["permissions"]
        # admin: all modules read+write true
        for m, v in perms.items():
            assert v["read"] is True and v["write"] is True

    def test_my_permissions_employee_default(self, employee_session):
        r = employee_session.get(f"{API}/my-permissions")
        assert r.status_code == 200
        perms = r.json()["permissions"]
        # employee has at least visits read+write
        assert perms.get("visits", {}).get("read") is True
        assert perms.get("visits", {}).get("write") is True


# ---------------- Leaves ----------------
class TestLeaves:
    leave_id = None

    def test_employee_apply_leave(self, employee_session):
        today = datetime.now(timezone.utc).date()
        f = (today + timedelta(days=10)).isoformat()
        t = (today + timedelta(days=11)).isoformat()
        r = employee_session.post(f"{API}/leaves", json={
            "leave_type": "casual", "from_date": f, "to_date": t, "reason": "TEST_leave"})
        assert r.status_code == 200, r.text
        lr = r.json()
        assert lr["status"] == "pending"
        assert lr["days"] == 2
        TestLeaves.leave_id = lr["id"]

    def test_mine_filter(self, employee_session):
        r = employee_session.get(f"{API}/leaves", params={"mine": True})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert TestLeaves.leave_id in ids

    def test_manager_sees_leave(self, manager_session):
        r = manager_session.get(f"{API}/leaves")
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert TestLeaves.leave_id in ids

    def test_manager_approves(self, manager_session):
        lid = TestLeaves.leave_id
        r = manager_session.patch(f"{API}/leaves/{lid}", json={"status": "approved", "comments": "ok"})
        assert r.status_code == 200, r.text
        lr = r.json()
        assert lr["status"] == "approved"
        assert lr.get("approver_name")
        assert lr.get("decided_at")

    def test_unauthorized_manager_cannot_approve(self, admin_session, employee_session):
        """Create a new manager not in employee's chain and verify 403."""
        # create a temp manager user (no relation) via admin
        phone = f"99{uuid.uuid4().int % 10**8:08d}"
        body = {"phone": phone, "name": "TEST_OtherMgr", "role": "manager"}
        r = admin_session.post(f"{API}/tenant/users", json=body)
        assert r.status_code == 200, r.text
        other_mgr = r.json()
        try:
            # login as that manager
            data = _login(phone)
            tok = data["token"]
            # employee creates a new leave
            today = datetime.now(timezone.utc).date()
            f = (today + timedelta(days=20)).isoformat()
            t2 = (today + timedelta(days=21)).isoformat()
            lr = employee_session.post(f"{API}/leaves", json={
                "leave_type": "casual", "from_date": f, "to_date": t2, "reason": "TEST_403"}).json()
            # other manager tries to approve
            r = requests.patch(f"{API}/leaves/{lr['id']}",
                               headers={"Authorization": f"Bearer {tok}",
                                        "Content-Type": "application/json"},
                               json={"status": "approved"})
            assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"
        finally:
            admin_session.delete(f"{API}/tenant/users/{other_mgr['id']}")


# ---------------- Targets ----------------
class TestTargets:
    def test_set_and_get_progress(self, admin_session, employee_session):
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        emp_id = employee_session.user_id
        r = admin_session.post(f"{API}/targets",
                               json={"user_id": emp_id, "month": month, "sales_target": 55000})
        assert r.status_code == 200, r.text
        assert r.json()["sales_target"] == 55000

        prog = admin_session.get(f"{API}/targets/progress", params={"month": month}).json()
        assert prog["month"] == month
        rows = prog["rows"]
        anil_row = next((x for x in rows if x["user_id"] == emp_id), None)
        assert anil_row
        assert anil_row["target"] == 55000
        assert "actual" in anil_row and "percent" in anil_row

    def test_employee_sees_only_own(self, employee_session):
        prog = employee_session.get(f"{API}/targets/progress").json()
        assert len(prog["rows"]) == 1
        assert prog["rows"][0]["user_id"] == employee_session.user_id


# ---------------- Batch Sync ----------------
class TestBatchSync:
    def test_mixed_batch(self, employee_session):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        items = [
            {"type": "visit", "client_id": "c1",
             "payload": {"dealer_name": "TEST_DealerX", "visit_date": today,
                         "lat": 17.4, "lng": 78.5}},
            {"type": "sales", "client_id": "c2",
             "payload": {"dealer_name": "TEST_DealerX", "product_name": "TEST_Prod",
                         "quantity": 2, "unit_price": 100, "sale_date": today}},
            {"type": "collection", "client_id": "c3",
             "payload": {"dealer_name": "TEST_DealerX", "amount": 500, "collection_date": today,
                         "payment_mode": "Cash"}},
            {"type": "dcr", "client_id": "c4",
             "payload": {"date": today, "dealers_visited": 3}},
            {"type": "enquiry", "client_id": "c5",
             "payload": {"customer_name": "TEST_Cust"}},
            {"type": "location", "client_id": "c6",
             "payload": {"lat": 17.4, "lng": 78.5}},
        ]
        r = employee_session.post(f"{API}/sync/batch", json=items)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 6
        assert data["synced"] == 6
        for res in data["results"]:
            assert res["ok"] is True
            assert "id" in res


# ---------------- GPS ----------------
class TestGPS:
    def test_track_with_pings(self, employee_session):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # post 3 pings clustered together
        for lat, lng in [(17.40, 78.50), (17.4001, 78.5001), (17.402, 78.502)]:
            r = employee_session.post(f"{API}/employee/location", json={"lat": lat, "lng": lng})
            assert r.status_code == 200
        r = employee_session.get(f"{API}/gps/track",
                                 params={"user_id": employee_session.user_id, "date": today})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "pings" in data
        assert "stops" in data
        assert "distance_m" in data
        assert len(data["pings"]) >= 3

    def test_gps_live_manager(self, manager_session, employee_session):
        # ensure employee is checked in
        try:
            employee_session.post(f"{API}/employee/checkin",
                                  json={"lat": 17.4, "lng": 78.5})
        except Exception:
            pass
        # ping
        employee_session.post(f"{API}/employee/location", json={"lat": 17.41, "lng": 78.51})
        r = manager_session.get(f"{API}/gps/live")
        assert r.status_code == 200, r.text
        assert "items" in r.json()

    def test_employee_cannot_see_other(self, employee_session, employee2_session):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = employee_session.get(f"{API}/gps/track",
                                 params={"user_id": employee2_session.user_id, "date": today})
        assert r.status_code == 403


# ---------------- UserIn extras ----------------
class TestUserExtras:
    def test_create_user_with_role_id_and_area(self, admin_session):
        roles = admin_session.get(f"{API}/roles").json()
        role_id = roles[0]["id"]
        areas = admin_session.get(f"{API}/areas").json()
        area_id = next(a["id"] for a in areas if a["type"] == "area")
        phone = f"98{uuid.uuid4().int % 10**8:08d}"
        body = {"phone": phone, "name": "TEST_RoleArea", "role": "employee",
                "role_id": role_id, "area_node_id": area_id}
        r = admin_session.post(f"{API}/tenant/users", json=body)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role_id"] == role_id
        assert u["area_node_id"] == area_id
        admin_session.delete(f"{API}/tenant/users/{u['id']}")


# ---------------- Phase 1 regression smoke ----------------
class TestPhase1Regression:
    def test_super_admin_login(self):
        r = requests.post(f"{API}/auth/verify-otp",
                          json={"phone": "9858558555", "otp": "557725"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "super_admin"

    def test_tenant_profile(self, admin_session):
        r = admin_session.get(f"{API}/tenant/profile")
        assert r.status_code == 200
        assert r.json()["slug"] == "demo"

    def test_list_products(self, admin_session):
        r = admin_session.get(f"{API}/tenant/products")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
