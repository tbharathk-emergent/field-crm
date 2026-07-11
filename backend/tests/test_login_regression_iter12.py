"""Iter12: Login regression — verify OTP flow for Super Admin, Reviewer bypass, Tenant user."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fieldforce-hub-11.preview.emergentagent.com").rstrip("/")

# Fallback from frontend/.env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestSuperAdminAuth:
    def test_request_otp_super_admin(self, api):
        r = api.post(f"{BASE_URL}/api/auth/request-otp", json={"phone": "9858558555"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("mock_otp") == "557725", f"mock_otp mismatch: {data}"

    def test_verify_otp_super_admin(self, api):
        r = api.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": "9858558555", "otp": "557725"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data or "access_token" in data, data
        token = data.get("token") or data.get("access_token")
        # profile
        me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200, me.text
        prof = me.json()
        user = prof.get("user", prof)
        assert user.get("is_super_admin") is True or user.get("role") == "super_admin", prof


class TestReviewerBypass:
    def test_request_otp_reviewer(self, api):
        r = api.post(f"{BASE_URL}/api/auth/request-otp", json={"phone": "9898989898"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("mock_otp") == "123456", data

    def test_verify_otp_reviewer(self, api):
        r = api.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": "9898989898", "otp": "123456"})
        assert r.status_code == 200, r.text
        data = r.json()
        token = data.get("token") or data.get("access_token")
        assert token, data
        me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200, me.text
        prof = me.json()
        # Reviewer auto-attaches to demo tenant as tenant_admin
        assert prof.get("tenant_id") or prof.get("tenant_slug") == "demo" or "demo" in str(prof).lower(), prof


class TestTenantUserDemo:
    def test_request_otp_tenant(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/request-otp",
            json={"phone": "9000000001", "tenant_slug": "demo"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("mock_otp") == "123456", data

    def test_verify_otp_tenant(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": "9000000001", "otp": "123456", "tenant_slug": "demo"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        token = data.get("token") or data.get("access_token")
        assert token, data
        me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200, me.text
        prof = me.json()
        user = prof.get("user", prof)
        assert user.get("tenant_id"), prof


class TestTenantResolve:
    def test_public_tenant_resolve_by_host(self, api):
        # Endpoint is host-based; provide subdomain host
        r = api.get(
            f"{BASE_URL}/api/public/tenant-resolve",
            params={"host": "demo.fieldcrm.localappstore.in"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Endpoint should return 200 with resolved tenant or null; must include host/root_domain fields
        assert "host" in data and "root_domain" in data, data

    def test_public_tenant_resolve_no_error(self, api):
        # Ensure endpoint doesn't 500 with default host
        r = api.get(f"{BASE_URL}/api/public/tenant-resolve")
        assert r.status_code == 200, r.text
