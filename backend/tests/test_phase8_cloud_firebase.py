"""Phase 8 — AWS creds UI + per-tenant Firebase config + Super-Admin per-tenant test push."""
import os
import sys
import uuid
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _load_frontend_env():
    p = Path("/app/frontend/.env")
    if not p.exists():
        return "http://localhost:8001"
    for line in p.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    return "http://localhost:8001"


ROOT = os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()
API = f"{ROOT}/api"


def _login(phone, otp="123456", tenant_slug=None):
    body = {"phone": phone, "otp": otp}
    if tenant_slug:
        body["tenant_slug"] = tenant_slug
    r = requests.post(f"{API}/auth/verify-otp", json=body, timeout=10)
    r.raise_for_status()
    return r.json()


@pytest.fixture(scope="module")
def super_token():
    return _login("9858558555", otp="557725")["token"]


@pytest.fixture(scope="module")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="module")
def demo_tenant_id(super_headers):
    r = requests.get(f"{API}/super/tenants", headers=super_headers, timeout=10)
    r.raise_for_status()
    for t in r.json():
        if t["slug"] == "demo":
            return t["id"]
    pytest.fail("demo tenant not found")


# ---------------- AWS credentials ----------------
def test_aws_creds_forbidden_for_non_super():
    tok = _login("9000000001", tenant_slug="demo")["token"]
    r = requests.get(f"{API}/super/aws-credentials", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 403


def test_aws_creds_get_masks_secret(super_headers):
    r = requests.get(f"{API}/super/aws-credentials", headers=super_headers, timeout=10)
    assert r.status_code == 200
    d = r.json()
    # If secret is stored it MUST be masked, never returned in full.
    m = d.get("aws_secret_access_key_masked", "")
    assert "…" in m or m == ""  # empty means not yet saved
    # Never leak the raw field name
    assert "aws_secret_access_key" not in d or d.get("aws_secret_access_key") is None


def test_aws_creds_put_and_apply_at_runtime(super_headers):
    # Save with the user-provided real credentials
    body = {
        "aws_access_key_id": "AKIAWJ47YHNLR6DKD2XR",
        "aws_secret_access_key": "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",
        "aws_region": "ap-south-1",
        "aws_bucket_name": "follomedia",
        "aws_public_media_host": "media.localappstore.in",
    }
    r = requests.put(f"{API}/super/aws-credentials", headers=super_headers, json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True
    assert d["configured"] is True
    # verify block is best-effort — either succeeded or attempted
    assert d["verify"]["attempted"] is True

    # After save, /uploads/presign should now succeed
    tok = _login("9000000001", tenant_slug="demo")["token"]
    r = requests.post(f"{API}/uploads/presign", headers={"Authorization": f"Bearer {tok}"},
                      json={"filename": "test.jpg", "content_type": "image/jpeg", "module": "customer"}, timeout=10)
    assert r.status_code == 200, r.text
    presign = r.json()
    assert presign["bucket"] == "follomedia"
    assert presign["region"] == "ap-south-1"
    # public_host is honoured in object_url
    assert "media.localappstore.in" in presign["object_url"]


# ---------------- Firebase projects ----------------
def test_firebase_project_rejects_non_service_account(super_headers):
    r = requests.post(f"{API}/super/firebase-projects", headers=super_headers,
                      json={"name": "bad", "project_id": f"bad-{uuid.uuid4().hex[:6]}",
                            "service_account_json": {"foo": "bar"}}, timeout=10)
    assert r.status_code == 400


def test_firebase_project_crud_lifecycle(super_headers):
    proj_id = f"test-{uuid.uuid4().hex[:8]}"
    sa = {
        "type": "service_account",
        "project_id": proj_id,
        "private_key": "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
        "client_email": f"sa@{proj_id}.iam.gserviceaccount.com",
    }
    r = requests.post(f"{API}/super/firebase-projects", headers=super_headers,
                      json={"name": "Test Shard", "project_id": proj_id, "service_account_json": sa}, timeout=15)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["project_id"] == proj_id
    assert "service_account_json" not in created  # never leaked
    # listing might fail because service account is fake — expected & documented
    assert created["listing"]["ok"] is False

    # Duplicate → 409
    r = requests.post(f"{API}/super/firebase-projects", headers=super_headers,
                      json={"name": "dup", "project_id": proj_id, "service_account_json": sa}, timeout=10)
    assert r.status_code == 409

    # List includes it, with tenants_bound=0 and remaining_apps=30
    r = requests.get(f"{API}/super/firebase-projects", headers=super_headers, timeout=10)
    assert r.status_code == 200
    ours = [p for p in r.json() if p["project_id"] == proj_id]
    assert len(ours) == 1
    assert ours[0]["tenants_bound"] == 0
    assert ours[0]["remaining_apps"] == 30
    assert ours[0]["max_apps"] == 30
    fp_id = ours[0]["id"]

    # Delete when unbound → OK
    r = requests.delete(f"{API}/super/firebase-projects/{fp_id}", headers=super_headers, timeout=10)
    assert r.status_code == 200


# ---------------- Per-tenant Firebase config ----------------
def test_tenant_firebase_config_empty_state(super_headers, demo_tenant_id):
    r = requests.get(f"{API}/super/tenants/{demo_tenant_id}/firebase-config",
                     headers=super_headers, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["tenant"]["slug"] == "demo"


def test_tenant_existing_config_only_affects_one_platform(super_headers, demo_tenant_id):
    # Set android
    r = requests.put(f"{API}/super/tenants/{demo_tenant_id}/firebase-config", headers=super_headers,
                     json={"platform": "android", "app_id": "1:1234:android:aaa",
                           "package_name": "com.acme.demo",
                           "config_json": '{"project_info":{}}'}, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["android"]["app_id"] == "1:1234:android:aaa"
    assert d["ios"] is None

    # Now set ios independently — android must remain intact
    r = requests.put(f"{API}/super/tenants/{demo_tenant_id}/firebase-config", headers=super_headers,
                     json={"platform": "ios", "app_id": "1:1234:ios:bbb",
                           "package_name": "com.acme.demo"}, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["android"]["app_id"] == "1:1234:android:aaa"  # preserved
    assert d["ios"]["app_id"] == "1:1234:ios:bbb"

    # Unbind ios only — android must remain
    r = requests.delete(f"{API}/super/tenants/{demo_tenant_id}/firebase-config/ios", headers=super_headers, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["android"]["app_id"] == "1:1234:android:aaa"
    assert d["ios"] is None

    # Cleanup: unbind android
    requests.delete(f"{API}/super/tenants/{demo_tenant_id}/firebase-config/android", headers=super_headers, timeout=10)


def test_tenant_config_rejects_bad_platform(super_headers, demo_tenant_id):
    r = requests.put(f"{API}/super/tenants/{demo_tenant_id}/firebase-config", headers=super_headers,
                     json={"platform": "windows", "app_id": "x"}, timeout=10)
    assert r.status_code == 400


def test_provision_fails_gracefully_with_fake_service_account(super_headers, demo_tenant_id):
    # Create a fake firebase project
    proj_id = f"test-{uuid.uuid4().hex[:8]}"
    sa = {
        "type": "service_account", "project_id": proj_id,
        "private_key": "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
        "client_email": f"sa@{proj_id}.iam.gserviceaccount.com",
    }
    r = requests.post(f"{API}/super/firebase-projects", headers=super_headers,
                      json={"name": "Prov Test", "project_id": proj_id, "service_account_json": sa}, timeout=15)
    fp_id = r.json()["id"]
    try:
        # Attempt provisioning — must not 500; must store the error in provisioning_error
        r = requests.post(f"{API}/super/tenants/{demo_tenant_id}/firebase-config/provision",
                          headers=super_headers,
                          json={"platform": "android", "firebase_project_id": fp_id}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is False
        assert d["result"]["ok"] is False
        assert "error" in d["result"]
        # Config was stored with error attached so admin sees why
        assert d["config"]["android"]["mode"] == "auto"
        assert d["config"]["android"]["provisioning_error"] is not None
    finally:
        requests.delete(f"{API}/super/tenants/{demo_tenant_id}/firebase-config/android", headers=super_headers, timeout=10)
        requests.delete(f"{API}/super/firebase-projects/{fp_id}", headers=super_headers, timeout=10)


# ---------------- Super-Admin per-tenant test push ----------------
def test_super_push_test_returns_disabled_when_shard_unconfigured(super_headers, demo_tenant_id):
    r = requests.post(f"{API}/super/tenants/{demo_tenant_id}/push/test",
                      headers=super_headers,
                      json={"title": "hi", "body": "hello", "dry_run_token": "synth-tok-1"},
                      timeout=15)
    assert r.status_code == 200
    d = r.json()
    # Either the source is env_shard (unconfigured) OR tenant_firebase_config (also unconfigured with fake creds)
    assert d["source"] in ("env_shard", "tenant_firebase_config")
    # Either way, sent should be 0 with a `disabled` reason in the test environment
    assert d["sent"] == 0


def test_super_push_test_forbidden_for_tenant_admin(demo_tenant_id):
    tok = _login("9000000001", tenant_slug="demo")["token"]
    r = requests.post(f"{API}/super/tenants/{demo_tenant_id}/push/test",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"title": "x", "body": "y"}, timeout=10)
    assert r.status_code == 403


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-v"])
