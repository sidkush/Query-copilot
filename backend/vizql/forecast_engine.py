"""Plan 9c — Forecast engine (Holt-Winters ETS + AIC selection).

Tableau parity (Build_Tableau SXIII.3): try 8 ETS models from the
Hyndman taxonomy, select by AIC, compute prediction intervals via
Hyndman's formula. Uses statsmodels.tsa.exponential_smoothing.ets
(proper ETS class with explicit error type).

This file builds in 3 layers:
  T3 — fit_one (single model + AIC math)
  T4 — fit_auto (8-model search + best-by-AIC + season detection)
  T5 — confidence bands + fit_all factor dispatcher
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
from statsmodels.tsa.exponential_smoothing.ets import ETSModel

from vizql.forecast import ForecastModelFit


# Hyndman taxonomy: (Error, Trend, Seasonal). Brief-mandated 8-tuple.
_MODEL_KINDS: Tuple[str, ...] = (
    "AAA", "AAM", "AMA", "AMM", "ANA", "ANM", "ANN", "MNN",
)


# Module-level association of ForecastModelFit -> trained statsmodels result.
# `ForecastModelFit` is `frozen=True, slots=True`, so we cannot stash the
# result as an attribute. Keyed by `id(fit)`; entry lives until the fit is
# released. Because the lifecycle is bounded (a single `fit_all` call),
# leakage is bounded; callers may invoke `_clear_sm_result(fit)` to evict
# explicitly when finished.
_SM_RESULT_CACHE: Dict[int, Any] = {}


def _register_sm_result(fit: ForecastModelFit, res: Any) -> None:
    _SM_RESULT_CACHE[id(fit)] = res


def _get_sm_result(fit: ForecastModelFit) -> Optional[Any]:
    return _SM_RESULT_CACHE.get(id(fit))


def _clear_sm_result(fit: ForecastModelFit) -> None:
    _SM_RESULT_CACHE.pop(id(fit), None)


def _decode(kind: str) -> Tuple[str, Optional[str], Optional[str]]:
    """Return (error, trend, seasonal) statsmodels strings for an ETS kind."""
    e_map = {"A": "add", "M": "mul"}
    ts_map = {"A": "add", "M": "mul", "N": None}
    return e_map[kind[0]], ts_map[kind[1]], ts_map[kind[2]]


def _compute_aic(sse: float, n: int, n_params: int) -> float:
    """AIC = 2k + n*ln(SSE/n). Brief-mandated formula.

    When SSE == 0 (perfect fit), substitute a tiny epsilon to keep AIC
    finite — a perfect fit is suspicious anyway, but should not crash
    the auto-selector.
    """
    if n <= 0:
        return float("inf")
    if sse <= 0.0:
        sse = 1e-12
    return 2 * n_params + n * math.log(sse / n)


def _param_count(kind: str, season_length: Optional[int]) -> int:
    """Count free parameters for AIC. error=1 always; trend adds beta;
    seasonal adds gamma + (season_length-1) initial seasonal levels."""
    _, trend, seasonal = _decode(kind)
    k = 2  # alpha + initial level
    if trend is not None:
        k += 2  # beta + initial trend
    if seasonal is not None and season_length is not None:
        k += 1 + season_length  # gamma + initial seasonal vector
    return k


def _extract_smoothing_param(res: Any, name: str) -> Optional[float]:
    """Read a smoothing param (alpha/beta/gamma) from a statsmodels result.

    statsmodels ETS exposes params via `res.params`, which may be a pandas
    Series, a numpy array (via `mle_retvals`), or a dict-like. Try the
    most common shapes; return None if not found.
    """
    params = getattr(res, "params", None)
    if params is None:
        return None
    # pandas Series with .index
    try:
        idx = getattr(params, "index", None)
        if idx is not None and name in list(idx):
            return float(params[name])
    except Exception:  # noqa: BLE001
        pass
    # dict-like
    try:
        if hasattr(params, "get"):
            v = params.get(name)
            if v is not None:
                return float(v)
    except Exception:  # noqa: BLE001
        pass
    # named-tuple / mapping fallback
    try:
        v = getattr(params, name)
        return float(v)
    except Exception:  # noqa: BLE001
        return None


def fit_one(
    y: Sequence[float],
    kind: str,
    season_length: Optional[int],
    ignore_last: int,
) -> Tuple[ForecastModelFit, List[float], List[float]]:
    """Fit a single ETS model. Return (fit-summary, fitted_values, residuals)."""
    if kind not in _MODEL_KINDS:
        raise ValueError(f"unknown model kind {kind!r}")
    error, trend, seasonal = _decode(kind)
    if seasonal is not None and (season_length is None or season_length < 2):
        raise ValueError(f"kind={kind} requires season_length >= 2")

    arr = np.asarray(y, dtype=float)
    if ignore_last > 0:
        arr = arr[:-ignore_last] if ignore_last < len(arr) else arr[:0]
    if arr.size < 4:
        raise ValueError("insufficient samples after ignore_last")

    # Multiplicative requires strictly positive y.
    if (error == "mul" or trend == "mul" or seasonal == "mul"):
        if np.nanmin(arr) <= 0:
            raise ValueError(f"kind={kind} requires positive y values")

    model = ETSModel(
        arr,
        error=error,
        trend=trend,
        seasonal=seasonal,
        seasonal_periods=season_length if seasonal is not None else None,
        initialization_method="estimated",
    )
    res = model.fit(disp=False)

    fitted = np.asarray(res.fittedvalues, dtype=float)
    residuals = arr - fitted
    sse = float(np.nansum(residuals ** 2))
    n_obs = int(np.sum(~np.isnan(residuals)))
    n_params = _param_count(kind, season_length)
    aic = _compute_aic(sse, n_obs, n_params)
    rmse = float(math.sqrt(sse / max(1, n_obs)))
    abs_residuals = np.abs(residuals)
    mae = float(np.nanmean(abs_residuals))
    nonzero = arr != 0
    if np.any(nonzero):
        mape = float(np.nanmean(abs_residuals[nonzero] / np.abs(arr[nonzero])) * 100.0)
    else:
        mape = float("inf")

    alpha = _extract_smoothing_param(res, "smoothing_level")
    beta = _extract_smoothing_param(res, "smoothing_trend")
    gamma = _extract_smoothing_param(res, "smoothing_seasonal")

    fit = ForecastModelFit(
        kind=kind, alpha=alpha, beta=beta, gamma=gamma,
        sse=sse, aic=aic, rmse=rmse, mae=mae, mape=mape,
    )
    # Stash the fit result in a module-level cache so the confidence-band
    # step (T5) can re-use the trained statsmodels object without re-fitting.
    _register_sm_result(fit, res)
    return fit, fitted.tolist(), residuals.tolist()


def _detect_season_length(
    y: Sequence[float],
    candidates: Sequence[int] = (4, 7, 12, 24, 52),
) -> int:
    """Pick season period via FFT autocorrelation peak among candidates."""
    arr = np.asarray(y, dtype=float)
    arr = arr[~np.isnan(arr)]
    if arr.size < max(candidates) * 2:
        return min(candidates)
    arr = arr - arr.mean()
    n = arr.size
    # Real FFT autocorrelation: ifft(|fft|^2) / n.
    fft = np.fft.rfft(arr, n=2 * n)
    acf = np.fft.irfft(fft * np.conj(fft), n=2 * n)[:n].real
    if acf[0] > 0:
        acf = acf / acf[0]
    best_p = candidates[0]
    best_score = -math.inf
    for p in candidates:
        if p < n:
            score = float(acf[p])
            if score > best_score:
                best_score = score
                best_p = p
    return best_p


def fit_auto(
    y: Sequence[float],
    season_length: Optional[int],
    ignore_last: int,
) -> Tuple[ForecastModelFit, List[ForecastModelFit]]:
    """Fit all 8 ETS kinds; return (best, all_candidates) sorted by AIC."""
    candidates: List[ForecastModelFit] = []
    arr = np.asarray(y, dtype=float)
    has_nonpositive = bool(np.any(arr <= 0))
    if season_length is None:
        season_length = _detect_season_length(y)
    for kind in _MODEL_KINDS:
        if has_nonpositive and "M" in kind:
            sentinel = ForecastModelFit(
                kind=kind, alpha=None, beta=None, gamma=None,
                sse=float("inf"), aic=float("inf"),
                rmse=float("inf"), mae=float("inf"), mape=float("inf"),
            )
            candidates.append(sentinel)
            continue
        try:
            fit, _, _ = fit_one(y, kind=kind, season_length=season_length, ignore_last=ignore_last)
            candidates.append(fit)
        except (ValueError, RuntimeError, np.linalg.LinAlgError, Exception):  # noqa: BLE001
            sentinel = ForecastModelFit(
                kind=kind, alpha=None, beta=None, gamma=None,
                sse=float("inf"), aic=float("inf"),
                rmse=float("inf"), mae=float("inf"), mape=float("inf"),
            )
            candidates.append(sentinel)

    finite = [c for c in candidates if math.isfinite(c.aic)]
    if not finite:
        raise ValueError("no ETS model converged for this series")
    best = min(finite, key=lambda c: c.aic)
    candidates_sorted = sorted(candidates, key=lambda c: c.aic)
    return best, candidates_sorted
