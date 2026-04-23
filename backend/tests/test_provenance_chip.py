"""ProvenanceChip — 4 shapes + multi-table staleness."""
from datetime import datetime, timedelta, timezone

import pytest

from provenance_chip import (
    ProvenanceChip, TrustStamp, build_live_chip, build_turbo_chip,
    build_sample_chip, build_unverified_chip, worst_staleness,
)


def test_live_chip_shape():
    chip = build_live_chip(row_count=4832)
    assert chip.trust is TrustStamp.LIVE
    assert chip.row_count == 4832
    assert "live" in chip.label.lower()


def test_turbo_chip_includes_staleness():
    chip = build_turbo_chip(row_count=4830, staleness_seconds=180)
    assert chip.trust is TrustStamp.TURBO
    assert "3m stale" in chip.label.lower() or "3 min" in chip.label.lower()


def test_sample_chip_includes_stratum_and_margin():
    chip = build_sample_chip(
        row_count=4500,
        sample_pct=1.0,
        stratified_on="region",
        margin_of_error=200,
    )
    assert chip.trust is TrustStamp.SAMPLE
    assert "1%" in chip.label
    assert "region" in chip.label.lower()
    assert "200" in chip.label


def test_unverified_chip_when_expression_predicate():
    chip = build_unverified_chip(reason="expression predicate")
    assert chip.trust is TrustStamp.UNVERIFIED
    assert "unverified" in chip.label.lower()


def test_worst_staleness_picks_largest_value():
    now = datetime.now(timezone.utc)
    stale_inputs = [
        ("orders", now - timedelta(minutes=1)),
        ("users",  now - timedelta(minutes=30)),
        ("items",  now - timedelta(minutes=5)),
    ]
    worst = worst_staleness(stale_inputs, now=now)
    assert 1700 < worst.total_seconds() < 1900


def test_worst_staleness_handles_none_values():
    now = datetime.now(timezone.utc)
    stale_inputs = [("live_tbl", None), ("orders", now - timedelta(minutes=10))]
    worst = worst_staleness(stale_inputs, now=now)
    assert worst.total_seconds() >= 600
