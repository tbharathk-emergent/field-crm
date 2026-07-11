"""Phase 10 — Firebase re-provisioning (ALREADY_EXISTS graceful fallback).

Unit tests the `firebase_provisioning.create_app` + `find_and_fetch_config`
helpers with a mocked `requests` and `google.oauth2.service_account` so we can
simulate ALREADY_EXISTS + list + fetch without hitting Google.
"""
from __future__ import annotations

import base64
import json
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


sys.path.insert(0, "/app/backend")

import firebase_provisioning as fp  # noqa: E402


FAKE_SA = {
    "type": "service_account",
    "project_id": "test-proj",
    "private_key_id": "x",
    "private_key": "-----BEGIN PRIVATE KEY-----\nAAA=\n-----END PRIVATE KEY-----\n",
    "client_email": "sa@test-proj.iam.gserviceaccount.com",
    "client_id": "1",
    "token_uri": "https://oauth2.googleapis.com/token",
}


def _fake_token(*args, **kwargs):
    return "fake-token"


def _resp(status_code, body):
    """Build a minimal `requests.Response`-like object."""
    m = MagicMock()
    m.status_code = status_code
    if isinstance(body, dict):
        m.json.return_value = body
        m.text = json.dumps(body)
    else:
        m.text = body
        m.json.side_effect = ValueError("not json")
    return m


def _b64(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("ascii")


# --------------- create_app happy path ---------------
def test_create_app_first_time(monkeypatch):
    monkeypatch.setattr(fp, "_access_token", _fake_token)
    fake_requests = MagicMock()
    fake_requests.post.return_value = _resp(200, {
        "done": True, "response": {"appId": "1:abc:android:xyz", "packageName": "com.acme.app"},
    })
    fake_requests.get.return_value = _resp(200, {"configFileContents": _b64('{"project": "yes"}')})
    monkeypatch.setattr(fp, "_http", lambda: fake_requests)

    r = fp.create_app("proj", FAKE_SA, "android", "com.acme.app", "Acme Android")
    assert r["ok"] is True
    assert r["app_id"] == "1:abc:android:xyz"
    assert r["config_json"] == '{"project": "yes"}'
    assert "reused" not in r


# --------------- create_app hitting ALREADY_EXISTS → fallback to reuse ---------------
def test_create_app_already_exists_falls_back_to_reuse(monkeypatch):
    monkeypatch.setattr(fp, "_access_token", _fake_token)
    fake_requests = MagicMock()
    # POST /androidApps → 409 ALREADY_EXISTS
    fake_requests.post.return_value = _resp(409, {
        "error": {"code": 409, "message": "Requested entity already exists",
                  "status": "ALREADY_EXISTS"},
    })

    # Then the fallback issues GET /androidApps (list) + GET .../config
    def _get(url, headers=None, timeout=None):
        if url.endswith("/androidApps?pageSize=100"):
            return _resp(200, {"apps": [
                {"appId": "1:xxx:android:yyy",
                 "packageName": "com.acme.app",
                 "name": "projects/proj/androidApps/1:xxx:android:yyy"},
                {"appId": "1:zzz:android:qqq", "packageName": "com.other.app"},
            ]})
        if "/config" in url:
            return _resp(200, {"configFileContents": _b64('{"restored": "config"}')})
        raise AssertionError(f"unexpected GET {url}")

    fake_requests.get.side_effect = _get
    monkeypatch.setattr(fp, "_http", lambda: fake_requests)

    r = fp.create_app("proj", FAKE_SA, "android", "com.acme.app", "Acme Android")
    assert r["ok"] is True, r
    assert r["reused"] is True
    assert r["app_id"] == "1:xxx:android:yyy"
    assert r["config_json"] == '{"restored": "config"}'


# --------------- create_app ALREADY_EXISTS but package can't be located ---------------
def test_create_app_already_exists_but_not_found_in_list(monkeypatch):
    monkeypatch.setattr(fp, "_access_token", _fake_token)
    fake_requests = MagicMock()
    fake_requests.post.return_value = _resp(409, {"error": {"status": "ALREADY_EXISTS"}})
    fake_requests.get.return_value = _resp(200, {"apps": [
        {"appId": "1:aaa", "packageName": "com.something.else"},
    ]})
    monkeypatch.setattr(fp, "_http", lambda: fake_requests)

    r = fp.create_app("proj", FAKE_SA, "android", "com.acme.app", "Acme")
    assert r["ok"] is False
    assert "no existing android app" in r["error"]


# --------------- find_and_fetch_config direct (iOS bundleId) ---------------
def test_find_and_fetch_config_ios_bundle(monkeypatch):
    monkeypatch.setattr(fp, "_access_token", _fake_token)
    fake_requests = MagicMock()

    def _get(url, headers=None, timeout=None):
        if url.endswith("/iosApps?pageSize=100"):
            return _resp(200, {"apps": [
                {"appId": "1:ios:1", "bundleId": "com.acme.ios"},
            ]})
        if "/config" in url:
            return _resp(200, {"configFileContents": _b64("<plist>ok</plist>")})
        raise AssertionError(url)

    fake_requests.get.side_effect = _get
    monkeypatch.setattr(fp, "_http", lambda: fake_requests)

    r = fp.find_and_fetch_config("proj", FAKE_SA, "ios", "com.acme.ios")
    assert r["ok"] is True
    assert r["reused"] is True
    assert r["config_json"] == "<plist>ok</plist>"
    assert r["app_id"] == "1:ios:1"


# --------------- invalid platform guard ---------------
def test_create_app_invalid_platform():
    r = fp.create_app("proj", FAKE_SA, "windows", "com.x", "Nope")
    assert r["ok"] is False and "invalid platform" in r["error"]
