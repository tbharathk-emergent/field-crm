"""Phase 8 — Real-time Firebase app provisioning via the Firebase Management API.

Given a stored FirebaseProject (`service_account_json` + `project_id`), we can:
    1. Create an Android or iOS app on that Firebase project.
    2. Wait for the long-running-operation (LRO) to complete.
    3. Download that app's config file (google-services.json / GoogleService-Info.plist).

The API surface here is defensive: every helper returns a dict with either
`ok: True, ...` or `ok: False, error: <string>` so callers can degrade to
deferred-provisioning (the user's option "c") without a try/except tower.

Docs:
    * https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/projects.androidApps
    * https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/projects.iosApps
"""
from __future__ import annotations
import base64
import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("fieldcrm.firebase_provisioning")

_SCOPES = ["https://www.googleapis.com/auth/firebase", "https://www.googleapis.com/auth/cloud-platform"]
_API_BASE = "https://firebase.googleapis.com/v1beta1"


def _access_token(service_account_json: Dict[str, Any]) -> Optional[str]:
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
    except Exception as e:  # pragma: no cover - depends on runtime env
        logger.warning("google-auth unavailable: %s", e)
        return None
    try:
        creds = service_account.Credentials.from_service_account_info(
            service_account_json, scopes=_SCOPES
        )
        creds.refresh(Request())
        return creds.token
    except Exception as e:
        logger.warning("service-account token failed: %s", e)
        return None


def _http():
    """Return the `requests` module (lazy, keeps import failures out of module load)."""
    import requests  # noqa: WPS433
    return requests


def _poll_operation(token: str, op_name: str, timeout_s: int = 30) -> Dict[str, Any]:
    """Poll an LRO until done or timeout. Returns the completed operation dict."""
    requests = _http()
    deadline = time.time() + timeout_s
    url = f"https://firebase.googleapis.com/v1/{op_name}"
    headers = {"Authorization": f"Bearer {token}"}
    while time.time() < deadline:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            j = r.json()
            if j.get("done"):
                return j
        time.sleep(1)
    return {"done": False, "error": {"message": f"LRO {op_name} timed out"}}


def _fetch_config_by_app_id(project_id: str, token: str, platform: str, app_id: str,
                            package_or_bundle: Optional[str]) -> Dict[str, Any]:
    """Download google-services.json / GoogleService-Info.plist for a specific app_id."""
    requests = _http()
    subresource = "androidApps" if platform == "android" else "iosApps"
    cfg_url = f"{_API_BASE}/projects/{project_id}/{subresource}/{app_id}/config"
    try:
        c = requests.get(cfg_url, headers={"Authorization": f"Bearer {token}"}, timeout=15)
    except Exception as e:
        return {"ok": False, "error": f"config fetch failed: {e}"}
    if c.status_code != 200:
        return {"ok": False, "error": f"config fetch HTTP {c.status_code}: {c.text[:200]}"}
    cj = c.json()
    b64 = cj.get("configFileContents", "")
    try:
        raw = base64.b64decode(b64).decode("utf-8") if b64 else None
    except Exception:
        raw = None
    return {"ok": True, "app_id": app_id, "config_json": raw,
            "package_or_bundle": package_or_bundle}


def find_and_fetch_config(project_id: str, service_account_json: Dict[str, Any],
                          platform: str, package_or_bundle: str) -> Dict[str, Any]:
    """Locate an existing app by package/bundle id on `project_id` and fetch its config.

    Used for the "re-provision" flow: the app already exists on Firebase, we just
    need to re-download the latest google-services.json / GoogleService-Info.plist
    (which may include newer API keys, senderIDs, additional OAuth clients, etc.).

    Returns `{ok: True, app_id, config_json, package_or_bundle, reused: True}` on
    hit, `{ok: False, error}` on miss.
    """
    if platform not in ("android", "ios"):
        return {"ok": False, "error": f"invalid platform '{platform}'"}
    token = _access_token(service_account_json)
    if not token:
        return {"ok": False, "error": "service_account_invalid_or_google_auth_missing"}

    requests = _http()
    subresource = "androidApps" if platform == "android" else "iosApps"
    key = "packageName" if platform == "android" else "bundleId"
    list_url = f"{_API_BASE}/projects/{project_id}/{subresource}?pageSize=100"
    headers = {"Authorization": f"Bearer {token}"}

    matched_app_id: Optional[str] = None
    page_token: Optional[str] = None
    try:
        while True:
            url = list_url + (f"&pageToken={page_token}" if page_token else "")
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code != 200:
                return {"ok": False, "error": f"list HTTP {r.status_code}: {r.text[:200]}"}
            body = r.json() or {}
            for app in body.get("apps") or []:
                if app.get(key) == package_or_bundle:
                    matched_app_id = app.get("appId") or (app.get("name", "").split("/")[-1])
                    break
            if matched_app_id or not body.get("nextPageToken"):
                break
            page_token = body.get("nextPageToken")
    except Exception as e:
        return {"ok": False, "error": f"list request failed: {e}"}

    if not matched_app_id:
        return {"ok": False,
                "error": f"no existing {platform} app with {key}={package_or_bundle} on project {project_id}"}

    result = _fetch_config_by_app_id(project_id, token, platform, matched_app_id, package_or_bundle)
    if result.get("ok"):
        result["reused"] = True
    return result


def create_app(project_id: str, service_account_json: Dict[str, Any],
               platform: str, package_or_bundle: str, display_name: str) -> Dict[str, Any]:
    """Create a single Android or iOS Firebase app under `project_id`.

    On HTTP 409 ALREADY_EXISTS (or any 409), automatically falls back to
    `find_and_fetch_config`, returning the same shape but with `reused=True`.

    Returns `{ok, app_id, config_json, package_or_bundle, [reused]}` on success
    or `{ok: False, error}` on any failure — quota, permission, LRO timeout.
    """
    if platform not in ("android", "ios"):
        return {"ok": False, "error": f"invalid platform '{platform}'"}
    token = _access_token(service_account_json)
    if not token:
        return {"ok": False, "error": "service_account_invalid_or_google_auth_missing"}

    requests = _http()
    subresource = "androidApps" if platform == "android" else "iosApps"
    key = "packageName" if platform == "android" else "bundleId"
    create_url = f"{_API_BASE}/projects/{project_id}/{subresource}"
    payload = {"displayName": display_name, key: package_or_bundle}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    try:
        r = requests.post(create_url, json=payload, headers=headers, timeout=15)
    except Exception as e:
        return {"ok": False, "error": f"create request failed: {e}"}

    # Graceful re-provision: if the app already exists on this Firebase project,
    # look it up by packageName/bundleId and download its config instead of erroring.
    if r.status_code == 409 or "ALREADY_EXISTS" in (r.text or ""):
        logger.info(
            "Firebase app %s already exists on %s — falling back to re-provision (list + fetch config)",
            package_or_bundle, project_id,
        )
        return find_and_fetch_config(project_id, service_account_json, platform, package_or_bundle)

    if r.status_code not in (200, 201):
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:400]}"}

    op = r.json()
    if op.get("done") is False and op.get("name"):
        op = _poll_operation(token, op["name"])
        if not op.get("done"):
            return {"ok": False, "error": op.get("error", {}).get("message", "LRO not done")}
    app_meta = op.get("response") or op
    app_id = app_meta.get("appId") or app_meta.get("name", "").split("/")[-1]
    if not app_id:
        return {"ok": False, "error": f"app id missing from response: {op}"}

    # Fetch config (google-services.json / GoogleService-Info.plist).
    return _fetch_config_by_app_id(project_id, token, platform, app_id, package_or_bundle)


def list_apps(project_id: str, service_account_json: Dict[str, Any]) -> Dict[str, Any]:
    """Return current app count on a Firebase project — used to enforce ~15-tenant limit."""
    token = _access_token(service_account_json)
    if not token:
        return {"ok": False, "error": "service_account_invalid_or_google_auth_missing"}
    requests = _http()
    headers = {"Authorization": f"Bearer {token}"}
    android = requests.get(f"{_API_BASE}/projects/{project_id}/androidApps", headers=headers, timeout=15)
    ios = requests.get(f"{_API_BASE}/projects/{project_id}/iosApps", headers=headers, timeout=15)
    if android.status_code != 200 or ios.status_code != 200:
        return {"ok": False, "error": f"list HTTP {android.status_code}/{ios.status_code}"}
    a_apps = android.json().get("apps") or []
    i_apps = ios.json().get("apps") or []
    return {"ok": True, "android_count": len(a_apps), "ios_count": len(i_apps),
            "total": len(a_apps) + len(i_apps)}
