"""SMS / OTP delivery — Pingbix integration with a safe mock fallback.

Provider resolution (highest wins):
  1. Runtime override from Platform Settings (Super Admin → Settings), applied
     via `apply_runtime_sms_settings()` on startup and on every settings PATCH.
  2. Env vars in backend/.env (SMS_PROVIDER + PINGBIX_*).
  3. Default: "mock" — the existing fixed-OTP flow (DEMO_OTP / SUPER_ADMIN_OTP).

Local development never needs live credentials: without a Pingbix API key the
provider silently resolves to "mock" and the app behaves exactly as before.

Pingbix request shape is env-configurable because DLT-registered SMS routes in
India vary per account (sender id, entity id, template id). The defaults follow
the common JSON POST convention; adjust PINGBIX_* in backend/.env to match the
account's integration sheet — no code change needed.

Env vars (all optional — see backend/.env.example):
    SMS_PROVIDER                mock | pingbix          (default: mock)
    PINGBIX_BASE_URL            full send-SMS endpoint URL
    PINGBIX_API_KEY             account API key / auth token
    PINGBIX_SENDER_ID           6-char DLT approved sender id (header)
    PINGBIX_ENTITY_ID           DLT principal entity id (optional)
    PINGBIX_TEMPLATE_ID         DLT content template id (optional)
    PINGBIX_OTP_TEMPLATE        message text, {otp} placeholder (must match DLT template)
    PINGBIX_TIMEOUT_SECONDS     HTTP timeout (default 10)

Every public function returns dicts / values — never raises — mirroring
fcm_service.py so OTP delivery problems degrade gracefully.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from typing import Dict, Optional

import requests

logger = logging.getLogger("fieldcrm.sms")

OTP_LENGTH = 6
OTP_TTL_SECONDS = 300          # OTP valid for 5 minutes
OTP_RESEND_COOLDOWN_SECONDS = 30
OTP_MAX_ATTEMPTS = 5

# Runtime override populated from platform_settings (same pattern as s3_presign).
_RUNTIME: Dict[str, str] = {}


def apply_runtime_sms_settings(settings: Optional[dict]) -> None:
    """Load SMS fields saved via Super Admin → Settings over the env config.

    Accepts the platform_settings document (or any dict with sms_provider /
    sms_api_key / sms_sender_id). Empty values clear the override so env wins.
    """
    s = settings or {}
    mapping = {
        "SMS_PROVIDER": s.get("sms_provider"),
        "PINGBIX_API_KEY": s.get("sms_api_key"),
        "PINGBIX_SENDER_ID": s.get("sms_sender_id"),
    }
    for k, v in mapping.items():
        v = (v or "").strip()
        if v:
            _RUNTIME[k] = v
        else:
            _RUNTIME.pop(k, None)


def _get(key: str, default: str = "") -> str:
    return (_RUNTIME.get(key) or os.environ.get(key, default) or "").strip()


def active_provider() -> str:
    """Resolve the effective provider. Falls back to mock when Pingbix is
    selected but not fully configured, so a half-filled form never locks
    everyone out of login."""
    provider = (_get("SMS_PROVIDER") or "mock").lower()
    if provider == "pingbix" and pingbix_configured():
        return "pingbix"
    if provider == "pingbix":
        logger.warning("[sms] SMS_PROVIDER=pingbix but PINGBIX_BASE_URL/PINGBIX_API_KEY missing — using mock OTP")
    return "mock"


def pingbix_configured() -> bool:
    return bool(_get("PINGBIX_BASE_URL") and _get("PINGBIX_API_KEY") and _get("PINGBIX_SENDER_ID"))


def status() -> dict:
    """Diagnostic snapshot for the Super Admin settings page. No secrets."""
    return {
        "active_provider": active_provider(),
        "pingbix_configured": pingbix_configured(),
        "sender_id": _get("PINGBIX_SENDER_ID") or None,
    }


def generate_otp() -> str:
    """Cryptographically random numeric OTP (no leading-zero stripping)."""
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_LENGTH))


def hash_otp(phone: str, otp: str) -> str:
    """HMAC the OTP with JWT_SECRET so a DB leak doesn't expose live codes."""
    secret = os.environ.get("JWT_SECRET", "")
    return hmac.new(secret.encode(), f"{phone}:{otp}".encode(), hashlib.sha256).hexdigest()


def verify_otp_hash(phone: str, otp: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(phone, otp), stored_hash or "")


def _otp_message(otp: str) -> str:
    template = _get("PINGBIX_OTP_TEMPLATE") or "Your {app} login OTP is {otp}. Valid for 5 minutes. Do not share it with anyone."
    app_name = os.environ.get("APP_NAME", "FieldCRM")
    return template.replace("{otp}", otp).replace("{app}", app_name)


def send_otp_sms(phone: str, otp: str, channel: str = "sms") -> dict:
    """Send the OTP through the active provider. Never raises.

    Returns {ok, provider, error?}. In mock mode it only logs — the caller is
    responsible for exposing the mock OTP to the client (existing behaviour).
    """
    provider = active_provider()
    if provider == "mock":
        logger.info("[sms] mock provider — OTP not sent over SMS (phone=%s)", phone)
        return {"ok": True, "provider": "mock"}
    return _send_via_pingbix(phone, otp, channel)


def _send_via_pingbix(phone: str, otp: str, channel: str) -> dict:
    url = _get("PINGBIX_BASE_URL")
    timeout = float(_get("PINGBIX_TIMEOUT_SECONDS") or "10")
    # Standard Indian DLT gateway payload. Field names follow the common
    # JSON-POST convention; confirm against the Pingbix integration sheet.
    payload: Dict[str, object] = {
        "apikey": _get("PINGBIX_API_KEY"),
        "senderid": _get("PINGBIX_SENDER_ID"),
        "number": f"91{phone}" if len(phone) == 10 else phone,
        "message": _otp_message(otp),
        "format": "json",
    }
    if _get("PINGBIX_ENTITY_ID"):
        payload["entityid"] = _get("PINGBIX_ENTITY_ID")
    if _get("PINGBIX_TEMPLATE_ID"):
        payload["templateid"] = _get("PINGBIX_TEMPLATE_ID")
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"Authorization": _get("PINGBIX_API_KEY"), "Content-Type": "application/json"},
            timeout=timeout,
        )
        body = (resp.text or "")[:300]
        if resp.status_code >= 400:
            logger.error("[sms] pingbix send failed status=%s body=%s", resp.status_code, body)
            return {"ok": False, "provider": "pingbix", "error": f"Gateway HTTP {resp.status_code}"}
        logger.info("[sms] pingbix OTP sent phone=%s status=%s", phone, resp.status_code)
        return {"ok": True, "provider": "pingbix"}
    except requests.RequestException as e:
        logger.error("[sms] pingbix send error: %s", e)
        return {"ok": False, "provider": "pingbix", "error": str(e)[:200]}
