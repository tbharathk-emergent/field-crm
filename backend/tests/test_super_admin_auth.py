"""Super Admin OTP auth regression + reviewer/CORS/structured-error tests."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').rstrip("/")

SUPER_PHONE = "9858558555"
SUPER_OTP = "557725"
REVIEWER_PHONE = "9898989898"
DEMO_OTP = "123456"


def test_super_admin_request_otp():
    r = requests.post(f"{BASE}/api/auth/request-otp",
                      json={"phone": SUPER_PHONE, "channel": "sms"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("is_super_admin") is True
    assert data.get("mock_otp") == SUPER_OTP


def test_super_admin_verify_otp():
    r = requests.post(f"{BASE}/api/auth/verify-otp",
                      json={"phone": SUPER_PHONE, "otp": SUPER_OTP})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "super_admin"
    assert isinstance(data.get("token"), str) and len(data["token"]) > 20


def test_super_admin_via_tenant_slug():
    # Even with tenant slug, super admin phone should be detected
    r = requests.post(f"{BASE}/api/auth/request-otp",
                      json={"phone": SUPER_PHONE, "tenant_slug": "demo", "channel": "sms"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("is_super_admin") is True
    assert data.get("mock_otp") == SUPER_OTP


def test_super_admin_stale_headers_ignored():
    # request-otp is public; stale X-Tenant-Slug / Authorization must not break it
    r = requests.post(
        f"{BASE}/api/auth/request-otp",
        json={"phone": SUPER_PHONE, "channel": "sms"},
        headers={
            "X-Tenant-Slug": "a-slug-that-was-deleted",
            "Authorization": "Bearer invalid.stale.jwt",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json().get("is_super_admin") is True


def test_reviewer_request_and_verify():
    r = requests.post(f"{BASE}/api/auth/request-otp",
                      json={"phone": REVIEWER_PHONE, "channel": "sms"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("is_super_admin") is False
    assert d.get("mock_otp") == DEMO_OTP

    r2 = requests.post(f"{BASE}/api/auth/verify-otp",
                       json={"phone": REVIEWER_PHONE, "otp": DEMO_OTP})
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["user"]["role"] == "tenant_admin"
    assert d2.get("tenant", {}).get("slug") == "demo"


def test_wrong_otp_returns_structured_error():
    r = requests.post(f"{BASE}/api/auth/verify-otp",
                      json={"phone": SUPER_PHONE, "otp": "000000"})
    assert r.status_code in (400, 401, 403), r.text
    body = r.json()
    detail = body.get("detail")
    # Detail may be str or {code,message}; both are acceptable, but must be renderable
    if isinstance(detail, dict):
        assert detail.get("message") or detail.get("code"), body
    else:
        assert isinstance(detail, str) and detail


def test_cors_preflight_request_otp():
    r = requests.options(
        f"{BASE}/api/auth/request-otp",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code in (200, 204), r.text
    aco = r.headers.get("access-control-allow-origin", "")
    assert aco in ("*", "https://example.com"), r.headers
    acm = r.headers.get("access-control-allow-methods", "")
    assert "POST" in acm.upper()
