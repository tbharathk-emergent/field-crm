"""Phase 10 — Push token lifecycle: purge + invalid-token auto-cleanup."""
from __future__ import annotations

import os
import pytest
import httpx


BASE = os.environ.get("REACT_APP_BACKEND_URL",
                      os.environ.get("BACKEND_URL", "http://localhost:8001"))
SUPER_PHONE = os.environ.get("SUPER_ADMIN_PHONE", "9858558555")
SUPER_OTP = os.environ.get("SUPER_ADMIN_OTP", "557725")


@pytest.fixture(scope="module")
def super_token():
    with httpx.Client(base_url=BASE, timeout=30) as c:
        c.post("/api/auth/request-otp", json={"phone": SUPER_PHONE})
        r = c.post("/api/auth/verify-otp", json={"phone": SUPER_PHONE, "otp": SUPER_OTP})
        return r.json()["token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def test_purge_requires_filter(super_token):
    with httpx.Client(base_url=BASE, timeout=30) as c:
        r = c.post("/api/super/push/tokens/purge", headers=_hdr(super_token))
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "no_filter"


def test_purge_by_prefix_returns_ok(super_token):
    with httpx.Client(base_url=BASE, timeout=30) as c:
        r = c.post("/api/super/push/tokens/purge",
                   params={"prefix": "never-match-this-xyz"},
                   headers=_hdr(super_token))
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["deleted"] == 0
    assert body["filter"]["token"]["$regex"].startswith("^never")


def test_purge_prefix_escapes_regex_metachars(super_token):
    # A prefix like ".+" must NOT match everything.
    with httpx.Client(base_url=BASE, timeout=30) as c:
        r = c.post("/api/super/push/tokens/purge",
                   params={"prefix": ".+"},
                   headers=_hdr(super_token))
    assert r.status_code == 200
    body = r.json()
    # The regex must be literal — the "." is escaped.
    assert "\\." in body["filter"]["token"]["$regex"]


def test_purge_requires_super_admin():
    # No token → unauthenticated
    with httpx.Client(base_url=BASE, timeout=30) as c:
        r = c.post("/api/super/push/tokens/purge", params={"prefix": "x"})
    assert r.status_code in (401, 403)
