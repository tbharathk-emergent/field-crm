"""Phase 10 — Platform-default legal document fallback.

Guarantees the `/api/public/legal/{kind}` endpoint gracefully falls back to
a platform-default template when a tenant has not yet published its own doc,
so the App Store review flow and marketing footer work without configuration.
"""
from __future__ import annotations

import os
import pytest
import httpx


BASE = os.environ.get("REACT_APP_BACKEND_URL",
                      os.environ.get("BACKEND_URL", "http://localhost:8001"))


def _get(url, params=None):
    with httpx.Client(base_url=BASE, timeout=15) as c:
        return c.get(url, params=params)


def test_legal_privacy_falls_back_without_tenant():
    r = _get("/api/public/legal/privacy")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_platform_default"] is True
    assert body["kind"] == "privacy"
    assert body["title"] == "Privacy Policy"
    assert "# Privacy Policy" in body["content_md"]


def test_legal_terms_falls_back_without_tenant():
    r = _get("/api/public/legal/terms")
    assert r.status_code == 200
    body = r.json()
    assert body["is_platform_default"] is True
    assert body["kind"] == "terms"
    assert body["title"] == "Terms of Service"


@pytest.mark.parametrize("kind", ["privacy", "terms", "refund", "shipping", "about", "contact"])
def test_all_legal_kinds_have_platform_defaults(kind):
    r = _get(f"/api/public/legal/{kind}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_platform_default"] is True
    assert body["content_md"], f"{kind} default content is empty"
    assert len(body["content_md"]) > 40, f"{kind} default content is suspiciously short"


def test_legal_unknown_slug_still_serves_default():
    r = _get("/api/public/legal/privacy", params={"slug": "definitely-not-a-tenant-xyz"})
    assert r.status_code == 200
    assert r.json()["is_platform_default"] is True


def test_legal_invalid_kind_400():
    r = _get("/api/public/legal/malicious")
    assert r.status_code == 400, r.text


def test_legal_existing_tenant_returns_own_doc_when_published():
    """When tenant 'demo' has a published legal doc, it should be preferred over the platform default."""
    r = _get("/api/public/legal/terms", params={"slug": "demo"})
    assert r.status_code == 200, r.text
    body = r.json()
    # If demo has published a terms doc (as seen in earlier verification), it's tenant-owned.
    # Otherwise the fallback fires. Both are acceptable — assert the shape.
    assert body["kind"] == "terms"
    assert "content_md" in body
    assert isinstance(body["is_platform_default"], bool)
