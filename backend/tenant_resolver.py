"""Phase 2 — Multi-tenant subdomain resolver + in-memory TTL cache.

Additive-only. Existing path-based routing (X-Tenant-Slug header + /t/:slug URLs)
continues to work unchanged. This module adds:

1. `TenantCache` — dict + timestamp TTL cache to avoid a Mongo round-trip on every
   request. TTL is controlled by env var TENANT_CACHE_TTL_SECONDS (default 300s).
2. `parse_host_to_slug(host, root_domain)` — pure function that:
       * strips port
       * lower-cases
       * if host == <slug>.<root_domain> → returns slug
       * else returns None
3. `resolve_tenant_from_host(db, host, root_domain)` — async: checks cache, then
   Mongo for custom_domain match, then subdomain match. Returns a tenant dict or
   None. Never raises.
4. `invalidate(slug|host)` — used by tenant update flows.

Golden rule: never change business logic. This module is purely a *fast path*
resolver used by the new `/api/public/tenant-resolve` endpoint and (later) an
optional middleware to seed X-Tenant-Slug from Host.
"""
from __future__ import annotations
import os
import time
from typing import Any, Dict, Optional, Tuple


_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_NEGATIVE: Dict[str, float] = {}  # host → expiry_ts for known-misses (short TTL)


def _ttl() -> int:
    try:
        return int(os.environ.get("TENANT_CACHE_TTL_SECONDS", "300"))
    except ValueError:
        return 300


def _neg_ttl() -> int:
    # Shorter negative TTL so newly-onboarded tenants surface within a minute.
    return min(60, _ttl())


def _root_domain() -> str:
    return (os.environ.get("ROOT_DOMAIN") or "").strip().lower()


def _public_view(t: Dict[str, Any]) -> Dict[str, Any]:
    """Only expose public-safe fields; mirrors /api/public/tenants/by-slug/{slug}."""
    return {
        "id": t.get("id"),
        "slug": t.get("slug"),
        "name": t.get("name"),
        "business_type": t.get("business_type"),
        "logo_path": t.get("logo_path"),
        "theme": t.get("theme"),
        "labels": t.get("labels"),
        "default_language": t.get("default_language", "en"),
        "catalog_mode": t.get("catalog_mode", "direct"),
        "features": t.get("features", {}),
        "custom_domain": t.get("custom_domain"),
    }


def normalize_host(host: Optional[str]) -> str:
    if not host:
        return ""
    h = host.strip().lower()
    # Strip protocol if a full URL was passed by mistake
    if "://" in h:
        h = h.split("://", 1)[1]
    # Strip path
    if "/" in h:
        h = h.split("/", 1)[0]
    # Strip port
    if ":" in h:
        h = h.split(":", 1)[0]
    return h


def parse_host_to_slug(host: str, root_domain: str) -> Optional[str]:
    """Return the subdomain slug if `host` is `<slug>.<root_domain>`, else None.

    Never returns the apex (root_domain itself) or `www`.
    """
    if not host or not root_domain:
        return None
    root_domain = root_domain.lower().lstrip(".")
    if host == root_domain:
        return None
    suffix = "." + root_domain
    if not host.endswith(suffix):
        return None
    prefix = host[: -len(suffix)]
    if not prefix or prefix == "www":
        return None
    # Reject multi-label subdomains (e.g. a.b.root) — we only route single labels.
    if "." in prefix:
        return None
    # Basic slug shape
    if not all(c.isalnum() or c in "-_" for c in prefix):
        return None
    return prefix


def get_cached(key: str) -> Optional[Dict[str, Any]]:
    now = time.time()
    ent = _CACHE.get(key)
    if not ent:
        return None
    exp, val = ent
    if exp < now:
        _CACHE.pop(key, None)
        return None
    return val


def set_cached(key: str, value: Dict[str, Any]) -> None:
    _CACHE[key] = (time.time() + _ttl(), value)


def get_negative(host: str) -> bool:
    now = time.time()
    exp = _NEGATIVE.get(host)
    if not exp:
        return False
    if exp < now:
        _NEGATIVE.pop(host, None)
        return False
    return True


def set_negative(host: str) -> None:
    _NEGATIVE[host] = time.time() + _neg_ttl()


def invalidate(*keys: str) -> None:
    for k in keys:
        _CACHE.pop(k, None)
        _NEGATIVE.pop(k, None)


def invalidate_all() -> None:
    _CACHE.clear()
    _NEGATIVE.clear()


async def resolve_tenant_from_host(db, host: Optional[str]) -> Optional[Dict[str, Any]]:
    """Best-effort tenant resolution from a raw Host header value.

    Order of resolution:
        1. Cache hit on normalized host.
        2. Mongo lookup on `custom_domain` (exact, active).
        3. Subdomain match against ROOT_DOMAIN → lookup by slug (active).
        4. Negative cache the miss to avoid hammering Mongo.
    """
    h = normalize_host(host)
    if not h:
        return None
    cached = get_cached(h)
    if cached is not None:
        return cached
    if get_negative(h):
        return None

    # 1. Custom domain match (only if the field is set on any tenant).
    doc = await db.tenants.find_one({"custom_domain": h, "is_active": True})
    if not doc:
        # 2. Subdomain match against ROOT_DOMAIN.
        slug = parse_host_to_slug(h, _root_domain())
        if slug:
            doc = await db.tenants.find_one({"slug": slug, "is_active": True})

    if not doc:
        set_negative(h)
        return None

    if "_id" in doc:
        doc.pop("_id")
    view = _public_view(doc)
    set_cached(h, view)
    # Also cache by slug so subsequent slug-based resolves are fast.
    set_cached(f"slug:{view['slug']}", view)
    return view


async def resolve_tenant_by_slug_cached(db, slug: str) -> Optional[Dict[str, Any]]:
    """Cached variant of the existing slug lookup — safe to swap in gradually."""
    if not slug:
        return None
    key = f"slug:{slug}"
    cached = get_cached(key)
    if cached is not None:
        return cached
    doc = await db.tenants.find_one({"slug": slug, "is_active": True})
    if not doc:
        return None
    if "_id" in doc:
        doc.pop("_id")
    view = _public_view(doc)
    set_cached(key, view)
    return view
