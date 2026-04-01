"""
Per-user file-based data layer for QueryCopilot.
Stores connection configs, chat history, and user profiles.
"""

import json
import hashlib
import logging
import threading
import uuid
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet

from config import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()

DATA_ROOT = Path(__file__).resolve().parent / ".data" / "user_data"


# ── Helpers ──────────────────────────────────────────────────────

def _user_dir(email: str) -> Path:
    """Return per-user directory based on sha256 hash prefix of email."""
    h = hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:16]
    return DATA_ROOT / h


def _fernet() -> Fernet:
    """Create a Fernet cipher from the JWT secret key."""
    key_bytes = settings.JWT_SECRET_KEY.encode("utf-8")
    # Derive a 32-byte key via sha256, then base64-encode for Fernet
    derived = hashlib.sha256(key_bytes).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_password(plain: str) -> str:
    """Encrypt a plaintext password and return the ciphertext as a string."""
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_password(cipher: str) -> str:
    """Decrypt a ciphertext string back to the plaintext password."""
    return _fernet().decrypt(cipher.encode("utf-8")).decode("utf-8")


# ── Connection Config CRUD ───────────────────────────────────────

def _connections_file(email: str) -> Path:
    return _user_dir(email) / "connections.json"


def _load_connections(email: str) -> list:
    path = _connections_file(email)
    if not path.exists():
        return []
    with open(path, "r") as f:
        return json.load(f)


def _save_connections(email: str, configs: list):
    path = _connections_file(email)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(configs, f, indent=2)


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
        path = _chat_file(email, chat_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(chat, f, indent=2)
        logger.info("Created chat %s for user %s", chat_id, email)
        return chat


def list_chats(email: str) -> list:
    """List all chats for a user (summary only, no messages)."""
    chat_d = _chat_dir(email)
    if not chat_d.exists():
        return []
    result = []
    for p in chat_d.glob("*.json"):
        try:
            with open(p, "r") as f:
                chat = json.load(f)
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
    path = _chat_file(email, chat_id)
    if not path.exists():
        return None
    with open(path, "r") as f:
        return json.load(f)


def append_message(email: str, chat_id: str, message_dict: dict):
    """Append a message to a chat and update the timestamp."""
    with _lock:
        path = _chat_file(email, chat_id)
        if not path.exists():
            raise FileNotFoundError(f"Chat {chat_id} not found")
        with open(path, "r") as f:
            chat = json.load(f)
        chat["messages"].append(message_dict)
        chat["updated_at"] = datetime.now(timezone.utc).isoformat()
        with open(path, "w") as f:
            json.dump(chat, f, indent=2)


def delete_chat(email: str, chat_id: str):
    """Delete a chat conversation."""
    with _lock:
        path = _chat_file(email, chat_id)
        if path.exists():
            path.unlink()
            logger.info("Deleted chat %s for user %s", chat_id, email)


# ── ER Diagram Positions ────────────────────────────────────────

def _er_positions_dir(email: str) -> Path:
    return _user_dir(email) / "er_positions"


def save_er_positions(email: str, conn_id: str, positions: dict):
    """Save ER diagram table positions for a specific connection."""
    with _lock:
        d = _er_positions_dir(email)
        d.mkdir(parents=True, exist_ok=True)
        path = d / f"{conn_id}.json"
        with open(path, "w") as f:
            json.dump(positions, f, indent=2)
        logger.info("Saved ER positions for conn %s, user %s", conn_id, email)


def load_er_positions(email: str, conn_id: str) -> dict:
    """Load ER diagram table positions for a specific connection."""
    path = _er_positions_dir(email) / f"{conn_id}.json"
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return json.load(f)


# ── Query Statistics ────────────────────────────────────────────

def _stats_file(email: str) -> Path:
    return _user_dir(email) / "query_stats.json"


def load_query_stats(email: str) -> dict:
    """Load query usage statistics for a user. Auto-backfills from chat history on first load."""
    path = _stats_file(email)
    if not path.exists():
        # Backfill from existing chat history
        stats = _backfill_stats_from_chats(email)
        if stats["total_queries"] > 0:
            # Persist so we don't re-scan next time
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w") as f:
                json.dump(stats, f, indent=2)
            logger.info("Backfilled query stats for %s: %d queries", email, stats["total_queries"])
        return stats
    with open(path, "r") as f:
        return json.load(f)


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
    chat_d = _chat_dir(email)
    if not chat_d.exists():
        return stats

    current_month = stats["current_month"]
    last_query_ts = None

    for p in chat_d.glob("*.json"):
        try:
            with open(p, "r") as f:
                chat = json.load(f)
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
                    # Check if this query was in the current month
                    if chat_updated and chat_updated[:7] == current_month:
                        stats["queries_this_month"] += 1
                    # Track latest query time
                    if chat_updated and (last_query_ts is None or chat_updated > last_query_ts):
                        last_query_ts = chat_updated
        except Exception:
            continue

    stats["last_query_at"] = last_query_ts
    return stats


# Daily query limits per plan
DAILY_LIMITS = {
    "free": 10,
    "weekly": 50,
    "monthly": 200,
    "yearly": 500,
    "pro": 1000,
    "enterprise": -1,  # unlimited
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

        path = _stats_file(email)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(stats, f, indent=2)


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
        chat_d = _chat_dir(email)
        if chat_d.exists():
            for p in chat_d.glob("*.json"):
                p.unlink()
            logger.info("Cleared chat history for user %s", email)


# ── Profile ──────────────────────────────────────────────────────

def _profile_file(email: str) -> Path:
    return _user_dir(email) / "profile.json"


def load_profile(email: str) -> dict:
    """Load user profile preferences."""
    path = _profile_file(email)
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return json.load(f)


def save_profile(email: str, data: dict):
    """Save user profile preferences."""
    with _lock:
        path = _profile_file(email)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        logger.info("Saved profile for user %s", email)


# ── Dashboards ─────────────────────────────────────────────────

def _dashboards_file(email: str) -> Path:
    return _user_dir(email) / "dashboards.json"


def _load_dashboards(email: str) -> list:
    path = _dashboards_file(email)
    if not path.exists():
        return []
    with open(path, "r") as f:
        return json.load(f)


def _save_dashboards(email: str, dashboards: list):
    path = _dashboards_file(email)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(dashboards, f, indent=2)


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
    """Update dashboard fields (name, description, tabs, annotations)."""
    with _lock:
        dashboards = _load_dashboards(email)
        for d in dashboards:
            if d["id"] == dashboard_id:
                for key in ("name", "description", "tabs", "annotations", "sharing"):
                    if key in updates:
                        d[key] = updates[key]
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                _save_dashboards(email, dashboards)
                return d
        return None


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
                                    tile["rows"] = tile["rows"][:100]
                                sec["tiles"].append(tile)
                                # Auto-compute layout position
                                existing = sec.get("layout", [])
                                max_y = max((item["y"] + item["h"] for item in existing), default=0)
                                col = len(existing) % 2
                                row_y = max_y if col == 0 else max(max_y - 4, 0)
                                sec["layout"].append({
                                    "i": tile_id,
                                    "x": col * 6,
                                    "y": row_y,
                                    "w": 6,
                                    "h": 4,
                                    "minW": 3,
                                    "minH": 3,
                                })
                                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                                _save_dashboards(email, dashboards)
                                return d
        return None


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
