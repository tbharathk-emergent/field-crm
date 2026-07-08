"""Phase 5 — Firebase Cloud Messaging (FCM) sharded push.

Google enforces a hard per-project limit on FCM projects; to keep the platform
scalable we split tenants across "shards" — each shard is one Firebase project
with its own service-account JSON. Up to 15 tenants live on a shard (constant
below; can be relaxed by the operator).

Env vars (per shard, indices 1..N, see backend/.env.example):
    FCM_SHARD_<i>_PROJECT_ID
    FCM_SHARD_<i>_CREDENTIALS_JSON  # entire service-account JSON on one line

Sending policy:
    * If the shard's env vars are missing → `send_to_tokens()` returns a benign
      result with `sent=0` and a `disabled` reason. The rest of the app is
      unaffected — exactly like the S3 pattern in Phase 3.
    * If firebase-admin is not installed at runtime → same graceful no-op.

Auto-sharding:
    `pick_shard_for_new_tenant(existing_counts)` returns the smallest shard
    index that still has room (< SHARD_CAPACITY tenants). Existing tenants keep
    their shard assignment forever; new tenants roll onto the next shard when
    the current one is full.
"""
from __future__ import annotations
import json
import logging
import os
import threading
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("fieldcrm.fcm")

# Google's per-project topic/token quotas comfortably serve 15 tenants each in our sizing.
SHARD_CAPACITY = 15

# Cached firebase-admin app instances keyed by shard project ID.
_APPS: Dict[str, "object"] = {}
_LOCK = threading.Lock()


def _shard_env(shard_id: int) -> Tuple[Optional[str], Optional[str]]:
    """Return (project_id, credentials_json) for a shard, or (None, None) if unset."""
    project_id = os.environ.get(f"FCM_SHARD_{shard_id}_PROJECT_ID", "").strip() or None
    creds_json = os.environ.get(f"FCM_SHARD_{shard_id}_CREDENTIALS_JSON", "").strip() or None
    return project_id, creds_json


def configured_shards() -> List[int]:
    """List of shard IDs with BOTH project_id and credentials_json set."""
    out: List[int] = []
    # Probe a reasonable range; operator can add more by extending env vars.
    for i in range(1, 33):
        pid, creds = _shard_env(i)
        if pid and creds:
            out.append(i)
    return out


def is_shard_configured(shard_id: int) -> bool:
    pid, creds = _shard_env(shard_id)
    return bool(pid and creds)


def pick_shard_for_new_tenant(shard_counts: Dict[int, int]) -> int:
    """Return the smallest shard_id with room, or the next new shard number.

    `shard_counts` is `{shard_id: tenant_count}` for existing tenants.
    """
    if not shard_counts:
        return 1
    for sid in sorted(shard_counts.keys()):
        if shard_counts[sid] < SHARD_CAPACITY:
            return sid
    return max(shard_counts.keys()) + 1


def _get_admin_app(shard_id: int):
    """Lazily initialise and cache a firebase_admin.App for a shard.

    Returns None (and logs) if firebase-admin isn't installed or the shard is
    unconfigured; callers must treat None as "no-op, no failure".
    """
    project_id, creds_json = _shard_env(shard_id)
    if not (project_id and creds_json):
        return None
    with _LOCK:
        if project_id in _APPS:
            return _APPS[project_id]
        try:
            import firebase_admin  # noqa: WPS433 lazy import to avoid boot cost
            from firebase_admin import credentials as fb_credentials

            info = json.loads(creds_json)
            cred = fb_credentials.Certificate(info)
            # Named app per shard so multiple shards can coexist in the same process.
            app_name = f"shard-{shard_id}"
            try:
                app = firebase_admin.get_app(app_name)
            except ValueError:
                app = firebase_admin.initialize_app(cred, {"projectId": project_id}, name=app_name)
            _APPS[project_id] = app
            return app
        except Exception as exc:  # pragma: no cover - depends on runtime env
            logger.warning("FCM shard %s init failed: %s", shard_id, exc)
            return None


def send_to_tokens(
    shard_id: int,
    tokens: List[str],
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None,
    service_account_json: Optional[Dict[str, object]] = None,
    project_id: Optional[str] = None,
) -> Dict[str, object]:
    """Multicast a notification via FCM. Never raises.

    Preferred path (Phase 8): pass an inline `service_account_json` + `project_id`
    for per-tenant Firebase — bypasses the env-based shard entirely.

    Fallback (Phase 5): if inline credentials are absent, look up the env shard
    by `shard_id`.

    Returns `{sent, failed, disabled?, failure_reasons}`.
    """
    tokens = [t for t in (tokens or []) if t]
    if not tokens:
        return {"sent": 0, "failed": 0}

    # --- Phase 8: inline per-tenant credentials ---
    if service_account_json and project_id:
        try:
            import json as _json
            import firebase_admin  # noqa
            from firebase_admin import credentials as fb_credentials, messaging

            with _LOCK:
                app_name = f"tenant-{project_id}"
                try:
                    app = firebase_admin.get_app(app_name)
                except ValueError:
                    cred = fb_credentials.Certificate(service_account_json)
                    app = firebase_admin.initialize_app(cred, {"projectId": project_id}, name=app_name)

            message = messaging.MulticastMessage(
                tokens=tokens,
                notification=messaging.Notification(title=title, body=body),
                data={k: str(v) for k, v in (data or {}).items()},
            )
            resp = messaging.send_each_for_multicast(message, app=app)
            failures = []
            for i, r in enumerate(resp.responses):
                if not r.success:
                    failures.append({"token": tokens[i][:12] + "…", "error": str(r.exception) if r.exception else "unknown"})
            return {"sent": resp.success_count, "failed": resp.failure_count, "failure_reasons": failures}
        except Exception as exc:
            logger.warning("Inline FCM send failed for project %s: %s", project_id, exc)
            return {"sent": 0, "failed": len(tokens), "disabled": f"inline send error: {exc}"}

    # --- Phase 5 fallback: env-based shard ---
    if not is_shard_configured(shard_id):
        return {"sent": 0, "failed": 0, "disabled": f"FCM shard {shard_id} not configured"}

    app = _get_admin_app(shard_id)
    if app is None:
        return {"sent": 0, "failed": 0, "disabled": "firebase-admin unavailable"}

    try:
        from firebase_admin import messaging  # lazy

        message = messaging.MulticastMessage(
            tokens=tokens,
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
        )
        # send_each_for_multicast avoids the deprecated `send_multicast` in newer SDKs.
        resp = messaging.send_each_for_multicast(message, app=app)
        failures = []
        for i, r in enumerate(resp.responses):
            if not r.success:
                failures.append({
                    "token": tokens[i][:12] + "…",
                    "error": str(r.exception) if r.exception else "unknown",
                })
        return {"sent": resp.success_count, "failed": resp.failure_count, "failure_reasons": failures}
    except Exception as exc:  # pragma: no cover - runtime FCM failures
        logger.warning("FCM send failed on shard %s: %s", shard_id, exc)
        return {"sent": 0, "failed": len(tokens), "disabled": f"send error: {exc}"}
