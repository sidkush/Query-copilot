"""Plan 9c T3 — Single ETS fit + AIC computation."""
import math
import numpy as np
import pytest

from vizql.forecast_engine import fit_one, _compute_aic, _MODEL_KINDS


def _ar1_series(n=120, phi=0.7, seed=0):
    rng = np.random.default_rng(seed)
    y = np.zeros(n)
    for i in range(1, n):
        y[i] = phi * y[i - 1] + rng.normal(0, 1)
    return y.tolist()


def test_compute_aic_formula():
    # AIC = 2k + n*ln(SSE/n)
    n, k, sse = 100, 3, 50.0
    expected = 2 * k + n * math.log(sse / n)
    assert _compute_aic(sse, n, k) == pytest.approx(expected, rel=1e-9)


def test_compute_aic_handles_zero_sse():
    assert math.isfinite(_compute_aic(0.0, 100, 3))


def test_fit_one_ann_returns_kind_and_aic():
    y = _ar1_series()
    fit, fitted_values, residuals = fit_one(y, kind="ANN", season_length=None, ignore_last=0)
    assert fit.kind == "ANN"
    assert math.isfinite(fit.aic)
    assert math.isfinite(fit.sse)
    assert math.isfinite(fit.rmse)
    assert len(fitted_values) == len(y)
    assert len(residuals) == len(y)


def test_fit_one_aaa_with_seasonality():
    rng = np.random.default_rng(0)
    n = 60
    season = np.tile(np.array([1.0, 2.0, 3.0, 1.5]), n // 4)
    trend = 0.5 * np.arange(n)
    y = (trend + season + rng.normal(0, 0.1, n)).tolist()
    fit, _, _ = fit_one(y, kind="AAA", season_length=4, ignore_last=0)
    assert fit.kind == "AAA"
    assert math.isfinite(fit.aic)


def test_fit_one_ignore_last_drops_n_points():
    y = _ar1_series()
    fit_full, fv_full, _ = fit_one(y, kind="ANN", season_length=None, ignore_last=0)
    fit_partial, fv_partial, _ = fit_one(y, kind="ANN", season_length=None, ignore_last=5)
    # Partial fit sees fewer points (5 dropped from end).
    assert len(fv_partial) == len(y) - 5
    assert len(fv_full) == len(y)


def test_model_kinds_constant_has_eight_entries():
    assert len(_MODEL_KINDS) == 8
    assert set(_MODEL_KINDS) == {"AAA", "AAM", "AMA", "AMM", "ANA", "ANM", "ANN", "MNN"}
