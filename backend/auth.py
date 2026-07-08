"""JWT auth + OTP utilities."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load env early: this module is imported before server.py's load_dotenv() would fire,
# so we call it here idempotently to guarantee env is populated on first access.
load_dotenv(Path(__file__).parent / ".env")

import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import Header, HTTPException, Depends

# JWT_SECRET / JWT_ALGO / JWT_TTL_HOURS are validated as REQUIRED by server.require_env().
# We read them here without dev fallbacks so any misconfiguration surfaces immediately.
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = os.environ["JWT_ALGO"]
JWT_TTL_HOURS = int(os.environ["JWT_TTL_HOURS"])

SUPER_ADMIN_PHONE = os.environ["SUPER_ADMIN_PHONE"]
SUPER_ADMIN_OTP = os.environ["SUPER_ADMIN_OTP"]
DEMO_OTP = os.environ["DEMO_OTP"]

# Phase 4 — Universal reviewer bypass (App Store / Play Store review accounts).
# This phone always logs in as a demo tenant_admin using DEMO_OTP so reviewers
# can traverse the app without a real SIM. Constant on purpose (not env-driven):
# reviewers must be able to reproduce the exact credentials from any doc.
REVIEWER_PHONE = "9898989898"
REVIEWER_TENANT_SLUG = "demo"


def is_reviewer_phone(phone: str) -> bool:
    return phone == REVIEWER_PHONE


def make_token(user_id: str, tenant_id: Optional[str], role: str, phone: str) -> str:
    payload = {
        "sub": user_id,
        "tid": tenant_id,
        "role": role,
        "phone": phone,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    # Phase 4 — Session revocation hook. server.py registers a validator that
    # checks `users.token_revoked_after` (soft-delete, forced logout, etc.).
    # Kept optional so unit tests without DB still work.
    validator = _SESSION_VALIDATOR
    if validator is not None:
        await validator(payload)
    return payload


# Phase 4 — server.py registers a DB-backed session validator via set_session_validator().
_SESSION_VALIDATOR = None


def set_session_validator(fn) -> None:
    """Install an async fn(payload:dict) that raises HTTPException(401) if the
    session has been revoked (e.g. user soft-deleted or logged-out-all)."""
    global _SESSION_VALIDATOR
    _SESSION_VALIDATOR = fn


def require_roles(*allowed_roles):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Forbidden role")
        return user
    return checker


def expected_otp(phone: str) -> str:
    """Mock OTP: super admin gets SUPER_ADMIN_OTP; reviewer & everyone else get DEMO_OTP."""
    if phone == SUPER_ADMIN_PHONE:
        return SUPER_ADMIN_OTP
    return DEMO_OTP


def is_super_admin_phone(phone: str) -> bool:
    return phone == SUPER_ADMIN_PHONE
