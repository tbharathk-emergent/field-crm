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
    return decode_token(token)


def require_roles(*allowed_roles):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Forbidden role")
        return user
    return checker


def expected_otp(phone: str) -> str:
    """Mock OTP: super admin gets 557725, everyone else gets 123456."""
    if phone == SUPER_ADMIN_PHONE:
        return SUPER_ADMIN_OTP
    return DEMO_OTP


def is_super_admin_phone(phone: str) -> bool:
    return phone == SUPER_ADMIN_PHONE
