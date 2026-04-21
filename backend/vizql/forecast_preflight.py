"""Plan 9c — Forecast preflight: temporal-dim guard + uniform-grid resampling.

Tableau requires a temporal dim on the series for forecast (Build_Tableau
SXIII.3). statsmodels Holt-Winters expects a strictly-uniform index — gaps
must be NaN-filled before fit. Both responsibilities live here.
"""
from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

from vizql.forecast import ForecastSpec


_SECONDS_PER_UNIT = {
    "seconds": 1.0,
    "minutes": 60.0,
    "hours": 3600.0,
    "days": 86400.0,
    "weeks": 7 * 86400.0,
    "months": 30.44 * 86400.0,
    "quarters": 91.31 * 86400.0,
    "years": 365.25 * 86400.0,
}


class PreflightError(ValueError):
    """Raised when input series fails preflight checks (caller maps -> HTTP 400)."""


def validate_series(
    series: Sequence[dict],
    spec: ForecastSpec,
    *,
    min_points: int = 10,
    max_horizon: int = 200,
) -> None:
    """Raise PreflightError if `series` cannot be forecast under `spec`."""
    if not series:
        raise PreflightError("series is empty")
    if len(series) < min_points:
        raise PreflightError(
            f"series has {len(series)} points; forecast requires at least {min_points}"
        )
    first = series[0]
    if "t" not in first:
        raise PreflightError("series rows must have a 't' temporal field")
    for i, row in enumerate(series):
        t = row.get("t")
        if not isinstance(t, (int, float)) or (isinstance(t, float) and math.isnan(t)):
            raise PreflightError(f"row {i}: 't' must be a numeric timestamp, got {t!r}")
        y = row.get("y")
        if y is None:
            continue  # NaN allowed; fill at resample time
        if not isinstance(y, (int, float)):
            raise PreflightError(f"row {i}: 'y' must be numeric or null, got {y!r}")
    if spec.forecast_length > max_horizon:
        raise PreflightError(
            f"forecast_length={spec.forecast_length} exceeds FORECAST_MAX_HORIZON={max_horizon}"
        )


def _detect_unit(timestamps: Sequence[float]) -> str:
    """Pick the unit whose average spacing best matches median delta."""
    if len(timestamps) < 2:
        return "days"
    deltas = sorted(
        timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)
    )
    median = deltas[len(deltas) // 2]
    if median <= 0:
        return "days"
    best_unit = "days"
    best_ratio = float("inf")
    for unit, sec in _SECONDS_PER_UNIT.items():
        if unit in {"auto"}:
            continue
        ratio = max(median / sec, sec / median)
        if ratio < best_ratio:
            best_ratio = ratio
            best_unit = unit
    return best_unit


def build_uniform_index(
    series: Sequence[dict],
    unit: str,
) -> Tuple[List[float], List[float]]:
    """Resample to a uniform grid; gaps become NaN."""
    if unit == "auto":
        unit = _detect_unit([row["t"] for row in series])
    step = _SECONDS_PER_UNIT[unit]
    sorted_rows = sorted(series, key=lambda r: r["t"])
    t0 = sorted_rows[0]["t"]
    t_end = sorted_rows[-1]["t"]
    n = max(1, int(round((t_end - t0) / step)) + 1)
    grid_ts: List[float] = [t0 + i * step for i in range(n)]
    bucketed: List[Optional[float]] = [None] * n
    for row in sorted_rows:
        idx = int(round((row["t"] - t0) / step))
        if 0 <= idx < n:
            v = row.get("y")
            if v is not None and not (isinstance(v, float) and math.isnan(v)):
                bucketed[idx] = float(v)
    grid_y: List[float] = [v if v is not None else float("nan") for v in bucketed]
    return grid_ts, grid_y
