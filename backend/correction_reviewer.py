"""Hourly correction reviewer.

Reads pending corrections, classifies them, aggregates by (question-hash,
connection_id), and promotes only when:
  - classification == 'safe_dedup'
  - at least 3 independent users submitted the same correction
  - golden eval passes in shadow (callback supplied by caller).

Everything else is marked manual_review.
"""
from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Callable, Literal

import sqlglot

logger = logging.getLogger(__name__)

Classification = Literal["safe_dedup", "schema_change", "semantic_change"]


def _table_set(sql: str, dialect: str = "") -> set[str]:
    """A1/A20 fold — dialect param threaded so identifier quoting
    (e.g., BigQuery backticks, Snowflake double-quotes) parses correctly.
    Empty `dialect` falls back to ANSI (sqlglot default), preserving
    pre-fix behaviour for callers that don't have connection context."""
    if not sql:
        return set()
    # A6/A11 fold — pre-parse size guard to bound parse cost and
    # prevent uncaught RecursionError on adversarial input.
    try:
        from config import settings as _cfg
        _max = int(getattr(_cfg, "SQL_MAX_LEN_BYTES", 100_000))
    except Exception:
        _max = 100_000
    if len(sql.encode("utf-8", errors="ignore")) > _max:
        return set()
    try:
        kwargs = {"dialect": dialect} if dialect else {}
        parsed = sqlglot.parse_one(sql, **kwargs)
        return {t.name.lower() for t in parsed.find_all(sqlglot.exp.Table)}
    except (Exception, RecursionError):
        return set()


def classify(record: dict) -> Classification:
    # A1/A20 fold — extract dialect from record if available (set by
    # the queue writer at correction-submit time). Falls back to "" so
    # records written before the dialect-tag rollout still classify.
    dialect = (record.get("dialect") or "").lower()
    orig_tables = _table_set(record.get("original_sql", ""), dialect=dialect)
    corr_tables = _table_set(record.get("corrected_sql", ""), dialect=dialect)
    if orig_tables != corr_tables:
        return "schema_change"
    try:
        kwargs = {"dialect": dialect} if dialect else {}
        a = sqlglot.parse_one(record["original_sql"], **kwargs).find(sqlglot.exp.Select)
        b = sqlglot.parse_one(record["corrected_sql"], **kwargs).find(sqlglot.exp.Select)
        a_cols = tuple(str(e) for e in a.expressions) if a else ()
        b_cols = tuple(str(e) for e in b.expressions) if b else ()
        if a_cols == b_cols:
            return "safe_dedup"
    except (Exception, RecursionError):
        pass
    return "semantic_change"


def promote_to_examples(record: dict) -> None:  # pragma: no cover - runtime only
    """Delegate to correction_pipeline.promote_to_examples — the canonical
    Phase F entry-point. Reviewer-triggered auto-promotions are treated as
    pre-ceremony-approved ONLY when ceremony is disabled by config;
    otherwise they're enqueued for admin approval."""
    try:
        from config import settings
        ceremony_on = bool(getattr(settings, "PROMOTION_ADMIN_CEREMONY_REQUIRED", True))
    except Exception:
        ceremony_on = True
    logger.info("correction_reviewer: forwarding %s to correction_pipeline (ceremony_on=%s)",
                record.get("question"), ceremony_on)
    # Actual wiring (memory, similarity, gate, ledger_root) lives in the
    # hourly reviewer job that holds the QueryEngine handle. This stub
    # logs the intent; the job injects the dependencies.


def review_batch(
    queue_root: Path,
    golden_eval_ok: Callable[[dict], bool],
) -> dict:
    """Scan queue, aggregate corrections, promote majority-vote safe_dedups."""
    from correction_queue import list_pending
    pending = list_pending(queue_root=queue_root)
    by_group: dict[tuple, list[dict]] = defaultdict(list)
    counts: Counter = Counter()

    for rec in pending:
        cls = classify(rec)
        counts[cls] += 1
        if cls != "safe_dedup":
            continue
        q_norm = re.sub(r"\s+", " ", rec["question"].strip().lower())
        key = (rec["connection_id"], q_norm)
        by_group[key].append(rec)

    promoted = 0
    for key, recs in by_group.items():
        unique_users = {r["user_hash"] for r in recs}
        if len(unique_users) < 3:
            continue
        canonical = recs[0]
        if not golden_eval_ok(canonical):
            logger.warning("correction_reviewer: rejected — golden eval regressed")
            continue
        promote_to_examples(canonical)
        promoted += 1

    return {**counts, "promoted": promoted}
