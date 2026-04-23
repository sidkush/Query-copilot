"""H10 — Always-on result observability.

- empty_cause:      diagnose *why* a result came back empty
- truncation_warning: flag MAX_ROWS-capped truncation
- turbo_live_divergence: compare Turbo against a 1% live sanity sample
"""
from __future__ import annotations

from enum import Enum
from typing import Optional


class EmptyCause(Enum):
    NON_EMPTY = "non_empty"
    TABLE_EMPTY = "table_empty"
    PREDICATE_EMPTY = "predicate_empty"
    UNKNOWN = "unknown"


def empty_cause(row_count: int, sql: str, card) -> EmptyCause:
    if row_count is None:
        return EmptyCause.UNKNOWN
    if row_count > 0:
        return EmptyCause.NON_EMPTY
    if card is None:
        return EmptyCause.UNKNOWN
    base_rows = getattr(card, "row_count", None)
    if base_rows == 0:
        return EmptyCause.TABLE_EMPTY
    if base_rows and base_rows > 0 and "where" in (sql or "").lower():
        return EmptyCause.PREDICATE_EMPTY
    return EmptyCause.UNKNOWN


def truncation_warning(row_count: int, max_rows: int) -> Optional[str]:
    if row_count is None or max_rows is None:
        return None
    if row_count >= max_rows:
        return f"Result truncated at MAX_ROWS={max_rows:,}; actual total may be larger."
    return None


def turbo_live_divergence(
    turbo_rows: int,
    live_sample_rows: int,
    warn_pct: float = 10.0,
) -> Optional[str]:
    if not turbo_rows or not live_sample_rows:
        return None
    pct = abs(turbo_rows - live_sample_rows) / max(turbo_rows, 1) * 100
    if pct > warn_pct:
        return (
            f"Turbo↔Live divergence {pct:.1f}% exceeds warn threshold "
            f"{warn_pct:.1f}% — consider re-running live."
        )
    return None
