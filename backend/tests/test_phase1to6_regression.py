"""
Phase 1-6 end-to-end regression test for FieldCRM Bizil retrofit.
Exercises live endpoints against REACT_APP_BACKEND_URL.
"""
import os
import time
import random
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback read from /app/frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"
OTP = "123456"
SUPER_OTP = "557725"


def _login(phone, otp=OTP, tenant_slug=None, role_hint=None):
    body = {"phone": phone, "otp": otp}
    if tenant_slug:
        body["tenant_slug"] = tenant_slug
    if role_hint:
        body["role_hint"] = role_hint
    r = requests.post(f"{API}/auth/verify-otp", json=body, timeout=15)
    return r


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# --------------- PHASE 1 ---------------
def test_phase1_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_phase1_public_demo_credentials():
    r = requests.get(f"{API}/public/demo-credentials", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert "super_admin" in j
    assert isinstance(j.get("users"), list) and len(j["users"]) > 0


# --------------- PHASE 2 subdomain resolver ---------------
def test_phase2_resolve_unknown_host():
    r = requests.get(f"{API}/public/tenant-resolve", params={"host": "unknown.example.com"}, timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j.get("tenant") is None
    assert j.get("matched_by") is None


def test_phase2_custom_domain_roundtrip():
    login = _login("9000000001", tenant_slug="demo")
    assert login.status_code == 200, login.text
    tok = login.json()["token"]
    domain = f"portal.demo-test-{random.randint(1000,9999)}.io"
    p = requests.patch(f"{API}/tenant/profile", json={"custom_domain": domain}, headers=_hdr(tok), timeout=15)
    assert p.status_code == 200, p.text
    try:
        r = requests.get(f"{API}/public/tenant-resolve", params={"host": domain}, timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert j.get("tenant") is not None, j
        assert j.get("matched_by") == "custom_domain", j
        assert j["tenant"].get("slug") == "demo"
    finally:
        # cleanup
        requests.patch(f"{API}/tenant/profile", json={"custom_domain": ""}, headers=_hdr(tok), timeout=15)


def test_phase2_stale_tenant_self_heal():
    r = requests.get(f"{API}/public/tenants/by-slug/definitely-not-a-tenant", timeout=10)
    assert r.status_code == 404
    j = r.json()
    detail = j.get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") == "tenant_not_found", j
    else:
        # FastAPI could wrap; accept either
        assert "tenant_not_found" in str(j)


# --------------- PHASE 3 uploads ---------------
def test_phase3_presign_unauth():
    r = requests.post(f"{API}/uploads/presign", json={}, timeout=10)
    assert r.status_code == 401


def test_phase3_presign_reflects_current_config():
    """Phase 8 update: AWS creds can be saved via Super Admin UI. If the platform
    has creds saved, presign returns 200 with a signed URL; if not, 503."""
    tok = _login("9000000001", tenant_slug="demo").json()["token"]
    r = requests.post(f"{API}/uploads/presign", json={"filename": "a.jpg", "content_type": "image/jpeg"}, headers=_hdr(tok), timeout=10)
    assert r.status_code in (200, 503), r.text
    if r.status_code == 200:
        assert r.json().get("url", "").startswith("https://")
    else:
        assert "not configured" in r.text.lower()


# --------------- PHASE 3 legal ---------------
def test_phase3_legal_full_cycle():
    tok = _login("9000000001", tenant_slug="demo").json()["token"]
    # v1
    r1 = requests.post(f"{API}/admin/legal", json={"kind": "terms", "title": "Terms v1", "content_md": "# Terms v1", "publish": True}, headers=_hdr(tok), timeout=15)
    assert r1.status_code == 200, r1.text
    assert r1.json().get("is_published") is True

    pub = requests.get(f"{API}/public/legal/terms", params={"slug": "demo"}, timeout=10)
    assert pub.status_code == 200
    v1 = pub.json().get("version")
    assert v1 is not None

    # v2
    r2 = requests.post(f"{API}/admin/legal", json={"kind": "terms", "title": "Terms v2", "content_md": "# Terms v2", "publish": True}, headers=_hdr(tok), timeout=15)
    assert r2.status_code == 200, r2.text
    pub2 = requests.get(f"{API}/public/legal/terms", params={"slug": "demo"}, timeout=10)
    assert pub2.status_code == 200
    assert pub2.json().get("version") != v1
    assert "v2" in (pub2.json().get("title") or "") or "v2" in (pub2.json().get("content_md") or "")

    # invalid kind
    bad = requests.post(f"{API}/admin/legal", json={"kind": "not-a-kind", "title": "X", "content_md": "x", "publish": False}, headers=_hdr(tok), timeout=15)
    assert bad.status_code == 400, bad.text

    # employee forbidden
    emp = _login("9000000003", tenant_slug="demo").json()["token"]
    forb = requests.post(f"{API}/admin/legal", json={"kind": "terms", "title": "e", "content_md": "e", "publish": False}, headers=_hdr(emp), timeout=15)
    assert forb.status_code == 403


def test_phase3_legal_public_404():
    r = requests.get(f"{API}/public/legal/shipping", params={"slug": "demo"}, timeout=10)
    assert r.status_code == 404
    j = r.json()
    detail = j.get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") == "legal_not_found", j
    else:
        assert "legal_not_found" in str(j)


# --------------- PHASE 4 reviewer ---------------
def test_phase4_reviewer_bypass():
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": "9898989898", "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("user", {}).get("role") == "tenant_admin", j
    assert j.get("tenant", {}).get("slug") == "demo", j
    tok = j["token"]
    me = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=10)
    assert me.status_code == 200
    dele = requests.post(f"{API}/auth/me/delete", headers=_hdr(tok), timeout=10)
    assert dele.status_code == 403
    assert "reviewer" in dele.text.lower()


# --------------- PHASE 4 soft-delete guards ---------------
def test_phase4_soft_delete_outstanding_guard():
    tok = _login("9000000001", tenant_slug="demo").json()["token"]
    phone = f"99{random.randint(10000000, 99999999)}"
    # create customer via /tenant/users
    payload = {"phone": phone, "name": "TEST_SoftDel", "role": "customer"}
    c = requests.post(f"{API}/tenant/users", json=payload, headers=_hdr(tok), timeout=15)
    assert c.status_code in (200, 201), c.text
    uid = c.json().get("id")
    assert uid

    # PATCH full payload with outstanding
    patch_body = {"phone": phone, "name": "TEST_SoftDel", "role": "customer", "outstanding_amount": 250}
    p = requests.patch(f"{API}/tenant/users/{uid}", json=patch_body, headers=_hdr(tok), timeout=15)
    assert p.status_code == 200, p.text

    # login as that customer
    cust = _login(phone, tenant_slug="demo", role_hint="customer")
    assert cust.status_code == 200, cust.text
    ctok = cust.json()["token"]

    dele = requests.post(f"{API}/auth/me/delete", headers=_hdr(ctok), timeout=10)
    assert dele.status_code == 409, dele.text
    j = dele.json()
    detail = j.get("detail")
    code = detail.get("code") if isinstance(detail, dict) else str(j)
    assert "outstanding_balance" in str(code), j

    # reset outstanding to 0
    patch_body2 = {"phone": phone, "name": "TEST_SoftDel", "role": "customer", "outstanding_amount": 0}
    p2 = requests.patch(f"{API}/tenant/users/{uid}", json=patch_body2, headers=_hdr(tok), timeout=15)
    assert p2.status_code == 200, p2.text

    dele2 = requests.post(f"{API}/auth/me/delete", headers=_hdr(ctok), timeout=10)
    assert dele2.status_code == 200, dele2.text

    # old token now revoked
    time.sleep(1.3)
    me = requests.get(f"{API}/auth/me", headers=_hdr(ctok), timeout=10)
    assert me.status_code == 401


def test_phase4_logout_all():
    tok = _login("9000000002", tenant_slug="demo").json()["token"]
    me = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=10)
    assert me.status_code == 200
    lo = requests.post(f"{API}/auth/logout-all", headers=_hdr(tok), timeout=10)
    assert lo.status_code == 200
    time.sleep(1.3)
    me2 = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=10)
    assert me2.status_code == 401
    assert "revoked" in me2.text.lower()


# --------------- PHASE 5 push ---------------
def test_phase5_push_register_dedupe_and_unregister():
    tok = _login("9000000001", tenant_slug="demo").json()["token"]
    r1 = requests.post(f"{API}/push/register", json={"token": "ci-tok", "platform": "android"}, headers=_hdr(tok), timeout=10)
    assert r1.status_code == 200, r1.text
    assert r1.json().get("updated") is False

    r2 = requests.post(f"{API}/push/register", json={"token": "ci-tok", "platform": "android"}, headers=_hdr(tok), timeout=10)
    assert r2.status_code == 200
    assert r2.json().get("updated") is True

    bad = requests.post(f"{API}/push/register", json={"token": "x", "platform": "windows-phone"}, headers=_hdr(tok), timeout=10)
    assert bad.status_code == 400

    un_no_auth = requests.post(f"{API}/push/register", json={"token": "x", "platform": "android"}, timeout=10)
    assert un_no_auth.status_code == 401

    un = requests.post(f"{API}/push/unregister", json={"token": "ci-tok"}, headers=_hdr(tok), timeout=10)
    assert un.status_code == 200
    assert un.json().get("removed") == 1


def test_phase5_push_status_and_test():
    tok = _login("9000000001", tenant_slug="demo").json()["token"]
    st = requests.get(f"{API}/admin/push/status", headers=_hdr(tok), timeout=10)
    assert st.status_code == 200, st.text
    j = st.json()
    for k in ["shard_id", "shard_configured", "configured_shards", "shard_capacity", "tokens_registered"]:
        assert k in j, (k, j)
    assert j["shard_capacity"] == 15
    assert j["shard_configured"] is False
    assert j["tokens_registered"] >= 0

    t = requests.post(f"{API}/admin/push/test", json={}, headers=_hdr(tok), timeout=10)
    assert t.status_code == 200, t.text
    tj = t.json()
    assert tj.get("sent") == 0
    assert "not configured" in (tj.get("disabled") or "").lower()
    assert "shard_id" in tj
    assert tj.get("tokens_targeted", -1) >= 0


def test_phase5_super_shards_and_tenant_forbidden():
    # tenant admin -> 403
    tok = _login("9000000001", tenant_slug="demo").json()["token"]
    r = requests.get(f"{API}/super/push/shards", headers=_hdr(tok), timeout=10)
    assert r.status_code == 403

    # super admin
    sa = _login("9858558555", otp=SUPER_OTP)
    assert sa.status_code == 200, sa.text
    stok = sa.json()["token"]
    s = requests.get(f"{API}/super/push/shards", headers=_hdr(stok), timeout=10)
    assert s.status_code == 200, s.text
    sj = s.json()
    assert isinstance(sj.get("shards"), list)
    assert isinstance(sj.get("configured_shards"), list)
    assert sj["configured_shards"] == []


# --------------- PHASE 6 iOS safe area ---------------
def test_phase6_viewport_fit_cover_in_html():
    r = requests.get(f"{BASE_URL}/", timeout=15)
    assert r.status_code == 200
    assert "viewport-fit=cover" in r.text, "index.html missing viewport-fit=cover"


# --------------- REGRESSION logins ---------------
def test_regression_all_logins():
    assert _login("9858558555", otp=SUPER_OTP).status_code == 200
    assert _login("9000000001", tenant_slug="demo").status_code == 200
    assert _login("9000000003", tenant_slug="demo").status_code == 200
    assert _login("9000000007", tenant_slug="demo", role_hint="customer").status_code == 200


def test_regression_phone_role_conflict():
    # 9000000004 is Dealer; asking role_hint=customer must return 409 (not 500)
    r = _login("9000000004", tenant_slug="demo", role_hint="customer")
    assert r.status_code == 409, r.text
    j = r.json()
    detail = j.get("detail")
    code = detail.get("code") if isinstance(detail, dict) else str(j)
    assert "phone_role_conflict" in str(code), j
