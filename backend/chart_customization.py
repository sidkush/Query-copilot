"""chart_customization — per-user storage for user-authored chart
types (Sub-project C) and semantic models (Sub-project D).

Both assets persist as JSON under the user's private data directory:
    .data/user_data/{hash}/chart_customizations.json

The file shape:
    {
        "chart_types": [UserChartType, ...],
        "semantic_models": [SemanticModel, ...]
    }

Atomic writes (write-tmp-then-rename) match the rest of user_storage's
crash-safety discipline. Thread-safe via a per-user lock mirrors
connections.json's locking pattern.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

CURRENT_SCHEMA_VERSION = 2

_user_locks: dict[str, Lock] = {}
_user_locks_guard = Lock()


def _lock_for(email: str) -> Lock:
    with _user_locks_guard:
        lock = _user_locks.get(email)
        if lock is None:
            lock = Lock()
            _user_locks[email] = lock
        return lock


def _customizations_path(email: str) -> Path:
    from user_storage import _user_dir  # lazy

    return _user_dir(email) / "chart_customizations.json"


def _load_raw(email: str) -> dict[str, Any]:
    path = _customizations_path(email)
    if not path.exists():
        return {"chart_types": [], "semantic_models": []}
    try:
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
    except Exception as e:
        logger.warning("chart_customization: unreadable file for %s: %s", email, e)
        return {"chart_types": [], "semantic_models": []}
    if not isinstance(data, dict):
        return {"chart_types": [], "semantic_models": []}
    data.setdefault("chart_types", [])
    data.setdefault("semantic_models", [])
    return data


def _save_raw(email: str, data: dict[str, Any]) -> None:
    path = _customizations_path(email)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Atomic write — write to a temp file in the same directory, then rename.
    fd, tmp_path = tempfile.mkstemp(
        prefix=".chart_customizations.", suffix=".tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


# ── Schema versioning & migration ─────────────────────────────────────


def migrate_chart_type(chart_type: dict) -> dict:
    """Migrate a stored chart type dict to CURRENT_SCHEMA_VERSION.

    Applies each migration in sequence (v1→v2, v2→v3, ...) so that
    types stored at any prior version are always returned at the current
    version.  If the type is already at CURRENT_SCHEMA_VERSION it is
    returned as-is (no copy, no mutation).
    """
    version = chart_type.get("schemaVersion", 1)
    if version >= CURRENT_SCHEMA_VERSION:
        return chart_type

    # Work on a shallow copy so callers' dicts are never mutated in-place.
    ct = dict(chart_type)

    # v1 → v2
    if version < 2:
        if "tier" not in ct:
            ct["tier"] = "spec"
        if "version" not in ct:
            ct["version"] = "1.0.0"
        if "capabilities" not in ct:
            ct["capabilities"] = {"dataRoles": []}
        ct["schemaVersion"] = 2
        version = 2

    # Future migrations would follow the same pattern:
    # if version < 3:
    #     ...
    #     ct["schemaVersion"] = 3
    #     version = 3

    return ct


# ── Sub-project C — user chart types ──────────────────────────────────


def list_chart_types(email: str) -> list[dict[str, Any]]:
    with _lock_for(email):
        raw = _load_raw(email).get("chart_types", [])
        return [migrate_chart_type(ct) for ct in raw]


def save_chart_type(email: str, chart_type: dict[str, Any]) -> dict[str, Any]:
    """Create or update a user chart type. Validates required fields
    (id + schemaVersion + specTemplate). Migrates to the current schema
    version before persisting. Returns the migrated saved object.
    """
    if not isinstance(chart_type, dict):
        raise ValueError("chart_type must be an object")
    type_id = chart_type.get("id")
    if not type_id or not isinstance(type_id, str):
        raise ValueError("chart_type.id must be a non-empty string")
    incoming_version = chart_type.get("schemaVersion")
    if incoming_version not in (1, 2):
        raise ValueError(
            f"chart_type.schemaVersion must be 1 or 2, got {incoming_version!r}"
        )
    if not isinstance(chart_type.get("specTemplate"), dict):
        raise ValueError("chart_type.specTemplate must be an object")

    # Migrate to current version before storing so storage is always up-to-date.
    chart_type = migrate_chart_type(chart_type)

    with _lock_for(email):
        data = _load_raw(email)
        existing = data.get("chart_types", [])
        replaced = False
        for i, ct in enumerate(existing):
            if ct.get("id") == type_id:
                existing[i] = chart_type
                replaced = True
                break
        if not replaced:
            existing.append(chart_type)
        data["chart_types"] = existing
        _save_raw(email, data)
        return chart_type


def delete_chart_type(email: str, type_id: str) -> bool:
    with _lock_for(email):
        data = _load_raw(email)
        before = data.get("chart_types", [])
        after = [ct for ct in before if ct.get("id") != type_id]
        if len(after) == len(before):
            return False
        data["chart_types"] = after
        _save_raw(email, data)
        return True


# ── Sub-project D — semantic models ───────────────────────────────────


def list_semantic_models(email: str) -> list[dict[str, Any]]:
    with _lock_for(email):
        return list(_load_raw(email).get("semantic_models", []))


def save_semantic_model(email: str, model: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(model, dict):
        raise ValueError("semantic_model must be an object")
    model_id = model.get("id")
    if not model_id or not isinstance(model_id, str):
        raise ValueError("semantic_model.id must be a non-empty string")
    if model.get("version") != 1:
        raise ValueError("semantic_model.version must be 1")

    with _lock_for(email):
        data = _load_raw(email)
        existing = data.get("semantic_models", [])
        replaced = False
        for i, m in enumerate(existing):
            if m.get("id") == model_id:
                existing[i] = model
                replaced = True
                break
        if not replaced:
            existing.append(model)
        data["semantic_models"] = existing
        _save_raw(email, data)
        return model


def delete_semantic_model(email: str, model_id: str) -> bool:
    with _lock_for(email):
        data = _load_raw(email)
        before = data.get("semantic_models", [])
        after = [m for m in before if m.get("id") != model_id]
        if len(after) == len(before):
            return False
        data["semantic_models"] = after
        _save_raw(email, data)
        return True
