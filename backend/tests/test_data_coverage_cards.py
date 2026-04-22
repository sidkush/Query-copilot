"""Unit tests: DataCoverageCard dataclasses and JSON round-trip."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from data_coverage import (
    DataCoverageCard,
    DateCoverage,
    CategoricalCoverage,
    card_to_dict,
    dict_to_card,
)


def test_date_coverage_fields():
    dc = DateCoverage(
        column="started_at",
        min_value="2023-12-01",
        max_value="2025-10-28",
        distinct_months=23,
        span_days=698,
    )
    assert dc.column == "started_at"
    assert dc.distinct_months == 23


def test_categorical_coverage_fields():
    cc = CategoricalCoverage(
        column="rider_type",
        distinct_count=2,
        sample_values=["member", "casual"],
    )
    assert cc.distinct_count == 2
    assert cc.sample_values == ["member", "casual"]


def test_card_roundtrip():
    card = DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage(
            column="started_at",
            min_value="2023-12-01",
            max_value="2025-10-28",
            distinct_months=23,
            span_days=698,
        )],
        categorical_columns=[CategoricalCoverage(
            column="rider_type",
            distinct_count=2,
            sample_values=["member", "casual"],
        )],
        computed_at=datetime(2026, 4, 29, 12, 0, tzinfo=timezone.utc),
        dialect="sqlite",
    )
    blob = json.dumps(card_to_dict(card), sort_keys=True)
    restored = dict_to_card(json.loads(blob))
    assert restored == card


def test_empty_table_card():
    card = DataCoverageCard(
        table_name="empty",
        row_count=0,
        date_columns=[],
        categorical_columns=[],
        computed_at=datetime(2026, 4, 29, tzinfo=timezone.utc),
        dialect="sqlite",
    )
    blob = card_to_dict(card)
    assert blob["row_count"] == 0
    assert blob["date_columns"] == []
