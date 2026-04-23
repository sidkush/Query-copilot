"""Ring 5 — ProvenanceChip.

Every agent result carries one chip with accurate trust metadata rendered
BEFORE the first streamed token. Four canonical shapes:

  Live · <N> rows
  Turbo · <M>m stale · est. <N>
  Sample <P>% (stratified on {col}) · <N> ±<E>
  Unverified scope · <reason>

Multi-table joins: staleness = worst across all referenced tables.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional


class TrustStamp(Enum):
    LIVE = "live"
    TURBO = "turbo"
    SAMPLE = "sample"
    UNVERIFIED = "unverified"


@dataclass(frozen=True)
class ProvenanceChip:
    trust: TrustStamp
    label: str                     # human-readable single line
    row_count: Optional[int] = None
    staleness_seconds: Optional[int] = None
    sample_pct: Optional[float] = None
    stratified_on: Optional[str] = None
    margin_of_error: Optional[int] = None
    reason: Optional[str] = None
    details: dict = field(default_factory=dict)


def _fmt_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s stale"
    m = seconds // 60
    if m < 60:
        return f"{m}m stale"
    h = m // 60
    return f"{h}h stale"


def build_live_chip(row_count: int) -> ProvenanceChip:
    return ProvenanceChip(
        trust=TrustStamp.LIVE,
        label=f"Live · {row_count:,} rows",
        row_count=row_count,
    )


def build_turbo_chip(row_count: int, staleness_seconds: int) -> ProvenanceChip:
    return ProvenanceChip(
        trust=TrustStamp.TURBO,
        label=f"Turbo · {_fmt_duration(staleness_seconds)} · est. {row_count:,}",
        row_count=row_count,
        staleness_seconds=staleness_seconds,
    )


def build_sample_chip(
    row_count: int,
    sample_pct: float,
    stratified_on: Optional[str] = None,
    margin_of_error: Optional[int] = None,
) -> ProvenanceChip:
    parts = [f"Sample {sample_pct:g}%"]
    if stratified_on:
        parts.append(f"(stratified on {stratified_on})")
    parts.append(f"· {row_count:,}")
    if margin_of_error is not None:
        parts.append(f"±{margin_of_error}")
    return ProvenanceChip(
        trust=TrustStamp.SAMPLE,
        label=" ".join(parts),
        row_count=row_count,
        sample_pct=sample_pct,
        stratified_on=stratified_on,
        margin_of_error=margin_of_error,
    )


def build_unverified_chip(reason: str) -> ProvenanceChip:
    return ProvenanceChip(
        trust=TrustStamp.UNVERIFIED,
        label=f"Unverified scope · {reason}",
        reason=reason,
    )


def worst_staleness(table_snapshots, now=None) -> timedelta:
    if now is None:
        now = datetime.now(timezone.utc)
    max_delta = timedelta(0)
    for _name, snap in table_snapshots:
        if snap is None:
            continue
        if snap.tzinfo is None:
            snap = snap.replace(tzinfo=timezone.utc)
        delta = now - snap
        if delta > max_delta:
            max_delta = delta
    return max_delta


def chip_to_sse_payload(chip: ProvenanceChip) -> dict:
    return {
        "trust": chip.trust.value,
        "label": chip.label,
        "row_count": chip.row_count,
        "staleness_seconds": chip.staleness_seconds,
        "sample_pct": chip.sample_pct,
        "stratified_on": chip.stratified_on,
        "margin_of_error": chip.margin_of_error,
        "reason": chip.reason,
    }
