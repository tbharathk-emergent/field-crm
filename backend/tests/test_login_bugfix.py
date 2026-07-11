"""Tests for the 'Failed to send OTP' bugfix - super admin, reviewer, tenant admin paths."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fieldforce-hub-11.preview.emergentagent.com').rstrip('/')


def _post_with_cold_retry(path, json, retries=1):
    """POST with a single retry after 5s if we hit 502/503/504 (cold start)."""
    url = f"{BASE_URL}{path}"
    for i in range(retries + 1):
        r = requests.post(url, json=json, timeout=15)
        if r.status_code not in (502, 503, 504):
            return r, i
        if i < retries:
            time.sleep(5)
    return r, retries


def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200, f"health returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert data.get("ok") is True


def test_super_admin_request_otp():
    r, attempts = _post_with_cold_retry("/api/auth/request-otp",
                                        {"phone": "9858558555", "channel": "sms"})
    assert r.status_code == 200, f"attempts={attempts} status={r.status_code} body={r.text[:300]}"
    data = r.json()
    assert data.get("is_super_admin") is True
    assert data.get("mock_otp") == "557725"


def test_super_admin_verify_otp():
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": "9858558555", "otp": "557725"}, timeout=15)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data["user"]["role"] == "super_admin"
    assert "token" in data or "access_token" in data


def test_super_admin_wrong_otp_returns_readable_error():
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": "9858558555", "otp": "000000"}, timeout=15)
    assert r.status_code in (400, 401, 403), r.text[:300]
    body = r.json()
    # ensure error is a string-y detail field, not something that would render as [object Object]
    assert "detail" in body or "message" in body or "error" in body
    detail = body.get("detail") or body.get("message") or body.get("error")
    assert isinstance(detail, str) and len(detail) > 0


def test_reviewer_request_otp():
    r, _ = _post_with_cold_retry("/api/auth/request-otp", {"phone": "9898989898"})
    assert r.status_code == 200, r.text[:300]


def test_reviewer_verify_otp():
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": "9898989898", "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data["tenant"]["slug"] == "demo"
    assert data["user"]["role"] == "tenant_admin"


def test_demo_tenant_admin_verify_otp():
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": "9000000001", "otp": "123456", "tenant_slug": "demo"},
                      timeout=15)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data["user"]["role"] == "tenant_admin"
