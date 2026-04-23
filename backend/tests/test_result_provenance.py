"""result_provenance — empty-cause + truncation + Turbo/Live cross-check (H10)."""
from datetime import datetime, timezone

from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from result_provenance import (
    empty_cause, truncation_warning, turbo_live_divergence,
    EmptyCause,
)


def _card(rows=500):
    return DataCoverageCard(
        table_name="trips",
        row_count=rows,
        date_columns=[DateCoverage("started_at", "2024-01-01", "2025-10-28", 22, 670)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 5, 10, tzinfo=timezone.utc),
        dialect="sqlite",
    )


def test_empty_cause_table_empty():
    cause = empty_cause(row_count=0, sql="SELECT * FROM trips", card=_card(rows=0))
    assert cause is EmptyCause.TABLE_EMPTY


def test_empty_cause_predicate_empty():
    cause = empty_cause(row_count=0, sql="SELECT * FROM trips WHERE rider_type='unicorn'", card=_card(rows=500))
    assert cause is EmptyCause.PREDICATE_EMPTY


def test_empty_cause_not_empty_when_row_count_positive():
    cause = empty_cause(row_count=5, sql="SELECT * FROM trips", card=_card())
    assert cause is EmptyCause.NON_EMPTY


def test_truncation_warning_fires_when_at_cap():
    w = truncation_warning(row_count=1000, max_rows=1000)
    assert w is not None
    assert "truncated" in w.lower()


def test_truncation_warning_none_when_under_cap():
    assert truncation_warning(row_count=500, max_rows=1000) is None


def test_turbo_live_divergence_returns_warning_on_big_delta():
    w = turbo_live_divergence(turbo_rows=1000, live_sample_rows=700, warn_pct=10.0)
    assert w is not None
    assert "divergence" in w.lower()


def test_turbo_live_divergence_none_within_threshold():
    assert turbo_live_divergence(turbo_rows=1000, live_sample_rows=950, warn_pct=10.0) is None


def test_turbo_live_divergence_handles_zero_turbo():
    assert turbo_live_divergence(turbo_rows=0, live_sample_rows=0, warn_pct=10.0) is None
