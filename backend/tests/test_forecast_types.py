"""Plan 9c T1 — ForecastSpec / ForecastModelFit / ForecastResult dataclass round-trip + validation."""
import pytest

from vizql.forecast import ForecastSpec, ForecastModelFit, ForecastResult


def test_spec_round_trip():
    spec = ForecastSpec(
        forecast_length=12,
        forecast_unit="months",
        model="auto",
        season_length=None,
        confidence_level=0.95,
        ignore_last=0,
    )
    assert ForecastSpec.from_dict(spec.to_dict()) == spec


def test_spec_rejects_unknown_unit():
    with pytest.raises(ValueError, match="forecast_unit"):
        ForecastSpec(
            forecast_length=12, forecast_unit="fortnights", model="auto",
            season_length=None, confidence_level=0.95, ignore_last=0,
        ).validate()


def test_spec_rejects_bad_confidence_level():
    with pytest.raises(ValueError, match="confidence_level"):
        ForecastSpec(
            forecast_length=12, forecast_unit="months", model="auto",
            season_length=None, confidence_level=0.80, ignore_last=0,
        ).validate()


def test_spec_rejects_non_positive_horizon():
    with pytest.raises(ValueError, match="forecast_length"):
        ForecastSpec(
            forecast_length=0, forecast_unit="months", model="auto",
            season_length=None, confidence_level=0.95, ignore_last=0,
        ).validate()


def test_spec_rejects_negative_ignore_last():
    with pytest.raises(ValueError, match="ignore_last"):
        ForecastSpec(
            forecast_length=12, forecast_unit="months", model="auto",
            season_length=None, confidence_level=0.95, ignore_last=-1,
        ).validate()


def test_spec_custom_model_requires_season_length():
    with pytest.raises(ValueError, match="season_length"):
        ForecastSpec(
            forecast_length=12, forecast_unit="months", model="additive",
            season_length=None, confidence_level=0.95, ignore_last=0,
        ).validate()


def test_modelfit_round_trip():
    fit = ForecastModelFit(
        kind="AAA", alpha=0.5, beta=0.1, gamma=0.2,
        sse=10.0, aic=42.0, rmse=1.0, mae=0.8, mape=5.0,
    )
    assert ForecastModelFit.from_dict(fit.to_dict()) == fit


def test_result_round_trip():
    fit = ForecastModelFit(
        kind="ANN", alpha=0.5, beta=None, gamma=None,
        sse=1.0, aic=10.0, rmse=0.5, mae=0.4, mape=2.0,
    )
    res = ForecastResult(
        best_model=fit,
        forecasts=[{"t": 100.0, "y": 1.0, "lower": 0.5, "upper": 1.5}],
        actuals=[{"t": 99.0, "y": 0.9}],
        model_candidates=[fit],
    )
    assert ForecastResult.from_dict(res.to_dict()) == res
