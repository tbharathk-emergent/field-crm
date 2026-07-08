"""Phase 3 — AWS S3 direct-upload presigning.

The endpoint `POST /api/uploads/presign` in server.py delegates here. If any of
the required env vars is unset, `presign_put()` raises `S3NotConfigured` and the
endpoint returns 503 with an operator-friendly message. The rest of the app
continues to work — this is a strictly opt-in feature.

We use v4 SigV4 presigned PUT URLs (single request, no browser CORS preflight
for form-data), which suits the mobile-PWA + Capacitor upload flow best.

Env vars required (see backend/.env.example):
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
    AWS_REGION
    AWS_S3_BUCKET
    AWS_S3_PRESIGN_TTL_SECONDS (optional, default 900)
"""
from __future__ import annotations
import os
import re
import uuid
from typing import Dict, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError


class S3NotConfigured(RuntimeError):
    """Raised when required S3 env vars are missing so callers can 503."""


_REQUIRED = ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_S3_BUCKET")
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


# Phase 8 — In-process override of AWS credentials, populated when the super
# admin uploads keys via the UI. Overrides env when set (empty dict = fall back to env).
_RUNTIME_OVERRIDE: Dict[str, str] = {}


def apply_runtime_credentials(creds: Dict[str, str]) -> None:
    """Populate/replace the in-process AWS credential override.

    Accepted keys: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
    AWS_S3_BUCKET, AWS_S3_PRESIGN_TTL_SECONDS, AWS_PUBLIC_MEDIA_HOST.
    Empty string values clear that key.
    """
    for k, v in (creds or {}).items():
        v = (v or "").strip()
        if v:
            _RUNTIME_OVERRIDE[k] = v
            # Also mirror into env so any other module that reads env stays in sync.
            os.environ[k] = v
        else:
            _RUNTIME_OVERRIDE.pop(k, None)


def _get(key: str) -> str:
    return _RUNTIME_OVERRIDE.get(key) or os.environ.get(key, "")


def _missing() -> list[str]:
    return [k for k in _REQUIRED if not _get(k).strip()]


def is_configured() -> bool:
    return not _missing()


def _client():
    missing = _missing()
    if missing:
        raise S3NotConfigured(f"S3 not configured — set {', '.join(missing)} in backend/.env")
    return boto3.client(
        "s3",
        aws_access_key_id=_get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=_get("AWS_SECRET_ACCESS_KEY"),
        region_name=_get("AWS_REGION"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )


def _safe_filename(name: str) -> str:
    name = (name or "").strip() or "upload"
    # Keep an extension if present.
    if "." in name:
        stem, _, ext = name.rpartition(".")
        stem = _SAFE_NAME.sub("-", stem)[:60].strip("-.") or "file"
        ext = _SAFE_NAME.sub("", ext).lower()[:8]
        return f"{stem}.{ext}" if ext else stem
    return _SAFE_NAME.sub("-", name)[:64].strip("-.") or "file"


def _ttl() -> int:
    try:
        return int(_get("AWS_S3_PRESIGN_TTL_SECONDS") or "900")
    except ValueError:
        return 900


def public_media_host() -> Optional[str]:
    """Return AWS_PUBLIC_MEDIA_HOST if configured (e.g. 'media.acme.com')."""
    v = _get("AWS_PUBLIC_MEDIA_HOST").strip()
    return v or None


def build_key(tenant_id: Optional[str], user_id: Optional[str], module: Optional[str], filename: str) -> str:
    """Deterministic key layout:  tenant/<tid>/<module>/<user>/<uuid>-<safe-name>."""
    tid = tenant_id or "platform"
    mod = _SAFE_NAME.sub("-", (module or "misc")).lower()[:32] or "misc"
    uid = _SAFE_NAME.sub("-", (user_id or "anon")).lower()[:40] or "anon"
    return f"tenant/{tid}/{mod}/{uid}/{uuid.uuid4().hex[:10]}-{_safe_filename(filename)}"


def presign_put(key: str, content_type: Optional[str]) -> Dict[str, object]:
    """Return a presigned PUT URL ready to be used directly from the browser/app."""
    client = _client()
    bucket = _get("AWS_S3_BUCKET")
    ttl = _ttl()
    params: Dict[str, object] = {"Bucket": bucket, "Key": key}
    if content_type:
        params["ContentType"] = content_type
    try:
        url = client.generate_presigned_url("put_object", Params=params, ExpiresIn=ttl, HttpMethod="PUT")
    except (BotoCoreError, ClientError) as e:
        raise S3NotConfigured(f"S3 presign failed: {e}") from e
    region = _get("AWS_REGION")
    host = public_media_host()
    object_url = (
        f"https://{host}/{key}" if host
        else f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    )
    return {
        "method": "PUT",
        "url": url,
        "key": key,
        "bucket": bucket,
        "region": region,
        "expires_in": ttl,
        "headers": {"Content-Type": content_type} if content_type else {},
        # Convenience: the final object URL, useful for storing in DB. May be
        # inaccessible publicly if the bucket blocks public reads (intended).
        "object_url": object_url,
        "public_host": host,
    }
