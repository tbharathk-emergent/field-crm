"""Phase 9: Tenant customization (logo, subdomain URL, Firebase in create/update).

Tests:
- ROOT_DOMAIN via /api/public/tenant-resolve
- Super-only guard on /api/super/tenants
- Firebase-config PUT (existing mode) + DELETE cleanup
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if False else None
# Frontend .env holds REACT_APP_BACKEND_URL, but backend tests read from frontend/.env
def _load_backend_url():
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

BASE_URL = _load_backend_url()


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/auth/request-otp", json={"phone": "9858558555"})
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": "9858558555", "otp": "557725"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def tenant_token():
    r = requests.post(f"{BASE_URL}/api/auth/request-otp", json={"phone": "9000000001", "tenant_slug": "demo"})
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": "9000000001", "otp": "123456", "tenant_slug": "demo"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_tenant_resolve_root_domain():
    r = requests.get(f"{BASE_URL}/api/public/tenant-resolve", params={"host": "demo.fieldcrm.localappstore.in"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("root_domain") == "fieldcrm.localappstore.in"
    assert data.get("matched_by") == "subdomain"
    assert data.get("tenant", {}).get("slug") == "demo"


def test_super_tenants_requires_super(tenant_token):
    r = requests.get(f"{BASE_URL}/api/super/tenants", headers={"Authorization": f"Bearer {tenant_token}"})
    assert r.status_code == 403


def test_super_tenants_lists(super_token):
    r = requests.get(f"{BASE_URL}/api/super/tenants", headers={"Authorization": f"Bearer {super_token}"})
    assert r.status_code == 200
    tenants = r.json()
    assert any(t["slug"] == "demo" for t in tenants)


def test_firebase_config_put_and_delete_android(super_token):
    """Simulate the update-tenant existing-mode path: PUT android app_id, verify, DELETE cleanup."""
    h = {"Authorization": f"Bearer {super_token}"}
    r = requests.get(f"{BASE_URL}/api/super/tenants", headers=h)
    demo = next(t for t in r.json() if t["slug"] == "demo")
    tid = demo["id"]

    # PUT existing android
    payload = {"platform": "android", "app_id": "1:1234:android:test", "package_name": "in.test.demo"}
    r = requests.put(f"{BASE_URL}/api/super/tenants/{tid}/firebase-config", json=payload, headers=h)
    assert r.status_code in (200, 201), r.text

    # GET to verify persisted
    r = requests.get(f"{BASE_URL}/api/super/tenants/{tid}/firebase-config", headers=h)
    assert r.status_code == 200
    cfg = r.json()
    android = cfg.get("android") or {}
    assert android.get("app_id") == "1:1234:android:test"
    assert android.get("mode") == "existing"

    # DELETE cleanup
    r = requests.delete(f"{BASE_URL}/api/super/tenants/{tid}/firebase-config/android", headers=h)
    assert r.status_code in (200, 204)

    # verify gone
    r = requests.get(f"{BASE_URL}/api/super/tenants/{tid}/firebase-config", headers=h)
    cfg = r.json()
    assert not (cfg.get("android") or {}).get("app_id")


def test_tenant_update_accepts_logo_path(super_token):
    h = {"Authorization": f"Bearer {super_token}"}
    r = requests.get(f"{BASE_URL}/api/super/tenants", headers=h)
    demo = next(t for t in r.json() if t["slug"] == "demo")
    tid = demo["id"]
    original_logo = demo.get("logo_path")

    r = requests.patch(f"{BASE_URL}/api/super/tenants/{tid}", json={"logo_path": "/uploads/test-logo.png"}, headers=h)
    assert r.status_code == 200, r.text

    r = requests.get(f"{BASE_URL}/api/super/tenants", headers=h)
    demo2 = next(t for t in r.json() if t["slug"] == "demo")
    assert demo2.get("logo_path") == "/uploads/test-logo.png"

    # restore
    requests.patch(f"{BASE_URL}/api/super/tenants/{tid}", json={"logo_path": original_logo or ""}, headers=h)
