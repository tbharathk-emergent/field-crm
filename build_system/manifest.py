"""Fetches the tenant build manifest from the FieldCRM backend.

Uses the super_admin OTP flow to obtain a JWT, then calls
`/api/super/build/manifest/{slug}` in one shot.

Env vars used (all required for non-interactive CI runs):
    BACKEND_URL             e.g. https://api.fieldcrm.app or the preview URL
    SUPER_ADMIN_PHONE       phone that maps to super_admin (default 9858558555)
    SUPER_ADMIN_OTP         mock OTP (default 557725) – ignore in real Pingbix mode

Optionally, callers can pass a pre-obtained JWT via `SUPER_ADMIN_TOKEN` env var
or `--super-token` CLI arg — useful when hitting production.
"""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional

from .utils import BuildError, log


DEFAULT_SUPER_PHONE = "9858558555"
DEFAULT_SUPER_OTP = "557725"

# Cloudflare's WAF rejects the default urllib User-Agent — masquerade as a browser.
_DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) build_app.py/1.0 "
                  "AppleWebKit/537.36 (KHTML, like Gecko) FieldCRM-Build",
    "Accept": "application/json",
}


def _looks_like_html(body: str) -> bool:
    b = body.lstrip()[:100].lower()
    return b.startswith("<") or "<html" in b or "<!doctype" in b


def _format_error(method: str, url: str, code: int, body: str) -> str:
    hint = ""
    if code == 405 or (code in (403, 404) and _looks_like_html(body)):
        # Almost always: pointing at the web host, not the API host.
        hint = (
            "\n\n  → Response is HTML from nginx, which means the URL you pointed "
            "to does NOT proxy /api/* to FastAPI."
            "\n  → Fix: set API_BASE_URL in build.env to your FastAPI host "
            "(e.g. https://api.<your-domain>) OR add an nginx `location /api/ "
            "{ proxy_pass http://127.0.0.1:8001; }` block to the web host."
        )
    elif code == 401:
        hint = ("\n\n  → Wrong SUPER_ADMIN_OTP/PHONE in build.env, "
                "or SUPER_ADMIN_TOKEN has expired.")
    elif code == 403:
        hint = "\n\n  → The account authenticated is not a super_admin."
    snippet = body if len(body) <= 400 else body[:400] + "…"
    return f"HTTP {code} {method} {url}\n  Body: {snippet}{hint}"


def _post_json(url: str, body: dict, headers: Optional[dict] = None) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", **_DEFAULT_HEADERS, **(headers or {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise BuildError(_format_error("POST", url, e.code, e.read().decode("utf-8", "replace")))
    except urllib.error.URLError as e:
        raise BuildError(f"Network error POST {url}: {e}")


def _get_json(url: str, headers: Optional[dict] = None) -> dict:
    req = urllib.request.Request(url, headers={**_DEFAULT_HEADERS, **(headers or {})}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise BuildError(_format_error("GET", url, e.code, e.read().decode("utf-8", "replace")))
    except urllib.error.URLError as e:
        raise BuildError(f"Network error GET {url}: {e}")


@dataclass
class BuildManifest:
    raw: dict
    tenant: dict
    firebase_android: Optional[dict]
    firebase_ios: Optional[dict]
    logo_bytes: Optional[bytes]
    logo_mime: Optional[str]
    server_host: Optional[str]

    @property
    def slug(self) -> str:
        return self.tenant["slug"]

    @property
    def name(self) -> str:
        return self.tenant["name"]

    @property
    def theme_primary(self) -> str:
        return (self.tenant.get("theme") or {}).get("primary") or "#2C5E43"


def obtain_super_token(backend_url: str,
                       phone: Optional[str] = None,
                       otp: Optional[str] = None) -> str:
    phone = phone or os.environ.get("SUPER_ADMIN_PHONE", DEFAULT_SUPER_PHONE)
    otp = otp or os.environ.get("SUPER_ADMIN_OTP", DEFAULT_SUPER_OTP)
    log.info(f"Requesting super admin OTP for {phone}")
    _post_json(f"{backend_url}/api/auth/request-otp", {"phone": phone})
    log.info("Verifying OTP…")
    verified = _post_json(
        f"{backend_url}/api/auth/verify-otp",
        {"phone": phone, "otp": otp},
    )
    token = verified.get("token") or verified.get("access_token")
    if not token:
        raise BuildError(f"verify-otp returned no token; got keys: {list(verified.keys())}")
    role = (verified.get("user") or {}).get("role")
    if role != "super_admin":
        raise BuildError(f"expected super_admin role, got '{role}'")
    return token


def fetch_manifest(backend_url: str, slug: str, token: str) -> BuildManifest:
    log.info(f"Fetching build manifest for tenant '{slug}'")
    data = _get_json(
        f"{backend_url}/api/super/build/manifest/{slug}",
        headers={"Authorization": f"Bearer {token}"},
    )
    logo_bytes: Optional[bytes] = None
    logo_mime: Optional[str] = None
    if data.get("logo") and data["logo"].get("base64"):
        logo_bytes = base64.b64decode(data["logo"]["base64"])
        logo_mime = data["logo"].get("mime")

    return BuildManifest(
        raw=data,
        tenant=data["tenant"],
        firebase_android=(data.get("firebase") or {}).get("android"),
        firebase_ios=(data.get("firebase") or {}).get("ios"),
        logo_bytes=logo_bytes,
        logo_mime=logo_mime,
        server_host=(data.get("server") or {}).get("host"),
    )


def load(backend_url: str, slug: str,
         token: Optional[str] = None,
         super_phone: Optional[str] = None,
         super_otp: Optional[str] = None) -> BuildManifest:
    """One-shot convenience: obtain token if not given, then fetch manifest."""
    if not token:
        token = os.environ.get("SUPER_ADMIN_TOKEN") or \
            obtain_super_token(backend_url, super_phone, super_otp)
    return fetch_manifest(backend_url, slug, token)


def list_tenants(backend_url: str,
                 token: Optional[str] = None,
                 super_phone: Optional[str] = None,
                 super_otp: Optional[str] = None) -> list[dict]:
    """Return the list of tenants visible to a super admin.

    Each item has keys: id, slug, name, is_active, business_type, and a nested
    `stats` dict with employees / dealers / customers counts.
    """
    if not token:
        token = os.environ.get("SUPER_ADMIN_TOKEN") or \
            obtain_super_token(backend_url, super_phone, super_otp)
    log.info("Fetching tenant list")
    data = _get_json(f"{backend_url}/api/super/tenants",
                     headers={"Authorization": f"Bearer {token}"})
    if not isinstance(data, list):
        raise BuildError(f"expected a list from /super/tenants, got: {type(data).__name__}")
    return data


def to_debug_json(m: BuildManifest) -> str:
    """Redact large fields for logs."""
    d: dict[str, Any] = json.loads(json.dumps(m.raw))  # deep copy
    if d.get("logo"):
        d["logo"] = {"mime": d["logo"].get("mime"), "base64": "<redacted>"}
    for pf in ("android", "ios"):
        if (d.get("firebase") or {}).get(pf):
            cfg = d["firebase"][pf].get("config_json") or d["firebase"][pf].get("config_plist")
            if cfg:
                key = "config_plist" if pf == "ios" else "config_json"
                d["firebase"][pf][key] = f"<{len(cfg)} bytes>"
    return json.dumps(d, indent=2)
