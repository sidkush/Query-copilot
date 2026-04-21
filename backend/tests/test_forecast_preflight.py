"""Plan 9c T2 — Forecast preflight: temporal validation + uniform-grid resampling."""
import math
import pytest
from datetime import datetime, timezone

from vizql.forecast import ForecastSpec
from vizql.forecast_preflight import (
    validate_series, build_uniform_index, _detect_unit, PreflightError,
)


def _spec(unit="auto"):
    return ForecastSpec(
        forecast_length=4, forecast_unit=unit, model="auto",
        season_length=None, confidence_level=0.95, ignore_last=0,
    )


def _ts(year, month=1, day=1):
    return datetime(year, month, day, tzinfo=timezone.utc).timestamp()


def test_validate_rejects_empty_series():
    with pytest.raises(PreflightError, match="empty"):
        validate_series([], _spec())


def test_validate_rejects_short_series():
    series = [{"t": _ts(2020 + i), "y": float(i)} for i in range(5)]
    with pytest.raises(PreflightError, match="at least 10"):
        validate_series(series, _spec())


def test_validate_rejects_missing_temporal_field():
    series = [{"x": i, "y": float(i)} for i in range(20)]
    with pytest.raises(PreflightError, match="temporal"):
        validate_series(series, _spec())


def test_validate_rejects_non_numeric_y():
    series = [{"t": _ts(2020 + i), "y": "abc"} for i in range(20)]
    with pytest.raises(PreflightError, match="numeric"):
        validate_series(series, _spec())


def test_validate_rejects_horizon_exceeds_cap():
    series = [{"t": _ts(2020 + i), "y": float(i)} for i in range(20)]
    spec = ForecastSpec(
        forecast_length=999, forecast_unit="years", model="auto",
        season_length=None, confidence_level=0.95, ignore_last=0,
    )
    with pytest.raises(PreflightError, match="FORECAST_MAX_HORIZON"):
        validate_series(series, spec, max_horizon=200)


def test_detect_unit_yearly():
    ts = [_ts(2010 + i) for i in range(20)]
    assert _detect_unit(ts) == "years"


def test_detect_unit_monthly():
    ts = [_ts(2010, ((i % 12) + 1), 1) + i // 12 * 365 * 86400 for i in range(24)]
    assert _detect_unit(ts) == "months"


def test_build_uniform_index_fills_gaps_with_nan():
    series = [
        {"t": _ts(2020), "y": 1.0},
        {"t": _ts(2021), "y": 2.0},
        # gap: 2022 missing
        {"t": _ts(2023), "y": 4.0},
    ]
    ts, y = build_uniform_index(series, unit="years")
    assert len(ts) == 4
    assert y[0] == 1.0
    assert y[1] == 2.0
    assert math.isnan(y[2])
    assert y[3] == 4.0
