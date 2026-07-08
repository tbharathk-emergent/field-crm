"""Iteration 8 regression smokes + AWS real-bucket verify + backward compat env-shard push."""
import os
from pathlib import Path
import requests
import pytest


def _root():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v: return v.strip()
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("no url")


ROOT = _root()
API = f"{ROOT}/api"


def _login(phone, otp, tenant_slug=None):
    body = {"phone": phone, "otp": otp}
    if tenant_slug: body["tenant_slug"] = tenant_slug
    r = requests.post(f"{API}/auth/verify-otp", json=body, timeout=10)
    r.raise_for_status()
    return r.json()


@pytest.fixture(scope="module")
def super_h():
    tok = _login("9858558555", "557725")["token"]
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tenant_h():
    tok = _login("9000000001", "123456", tenant_slug="demo")["token"]
    return {"Authorization": f"Bearer {tok}"}


# Regression smokes
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200

def test_super_login():
    d = _login("9858558555", "557725")
    assert d.get("token")

def test_tenant_login():
    d = _login("9000000001", "123456", tenant_slug="demo")
    assert d.get("token")

def test_reviewer_login():
    d = _login("9898989898", "123456")
    assert d.get("token")

def test_public_terms():
    r = requests.get(f"{API}/public/legal/terms", params={"slug": "demo"}, timeout=10)
    assert r.status_code == 200

def test_tenant_resolve():
    r = requests.get(f"{API}/public/tenant-resolve", params={"slug": "demo"}, timeout=10)
    assert r.status_code == 200

def test_push_shards(super_h):
    r = requests.get(f"{API}/super/push/shards", headers=super_h, timeout=10)
    assert r.status_code == 200

def test_admin_push_status(tenant_h):
    r = requests.get(f"{API}/admin/push/status", headers=tenant_h, timeout=10)
    assert r.status_code == 200


# AWS real bucket verify + secret masking
def test_aws_real_credentials_verify(super_h):
    """Save user-provided REAL AWS creds and confirm bucket verify succeeds via head_bucket."""
    body = {
        "aws_access_key_id": "AKIAWJ47YHNLR6DKD2XR",
        "aws_secret_access_key": "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",
        "aws_region": "ap-south-1",
        "aws_bucket_name": "follomedia",
        "aws_public_media_host": "media.localappstore.in",
    }
    r = requests.put(f"{API}/super/aws-credentials", headers=super_h, json=body, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["configured"] is True
    assert d["verify"]["attempted"] is True
    # With real creds this should succeed
    assert d["verify"]["ok"] is True, f"Bucket head check failed: {d['verify']}"

    # GET masks secret
    r = requests.get(f"{API}/super/aws-credentials", headers=super_h, timeout=10)
    j = r.json()
    assert j["configured"] is True
    m = j.get("aws_secret_access_key_masked", "")
    assert "…" in m
    # never leak raw secret
    assert "6NWPErHLUelLIktVVxYxFqoevlooaJwzH1QMY2aM" not in r.text


def test_presign_uses_saved_creds(tenant_h):
    r = requests.post(f"{API}/uploads/presign", headers=tenant_h,
                      json={"filename": "x.jpg", "content_type": "image/jpeg", "module": "customer"}, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["bucket"] == "follomedia"
    assert d["region"] == "ap-south-1"
    assert "media.localappstore.in" in d["object_url"]
    assert d["url"].startswith("https://")


# Backward compat env-shard push — tenant WITHOUT tenant_firebase_config
def test_env_shard_push_backward_compat(tenant_h):
    r = requests.post(f"{API}/admin/push/test", headers=tenant_h,
                      json={"title": "t", "body": "b", "dry_run_token": "synth-1"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    # In this test env shard is not configured — expect disabled + source=env_shard OR tenant_firebase_config
    assert "sent" in d
    assert d["sent"] == 0
    # No [object Object] leakage
    assert "[object Object]" not in r.text


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
