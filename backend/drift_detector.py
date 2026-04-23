"""H12 — DriftDetector.

Deterministic checks applied against Phase-B card deltas + user SQL:
  1. Merger pattern: column goes null-dominant while another grows.
  2. Fiscal-calendar mismatch: tenant fiscal year != Jan, but SQL uses DATE_TRUNC('year', ...).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DriftFinding:
    kind: str               # "merger", "denorm", "fiscal_mismatch"
    message: str
    evidence: dict


def detect_fiscal_calendar_mismatch(sql: str, fiscal_year_start_month: int = 1):
    if fiscal_year_start_month == 1:
        return None
    lc = sql.lower()
    if "date_trunc('year'" in lc or 'date_trunc("year"' in lc:
        return DriftFinding(
            kind="fiscal_mismatch",
            message=(
                f"SQL uses calendar-year bucketing but tenant fiscal year starts "
                f"in month {fiscal_year_start_month}. Results may mis-align fiscal quarters."
            ),
            evidence={"fiscal_year_start_month": fiscal_year_start_month},
        )
    return None


def detect_merger_pattern(
    null_rate_before: dict,
    null_rate_after: dict,
    rowcount_before: int,
    rowcount_after: int,
):
    if rowcount_before <= 0 or rowcount_after <= 0:
        return None
    for col, rate_after in null_rate_after.items():
        rate_before = null_rate_before.get(col, 0.0)
        if rate_before < 0.1 and rate_after > 0.9:
            return DriftFinding(
                kind="merger",
                message=(
                    f"Column {col!r} went from {rate_before:.0%} null to {rate_after:.0%} null — "
                    f"possible schema merger or column deprecation."
                ),
                evidence={"column": col, "before": rate_before, "after": rate_after},
            )
    return None
