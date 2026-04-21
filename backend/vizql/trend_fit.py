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


def fit_logarithmic(x: Sequence[float], y: Sequence[float]) -> TrendFitResult:
    """y = a*ln(x) + b. Linear fit on (ln(x), y)."""
    xa = _require_min_samples(x, 2)
    ya = np.asarray(y, dtype=float)
    if ya.shape != xa.shape:
        raise ValueError("x and y must have the same length")
    if np.any(xa <= 0):
        raise ValueError("logarithmic fit requires x > 0 for all samples")

    coeffs = np.polyfit(np.log(xa), ya, 1)  # [a, b]
    y_pred = coeffs[0] * np.log(xa) + coeffs[1]
    r2, p_value, sse, rmse = _compute_stats(ya, y_pred, n_params=2)
    preds = [{"x": float(xi), "y": float(yi)} for xi, yi in zip(xa, y_pred)]
    return TrendFitResult(
        coefficients=[float(coeffs[0]), float(coeffs[1])],
        r_squared=r2, p_value=p_value, sse=sse, rmse=rmse,
        equation=f"y = {coeffs[0]:.4f}*ln(x) + {coeffs[1]:.4f}",
        predictions=preds,
    )


def fit_exponential(x: Sequence[float], y: Sequence[float]) -> TrendFitResult:
    """y = a*exp(b*x). Linear fit on (x, ln(y)); recovers (a = exp(intercept), b = slope)."""
    xa = _require_min_samples(x, 2)
    ya = np.asarray(y, dtype=float)
    if ya.shape != xa.shape:
        raise ValueError("x and y must have the same length")
    if np.any(ya <= 0):
        raise ValueError("exponential fit requires y > 0 for all samples")

    slope, intercept = np.polyfit(xa, np.log(ya), 1)
    a = float(np.exp(intercept))
    b = float(slope)
    y_pred = a * np.exp(b * xa)
    r2, p_value, sse, rmse = _compute_stats(ya, y_pred, n_params=2)
    preds = [{"x": float(xi), "y": float(yi)} for xi, yi in zip(xa, y_pred)]
    return TrendFitResult(
        coefficients=[a, b],
        r_squared=r2, p_value=p_value, sse=sse, rmse=rmse,
        equation=f"y = {a:.4f}*exp({b:.4f}*x)",
        predictions=preds,
    )


def fit_power(x: Sequence[float], y: Sequence[float]) -> TrendFitResult:
    """y = a*x^b. Linear fit on (ln(x), ln(y))."""
    xa = _require_min_samples(x, 2)
    ya = np.asarray(y, dtype=float)
    if ya.shape != xa.shape:
        raise ValueError("x and y must have the same length")
    if np.any(xa <= 0) or np.any(ya <= 0):
        raise ValueError("power fit requires x > 0 and y > 0 for all samples")

    slope, intercept = np.polyfit(np.log(xa), np.log(ya), 1)
    a = float(np.exp(intercept))
    b = float(slope)
    y_pred = a * np.power(xa, b)
    r2, p_value, sse, rmse = _compute_stats(ya, y_pred, n_params=2)
    preds = [{"x": float(xi), "y": float(yi)} for xi, yi in zip(xa, y_pred)]
    return TrendFitResult(
        coefficients=[a, b],
        r_squared=r2, p_value=p_value, sse=sse, rmse=rmse,
        equation=f"y = {a:.4f}*x^{b:.4f}",
        predictions=preds,
    )


from collections import OrderedDict  # noqa: E402
from typing import Any, Dict, Optional  # noqa: E402

from vizql.trend_line import TrendLineSpec  # noqa: E402


_FIT_DISPATCH = {
    "linear": lambda x, y, _spec: fit_linear(x, y),
    "logarithmic": lambda x, y, _spec: fit_logarithmic(x, y),
    "exponential": lambda x, y, _spec: fit_exponential(x, y),
    "power": lambda x, y, _spec: fit_power(x, y),
    "polynomial": lambda x, y, spec: fit_polynomial(x, y, degree=spec.degree or 2),
}


def add_confidence_band(
    result: TrendFitResult,
    x: Sequence[float],
    y: Sequence[float],
    *,
    level: float,
    fit_type: str,
) -> TrendFitResult:
    """Attach (lower, upper) prediction intervals to each sample via the
    t-distribution.

    For linear and transform-based fits we use the ordinary-least-squares
    prediction interval on the *transformed* linear space, then invert
    back. For polynomial fits we form the prediction variance from the
    design matrix directly.
    """
    xa = np.asarray(x, dtype=float)
    ya = np.asarray(y, dtype=float)
    n = xa.shape[0]

    if fit_type == "polynomial":
        degree = len(result.coefficients) - 1
        X = np.vander(xa, degree + 1, increasing=False)
        y_pred_vec = X @ np.asarray(result.coefficients)
        residuals = ya - y_pred_vec
        p = degree + 1
    elif fit_type == "linear":
        X = np.column_stack([xa, np.ones_like(xa)])
        y_pred_vec = X @ np.asarray(result.coefficients)
        residuals = ya - y_pred_vec
        p = 2
    elif fit_type == "logarithmic":
        X = np.column_stack([np.log(xa), np.ones_like(xa)])
        y_pred_vec = X @ np.asarray(result.coefficients)
        residuals = ya - y_pred_vec
        p = 2
    elif fit_type == "exponential":
        # Work in log(y) space.
        a, b = result.coefficients
        X = np.column_stack([xa, np.ones_like(xa)])
        beta = np.array([b, np.log(a)])
        log_y_pred = X @ beta
        residuals = np.log(ya) - log_y_pred
        p = 2
    elif fit_type == "power":
        a, b = result.coefficients
        X = np.column_stack([np.log(xa), np.ones_like(xa)])
        beta = np.array([b, np.log(a)])
        log_y_pred = X @ beta
        residuals = np.log(ya) - log_y_pred
        p = 2
    else:
        raise ValueError(f"unknown fit_type for confidence band: {fit_type}")

    df = max(1, n - p)
    sigma2 = float(np.sum(residuals ** 2) / df)
    # Pseudo-inverse handles rank deficiency.
    xtx_inv = np.linalg.pinv(X.T @ X)
    # Prediction variance = sigma^2 * (1 + x0 (X^T X)^{-1} x0^T).
    pred_var = sigma2 * (1.0 + np.einsum("ij,jk,ik->i", X, xtx_inv, X))
    t_crit = float(stats.t.ppf(0.5 + level / 2.0, df))
    half_width = t_crit * np.sqrt(np.maximum(pred_var, 0.0))

    # In log-space fits, invert back to y-space.
    if fit_type == "exponential":
        y_pred = np.exp(X @ beta)
        lower = y_pred * np.exp(-half_width)
        upper = y_pred * np.exp(half_width)
    elif fit_type == "power":
        y_pred = np.exp(X @ beta)
        lower = y_pred * np.exp(-half_width)
        upper = y_pred * np.exp(half_width)
    else:
        y_pred = y_pred_vec
        lower = y_pred - half_width
        upper = y_pred + half_width

    preds: List[Dict[str, float]] = []
    for xi, yi, lo, hi in zip(xa, y_pred, lower, upper):
        preds.append({
            "x": float(xi),
            "y": float(yi),
            "lower": float(lo),
            "upper": float(hi),
        })

    return TrendFitResult(
        coefficients=list(result.coefficients),
        r_squared=result.r_squared,
        p_value=result.p_value,
        sse=result.sse,
        rmse=result.rmse,
        equation=result.equation,
        predictions=preds,
    )


def fit_all(
    rows: List[Dict[str, Any]],
    spec: TrendLineSpec,
) -> List[Dict[str, Any]]:
    """Dispatch by spec.fit_type and group by spec.factor_fields.

    Returns [{"factor_value": <tuple|str|None>, "result": TrendFitResult}, ...]
    preserving the insertion order of factor groups for deterministic output.
    """
    spec.validate()
    if spec.fit_type not in _FIT_DISPATCH:
        raise ValueError(f"unknown fit_type {spec.fit_type!r}")
    fit_fn = _FIT_DISPATCH[spec.fit_type]

    # Group rows. Empty factor_fields → single None group.
    groups: "OrderedDict[Optional[tuple], List[Dict[str, Any]]]" = OrderedDict()
    for row in rows:
        if spec.factor_fields:
            key = tuple(row.get(f) for f in spec.factor_fields)
        else:
            key = None
        groups.setdefault(key, []).append(row)

    out: List[Dict[str, Any]] = []
    for key, grows in groups.items():
        xs = [float(r["x"]) for r in grows]
        ys = [float(r["y"]) for r in grows]
        result = fit_fn(xs, ys, spec)
        if spec.show_confidence_bands:
            result = add_confidence_band(
                result, xs, ys,
                level=spec.confidence_level,
                fit_type=spec.fit_type,
            )
        # Surface the factor key — scalar when single field, tuple otherwise.
        if key is None:
            factor_value: Any = None
        elif len(key) == 1:
            factor_value = key[0]
        else:
            factor_value = list(key)
        out.append({"factor_value": factor_value, "result": result})
    return out
