"""Drift detector — mergers, fiscal mismatch (H12)."""
from drift_detector import (
    detect_fiscal_calendar_mismatch,
    detect_merger_pattern,
)


def test_fiscal_mismatch_fires_when_fiscal_start_not_january():
    sql = "SELECT DATE_TRUNC('year', signup_date) FROM users"
    result = detect_fiscal_calendar_mismatch(sql=sql, fiscal_year_start_month=7)
    assert result is not None
    assert "fiscal" in result.message.lower()


def test_fiscal_mismatch_does_not_fire_when_calendar_year():
    sql = "SELECT DATE_TRUNC('year', signup_date) FROM users"
    result = detect_fiscal_calendar_mismatch(sql=sql, fiscal_year_start_month=1)
    assert result is None


def test_fiscal_mismatch_does_not_fire_on_month_bucket():
    sql = "SELECT DATE_TRUNC('month', signup_date) FROM users"
    result = detect_fiscal_calendar_mismatch(sql=sql, fiscal_year_start_month=7)
    assert result is None


def test_merger_pattern_detects_null_shift():
    before = {"country_code": 0.0, "country_name": 0.0}
    after  = {"country_code": 0.0, "country_name": 1.0}
    result = detect_merger_pattern(
        null_rate_before=before, null_rate_after=after,
        rowcount_before=10_000, rowcount_after=10_000,
    )
    assert result is not None
    assert "country_name" in result.message


def test_no_merger_when_null_rates_stable():
    before = {"country_code": 0.01, "country_name": 0.01}
    after  = {"country_code": 0.02, "country_name": 0.01}
    result = detect_merger_pattern(
        null_rate_before=before, null_rate_after=after,
        rowcount_before=10_000, rowcount_after=10_000,
    )
    assert result is None
