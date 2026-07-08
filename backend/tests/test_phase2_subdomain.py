"""Phase 2 — Multi-tenant subdomain resolver + custom_domain routing tests."""
import os
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tenant_resolver import (  # noqa: E402
    normalize_host,
    parse_host_to_slug,
    invalidate_all,
)


ROOT = None
API = None


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


# ---------------- Pure helpers ----------------
def test_normalize_host_strips_protocol_path_port():
    assert normalize_host("HTTPS://Acme.Example.com:8080/foo") == "acme.example.com"
    assert normalize_host("  demo.fieldcrm.app  ") == "demo.fieldcrm.app"
    assert normalize_host("") == ""
    assert normalize_host(None) == ""


def test_parse_host_to_slug_happy_path():
    assert parse_host_to_slug("demo.fieldcrm.app", "fieldcrm.app") == "demo"
    assert parse_host_to_slug("acme-agro.fieldcrm.app", "fieldcrm.app") == "acme-agro"


def test_parse_host_to_slug_rejects_apex_and_www():
    assert parse_host_to_slug("fieldcrm.app", "fieldcrm.app") is None
    assert parse_host_to_slug("www.fieldcrm.app", "fieldcrm.app") is None


def test_parse_host_to_slug_rejects_multi_label():
    assert parse_host_to_slug("a.b.fieldcrm.app", "fieldcrm.app") is None


def test_parse_host_to_slug_rejects_bad_chars():
    assert parse_host_to_slug("acme!.fieldcrm.app", "fieldcrm.app") is None


def test_parse_host_to_slug_no_root_configured():
    assert parse_host_to_slug("anything.local", "") is None


# ---------------- Live endpoint ----------------
def _demo_token():
    r = requests.post(f"{API}/auth/verify-otp", json={
        "phone": "9000000001", "otp": "123456", "tenant_slug": "demo",
    }, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def test_public_tenant_resolve_no_match_returns_null():
    invalidate_all()
    r = requests.get(f"{API}/public/tenant-resolve", params={"host": "unknown.example.com"}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["tenant"] is None
    assert body["matched_by"] is None
    assert body["host"] == "unknown.example.com"


def test_stale_slug_returns_self_heal_code():
    r = requests.get(f"{API}/public/tenants/by-slug/definitely-not-a-tenant", timeout=10)
    assert r.status_code == 404
    detail = r.json().get("detail")
    # detail can be either the object or a stringified dict depending on FastAPI version
    if isinstance(detail, dict):
        assert detail.get("code") == "tenant_not_found"
    else:
        assert "tenant_not_found" in str(detail)


def test_custom_domain_binding_end_to_end():
    invalidate_all()
    token = _demo_token()
    headers = {"Authorization": f"Bearer {token}"}
    # Bind a custom domain
    r = requests.patch(f"{API}/tenant/profile", headers=headers,
                       json={"custom_domain": "portal.demo-test.io"}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json().get("custom_domain") == "portal.demo-test.io"

    # Resolve via the custom domain
    r = requests.get(f"{API}/public/tenant-resolve",
                     params={"host": "portal.demo-test.io"}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["tenant"] is not None
    assert body["tenant"]["slug"] == "demo"
    assert body["matched_by"] == "custom_domain"

    # Uniqueness — another tenant taking the same domain should get 409
    # (Skipped: requires a second tenant admin token; covered by unique index.)

    # Cleanup
    r = requests.patch(f"{API}/tenant/profile", headers=headers,
                       json={"custom_domain": ""}, timeout=10)
    assert r.status_code == 200
    assert r.json().get("custom_domain") in (None, "")


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-v"])
