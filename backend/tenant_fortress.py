"""Ring 6 / H7 — TenantFortress.

Every cache / namespace / session key includes `tenant_id` (immutable UUID
assigned at signup, NEVER email-derived). This module is the single source
of truth for how those keys are composed.
"""
from __future__ import annotations

import uuid
from pathlib import Path


class TenantKeyError(ValueError):
    """Raised when a required key component is missing or empty."""


def _require(val: str, name: str) -> None:
    if not val:
        raise TenantKeyError(f"{name} required for composite-key build")


def chroma_namespace(tenant_id: str, conn_id: str, user_id: str, collection: str) -> str:
    _require(tenant_id, "tenant_id")
    _require(conn_id, "conn_id")
    _require(user_id, "user_id")
    _require(collection, "collection")
    return f"tenant:{tenant_id}/conn:{conn_id}/user:{user_id}/coll:{collection}"


def session_key(tenant_id: str, conn_id: str, user_id: str, session_id: str) -> str:
    _require(tenant_id, "tenant_id")
    _require(conn_id, "conn_id")
    _require(user_id, "user_id")
    _require(session_id, "session_id")
    return f"{tenant_id}:{conn_id}:{user_id}:{session_id}"


def turbo_twin_path(root, tenant_id: str, conn_id: str) -> Path:
    _require(tenant_id, "tenant_id")
    _require(conn_id, "conn_id")
    root = Path(root)
    return root / tenant_id / f"{conn_id}.duckdb"


def schema_cache_path(root, tenant_id: str, conn_id: str) -> Path:
    _require(tenant_id, "tenant_id")
    _require(conn_id, "conn_id")
    root = Path(root)
    return root / tenant_id / f"{conn_id}.json"


def resolve_tenant_id(user_profile: dict) -> str:
    existing = user_profile.get("tenant_id")
    if existing:
        return str(existing)
    new = str(uuid.uuid4())
    user_profile["tenant_id"] = new
    return new
