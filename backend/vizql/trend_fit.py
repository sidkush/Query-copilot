"""Plan 9b — Least-squares fit engine.

Tableau-parity: `TrendLineFitType` ∈ {Linear, Logarithmic, Exponential,
Power, Polynomial(2..8)}. Build_Tableau §XIII.2 requires R² / p-value /
SSE surfaced per factor. We surface RMSE too (cheap, widely expected).

All fits share the R²/p-value/SSE helper. Transform-based fits
(log/exp/power in T3) reuse the linear path after a domain-legal
transform.
"""
from __future__ import annotations

from typing import List, Sequence

import numpy as np
from scipy import stats

from vizql.trend_line import TrendFitResult


def _require_min_samples(x: Sequence[float], min_n: int) -> np.ndarray:
    arr = np.asarray(x, dtype=float)
    if arr.shape[0] < min_n:
        raise ValueError(f"need at least {min_n} samples, got {arr.shape[0]}")
    return arr


def _compute_stats(y_true: np.ndarray, y_pred: np.ndarray, n_params: int) -> tuple[float, float, float, float]:
    """Return (r_squared, p_value, sse, rmse).

    R² = 1 - SSE/SST, clamped to 0 when SST = 0 (constant y).
    P-value via F-test of the fitted model vs the null (intercept-only).
    Degrees of freedom: df_model = n_params - 1; df_resid = n - n_params.
    When df_resid ≤ 0 (overparameterised exact fit) we return p = 0 and
    R² = 1.
    """
    n = y_true.shape[0]
    residuals = y_true - y_pred
    sse = float(np.sum(residuals ** 2))
    sst = float(np.sum((y_true - np.mean(y_true)) ** 2))
    if sst == 0.0:
        r2 = 0.0
    else:
        r2 = max(0.0, 1.0 - sse / sst)
    df_model = max(1, n_params - 1)
    df_resid = n - n_params
    if df_resid <= 0 or sse == 0.0:
        p_value = 0.0 if r2 > 0 else float("inf")
    else:
        ssr = max(0.0, sst - sse)
        f_stat = (ssr / df_model) / (sse / df_resid)
        p_value = float(stats.f.sf(f_stat, df_model, df_resid))
    rmse = float(np.sqrt(sse / max(1, n)))
    return r2, p_value, sse, rmse


def _format_linear_equation(slope: float, intercept: float) -> str:
    return f"y = {slope:.4f}*x + {intercept:.4f}"


def _format_polynomial_equation(coeffs: Sequence[float]) -> str:
    # coeffs are highest-power-first (numpy.polyfit convention).
    degree = len(coeffs) - 1
    terms = []
    for i, c in enumerate(coeffs):
        power = degree - i
        if power == 0:
            terms.append(f"{c:+.4f}")
        elif power == 1:
            terms.append(f"{c:+.4f}*x")
        else:
            terms.append(f"{c:+.4f}*x^{power}")
    return "y = " + " ".join(terms).lstrip("+ ")


def fit_linear(x: Sequence[float], y: Sequence[float]) -> TrendFitResult:
    """y = a*x + b via least-squares."""
    xa = _require_min_samples(x, 2)
    ya = np.asarray(y, dtype=float)
    if ya.shape != xa.shape:
        raise ValueError("x and y must have the same length")

    coeffs = np.polyfit(xa, ya, 1)  # [slope, intercept]
    y_pred = np.polyval(coeffs, xa)
    r2, p_value, sse, rmse = _compute_stats(ya, y_pred, n_params=2)
    preds = [{"x": float(xi), "y": float(yi)} for xi, yi in zip(xa, y_pred)]
    return TrendFitResult(
        coefficients=[float(c) for c in coeffs],
        r_squared=r2,
        p_value=p_value,
        sse=sse,
        rmse=rmse,
        equation=_format_linear_equation(float(coeffs[0]), float(coeffs[1])),
        predictions=preds,
    )


def fit_polynomial(x: Sequence[float], y: Sequence[float], degree: int) -> TrendFitResult:
    """y = c_d*x^d + ... + c_1*x + c_0 via numpy.polyfit."""
    if not 2 <= degree <= 8:
        raise ValueError(f"polynomial degree must be in [2, 8], got {degree}")
    xa = _require_min_samples(x, degree + 1)
    ya = np.asarray(y, dtype=float)
    if ya.shape != xa.shape:
        raise ValueError("x and y must have the same length")

    coeffs = np.polyfit(xa, ya, degree)
    y_pred = np.polyval(coeffs, xa)
    r2, p_value, sse, rmse = _compute_stats(ya, y_pred, n_params=degree + 1)
    preds = [{"x": float(xi), "y": float(yi)} for xi, yi in zip(xa, y_pred)]
    return TrendFitResult(
        coefficients=[float(c) for c in coeffs],
        r_squared=r2,
        p_value=p_value,
        sse=sse,
        rmse=rmse,
        equation=_format_polynomial_equation(coeffs.tolist()),
        predictions=preds,
    )
