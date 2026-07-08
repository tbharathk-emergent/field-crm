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


def _missing() -> list[str]:
    return [k for k in _REQUIRED if not os.environ.get(k, "").strip()]


def is_configured() -> bool:
    return not _missing()


def _client():
    missing = _missing()
    if missing:
        raise S3NotConfigured(f"S3 not configured — set {', '.join(missing)} in backend/.env")
    return boto3.client(
        "s3",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=os.environ["AWS_REGION"],
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
        return int(os.environ.get("AWS_S3_PRESIGN_TTL_SECONDS", "900"))
    except ValueError:
        return 900


def build_key(tenant_id: Optional[str], user_id: Optional[str], module: Optional[str], filename: str) -> str:
    """Deterministic key layout:  tenant/<tid>/<module>/<user>/<uuid>-<safe-name>."""
    tid = tenant_id or "platform"
    mod = _SAFE_NAME.sub("-", (module or "misc")).lower()[:32] or "misc"
    uid = _SAFE_NAME.sub("-", (user_id or "anon")).lower()[:40] or "anon"
    return f"tenant/{tid}/{mod}/{uid}/{uuid.uuid4().hex[:10]}-{_safe_filename(filename)}"


def presign_put(key: str, content_type: Optional[str]) -> Dict[str, object]:
    """Return a presigned PUT URL ready to be used directly from the browser/app."""
    client = _client()
    bucket = os.environ["AWS_S3_BUCKET"]
    ttl = _ttl()
    params: Dict[str, object] = {"Bucket": bucket, "Key": key}
    if content_type:
        params["ContentType"] = content_type
    try:
        url = client.generate_presigned_url("put_object", Params=params, ExpiresIn=ttl, HttpMethod="PUT")
    except (BotoCoreError, ClientError) as e:
        raise S3NotConfigured(f"S3 presign failed: {e}") from e
    return {
        "method": "PUT",
        "url": url,
        "key": key,
        "bucket": bucket,
        "region": os.environ["AWS_REGION"],
        "expires_in": ttl,
        "headers": {"Content-Type": content_type} if content_type else {},
        # Convenience: the final object URL, useful for storing in DB. May be
        # inaccessible publicly if the bucket blocks public reads (intended).
        "object_url": f"https://{bucket}.s3.{os.environ['AWS_REGION']}.amazonaws.com/{key}",
    }
