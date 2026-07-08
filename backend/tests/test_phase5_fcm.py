"""Phase 5 — FCM sharded push + Phase 6 — safe-area smoke tests."""
import os
import sys
import uuid
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fcm_service import pick_shard_for_new_tenant, SHARD_CAPACITY, is_shard_configured  # noqa: E402


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


def _login(phone, otp="123456", tenant_slug="demo"):
    body = {"phone": phone, "otp": otp}
    if tenant_slug:
        body["tenant_slug"] = tenant_slug
    r = requests.post(f"{API}/auth/verify-otp", json=body, timeout=10)
    r.raise_for_status()
    return r.json()


@pytest.fixture(scope="module")
def admin_token():
    return _login("9000000001")["token"]


@pytest.fixture(scope="module")
def super_token():
    return _login("9858558555", otp="557725", tenant_slug=None)["token"]


# ---------------- Pure helpers ----------------
def test_pick_shard_empty_returns_1():
    assert pick_shard_for_new_tenant({}) == 1


def test_pick_shard_fills_smallest_with_room():
    counts = {1: SHARD_CAPACITY, 2: 3, 3: 10}
    assert pick_shard_for_new_tenant(counts) == 2


def test_pick_shard_all_full_returns_next():
    counts = {1: SHARD_CAPACITY, 2: SHARD_CAPACITY}
    assert pick_shard_for_new_tenant(counts) == 3


def test_shard_capacity_is_15():
    # Locked constant — 15 tenants per Firebase project per the retrofit spec.
    assert SHARD_CAPACITY == 15


def test_is_shard_configured_returns_false_when_unset():
    # No FCM_SHARD_99_* env vars set in test environment.
    assert is_shard_configured(99) is False


# ---------------- Push token endpoints ----------------
def test_push_register_and_dedupe(admin_token):
    token = f"tok-{uuid.uuid4().hex[:10]}"
    r = requests.post(f"{API}/push/register",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json={"token": token, "platform": "android"}, timeout=10)
    assert r.status_code == 200
    d1 = r.json()
    assert d1["ok"] is True
    assert d1["updated"] is False
    # Register again — must upsert, not duplicate
    r = requests.post(f"{API}/push/register",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json={"token": token, "platform": "ios"}, timeout=10)
    assert r.status_code == 200
    d2 = r.json()
    assert d2["id"] == d1["id"]
    assert d2["updated"] is True

    # Unregister
    r = requests.post(f"{API}/push/unregister",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json={"token": token}, timeout=10)
    assert r.status_code == 200
    assert r.json()["removed"] == 1


def test_push_register_rejects_bad_platform(admin_token):
    r = requests.post(f"{API}/push/register",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json={"token": "x", "platform": "kaios"}, timeout=10)
    assert r.status_code == 400


def test_push_register_requires_auth():
    r = requests.post(f"{API}/push/register", json={"token": "x"}, timeout=10)
    assert r.status_code == 401


def test_push_status_reports_unconfigured_shard(admin_token):
    r = requests.get(f"{API}/admin/push/status",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["shard_capacity"] == 15
    assert isinstance(d["shard_configured"], bool)
    assert isinstance(d["configured_shards"], list)
    assert d["tokens_registered"] >= 0


def test_push_test_returns_disabled_when_shard_unconfigured(admin_token):
    # Register a token so tokens_targeted > 0
    token = f"tok-{uuid.uuid4().hex[:10]}"
    requests.post(f"{API}/push/register",
                  headers={"Authorization": f"Bearer {admin_token}"},
                  json={"token": token, "platform": "android"}, timeout=10)
    r = requests.post(f"{API}/admin/push/test",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json={"title": "hi", "body": "test"}, timeout=10)
    assert r.status_code == 200
    d = r.json()
    # In the test env FCM shards are not configured → response should indicate that.
    assert d["sent"] == 0
    assert "disabled" in d  # explicit reason field
    assert d["shard_id"] >= 1
    assert d["tokens_targeted"] >= 1


def test_super_push_shards_endpoint(super_token):
    r = requests.get(f"{API}/super/push/shards",
                     headers={"Authorization": f"Bearer {super_token}"}, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "shards" in d
    if d["shards"]:
        row = d["shards"][0]
        for k in ("shard_id", "tenant_count", "tenants", "configured", "capacity", "remaining"):
            assert k in row


def test_super_push_shards_forbidden_for_admin(admin_token):
    r = requests.get(f"{API}/super/push/shards",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert r.status_code == 403


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-v"])
