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


from vizql.forecast_engine import fit_auto, _detect_season_length


def test_fit_auto_returns_eight_candidates_and_one_best():
    rng = np.random.default_rng(0)
    y = (np.arange(60) * 0.5 + rng.normal(0, 0.5, 60)).tolist()
    best, candidates = fit_auto(y, season_length=4, ignore_last=0)
    assert len(candidates) == 8
    aics = [c.aic for c in candidates if math.isfinite(c.aic)]
    assert best.aic == min(aics)


def test_fit_auto_picks_trend_model_for_trending_data():
    rng = np.random.default_rng(0)
    y = (np.arange(80) * 0.5 + rng.normal(0, 0.3, 80)).tolist()
    best, _ = fit_auto(y, season_length=4, ignore_last=0)
    # Trend models contain 'A' or 'M' in slot 1 (not 'N').
    assert best.kind[1] != "N", f"expected trend model, got {best.kind}"


def test_fit_auto_picks_seasonal_model_for_seasonal_data():
    n = 96
    season = np.tile(np.array([1.0, 4.0, 2.0, 5.0]), n // 4)
    rng = np.random.default_rng(0)
    y = (season + rng.normal(0, 0.1, n)).tolist()
    best, _ = fit_auto(y, season_length=4, ignore_last=0)
    # Seasonal models contain 'A' or 'M' in slot 2 (not 'N').
    assert best.kind[2] != "N", f"expected seasonal model, got {best.kind}"


def test_fit_auto_skips_multiplicative_for_negative_data():
    rng = np.random.default_rng(0)
    y = rng.normal(0, 1, 60).tolist()  # contains negatives
    best, candidates = fit_auto(y, season_length=4, ignore_last=0)
    # Multiplicative variants (M in slot 0/1/2) must be marked aic=inf.
    for c in candidates:
        if "M" in c.kind:
            assert not math.isfinite(c.aic), f"mul kind {c.kind} should be inf"
    assert "M" not in best.kind


def test_detect_season_length_recovers_period_12():
    n = 240
    t = np.arange(n)
    y = (np.sin(2 * np.pi * t / 12) + 0.1 * np.random.default_rng(0).normal(0, 1, n))
    p = _detect_season_length(y.tolist(), candidates=(4, 7, 12, 24, 52))
    assert p == 12
