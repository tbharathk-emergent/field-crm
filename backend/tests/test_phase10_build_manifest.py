"""Phase 10 — Build Manifest endpoint tests.

Covers /api/super/build/manifest/{slug} added for build_app.py orchestration.
"""
import os
import pytest
import httpx


BASE = os.environ.get("REACT_APP_BACKEND_URL",
                      os.environ.get("BACKEND_URL", "http://localhost:8001"))
SUPER_PHONE = os.environ.get("SUPER_ADMIN_PHONE", "9858558555")
SUPER_OTP = os.environ.get("SUPER_ADMIN_OTP", "557725")


@pytest.fixture(scope="module")
def super_token():
    with httpx.Client(base_url=BASE, timeout=15) as c:
        r = c.post("/api/auth/request-otp", json={"phone": SUPER_PHONE})
        assert r.status_code == 200, r.text
        r = c.post("/api/auth/verify-otp",
                   json={"phone": SUPER_PHONE, "otp": SUPER_OTP})
        assert r.status_code == 200, r.text
        token = r.json().get("token") or r.json().get("access_token")
        assert token, r.json()
        return token


@pytest.fixture(scope="module")
def tenant_token():
    """Non-super token for negative auth tests."""
    with httpx.Client(base_url=BASE, timeout=15) as c:
        c.post("/api/auth/request-otp", json={"phone": "9000000001"})
        r = c.post("/api/auth/verify-otp",
                   json={"phone": "9000000001", "otp": "123456",
                         "tenant_slug": "demo"})
        if r.status_code != 200:
            r = c.post("/api/auth/verify-otp",
                       json={"phone": "9000000001", "otp": "123456"})
        assert r.status_code == 200, r.text
        return r.json().get("token") or r.json().get("access_token")


def _get(token, url):
    with httpx.Client(base_url=BASE, timeout=15) as c:
        return c.get(url, headers={"Authorization": f"Bearer {token}"})


def test_build_manifest_requires_super_admin(tenant_token):
    r = _get(tenant_token, "/api/super/build/manifest/demo")
    assert r.status_code == 403, r.text


def test_build_manifest_returns_tenant_metadata(super_token):
    r = _get(super_token, "/api/super/build/manifest/demo")
    assert r.status_code == 200, r.text
    body = r.json()
    # tenant block
    t = body["tenant"]
    for k in ("id", "slug", "name", "theme", "default_language"):
        assert k in t, f"missing {k}"
    assert t["slug"] == "demo"
    # firebase block (shape may be null/dict but keys must be present)
    assert "firebase" in body
    assert "android" in body["firebase"]
    assert "ios" in body["firebase"]
    # server block with derived host
    assert "server" in body


def test_build_manifest_unknown_slug_returns_404(super_token):
    r = _get(super_token, "/api/super/build/manifest/no-such-tenant-xyz")
    assert r.status_code == 404
    detail = r.json().get("detail")
    assert isinstance(detail, dict) and detail.get("code") == "tenant_not_found"


def test_build_manifest_includes_server_host_when_root_domain_set(super_token):
    if not os.environ.get("ROOT_DOMAIN"):
        pytest.skip("ROOT_DOMAIN not configured")
    r = _get(super_token, "/api/super/build/manifest/demo")
    server = r.json().get("server") or {}
    root = os.environ["ROOT_DOMAIN"]
    assert server.get("host") == f"demo.{root}"
    assert server.get("url") == f"https://demo.{root}"
