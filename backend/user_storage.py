"""
Per-user file-based data layer for AskDB.
Stores connection configs, chat history, and user profiles.

Storage is pluggable via the StorageBackend ABC.  The active backend is
selected by ``settings.STORAGE_BACKEND`` (default: ``"file"``).  All
public functions in this module delegate to the module-level ``_backend``
instance, so swapping to S3/SQLite/Postgres only requires a new subclass.
"""

import json
import hashlib
import logging
import os
import threading
import uuid
import base64
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from cryptography.fernet import Fernet

from config import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()

DATA_ROOT = Path(__file__).resolve().parent / ".data" / "user_data"
_STORAGE_ROOT = DATA_ROOT.parent  # .data/


# ── StorageBackend ABC ────────────────────────────────────────────

class StorageBackend(ABC):
    """Abstract interface for all data persistence operations."""

    @abstractmethod
    def read_json(self, key: str) -> Optional[Any]:
        """Read and parse JSON at *key*. Return ``None`` if not found."""

    @abstractmethod
    def write_json(self, key: str, data: Any, *, atomic: bool = False) -> None:
        """Serialise *data* as JSON and write to *key*.
        If *atomic* is ``True``, use write-then-rename for crash safety."""

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Delete *key*. Return ``True`` if it existed."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Return ``True`` if *key* exists."""

    @abstractmethod
    def list_keys(self, prefix: str, suffix: str = ".json") -> list[str]:
        """Return all keys under *prefix* that end with *suffix*."""


class FileStorage(StorageBackend):
    """Local-filesystem implementation — the default backend."""

    def __init__(self, root: Path):
        self.root = root

    def _resolve(self, key: str) -> Path:
        return self.root / key

    def read_json(self, key: str) -> Optional[Any]:
        path = self._resolve(key)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def write_json(self, key: str, data: Any, *, atomic: bool = False) -> None:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(data, indent=2, default=str)
        if atomic:
            tmp = path.with_suffix(".tmp")
            tmp.write_text(text, encoding="utf-8")
            tmp.replace(path)
        else:
            path.write_text(text, encoding="utf-8")

    def delete(self, key: str) -> bool:
        path = self._resolve(key)
        if path.exists():
            path.unlink()
            return True
        return False

    def exists(self, key: str) -> bool:
        return self._resolve(key).exists()

    def list_keys(self, prefix: str, suffix: str = ".json") -> list[str]:
        directory = self._resolve(prefix)
        if not directory.exists():
            return []
        return [
            f"{prefix}/{p.name}"
            for p in directory.iterdir()
            if p.name.endswith(suffix)
        ]


def _create_backend() -> StorageBackend:
    """Factory: select backend from config."""
    backend_type = settings.STORAGE_BACKEND
    if backend_type == "file":
        return FileStorage(_STORAGE_ROOT)
    raise ValueError(f"Unknown STORAGE_BACKEND: {backend_type!r}. Supported: 'file'")


_backend: StorageBackend = _create_backend()


# ── Helpers ──────────────────────────────────────────────────────

def _user_prefix(email: str) -> str:
    """Return the storage key prefix for a user (e.g. 'user_data/a1b2c3d4...')."""
    h = hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:16]
    return f"user_data/{h}"


def _user_dir(email: str) -> Path:
    """Return per-user directory based on sha256 hash prefix of email."""
    h = hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:16]
    return DATA_ROOT / h


def _fernet() -> Fernet:
    """Create a Fernet cipher. Uses FERNET_SECRET_KEY if configured,
    otherwise derives key from JWT_SECRET_KEY via PBKDF2-HMAC-SHA256."""
    if settings.FERNET_SECRET_KEY:
        # Use dedicated Fernet key directly (must be valid base64-encoded 32-byte key)
        return Fernet(settings.FERNET_SECRET_KEY.encode("utf-8"))
    key_bytes = settings.JWT_SECRET_KEY.encode("utf-8")
    derived = hashlib.pbkdf2_hmac(
        "sha256", key_bytes, b"askdb-fernet-salt", 600000
    )
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_password(plain: str) -> str:
    """Encrypt a plaintext password and return the ciphertext as a string."""
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_password(cipher: str) -> str:
    """Decrypt a ciphertext string back to the plaintext password."""
    return _fernet().decrypt(cipher.encode("utf-8")).decode("utf-8")


# ── Connection Config CRUD ───────────────────────────────────────

def _connections_key(email: str) -> str:
    return f"{_user_prefix(email)}/connections.json"


def _connections_file(email: str) -> Path:
    return _user_dir(email) / "connections.json"


def _load_connections(email: str) -> list:
    return _backend.read_json(_connections_key(email)) or []


def _save_connections(email: str, configs: list):
    _backend.write_json(_connections_key(email), configs)


def save_connection_config(email: str, config_dict: dict) -> dict:
    """Save a connection config. Encrypts the password field if present."""
    with _lock:
        configs = _load_connections(email)
        config = dict(config_dict)
        config["id"] = uuid.uuid4().hex[:8]
        config["created_at"] = datetime.now(timezone.utc).isoformat()
        if config.get("password"):
            config["password"] = encrypt_password(config["password"])
        configs.append(config)
        _save_connections(email, configs)
        logger.info("Saved connection config %s for user %s", config["id"], email)
        return config


def load_connection_configs(email: str) -> list:
    """Load all connection configs for a user."""
    with _lock:
        return _load_connections(email)


def delete_connection_config(email: str, config_id: str):
    """Delete a connection config by id."""
    with _lock:
        configs = _load_connections(email)
        configs = [c for c in configs if c.get("id") != config_id]
        _save_connections(email, configs)
        logger.info("Deleted connection config %s for user %s", config_id, email)


def update_connection_config(email: str, config_id: str, updates: dict):
    """Update fields on a connection config."""
    with _lock:
        configs = _load_connections(email)
        for config in configs:
            if config.get("id") == config_id:
                for k, v in updates.items():
                    if k == "password" and v:
                        config[k] = encrypt_password(v)
                    else:
                        config[k] = v
                break
        _save_connections(email, configs)
        logger.info("Updated connection config %s for user %s", config_id, email)


# ── Chat CRUD ────────────────────────────────────────────────────

def _chat_prefix(email: str) -> str:
    return f"{_user_prefix(email)}/chat_history"


def _chat_key(email: str, chat_id: str) -> str:
    return f"{_chat_prefix(email)}/{chat_id}.json"


def _chat_dir(email: str) -> Path:
    return _user_dir(email) / "chat_history"


def _chat_file(email: str, chat_id: str) -> Path:
    return _chat_dir(email) / f"{chat_id}.json"


def create_chat(email: str, title: str, conn_id: Optional[str] = None,
                db_type: Optional[str] = None, database_name: Optional[str] = None) -> dict:
    """Create a new chat conversation."""
    with _lock:
        chat_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        chat = {
            "chat_id": chat_id,
            "title": title,
            "conn_id": conn_id,
            "db_type": db_type,
            "database_name": database_name,
            "created_at": now,
            "updated_at": now,
            "messages": [],
        }
        _backend.write_json(_chat_key(email, chat_id), chat)
        logger.info("Created chat %s for user %s", chat_id, email)
        return chat


def list_chats(email: str) -> list:
    """List all chats for a user (summary only, no messages)."""
    keys = _backend.list_keys(_chat_prefix(email))
    result = []
    for key in keys:
        try:
            chat = _backend.read_json(key)
            if not chat:
                continue
            result.append({
                "chat_id": chat["chat_id"],
                "title": chat.get("title", ""),
                "updated_at": chat.get("updated_at", ""),
                "db_type": chat.get("db_type"),
                "database_name": chat.get("database_name"),
            })
        except Exception:
            continue
    result.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
    return result


def load_chat(email: str, chat_id: str) -> Optional[dict]:
    """Load a full chat with messages."""
    return _backend.read_json(_chat_key(email, chat_id))


def append_message(email: str, chat_id: str, message_dict: dict):
    """Append a message to a chat and update the timestamp."""
    with _lock:
        key = _chat_key(email, chat_id)
        chat = _backend.read_json(key)
        if not chat:
            raise FileNotFoundError(f"Chat {chat_id} not found")
        chat["messages"].append(message_dict)
        chat["updated_at"] = datetime.now(timezone.utc).isoformat()
        _backend.write_json(key, chat)


def delete_chat(email: str, chat_id: str):
    """Delete a chat conversation."""
    with _lock:
        if _backend.delete(_chat_key(email, chat_id)):
            logger.info("Deleted chat %s for user %s", chat_id, email)


# ── ER Diagram Positions ────────────────────────────────────────

def _er_positions_dir(email: str) -> Path:
    return _user_dir(email) / "er_positions"


def save_er_positions(email: str, conn_id: str, positions: dict):
    """Save ER diagram table positions for a specific connection."""
    with _lock:
        key = f"{_user_prefix(email)}/er_positions/{conn_id}.json"
        _backend.write_json(key, positions)
        logger.info("Saved ER positions for conn %s, user %s", conn_id, email)


def load_er_positions(email: str, conn_id: str) -> dict:
    """Load ER diagram table positions for a specific connection."""
    return _backend.read_json(f"{_user_prefix(email)}/er_positions/{conn_id}.json") or {}


# ── Query Statistics ────────────────────────────────────────────

def _stats_key(email: str) -> str:
    return f"{_user_prefix(email)}/query_stats.json"


def _stats_file(email: str) -> Path:
    return _user_dir(email) / "query_stats.json"


def load_query_stats(email: str) -> dict:
    """Load query usage statistics for a user. Auto-backfills from chat history on first load."""
    key = _stats_key(email)
    stats = _backend.read_json(key)
    if stats is not None:
        return stats
    # Backfill from existing chat history
    stats = _backfill_stats_from_chats(email)
    if stats["total_queries"] > 0:
        _backend.write_json(key, stats)
        logger.info("Backfilled query stats for %s: %d queries", email, stats["total_queries"])
    return stats


def _backfill_stats_from_chats(email: str) -> dict:
    """Scan chat history to reconstruct query stats for users who predate tracking."""
    stats = {
        "total_queries": 0,
        "queries_this_month": 0,
        "current_month": datetime.now(timezone.utc).strftime("%Y-%m"),
        "total_latency_ms": 0,
        "success_count": 0,
        "fail_count": 0,
        "last_query_at": None,
    }
    keys = _backend.list_keys(_chat_prefix(email))
    if not keys:
        return stats

    current_month = stats["current_month"]
    last_query_ts = None

    for key in keys:
        try:
            chat = _backend.read_json(key)
            if not chat:
                continue
            chat_updated = chat.get("updated_at", "")
            for msg in chat.get("messages", []):
                if msg.get("type") == "result":
                    stats["total_queries"] += 1
                    latency = msg.get("latency", 0)
                    stats["total_latency_ms"] += latency
                    if msg.get("error"):
                        stats["fail_count"] += 1
                    else:
                        stats["success_count"] += 1
                    if chat_updated and chat_updated[:7] == current_month:
                        stats["queries_this_month"] += 1
                    if chat_updated and (last_query_ts is None or chat_updated > last_query_ts):
                        last_query_ts = chat_updated
        except Exception:
            continue

    stats["last_query_at"] = last_query_ts
    return stats


# Daily query limits per plan
DAILY_LIMITS = {
    "free": 10,
    "pro": -1,          # unlimited
    "team": -1,         # unlimited
    # Legacy plan names (backward compat for existing users)
    "weekly": 50,
    "monthly": 200,
    "yearly": 500,
    "enterprise": -1,
}


def increment_query_stats(email: str, latency_ms: float, success: bool):
    """Atomically increment query stats after each execution."""
    with _lock:
        stats = load_query_stats(email)
        now = datetime.now(timezone.utc)
        current_month = now.strftime("%Y-%m")
        current_day = now.strftime("%Y-%m-%d")

        # Reset monthly counter if month changed
        if stats.get("current_month") != current_month:
            stats["queries_this_month"] = 0
            stats["current_month"] = current_month

        # Reset daily counter if day changed
        if stats.get("current_day") != current_day:
            stats["queries_today"] = 0
            stats["current_day"] = current_day

        stats["total_queries"] = stats.get("total_queries", 0) + 1
        stats["queries_this_month"] = stats.get("queries_this_month", 0) + 1
        stats["queries_today"] = stats.get("queries_today", 0) + 1
        stats["total_latency_ms"] = stats.get("total_latency_ms", 0) + latency_ms
        if success:
            stats["success_count"] = stats.get("success_count", 0) + 1
        else:
            stats["fail_count"] = stats.get("fail_count", 0) + 1
        stats["last_query_at"] = now.isoformat()

        _backend.write_json(_stats_key(email), stats)


def get_daily_usage(email: str) -> dict:
    """Return daily usage info: queries used today, daily limit, remaining."""
    stats = load_query_stats(email)
    profile = load_profile(email)
    plan = profile.get("plan", "free")
    daily_limit = DAILY_LIMITS.get(plan, DAILY_LIMITS["free"])

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    queries_today = stats.get("queries_today", 0) if stats.get("current_day") == today else 0

    if daily_limit == -1:
        remaining = -1  # unlimited
    else:
        remaining = max(0, daily_limit - queries_today)

    return {
        "plan": plan,
        "queries_today": queries_today,
        "daily_limit": daily_limit,
        "remaining": remaining,
        "unlimited": daily_limit == -1,
    }


def clear_chat_history(email: str):
    """Delete all chat files for a user."""
    with _lock:
        keys = _backend.list_keys(_chat_prefix(email))
        for key in keys:
            _backend.delete(key)
        if keys:
            logger.info("Cleared chat history for user %s", email)


# ── Profile ──────────────────────────────────────────────────────

def _profile_key(email: str) -> str:
    return f"{_user_prefix(email)}/profile.json"


def _profile_file(email: str) -> Path:
    return _user_dir(email) / "profile.json"


def load_profile(email: str) -> dict:
    """Load user profile preferences."""
    return _backend.read_json(_profile_key(email)) or {}


def save_profile(email: str, data: dict):
    """Save user profile preferences."""
    with _lock:
        _backend.write_json(_profile_key(email), data)
        logger.info("Saved profile for user %s", email)


def save_api_key_to_profile(email: str, updates: dict):
    """Save API key fields to profile with atomic writes (crash-safe).

    Unlike save_profile(), this uses atomic=True because API keys
    are Fernet-encrypted secrets that must not be corrupted on crash.
    """
    with _lock:
        profile = _backend.read_json(_profile_key(email)) or {}
        profile.update(updates)
        _backend.write_json(_profile_key(email), profile, atomic=True)
        logger.info("Saved provider config for user %s", email)


# ── Dashboards ─────────────────────────────────────────────────

def _dashboards_key(email: str) -> str:
    return f"{_user_prefix(email)}/dashboards.json"


def _dashboards_file(email: str) -> Path:
    return _user_dir(email) / "dashboards.json"


def _load_dashboards(email: str) -> list:
    return _backend.read_json(_dashboards_key(email)) or []


def _sanitize_for_json(obj):
    """Replace NaN/Inf floats with None to prevent JSON serialization errors.
    These values appear in computed columns (e.g., first-order differences where
    the first row has no predecessor). Python's json.dumps crashes on NaN/Inf."""
    import math
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(item) for item in obj]
    return obj


def _save_dashboards(email: str, dashboards: list):
    """Atomic write-then-rename for crash safety [ADV-FIX]."""
    _backend.write_json(_dashboards_key(email), _sanitize_for_json(dashboards), atomic=True)


def list_dashboards(email: str) -> list:
    """Return summary list of all dashboards."""
    dashboards = _load_dashboards(email)
    result = []
    for d in dashboards:
        tile_count = sum(
            len(sec.get("tiles", []))
            for tab in d.get("tabs", [])
            for sec in tab.get("sections", [])
        )
        result.append({
            "id": d["id"],
            "name": d["name"],
            "created_at": d["created_at"],
            "updated_at": d["updated_at"],
            "tile_count": tile_count,
            "tab_count": len(d.get("tabs", [])),
        })
    return result


def create_dashboard(email: str, name: str) -> dict:
    """Create a new dashboard with a default tab and section."""
    with _lock:
        dashboards = _load_dashboards(email)
        now = datetime.now(timezone.utc).isoformat()
        default_section = {
            "id": uuid.uuid4().hex[:8],
            "name": "General",
            "description": "",
            "order": 0,
            "collapsed": False,
            "tiles": [],
            "layout": [],
        }
        default_tab = {
            "id": uuid.uuid4().hex[:8],
            "name": "Overview",
            "order": 0,
            "sections": [default_section],
        }
        dashboard = {
            "id": uuid.uuid4().hex[:12],
            "name": name[:200],
            "description": "",
            "created_at": now,
            "updated_at": now,
            "tabs": [default_tab],
            "annotations": [],
            "sharing": {"enabled": False, "token": None},
            "customMetrics": [],
            "themeConfig": {},
        }
        dashboards.append(dashboard)
        _save_dashboards(email, dashboards)
        logger.info("Created dashboard %s for user %s", dashboard["id"], email)
        return dashboard


def load_dashboard(email: str, dashboard_id: str) -> Optional[dict]:
    """Load a full dashboard by ID, auto-migrating if needed."""
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            migrated = migrate_dashboard_if_needed(d)
            if "tabs" not in d or migrated is not d:
                _save_dashboards(email, dashboards)
            return migrated
    return None


def update_dashboard(email: str, dashboard_id: str, updates: dict) -> Optional[dict]:
    """Update dashboard fields (name, description, tabs, annotations).
    Auto-snapshots version history on structural changes (tabs)."""
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                # Snapshot before structural changes (tabs/tiles)
                if "tabs" in updates:
                    _auto_version_snapshot(email, dashboard_id, d)
                for key in (
                    "name", "description", "tabs", "annotations", "sharing",
                    "customMetrics", "globalFilters", "themeConfig", "bookmarks", "settings",
                    # Analyst Pro freeform schema fields (Plan 3 T9)
                    "schemaVersion", "archetype", "size",
                    "tiledRoot", "floatingLayer", "worksheets",
                    "parameters", "sets", "actions", "globalStyle",
                    "layout",
                    # Plan 6a — device-layout overrides (Build_Tableau §IX.5)
                    "deviceLayouts",
                    # Plan 10a — workbook-level format rules (precedence chain)
                    "formatting",
                ):
                    if key in updates:
                        d[key] = updates[key]
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                _save_dashboards(email, dashboards)
                return d
        return None


def _auto_version_snapshot(email: str, dashboard_id: str, dashboard: dict):
    """Internal: save version snapshot without re-acquiring _lock."""
    versions = _load_versions(email, dashboard_id)
    # Debounce: skip if last version was < 60s ago
    if versions:
        from datetime import timedelta
        last_ts = versions[-1].get("timestamp", "")
        try:
            last_dt = datetime.fromisoformat(last_ts)
            if datetime.now(timezone.utc) - last_dt < timedelta(seconds=60):
                return
        except Exception:
            pass
    version = {
        "id": uuid.uuid4().hex[:12],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "label": "",
        "snapshot": dict(dashboard),
    }
    versions.append(version)
    if len(versions) > MAX_VERSIONS:
        versions = versions[-MAX_VERSIONS:]
    _save_versions(email, dashboard_id, versions)


def add_dashboard_tab(email: str, dashboard_id: str, tab_name: str) -> Optional[dict]:
    """Add a new tab to a dashboard."""
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                new_tab = {
                    "id": uuid.uuid4().hex[:8],
                    "name": tab_name[:200],
                    "order": len(d.get("tabs", [])),
                    "sections": [{
                        "id": uuid.uuid4().hex[:8],
                        "name": "General",
                        "description": "",
                        "order": 0,
                        "collapsed": False,
                        "tiles": [],
                        "layout": [],
                    }],
                }
                d.setdefault("tabs", []).append(new_tab)
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                _save_dashboards(email, dashboards)
                return d
        return None


def add_section_to_tab(email: str, dashboard_id: str, tab_id: str, section_name: str) -> Optional[dict]:
    """Add a new section to a tab."""
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                for tab in d.get("tabs", []):
                    if tab["id"] == tab_id:
                        new_section = {
                            "id": uuid.uuid4().hex[:8],
                            "name": section_name[:200],
                            "description": "",
                            "order": len(tab.get("sections", [])),
                            "collapsed": False,
                            "tiles": [],
                            "layout": [],
                        }
                        tab.setdefault("sections", []).append(new_section)
                        d["updated_at"] = datetime.now(timezone.utc).isoformat()
                        _save_dashboards(email, dashboards)
                        return d
        return None


def add_tile_to_section(email: str, dashboard_id: str, tab_id: str, section_id: str, tile: dict) -> Optional[dict]:
    """Add a tile to a specific section."""
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                for tab in d.get("tabs", []):
                    if tab["id"] == tab_id:
                        for sec in tab.get("sections", []):
                            if sec["id"] == section_id:
                                tile_id = uuid.uuid4().hex[:8]
                                tile["id"] = tile_id
                                if "rows" in tile:
                                    tile["rows"] = tile["rows"][:5000]
                                sec["tiles"].append(tile)
                                # Auto-compute layout position
                                existing = sec.get("layout", [])
                                max_y = max((item["y"] + item["h"] for item in existing), default=0)
                                col = len(existing) % 3
                                row_y = max_y if col == 0 else max(max_y - 3, 0)
                                sec["layout"].append({
                                    "i": tile_id,
                                    "x": col * 4,
                                    "y": row_y,
                                    "w": 4,
                                    "h": 3,
                                    "minW": 2,
                                    "minH": 2,
                                })
                                _sync_tiled_root_add(d, tile, tile_id)
                                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                                _save_dashboards(email, dashboards)
                                return d
        return None


def _sync_tiled_root_add(dashboard: dict, tile: dict, tile_id: str) -> None:
    """Append a worksheet node to tiledRoot when archetype is analyst-pro.

    Analyst Pro renders exclusively from tiledRoot graph; tiles added only to
    tabs[].sections[].tiles are invisible without this sync. Appends a single-
    child container-horz row so the new tile shows in the flow without
    rebalancing existing row weights.
    """
    if dashboard.get("archetype") != "analyst-pro":
        return
    tiled_root = dashboard.get("tiledRoot")
    if not isinstance(tiled_root, dict):
        return
    children = tiled_root.setdefault("children", [])
    row_height = 5882
    existing_rows = [c for c in children if isinstance(c, dict) and c.get("type") == "container-horz"]
    if existing_rows:
        first_h = existing_rows[0].get("h")
        if isinstance(first_h, int) and first_h > 0:
            row_height = first_h
    title = tile.get("title") or tile.get("name") or ""
    worksheet_node = {
        "id": tile_id,
        "type": "worksheet",
        "w": 100000,
        "h": 100000,
        "worksheetRef": tile_id,
        "displayName": title,
        "fitMode": "fit",
    }
    row_node = {
        "id": f"agent-row-{tile_id}",
        "type": "container-horz",
        "w": 100000,
        "h": row_height,
        "children": [worksheet_node],
    }
    children.append(row_node)


def update_tile(email: str, dashboard_id: str, tile_id: str, updates: dict) -> Optional[dict]:
    """Update a specific tile's properties (title, chartType, sql, measures, filters, etc.)."""
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                for tab in d.get("tabs", []):
                    for sec in tab.get("sections", []):
                        for tile in sec.get("tiles", []):
                            if tile["id"] == tile_id:
                                for key, val in updates.items():
                                    if key != "id":
                                        tile[key] = val
                                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                                _save_dashboards(email, dashboards)
                                return d
        return None


def move_tile(email: str, dashboard_id: str, tile_id: str,
              target_tab_id: str, target_section_id: str) -> Optional[dict]:
    """Move a tile from its current section to a target section (can cross tabs)."""
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] != dashboard_id:
                continue
            # Find and remove tile from source
            source_tile = None
            for tab in d.get("tabs", []):
                for sec in tab.get("sections", []):
                    for i, tile in enumerate(sec.get("tiles", [])):
                        if tile["id"] == tile_id:
                            source_tile = sec["tiles"].pop(i)
                            sec["layout"] = [l for l in sec.get("layout", []) if l["i"] != tile_id]
                            break
                    if source_tile:
                        break
                if source_tile:
                    break
            if not source_tile:
                return None
            # Add to target section
            for tab in d.get("tabs", []):
                if tab["id"] == target_tab_id:
                    for sec in tab.get("sections", []):
                        if sec["id"] == target_section_id:
                            sec["tiles"].append(source_tile)
                            existing = sec.get("layout", [])
                            max_y = max((item["y"] + item["h"] for item in existing), default=0)
                            col = len(existing) % 3
                            row_y = max_y if col == 0 else max(max_y - 3, 0)
                            sec.setdefault("layout", []).append({
                                "i": tile_id, "x": col * 4, "y": row_y,
                                "w": 4, "h": 3, "minW": 2, "minH": 2,
                            })
                            d["updated_at"] = datetime.now(timezone.utc).isoformat()
                            _save_dashboards(email, dashboards)
                            return d
            return None
    return None


def copy_tile(email: str, dashboard_id: str, tile_id: str,
              target_tab_id: str, target_section_id: str) -> Optional[dict]:
    """Copy a tile to a target section (can cross tabs). Creates a new tile with a new ID."""
    import copy as _copy
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] != dashboard_id:
                continue
            # Find source tile
            source_tile = None
            for tab in d.get("tabs", []):
                for sec in tab.get("sections", []):
                    for tile in sec.get("tiles", []):
                        if tile["id"] == tile_id:
                            source_tile = _copy.deepcopy(tile)
                            break
                    if source_tile:
                        break
                if source_tile:
                    break
            if not source_tile:
                return None
            # Assign new ID
            new_id = uuid.uuid4().hex[:8]
            source_tile["id"] = new_id
            source_tile["title"] = source_tile.get("title", "Untitled") + " (Copy)"
            # Add to target section
            for tab in d.get("tabs", []):
                if tab["id"] == target_tab_id:
                    for sec in tab.get("sections", []):
                        if sec["id"] == target_section_id:
                            sec["tiles"].append(source_tile)
                            existing = sec.get("layout", [])
                            max_y = max((item["y"] + item["h"] for item in existing), default=0)
                            col = len(existing) % 3
                            row_y = max_y if col == 0 else max(max_y - 3, 0)
                            sec.setdefault("layout", []).append({
                                "i": new_id, "x": col * 4, "y": row_y,
                                "w": 4, "h": 3, "minW": 2, "minH": 2,
                            })
                            d["updated_at"] = datetime.now(timezone.utc).isoformat()
                            _save_dashboards(email, dashboards)
                            return d
            return None
    return None


def add_annotation(email: str, dashboard_id: str, annotation: dict, tile_id: str = None) -> Optional[dict]:
    """Add annotation to dashboard or specific tile."""
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                annotation["id"] = uuid.uuid4().hex[:8]
                annotation["created_at"] = datetime.now(timezone.utc).isoformat()
                if tile_id:
                    for tab in d.get("tabs", []):
                        for sec in tab.get("sections", []):
                            for tile in sec.get("tiles", []):
                                if tile["id"] == tile_id:
                                    tile.setdefault("annotations", []).append(annotation)
                                    break
                else:
                    d.setdefault("annotations", []).append(annotation)
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                _save_dashboards(email, dashboards)
                return d
        return None


def delete_annotation(email: str, dashboard_id: str, annotation_id: str, tile_id: str = None) -> Optional[dict]:
    """Remove an annotation from a dashboard or a specific tile."""
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                if tile_id:
                    found = False
                    for tab in d.get("tabs", []):
                        for sec in tab.get("sections", []):
                            for tile in sec.get("tiles", []):
                                if tile["id"] == tile_id:
                                    original = tile.get("annotations", [])
                                    tile["annotations"] = [a for a in original if a.get("id") != annotation_id]
                                    if len(tile["annotations"]) < len(original):
                                        found = True
                                    break
                    if not found:
                        return None
                else:
                    original = d.get("annotations", [])
                    d["annotations"] = [a for a in original if a.get("id") != annotation_id]
                    if len(d["annotations"]) == len(original):
                        return None
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                _save_dashboards(email, dashboards)
                return d
        return None


def delete_dashboard(email: str, dashboard_id: str) -> bool:
    """Delete a dashboard."""
    with _lock:
        dashboards = _load_dashboards(email)
        filtered = [d for d in dashboards if d["id"] != dashboard_id]
        if len(filtered) < len(dashboards):
            _save_dashboards(email, filtered)
            logger.info("Deleted dashboard %s for user %s", dashboard_id, email)
            return True
        return False


def migrate_dashboard_if_needed(dashboard: dict) -> dict:
    """Migrate flat dashboard format to hierarchical (tabs/sections) format."""
    if "tabs" in dashboard:
        return dashboard
    # Old format: { tiles: [], layout: [] }
    old_tiles = dashboard.get("tiles", [])
    old_layout = dashboard.get("layout", [])
    default_section = {
        "id": uuid.uuid4().hex[:8],
        "name": "General",
        "description": "",
        "order": 0,
        "collapsed": False,
        "tiles": old_tiles,
        "layout": old_layout,
    }
    default_tab = {
        "id": uuid.uuid4().hex[:8],
        "name": "Overview",
        "order": 0,
        "sections": [default_section],
    }
    dashboard["tabs"] = [default_tab]
    dashboard.setdefault("annotations", [])
    dashboard.setdefault("sharing", {"enabled": False, "token": None})
    dashboard.pop("tiles", None)
    dashboard.pop("layout", None)
    return dashboard


# ── Share tokens [ADV-FIX H1] ─────────────────────────────────

SHARE_TOKENS_FILE = Path(__file__).resolve().parent / ".data" / "share_tokens.json"
_SHARE_TOKENS_KEY = "share_tokens.json"

def _load_share_tokens() -> dict:
    return _backend.read_json(_SHARE_TOKENS_KEY) or {}

def _save_share_tokens(tokens: dict):
    _backend.write_json(_SHARE_TOKENS_KEY, tokens, atomic=True)

SHARE_TOKEN_LIMITS = {
    "free": 5,
    "weekly": 10,
    "monthly": 20,
    "yearly": 30,
    "pro": 50,
    "team": 50,
    "enterprise": -1,  # unlimited
}

def create_share_token(email: str, dashboard_id: str, expires_hours: int = 0) -> dict:
    """Generate an opaque share token for a dashboard.
    Uses SHARE_TOKEN_EXPIRE_HOURS from config if expires_hours is 0."""
    from datetime import timedelta
    if expires_hours <= 0:
        expires_hours = settings.SHARE_TOKEN_EXPIRE_HOURS
    with _lock:
        tokens = _load_share_tokens()

        # Enforce per-plan share token quota
        profile = load_profile(email)
        plan = profile.get("plan", "free")
        limit = SHARE_TOKEN_LIMITS.get(plan, SHARE_TOKEN_LIMITS["free"])
        if limit != -1:
            user_count = sum(
                1 for t in tokens.values()
                if t.get("created_by") == email and not t.get("revoked")
            )
            if user_count >= limit:
                raise ValueError(
                    f"Share token limit reached ({limit} on {plan} plan). "
                    f"Revoke an existing token or upgrade your plan."
                )

        token = uuid.uuid4().hex
        entry = {
            "dashboard_id": dashboard_id,
            "created_by": email,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=expires_hours)).isoformat(),
            "revoked": False,
            "audit_log": [{"action": "created", "by": email, "at": datetime.now(timezone.utc).isoformat()}],
        }
        tokens[token] = entry
        _save_share_tokens(tokens)

        # Also update dashboard's sharing field
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                d["sharing"] = {"enabled": True, "token": token}
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                break
        _save_dashboards(email, dashboards)

        return {"token": token, **{k: v for k, v in entry.items() if k != "audit_log"}}

def validate_share_token(token: str) -> Optional[dict]:
    """Validate a share token. Returns {dashboard_id, created_by} or None.
    Records access in the audit log."""
    with _lock:
        tokens = _load_share_tokens()
        entry = tokens.get(token)
        if not entry:
            return None
        if entry.get("revoked"):
            return None
        if entry.get("expires_at"):
            exp = datetime.fromisoformat(entry["expires_at"])
            if datetime.now(timezone.utc) > exp:
                return None
        # Record access in audit log
        audit = entry.setdefault("audit_log", [])
        audit.append({"action": "accessed", "at": datetime.now(timezone.utc).isoformat()})
        # Cap audit log to last 100 entries
        if len(audit) > 100:
            entry["audit_log"] = audit[-100:]
        _save_share_tokens(tokens)
        return entry

def revoke_share_token(token: str) -> bool:
    """Revoke a share token and record in audit log."""
    with _lock:
        tokens = _load_share_tokens()
        if token in tokens:
            tokens[token]["revoked"] = True
            audit = tokens[token].setdefault("audit_log", [])
            audit.append({"action": "revoked", "at": datetime.now(timezone.utc).isoformat()})
            _save_share_tokens(tokens)
            return True
        return False

def prune_expired_share_tokens() -> int:
    """Remove expired and revoked share tokens. Returns count removed."""
    now = datetime.now(timezone.utc)
    with _lock:
        tokens = _load_share_tokens()
        to_remove = []
        for tok, entry in tokens.items():
            if entry.get("revoked"):
                to_remove.append(tok)
            elif entry.get("expires_at"):
                exp = datetime.fromisoformat(entry["expires_at"])
                if now > exp:
                    to_remove.append(tok)
        for tok in to_remove:
            del tokens[tok]
        if to_remove:
            _save_share_tokens(tokens)
        return len(to_remove)

# ── Dashboard Version History ───────────────────────────────────────

MAX_VERSIONS = 30  # keep last 30 versions per dashboard


def _versions_key(email: str, dashboard_id: str) -> str:
    return f"{_user_prefix(email)}/versions_{dashboard_id}.json"


def _versions_file(email: str, dashboard_id: str) -> Path:
    return _user_dir(email) / f"versions_{dashboard_id}.json"


def _load_versions(email: str, dashboard_id: str) -> list:
    return _backend.read_json(_versions_key(email, dashboard_id)) or []


def _save_versions(email: str, dashboard_id: str, versions: list):
    _backend.write_json(_versions_key(email, dashboard_id), versions, atomic=True)


def _save_version_no_lock(email: str, dashboard_id: str, snapshot: dict, label: str = "") -> dict:
    """Internal: snapshot a dashboard state as a version WITHOUT acquiring _lock.

    Use this from inside an existing `with _lock:` block. Calling the public
    `save_dashboard_version` from inside a locked section would try to
    re-acquire the non-reentrant `_lock` on the same thread and deadlock.

    Mirrors the `_auto_version_snapshot` pattern already used by
    `update_dashboard`. See `restore_dashboard_version` for the reason this
    helper exists.
    """
    versions = _load_versions(email, dashboard_id)
    version = {
        "id": uuid.uuid4().hex[:12],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "label": label[:200] if label else "",
        "snapshot": snapshot,
    }
    versions.append(version)
    # Trim to MAX_VERSIONS
    if len(versions) > MAX_VERSIONS:
        versions = versions[-MAX_VERSIONS:]
    _save_versions(email, dashboard_id, versions)
    return version


def save_dashboard_version(email: str, dashboard_id: str, snapshot: dict, label: str = ""):
    """Snapshot the current dashboard state as a version.

    Public API — acquires _lock. Must NOT be called from inside another
    `with _lock:` block (use `_save_version_no_lock` instead).
    """
    with _lock:
        return _save_version_no_lock(email, dashboard_id, snapshot, label)


def list_dashboard_versions(email: str, dashboard_id: str) -> list:
    """Return version metadata (without full snapshots) for a dashboard."""
    versions = _load_versions(email, dashboard_id)
    return [
        {"id": v["id"], "timestamp": v["timestamp"], "label": v.get("label", "")}
        for v in versions
    ]


def restore_dashboard_version(email: str, dashboard_id: str, version_id: str) -> Optional[dict]:
    """Restore a dashboard to a specific version. Returns the restored dashboard."""
    versions = _load_versions(email, dashboard_id)
    target = None
    for v in versions:
        if v["id"] == version_id:
            target = v
            break
    if not target:
        return None

    snapshot = target["snapshot"]
    # Preserve the original id and created_at
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                # Save current state as a version before restoring.
                # Must use the no-lock helper — we are already holding _lock
                # and threading.Lock is NOT reentrant. Calling the public
                # `save_dashboard_version` here would deadlock the thread
                # (and, because the FastAPI endpoint is async def, freeze the
                # entire event loop worker — making a subsequent page refresh
                # also hang).
                _save_version_no_lock(
                    email, dashboard_id, dict(d), label="Auto-save before restore"
                )
                # Restore from snapshot
                for key in ("name", "description", "tabs", "annotations", "customMetrics", "globalFilters", "themeConfig", "bookmarks"):
                    if key in snapshot:
                        d[key] = snapshot[key]
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                _save_dashboards(email, dashboards)
                return d
        return None


# ── SQL Diff Audit Log ──────────────────────────────────────────

MAX_AUDIT_ENTRIES = 200


def _audit_log_key(email: str) -> str:
    return f"{_user_prefix(email)}/sql_audit_log.json"


def _audit_log_file(email: str) -> Path:
    return _user_dir(email) / "sql_audit_log.json"


def log_sql_edit(email: str, question: str, original_sql: str, edited_sql: str, conn_id: str = None):
    """Log when a user edits AI-generated SQL before execution."""
    if original_sql.strip() == edited_sql.strip():
        return  # No change, skip logging
    with _lock:
        key = _audit_log_key(email)
        entries = _backend.read_json(key) or []
        entry = {
            "id": uuid.uuid4().hex[:12],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "question": question[:500],
            "original_sql": original_sql,
            "edited_sql": edited_sql,
            "conn_id": conn_id,
        }
        entries.append(entry)
        if len(entries) > MAX_AUDIT_ENTRIES:
            entries = entries[-MAX_AUDIT_ENTRIES:]
        _backend.write_json(key, entries, atomic=True)


def load_sql_audit_log(email: str) -> list:
    """Load the SQL edit audit log for a user."""
    return _backend.read_json(_audit_log_key(email)) or []


# ── Alert Rules ──────────────────────────────────────────────────

# Per-plan alert limits [ADV-FIX H3]
ALERT_LIMITS = {
    "free": 2,
    "weekly": 5,
    "monthly": 10,
    "yearly": 15,
    "pro": 20,
    "enterprise": -1,  # unlimited
}
ALERT_MIN_FREQUENCY = {
    "free": 3600,       # 1 hour minimum
    "weekly": 1800,     # 30 min
    "monthly": 900,     # 15 min
    "yearly": 900,
    "pro": 900,
    "enterprise": 300,  # 5 min
}


def _alerts_key(email: str) -> str:
    return f"{_user_prefix(email)}/alerts.json"


def _alerts_file(email: str) -> Path:
    return _user_dir(email) / "alerts.json"


def _load_alerts(email: str) -> list:
    return _backend.read_json(_alerts_key(email)) or []


def _save_alerts(email: str, alerts: list):
    _backend.write_json(_alerts_key(email), alerts, atomic=True)


def create_alert(email: str, rule: dict) -> dict:
    """Create an alert rule. Enforces per-plan limits [ADV-FIX H3]."""
    with _lock:
        profile = load_profile(email)
        plan = profile.get("plan", "free")
        alerts = _load_alerts(email)
        active = [a for a in alerts if a.get("status") == "active"]

        limit = ALERT_LIMITS.get(plan, ALERT_LIMITS["free"])
        if limit != -1 and len(active) >= limit:
            raise ValueError(f"Alert limit reached ({limit} for {plan} plan)")

        min_freq = ALERT_MIN_FREQUENCY.get(plan, 3600)
        freq = rule.get("frequency_seconds", 3600)
        if freq < min_freq:
            freq = min_freq

        alert = {
            "id": uuid.uuid4().hex[:12],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "active",
            "name": rule.get("name", "Untitled Alert")[:200],
            "condition_text": rule.get("condition_text", "")[:500],
            "sql": rule.get("sql", ""),
            "column": rule.get("column", ""),
            "operator": rule.get("operator", ">"),
            "threshold": rule.get("threshold", 0),
            "frequency_seconds": freq,
            "conn_id": rule.get("conn_id"),
            "dashboard_id": rule.get("dashboard_id"),
            "last_checked": None,
            "last_triggered": None,
            "trigger_count": 0,
        }
        alerts.append(alert)
        _save_alerts(email, alerts)
        return alert


def list_alerts(email: str) -> list:
    """List all alerts for a user."""
    return _load_alerts(email)


def update_alert(email: str, alert_id: str, updates: dict) -> Optional[dict]:
    """Update an alert rule."""
    with _lock:
        alerts = _load_alerts(email)
        for a in alerts:
            if a["id"] == alert_id:
                for key in ("name", "status", "sql", "column", "operator", "threshold", "frequency_seconds", "conn_id"):
                    if key in updates:
                        a[key] = updates[key]
                _save_alerts(email, alerts)
                return a
        return None


def delete_alert(email: str, alert_id: str) -> bool:
    """Delete an alert rule."""
    with _lock:
        alerts = _load_alerts(email)
        filtered = [a for a in alerts if a["id"] != alert_id]
        if len(filtered) < len(alerts):
            _save_alerts(email, filtered)
            return True
        return False


def record_alert_check(email: str, alert_id: str, triggered: bool):
    """Record that an alert was checked (counts against daily query limit) [ADV-FIX H3]."""
    with _lock:
        alerts = _load_alerts(email)
        for a in alerts:
            if a["id"] == alert_id:
                a["last_checked"] = datetime.now(timezone.utc).isoformat()
                if triggered:
                    a["last_triggered"] = datetime.now(timezone.utc).isoformat()
                    a["trigger_count"] = a.get("trigger_count", 0) + 1
                break
        _save_alerts(email, alerts)


def load_shared_dashboard(token: str) -> Optional[dict]:
    """Load a dashboard via share token. Returns dashboard dict or None."""
    entry = validate_share_token(token)
    if not entry:
        return None
    email = entry["created_by"]
    dashboard_id = entry["dashboard_id"]
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            return d
    return None


# ── Behavior Profiles ────────────────────────────────────────────
# Separate lock to avoid contention with _lock (used by users.json).
# Council recommendation: behavior writes are fire-and-forget and
# should never block auth or query operations.

_behavior_lock = threading.Lock()

_DECAY_HALF_LIFE_DAYS = 14  # 2-week half-life on signal weights


def _behavior_key(email: str) -> str:
    return f"{_user_prefix(email)}/behavior_profile.json"


def load_behavior_profile(email: str) -> dict:
    """Load the compacted behavior profile for a user."""
    profile = _backend.read_json(_behavior_key(email))
    return profile or {
        "topic_interests": {},
        "connection_patterns": [],
        "page_visits": {},
        "dashboard_usage": {},
        "prediction_accuracy": None,
        "total_signals": 0,
        "consent_level": 0,
        "last_compacted_at": None,
    }


def merge_behavior_delta(email: str, delta: dict) -> dict:
    """Merge a compacted behavior delta into the user's stored profile.

    Applies additive merging for counters and recency-weighted append
    for list fields. Uses a separate lock from the main data lock.
    """
    with _behavior_lock:
        profile = load_behavior_profile(email)

        # Merge topic interests (additive counts)
        for topic, count in delta.get("topic_interests", {}).items():
            profile["topic_interests"][topic] = (
                profile["topic_interests"].get(topic, 0) + count
            )

        # Merge connection patterns (append, keep last 20)
        new_patterns = delta.get("connection_patterns", [])
        profile["connection_patterns"] = (
            profile["connection_patterns"] + new_patterns
        )[-20:]

        # Merge page visits (additive)
        for page, count in delta.get("page_visits", {}).items():
            profile["page_visits"][page] = (
                profile["page_visits"].get(page, 0) + count
            )

        # Merge dashboard usage (additive)
        for action, count in delta.get("dashboard_usage", {}).items():
            profile["dashboard_usage"][action] = (
                profile["dashboard_usage"].get(action, 0) + count
            )

        # Update prediction accuracy (exponential moving average)
        new_accuracy = delta.get("prediction_accuracy")
        if new_accuracy is not None:
            old = profile.get("prediction_accuracy")
            if old is not None:
                profile["prediction_accuracy"] = old * 0.7 + new_accuracy * 0.3
            else:
                profile["prediction_accuracy"] = new_accuracy

        # Accumulate total signals
        profile["total_signals"] = (
            profile.get("total_signals", 0) + delta.get("session_signals", 0)
        )
        profile["last_compacted_at"] = delta.get(
            "compacted_at", datetime.now(timezone.utc).isoformat()
        )

        _backend.write_json(_behavior_key(email), profile, atomic=True)
        return profile


def update_consent_level(email: str, level: int) -> dict:
    """Update the user's behavior tracking consent level (0=off, 1=personal, 2=collaborative)."""
    with _behavior_lock:
        profile = load_behavior_profile(email)
        profile["consent_level"] = max(0, min(2, level))
        _backend.write_json(_behavior_key(email), profile, atomic=True)
        return profile


def clear_behavior_profile(email: str) -> bool:
    """Delete all behavior data for a user (right-to-erasure)."""
    with _behavior_lock:
        return _backend.delete(_behavior_key(email))


# ── Phase E — Tenant ID migration ──────────────────────────────────────────

def load_profile_with_tenant(path):
    """Phase E — read a profile JSON, minting + persisting tenant_id if absent.

    Backward-compat: legacy profiles without tenant_id get one on first read.
    """
    import json
    import os
    import tempfile
    from pathlib import Path
    from tenant_fortress import resolve_tenant_id

    p = Path(path)
    if not p.exists():
        return {}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if "tenant_id" not in raw:
        resolve_tenant_id(raw)
        fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=f".{p.name}_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(raw, fh, indent=2)
            os.replace(tmp, p)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
    return raw


# ── Phase F — Right-to-erasure cascade ─────────────────────────────────────

def delete_tenant_data(*, tenant_id: str, data_root=None) -> dict:
    """Right-to-erasure cascade. Removes tenant data from:
      - turbo twins (.data/turbo_twins/{tenant_id}/*.duckdb)
      - promotion ledger (.data/promotion_ledger/{tenant_id}.jsonl)
      - correction queue entries tagged with tenant_id
      - QueryMemory ChromaDB namespaces (best-effort)
    Always appends an {action: "erasure"} marker to the audit log.
    Returns dict with per-surface removal counts + marker_written flag.
    """
    from datetime import datetime, timezone
    import json as _json
    from pathlib import Path as _Path

    if data_root is None:
        data_root = _Path(__file__).resolve().parent.parent / ".data"
    data_root = _Path(data_root)

    report = {
        "tenant_id": tenant_id,
        "twin_removed": 0,
        "ledger_removed": 0,
        "queue_removed": 0,
        "chroma_removed": 0,
        "marker_written": False,
    }

    # 1) Turbo twins.
    twin_root = data_root / "turbo_twins" / tenant_id
    if twin_root.exists():
        for p in twin_root.glob("*.duckdb"):
            try:
                p.unlink()
                report["twin_removed"] += 1
            except OSError:
                pass
        try:
            twin_root.rmdir()
        except OSError:
            pass

    # 2) Promotion ledger.
    ledger_root = data_root / "promotion_ledger"
    ledger_file = ledger_root / f"{tenant_id}.jsonl"
    if ledger_file.exists():
        try:
            ledger_file.unlink()
            report["ledger_removed"] = 1
        except OSError:
            pass

    # 3) Correction queue — best-effort scan.
    queue_root = data_root / "correction_queue"
    if queue_root.exists():
        for p in queue_root.rglob("*.json"):
            try:
                rec = _json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            if rec.get("tenant_id") == tenant_id:
                try:
                    p.unlink()
                    report["queue_removed"] += 1
                except OSError:
                    pass

    # 4) ChromaDB — best-effort via QueryMemory.
    try:
        from query_memory import QueryMemory
        qm = QueryMemory()
        if hasattr(qm, "_list_tenant_conn_ids"):
            for conn_id in qm._list_tenant_conn_ids(tenant_id):
                report["chroma_removed"] += qm.delete_tenant_namespace(
                    tenant_id=tenant_id, conn_id=conn_id,
                )
    except Exception:
        pass

    # 5) Audit marker — ALWAYS written.
    audit_dir = data_root / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    marker = {
        "action": "erasure",
        "tenant_id": tenant_id,
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
        "counts": {k: v for k, v in report.items() if k.endswith("_removed")},
    }
    with (audit_dir / "query_decisions.jsonl").open("a", encoding="utf-8") as f:
        f.write(_json.dumps(marker) + "\n")
    report["marker_written"] = True
    return report


# ── Phase H — H21 two-writer conflict detector ──────────────────────────────

class TwoWriterConflict(RuntimeError):
    """Raised when expected_mtime_ns does not match the on-disk mtime at commit time."""


def atomic_write_profile(path: Path, data: dict, *, expected_mtime_ns: Optional[int] = None) -> None:
    """H21 — write-then-rename with optional 'no concurrent writer' check.

    If expected_mtime_ns is given and the target file's mtime differs from it
    at commit time, raise TwoWriterConflict. Caller retries with fresh read.
    """
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        fh.write(json.dumps(data))
        fh.flush()
        try:
            os.fsync(fh.fileno())
        except OSError:
            # Windows may reject fsync on some file descriptors; flush is sufficient
            pass
    if expected_mtime_ns is not None and path.exists():
        current = path.stat().st_mtime_ns
        if current != expected_mtime_ns:
            tmp.unlink(missing_ok=True)
            raise TwoWriterConflict(f"mtime changed: expected={expected_mtime_ns} on-disk={current}")
    os.replace(tmp, path)


def get_admin_email_for_tenant(tenant_id: str) -> str:
    """Return admin email for tenant by scanning user profiles. Returns '' if not found."""
    import glob as _glob
    import json as _json
    from pathlib import Path as _Path
    for path in _Path(".data/user_data").glob("*/profile.json"):
        try:
            data = _json.loads(path.read_text())
            if data.get("tenant_id") == tenant_id and data.get("is_admin"):
                return data.get("email", "")
        except Exception:
            pass
    return ""
