"""
audit_trail.py — Append-only audit log for all query intelligence routing decisions.

Invariant-6: Writes are strictly append-only. Lines are never modified or deleted.
One JSON object per line (JSONL format).

Usage:
    from audit_trail import log_tier_decision, log_turbo_event, log_memory_event, get_recent_decisions
"""

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level configuration
# ---------------------------------------------------------------------------

_LOG_DIR = Path(".data/audit")
_LOG_FILENAME = "query_decisions.jsonl"
_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

# Single module-level lock — all write operations must hold this.
_write_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _log_path() -> Path:
    """Return the current active log file path."""
    return _LOG_DIR / _LOG_FILENAME


def _ensure_dir() -> None:
    """Create the log directory if it does not already exist."""
    _LOG_DIR.mkdir(parents=True, exist_ok=True)


def _rotated_path(n: int) -> Path:
    """Return the path for rotation slot N (e.g. query_decisions.1.jsonl)."""
    stem = Path(_LOG_FILENAME).stem          # "query_decisions"
    suffix = Path(_LOG_FILENAME).suffix      # ".jsonl"
    return _LOG_DIR / f"{stem}.{n}{suffix}"


def _rotate_if_needed() -> None:
    """
    Rotate the active log file if it has exceeded _MAX_FILE_SIZE_BYTES.

    Rotation scheme: find the lowest unused N starting from 1 and rename
    the active file to query_decisions.{N}.jsonl, then let the next write
    create a fresh query_decisions.jsonl.

    Must be called while _write_lock is held.
    """
    active = _log_path()
    if not active.exists():
        return
    if active.stat().st_size < _MAX_FILE_SIZE_BYTES:
        return

    # Find next available rotation index.
    n = 1
    while _rotated_path(n).exists():
        n += 1

    dest = _rotated_path(n)
    try:
        active.rename(dest)
        logger.info("audit_trail: rotated %s -> %s", active, dest)
        from audit_integrity import seal
        try:
            seal(dest)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"audit seal failed for {dest}: {e}")
    except OSError:
        logger.exception("audit_trail: rotation failed — continuing without rotate")


def _append_entry(entry: dict) -> None:
    """
    Serialize *entry* as a single JSON line and append it to the active log.

    Steps (all under _write_lock):
      1. Ensure directory exists.
      2. Rotate if the current file is over-size.
      3. Open in append mode, write line, flush, close.

    Never opens the file for writing ('w') — only ever 'a'.
    """
    line = json.dumps(entry, ensure_ascii=False) + "\n"

    with _write_lock:
        _ensure_dir()
        _rotate_if_needed()
        active = _log_path()
        try:
            with open(active, "a", encoding="utf-8") as fh:
                fh.write(line)
                fh.flush()
            _touch_last_write()
        except OSError:
            logger.exception(
                "audit_trail: failed to write entry to %s — entry: %s",
                active,
                entry,
            )


def _utc_now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(tz=timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def log_tier_decision(
    conn_id: str,
    email_hash: str,
    question_hash: str,
    tiers_checked: list,
    tier_hit: Optional[str],
    schema_hash: str,
    cache_age_s: Optional[float],
    reason: str,
) -> None:
    """
    Record one query-intelligence tier routing decision.

    Parameters
    ----------
    conn_id       : Connection identifier.
    email_hash    : Pre-hashed email — do NOT hash again here.
    question_hash : Pre-hashed question — do NOT hash again here.
    tiers_checked : Ordered list of tier names that were evaluated.
    tier_hit      : Name of the tier that produced a result, or None on miss.
    schema_hash   : Hash of the schema fingerprint used.
    cache_age_s   : Age of the cached entry in seconds, or None if not cached.
    reason        : Human-readable explanation of why this tier was chosen.
    """
    entry = {
        "timestamp": _utc_now_iso(),
        "conn_id": conn_id,
        "email_hash": email_hash,
        "question_hash": question_hash,
        "tiers_checked": tiers_checked,
        "tier_hit": tier_hit,
        "schema_hash": schema_hash,
        "cache_age_s": cache_age_s,
        "reason": reason,
    }
    _append_entry(entry)


_VALID_TURBO_EVENT_TYPES = frozenset(
    {"sync_started", "sync_completed", "sync_failed", "disabled", "refreshed"}
)


def log_turbo_event(
    conn_id: str,
    event_type: str,
    details: dict,
) -> None:
    """
    Record a turbo-sync lifecycle event.

    Parameters
    ----------
    conn_id    : Connection identifier.
    event_type : One of "sync_started", "sync_completed", "sync_failed",
                 "disabled", "refreshed".
    details    : Arbitrary dict of supplemental metadata.
    """
    if event_type not in _VALID_TURBO_EVENT_TYPES:
        logger.warning(
            "audit_trail.log_turbo_event: unknown event_type %r — logging anyway",
            event_type,
        )
    entry = {
        "timestamp": _utc_now_iso(),
        "conn_id": conn_id,
        "event_type": event_type,
        "details": details,
    }
    _append_entry(entry)


_VALID_MEMORY_EVENT_TYPES = frozenset({"stored", "retrieved", "expired", "boosted"})


def log_memory_event(
    conn_id: str,
    event_type: str,
    intent_hash: str,
) -> None:
    """
    Record a query-memory lifecycle event.

    Parameters
    ----------
    conn_id     : Connection identifier.
    event_type  : One of "stored", "retrieved", "expired", "boosted".
    intent_hash : Hash of the intent/question that was acted upon.
    """
    if event_type not in _VALID_MEMORY_EVENT_TYPES:
        logger.warning(
            "audit_trail.log_memory_event: unknown event_type %r — logging anyway",
            event_type,
        )
    entry = {
        "timestamp": _utc_now_iso(),
        "conn_id": conn_id,
        "event_type": event_type,
        "intent_hash": intent_hash,
    }
    _append_entry(entry)


def log_agent_event(
    event_type: str,
    session_id: str = "",
    details: Optional[dict] = None,
) -> None:
    """
    Log an agent lifecycle event (budget extension, plan generation, etc.).

    Parameters
    ----------
    event_type  : Event discriminator (e.g., "budget_extension", "plan_generated").
    session_id  : Agent session / chat_id.
    details     : Arbitrary dict of event-specific data.
    """
    entry = {
        "timestamp": _utc_now_iso(),
        "event_type": event_type,
        "session_id": session_id,
        **(details or {}),
    }
    _append_entry(entry)


_VALID_TILE_EVENT_TYPES = frozenset(
    {"tile_created", "tile_deleted", "tile_survived_24h"}
)


def log_tile_event(
    event_type: str,
    dashboard_id: str,
    tile_id: str,
    chart_type: Optional[str] = None,
    user_email_hash: Optional[str] = None,
    age_ms: Optional[int] = None,
) -> None:
    """
    Record a dashboard tile lifecycle event for survival telemetry.

    Phase 2.5 engagement signal — reuses the existing JSONL writer, no
    schema change. Used to compute tile survival rate (1 - deleted_24h/created)
    for the falsifiable claim in the dashboard-density plan.

    Parameters
    ----------
    event_type       : "tile_created" | "tile_deleted" | "tile_survived_24h"
    dashboard_id     : Dashboard the tile belongs to.
    tile_id          : Tile identifier.
    chart_type       : The chart family used (bar, kpi, sparkline_kpi, ...).
    user_email_hash  : Pre-hashed email — do NOT hash again here.
    age_ms           : Age in milliseconds for delete events.
    """
    if event_type not in _VALID_TILE_EVENT_TYPES:
        logger.warning(
            "audit_trail.log_tile_event: unknown event_type %r — logging anyway",
            event_type,
        )
    entry = {
        "timestamp": _utc_now_iso(),
        "event_type": event_type,
        "dashboard_id": dashboard_id,
        "tile_id": tile_id,
    }
    if chart_type is not None:
        entry["chart_type"] = chart_type
    if user_email_hash is not None:
        entry["user_email_hash"] = user_email_hash
    if age_ms is not None:
        entry["age_ms"] = age_ms
    _append_entry(entry)


def get_recent_decisions(
    conn_id: Optional[str] = None,
    limit: int = 100,
) -> list:
    """
    Return the last *limit* entries from the audit log, optionally filtered
    by *conn_id*.

    Reads from the active (current) log file only. Rotated archives are not
    scanned — callers that need historical data should open them directly.

    Parameters
    ----------
    conn_id : If provided, only entries whose ``conn_id`` field matches are
              returned. If None, all entry types are returned.
    limit   : Maximum number of entries to return (counted after filtering).

    Returns
    -------
    list of dict — most recent entries first (reverse chronological).
    """
    active = _log_path()
    if not active.exists():
        return []

    try:
        with open(active, "r", encoding="utf-8") as fh:
            raw_lines = fh.readlines()
    except OSError:
        logger.exception("audit_trail.get_recent_decisions: cannot read %s", active)
        return []

    # Parse valid JSON lines; silently skip malformed ones.
    parsed: list[dict] = []
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        try:
            parsed.append(json.loads(line))
        except json.JSONDecodeError:
            logger.debug("audit_trail: skipping malformed line: %r", line[:120])

    # Filter by conn_id if requested.
    if conn_id is not None:
        parsed = [e for e in parsed if e.get("conn_id") == conn_id]

    # Return the last *limit* entries in reverse-chronological order.
    return list(reversed(parsed[-limit:]))


# ---------------------------------------------------------------------------
# Plan 7e — VizQL cache + batch audit events
# ---------------------------------------------------------------------------

_VALID_VIZQL_CACHE_EVENT_TYPES = frozenset({
    "hit_inprocess",
    "hit_external",
    "miss",
    "compiled_stored",
    "evicted",
    "invalidated",
})

_VALID_VIZQL_CACHE_TIERS = frozenset({"in_process", "external", "both"})


def log_vizql_cache_event(
    conn_id: str,
    event_type: str,
    key_hash: str,
    tier: str,
    reason: str,
) -> None:
    """Record a VizQL cache hit/miss/invalidation."""
    if event_type not in _VALID_VIZQL_CACHE_EVENT_TYPES:
        logger.warning(
            "audit_trail.log_vizql_cache_event: unknown event_type %r - logging anyway",
            event_type,
        )
    if tier not in _VALID_VIZQL_CACHE_TIERS:
        logger.warning(
            "audit_trail.log_vizql_cache_event: unknown tier %r - logging anyway",
            tier,
        )
    entry = {
        "timestamp": _utc_now_iso(),
        "conn_id": conn_id,
        "event_type": event_type,
        "key_hash": key_hash,
        "tier": tier,
        "reason": reason,
    }
    _append_entry(entry)


def log_vizql_batch_event(
    conn_id: str,
    total: int,
    hits: int,
    misses: int,
    distinct_misses: int,
    total_ms: float,
) -> None:
    """Record a dashboard ``QueryBatch`` probe outcome."""
    entry = {
        "timestamp": _utc_now_iso(),
        "conn_id": conn_id,
        "event_type": "vizql_batch",
        "total": int(total),
        "hits": int(hits),
        "misses": int(misses),
        "distinct_misses": int(distinct_misses),
        "total_ms": float(total_ms),
    }
    _append_entry(entry)


# ── H24 — monitoring-silent watchdog ──
import time as _time
from config import settings as _settings

_LAST_WRITE_TS = 0.0
_SILENCE_LOCK = threading.Lock()
_SILENT_CALLBACK = None


def _touch_last_write() -> None:
    global _LAST_WRITE_TS
    with _SILENCE_LOCK:
        _LAST_WRITE_TS = _time.time()


def _reset_last_write() -> None:
    global _LAST_WRITE_TS
    _LAST_WRITE_TS = 0.0


def _get_last_write_ts() -> float:
    return _LAST_WRITE_TS


def register_silence_watchdog(*, on_silent) -> None:
    global _SILENT_CALLBACK
    _SILENT_CALLBACK = on_silent


def _check_silence_now() -> None:
    if _SILENT_CALLBACK is None:
        return
    window = _settings.AUDIT_SILENCE_WINDOW_SECONDS
    now = _time.time()
    if _LAST_WRITE_TS == 0:
        if now > window:
            _SILENT_CALLBACK()
        return
    if now - _LAST_WRITE_TS > window:
        _SILENT_CALLBACK()
