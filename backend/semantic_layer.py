"""semantic_layer — per-connection CRUD for linguistic model, color map,
and semantic model (Sub-project D, D0 Task 3).

Storage layout:
    .data/user_data/{sha16_prefix}/semantic/{conn_id}/
        linguistic.json   — NL alias + synonym map for this connection
        color_map.json    — field→color mappings
        model.json        — full semantic model (dimensions, measures, metrics)

All three file types:
    - use atomic write (write to .tmp, then os.replace)
    - are protected per (email, conn_id) by a threading.Lock
    - return the saved dict on write, None on missing read

Migration:
    migrate_from_chart_customizations() reads the old per-user
    chart_customizations.json (via chart_customization._load_raw) and
    writes the matching semantic model to the new per-connection path.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
from collections import defaultdict
from pathlib import Path
from threading import Lock
from typing import Optional

logger = logging.getLogger(__name__)

# Module-level DATA_ROOT — tests override this via monkeypatch.
# Mirrors user_storage.DATA_ROOT so semantic data lands next to other
# per-user storage (connections.json, chart_customizations.json, etc.).
DATA_ROOT = Path(__file__).resolve().parent / ".data" / "user_data"

# ── Locking ──────────────────────────────────────────────────────────────────

# One Lock per (email, conn_id) pair, lazily created.
_locks: dict[tuple[str, str], Lock] = defaultdict(Lock)
_locks_guard = Lock()


def _lock_for(email: str, conn_id: str) -> Lock:
    key = (email.lower(), conn_id)
    with _locks_guard:
        return _locks[key]


# ── Path helpers ─────────────────────────────────────────────────────────────


def _sha_prefix(email: str) -> str:
    """First 16 hex chars of SHA-256(email.lower()) — matches user_storage._user_dir."""
    return hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:16]


def _semantic_dir(email: str, conn_id: str) -> Path:
    """Return (and do NOT create) the per-connection semantic directory."""
    return DATA_ROOT / _sha_prefix(email) / "semantic" / conn_id


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


# ── Atomic write helper ───────────────────────────────────────────────────────


def _write_atomic(path: Path, data: dict) -> None:
    """Write *data* as JSON to *path* using write-tmp-then-rename for crash safety."""
    _ensure_dir(path.parent)
    fd, tmp_path = tempfile.mkstemp(
        prefix="." + path.stem + ".", suffix=".tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, str(path))
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _read_json(path: Path) -> Optional[dict]:
    """Return parsed JSON dict from *path*, or None if missing / unreadable."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("semantic_layer: could not read %s: %s", path, exc)
        return None


# ── Validation helpers ────────────────────────────────────────────────────────


def _validate_linguistic(data: dict) -> None:
    if not isinstance(data, dict):
        raise ValueError("linguistic data must be a dict")
    if not data.get("conn_id"):
        raise ValueError("linguistic data must have a non-empty conn_id")
    if data.get("version") != 1:
        raise ValueError("linguistic data version must be 1")


def _validate_color_map(data: dict) -> None:
    if not isinstance(data, dict):
        raise ValueError("color_map data must be a dict")
    if not data.get("conn_id"):
        raise ValueError("color_map data must have a non-empty conn_id")
    if data.get("version") != 1:
        raise ValueError("color_map data version must be 1")


def _validate_semantic_model(data: dict) -> None:
    if not isinstance(data, dict):
        raise ValueError("semantic model must be a dict")
    if not data.get("id"):
        raise ValueError("semantic model must have a non-empty id")
    if not data.get("name"):
        raise ValueError("semantic model must have a non-empty name")


# ── linguistic.json ───────────────────────────────────────────────────────────


def save_linguistic(email: str, conn_id: str, data: dict) -> dict:
    """Validate and save linguistic.json for *conn_id*.  Returns saved dict."""
    _validate_linguistic(data)
    path = _semantic_dir(email, conn_id) / "linguistic.json"
    with _lock_for(email, conn_id):
        _write_atomic(path, data)
    return data


def load_linguistic(email: str, conn_id: str) -> Optional[dict]:
    """Load linguistic.json for *conn_id*. Returns None if not found."""
    path = _semantic_dir(email, conn_id) / "linguistic.json"
    with _lock_for(email, conn_id):
        return _read_json(path)


def delete_linguistic(email: str, conn_id: str) -> bool:
    """Delete linguistic.json for *conn_id*. Returns True if file existed."""
    path = _semantic_dir(email, conn_id) / "linguistic.json"
    with _lock_for(email, conn_id):
        if path.exists():
            path.unlink()
            return True
        return False


# ── color_map.json ────────────────────────────────────────────────────────────


def save_color_map(email: str, conn_id: str, data: dict) -> dict:
    """Validate and save color_map.json for *conn_id*.  Returns saved dict."""
    _validate_color_map(data)
    path = _semantic_dir(email, conn_id) / "color_map.json"
    with _lock_for(email, conn_id):
        _write_atomic(path, data)
    return data


def load_color_map(email: str, conn_id: str) -> Optional[dict]:
    """Load color_map.json for *conn_id*. Returns None if not found."""
    path = _semantic_dir(email, conn_id) / "color_map.json"
    with _lock_for(email, conn_id):
        return _read_json(path)


# ── model.json ────────────────────────────────────────────────────────────────


def save_semantic_model(email: str, conn_id: str, data: dict) -> dict:
    """Validate and save model.json for *conn_id*.  Returns saved dict."""
    _validate_semantic_model(data)
    path = _semantic_dir(email, conn_id) / "model.json"
    with _lock_for(email, conn_id):
        _write_atomic(path, data)
    return data


def load_semantic_model(email: str, conn_id: str) -> Optional[dict]:
    """Load model.json for *conn_id*. Returns None if not found."""
    path = _semantic_dir(email, conn_id) / "model.json"
    with _lock_for(email, conn_id):
        return _read_json(path)


# ── hydrate ───────────────────────────────────────────────────────────────────


def hydrate(email: str, conn_id: str) -> dict:
    """Load all three semantic files for *conn_id*.

    Returns::

        {
            "linguistic": <dict or None>,
            "color_map":  <dict or None>,
            "model":      <dict or None>,
        }
    """
    return {
        "linguistic": load_linguistic(email, conn_id),
        "color_map": load_color_map(email, conn_id),
        "model": load_semantic_model(email, conn_id),
    }


# ── migration ─────────────────────────────────────────────────────────────────


def migrate_from_chart_customizations(
    email: str, conn_id: str, model_id: str
) -> bool:
    """Copy a semantic model from the old per-user store to the new per-connection path.

    Reads ``chart_customization._load_raw(email)`` to find a model whose ``id``
    matches *model_id*, then writes it as ``model.json`` under this connection's
    semantic directory.

    Returns:
        True  — model found and written to new path.
        False — model with *model_id* not found in old store.
    """
    import chart_customization  # lazy import to avoid circular deps

    raw = chart_customization._load_raw(email)
    models = raw.get("semantic_models", [])
    match = next((m for m in models if m.get("id") == model_id), None)
    if match is None:
        logger.info(
            "semantic_layer: migration skipped — model %r not found for %s",
            model_id,
            email,
        )
        return False

    # Write using low-level helper to bypass the stricter name validation in
    # save_semantic_model (old models may lack the exact required fields).
    path = _semantic_dir(email, conn_id) / "model.json"
    with _lock_for(email, conn_id):
        _write_atomic(path, match)

    logger.info(
        "semantic_layer: migrated model %r → %s for %s",
        model_id,
        path,
        email,
    )
    return True
