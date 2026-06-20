"""Emergent Object Storage wrapper."""
import os
import uuid
import logging
import requests

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"


def _emergent_key():
    return os.environ.get("EMERGENT_LLM_KEY")


def _app_name():
    return os.environ.get("APP_NAME", "fieldcrm")

_storage_key = None

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
    "csv": "text/csv", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    key = _emergent_key()
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY missing")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": key}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def reset_storage_key():
    global _storage_key
    _storage_key = None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 403:
        reset_storage_key()
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    if resp.status_code == 403:
        reset_storage_key()
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key}, timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def build_path(tenant_id: str, purpose: str, filename: str) -> str:
    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    return f"{_app_name()}/{tenant_id or 'platform'}/{purpose}/{uuid.uuid4().hex}.{ext}"


def guess_content_type(filename: str, fallback: str = "application/octet-stream") -> str:
    if "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        return MIME_TYPES.get(ext, fallback)
    return fallback
