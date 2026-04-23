"""
SQLite-backed agent session persistence.

Stores agent conversations (steps, progress tracker) so sessions survive
server restarts and can be listed/loaded/continued from the frontend.

Invariant-3: All queries include ``WHERE email = ?`` — sessions are never
shared across users.
Invariant-5: This module is the source of truth for agent history.
"""

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Optional

from config import settings

_logger = logging.getLogger(__name__)

# H21 — PVC-configurable. Override with `AGENT_SESSION_DB_PATH` env in k8s
# (e.g. `/mnt/pvc/agent_sessions.db`). Relative paths resolve against backend root.
_configured = Path(settings.AGENT_SESSION_DB_PATH)
if _configured.is_absolute():
    DB_PATH = _configured
else:
    DB_PATH = Path(__file__).resolve().parent / _configured
_DB_PATH = DB_PATH  # legacy alias preserved for existing callers
_MAX_SESSIONS_PER_USER = 50

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    chat_id    TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    title      TEXT DEFAULT '',
    steps_json TEXT DEFAULT '[]',
    progress_json TEXT DEFAULT '{}',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(email, updated_at);
"""


class AgentSessionStore:
    """Thread-safe SQLite session store with WAL mode."""

    def __init__(self, db_path: Path = _DB_PATH):
        self._db_path = db_path
        self._lock = threading.Lock()
        self._ensure_db()

    # ── Private helpers ───────────────────────────────────────────

    def _ensure_db(self):
        """Create DB directory, file, and schema if missing."""
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db_path))
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")
            conn.executescript(_SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
        _logger.info("Agent session store ready at %s", self._db_path)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path))
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.row_factory = sqlite3.Row
        return conn

    # ── Public API ────────────────────────────────────────────────

    def save_session(
        self,
        chat_id: str,
        email: str,
        title: str,
        steps: list,
        progress: dict,
    ) -> None:
        """Insert or update a session. Auto-purges oldest if over cap."""
        now = time.time()
        steps_json = json.dumps(steps, default=str)
        progress_json = json.dumps(progress, default=str)

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """INSERT INTO sessions (chat_id, email, title, steps_json, progress_json, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(chat_id) DO UPDATE SET
                           title = excluded.title,
                           steps_json = excluded.steps_json,
                           progress_json = excluded.progress_json,
                           updated_at = excluded.updated_at""",
                    (chat_id, email, title, steps_json, progress_json, now, now),
                )
                conn.commit()
                # Purge oldest beyond cap — Invariant-3: scoped by email
                self._purge_oldest(conn, email)
            except Exception:
                _logger.exception("Failed to save session %s", chat_id)
            finally:
                conn.close()

    def load_session(self, chat_id: str, email: str) -> Optional[dict]:
        """Load a session by chat_id. Returns None if not found or wrong email (Invariant-3)."""
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM sessions WHERE chat_id = ? AND email = ?",
                (chat_id, email),
            ).fetchone()
            if not row:
                return None
            return self._row_to_dict(row)
        finally:
            conn.close()

    def list_sessions(self, email: str, limit: int = 50) -> list[dict]:
        """List sessions for a user, newest first. Invariant-3: email-scoped."""
        conn = self._connect()
        try:
            rows = conn.execute(
                """SELECT chat_id, email, title,
                          json_array_length(steps_json) AS step_count,
                          progress_json, created_at, updated_at
                   FROM sessions
                   WHERE email = ?
                   ORDER BY updated_at DESC
                   LIMIT ?""",
                (email, limit),
            ).fetchall()
            result = []
            for r in rows:
                result.append({
                    "chat_id": r["chat_id"],
                    "title": r["title"],
                    "step_count": r["step_count"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "has_pending": self._has_pending(r["progress_json"]),
                })
            return result
        finally:
            conn.close()

    def delete_session(self, chat_id: str, email: str) -> bool:
        """Delete a session. Returns True if deleted. Invariant-3: email-scoped."""
        with self._lock:
            conn = self._connect()
            try:
                cursor = conn.execute(
                    "DELETE FROM sessions WHERE chat_id = ? AND email = ?",
                    (chat_id, email),
                )
                conn.commit()
                return cursor.rowcount > 0
            finally:
                conn.close()

    # ── Internal helpers ──────────────────────────────────────────

    def _purge_oldest(self, conn: sqlite3.Connection, email: str):
        """Keep only the newest MAX sessions per user."""
        conn.execute(
            """DELETE FROM sessions WHERE chat_id IN (
                 SELECT chat_id FROM sessions
                 WHERE email = ?
                 ORDER BY updated_at DESC
                 LIMIT -1 OFFSET ?
               )""",
            (email, _MAX_SESSIONS_PER_USER),
        )
        conn.commit()

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict:
        """Convert a full session row to a dict with parsed JSON."""
        return {
            "chat_id": row["chat_id"],
            "email": row["email"],
            "title": row["title"],
            "steps": json.loads(row["steps_json"]),
            "progress": json.loads(row["progress_json"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _has_pending(progress_json: str) -> bool:
        """Check if a session has pending tasks in its progress tracker."""
        try:
            p = json.loads(progress_json)
            return bool(p.get("pending"))
        except (json.JSONDecodeError, TypeError):
            return False


# ── Module-level singleton ────────────────────────────────────────
session_store = AgentSessionStore()
