# Analyst Pro — Plan 9c: Forecast (Holt-Winters + AIC model selection)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 9 (Analytics Pane) slice #3 — Tableau-parity forecast using Holt-Winters exponential smoothing with automatic 8-model search, AIC-driven selection, prediction intervals (CI bands), automatic seasonality detection, partial-period guard, and per-factor fitting — exactly the surface documented in `Build_Tableau.md` §XIII.3 (`Holt-Winters`, `GetConfidenceBands`) and §XXIII Appendix C `tabdocforecast`.

**Architecture:** Forecast engine runs **server-side only** (statsmodels never bundled into the browser). A new endpoint `POST /api/v1/analytics/forecast` accepts `{ series, spec }`, runs a preflight that asserts temporal-dim presence + builds a uniform time index (NaN-fills gaps), dispatches to `forecast_engine.fit_all` which (when `spec.model='auto'`) fits all 8 ETS combinations from the Hyndman taxonomy via `statsmodels.tsa.exponential_smoothing.ets.ETSModel`, computes `AIC = 2k + n·ln(SSE/n)` per fit, returns the lowest-AIC model as `best_model` plus the full `model_candidates` list for transparency. Confidence bands use Hyndman's prediction-interval formula at the requested level (90/95/99). The endpoint is feature-flagged on `FEATURE_ANALYST_PRO`, sliding-window rate-limited (10 calls / 60s per user), hard-capped at 10k input rows, and terminates inside a 10-second wall-clock budget. The frontend turns each fit into `VegaLiteLayer[]` via `forecastToVega.ts` (solid actuals line + dashed forecast line + 30%-opacity CI rect band + vertical divider rule at `last_actual_t`). The authoring dialog (`ForecastDialog.jsx`) unparks the `forecast` catalogue item parked as `disabled: true` in Plan 9a T9 (`AnalyticsPanel.jsx:26`), mirroring the Plan 9b `TrendLineDialog` shape with new fields for forecast length / unit / model / season length / confidence level / ignore-last-N.

**Tech Stack:** Python 3.10 / numpy / scipy / statsmodels / pytest / FastAPI; React 19 / TypeScript 5.x / Vega-Lite (via `react-vega`) / Zustand / Vitest.

**Authoritative references:**
- `docs/Build_Tableau.md` §XIII.1 (analytics-pane catalogue), §XIII.3 (Holt-Winters + 8 models tried + AIC + `GetConfidenceBands`), Appendix C (`tabdocforecast` → Phase 6 / our module).
- `docs/analyst_pro_tableau_parity_roadmap.md` §Phase 9 / Plan 9c (authoritative scope).
- `CLAUDE.md` + `QueryCopilot V1/CLAUDE.md` (numeric-constants-in-config-defaults rule, BYOK boundary — forecast has no LLM).
- Plan 9a shipped artifacts (reuse): `backend/vizql/analytics_types.py`, `frontend/src/chart-ir/analytics/referenceLineToVega.ts`, `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx`.
- Plan 9b shipped artifacts (template): `backend/vizql/{trend_line,trend_fit}.py`, `backend/routers/query_routes.py:1880-1964` (rate-limit + feature-flag + spliced-router pattern), `frontend/src/api.js:1072-1080` (`fetchTrendFit`), `frontend/src/store.js:1478-1520`, `frontend/src/chart-ir/analytics/trendLineToVega.ts`, `frontend/src/components/dashboard/freeform/panels/TrendLineDialog.jsx`.

**Hard conventions (from Plan 9c scheduled-task brief + shared conventions):**
- statsmodels in **Python only** — never client-side.
- **All 8 models always tried** when `model='auto'`; `best_model` = lowest AIC; full `model_candidates` returned for transparency.
- **AIC is the tiebreaker** — not RMSE (different penalty / overfit risk).
- **CI bands always available**, default on; level ∈ {0.90, 0.95, 0.99}.
- **Reject non-temporal upfront** — preflight 400 if no temporal column in series.
- **Uniform index** — gap-fill with NaN before fitting (statsmodels requires it).
- TDD with synthetic datasets + numeric tolerance `1e-4` on coefficients (per scheduled-task brief).
- Commit per task: `feat(analyst-pro): <verb> <object> (Plan 9c T<N>)`; final docs task uses `docs(analyst-pro): …`.
- Vega-Lite only on the client (no custom canvas).
- Feature-gate: `FEATURE_ANALYST_PRO`.
- Store action suffix `…AnalystPro`; state field prefix `analystPro…`.

---

## File Structure

### Backend — Python

| Path | Purpose | Touch |
|---|---|---|
| `backend/requirements.txt` | Add `statsmodels>=0.14` (pinned-floor, no upper) under the existing `# ── ML Engine ───` section (already houses `scikit-learn`, `xgboost`). | Modify |
| `backend/config.py` | Add `FORECAST_RATE_LIMIT_PER_60S: int = 10`, `FORECAST_MAX_ROWS: int = 10_000`, `FORECAST_TIMEOUT_SECONDS: float = 10.0`, `FORECAST_MAX_HORIZON: int = 200` (hard sanity cap on `forecast_length`). | Modify |
| `docs/claude/config-defaults.md` | New `### Forecast (Plan 9c)` row group for the four constants above. CLAUDE.md mandates updating in the same commit as the value lands in code. | Modify |
| `backend/vizql/forecast.py` | `ForecastSpec` + `ForecastModelFit` + `ForecastResult` dataclasses with `validate()` + `to_dict`/`from_dict`. Not a proto message — fit results are transient wire data, not persisted in `VisualSpec` (matches Plan 9b precedent). | Create |
| `backend/vizql/forecast_preflight.py` | `validate_series(series, spec)`, `build_uniform_index(series, unit)`, `_detect_unit(timestamps)`, `_resample_to_grid(series, index)`. Pure functions, no I/O. | Create |
| `backend/vizql/forecast_engine.py` | `fit_one(y, kind, season_length, ignore_last)`, `fit_auto(y, season_length, ignore_last)` (8-model search + AIC selection), `_compute_aic(sse, n, k)`, `_detect_season_length(y)` (FFT autocorrelation peak), `_confidence_band(fit, horizon, level)` (Hyndman prediction-interval formula), `fit_all(series, spec)` (factor dispatcher), `_MODEL_KINDS` constant (8-tuple of `(error, trend, seasonal)`). Pure functions; no I/O. | Create |
| `backend/routers/query_routes.py` | Mount `POST /api/v1/analytics/forecast` via the same spliced-router trick used for `/api/v1/calcs/*` and Plan 9b `/api/v1/analytics/trend-fit` (see `query_routes.py:1882-1964`). Add `_enforce_forecast_rate_limit`, `_FORECAST_RL_*` globals, reuse `FEATURE_ANALYST_PRO` + `get_current_user` guards. Subprocess isolation NOT required by default — graceful in-process degrade on statsmodels failure (catch + 422 with model-failed detail). | Modify |
| `backend/tests/fixtures/forecast/` | Synthetic JSON fixtures: AR1, trend-only, seasonal-12, multiplicative, gappy, non-temporal-rejected. | Create |
| `backend/tests/test_forecast_types.py` | Dataclass round-trip + `validate()` failure cases. | Create |
| `backend/tests/test_forecast_preflight.py` | Temporal-dim detection, gap fill, unit auto-detect (years/quarters/months/weeks/days), short-series rejection. | Create |
| `backend/tests/test_forecast_engine.py` | Synthetic recovery: AR(1) → forecast→mean; trend → AAN/AAA selected; seasonal-12 → ANA selected; multiplicative → MAM/AMM selected; AIC tie-break behaviour; CI coverage ≥85% on synthetic data; `_detect_season_length` recovers period 12. | Create |
| `backend/tests/test_forecast_endpoint.py` | FastAPI integration — happy path, 400 on non-temporal, 400 on <10 points, 413 on >`FORECAST_MAX_ROWS`, 403 on `FEATURE_ANALYST_PRO=False`, 429 after `FORECAST_RATE_LIMIT_PER_60S` calls, 504 on timeout. | Create |

### Frontend — TypeScript / React

| Path | Purpose | Touch |
|---|---|---|
| `frontend/src/chart-ir/analytics/forecastToVega.ts` | `compileForecast(spec, fit, lastActualT) → VegaLiteLayer[]` — solid actuals line + dashed forecast line + CI rect band + vertical rule divider at `lastActualT`. Re-exports `ForecastSpec` / `ForecastResult` TS types inline. | Create |
| `frontend/src/chart-ir/analytics/__tests__/forecastToVega.test.ts` | Vitest — golden-fixture spec → golden Vega-Lite layer JSON (3 cases: simple, with-CI, multi-factor). | Create |
| `frontend/src/chart-ir/analytics/__tests__/__fixtures__/forecast-*.json` | Golden layer fixtures. | Create |
| `frontend/src/api.js` | Add `fetchForecast(req)` — POST `/api/v1/analytics/forecast` with JWT injection, returns typed `ForecastResult`. | Modify |
| `frontend/src/store.js` | Add `analystProForecasts` list + `addForecastAnalystPro` / `updateForecastAnalystPro` / `deleteForecastAnalystPro` / `openForecastDialogAnalystPro` / `closeForecastDialogAnalystPro` + `analystProForecastDialogCtx` field. Wire history snapshot identically to Plan 9b T7. | Modify |
| `frontend/src/__tests__/store.forecast.test.ts` | Vitest — CRUD + dialog open/close + undo/redo round-trip. | Create |
| `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx` | Flip `{ id: 'forecast', disabled: true }` (line 26) to enabled, wire onClick to `openForecastDialogAnalystPro`. | Modify |
| `frontend/src/components/dashboard/freeform/panels/ForecastDialog.jsx` | Editor: forecast-length number + unit dropdown (auto/years/quarters/months/weeks/days/hours/minutes/seconds), model picker (Auto / Additive / Multiplicative / Custom), season-length number (shown only when model = Custom), confidence-level radio (90/95/99), ignore-last-N number (partial-period guard), Preview button → `fetchForecast` → renders best-model badge (kind + AIC + RMSE) + per-factor stats table. | Create |
| `frontend/src/components/dashboard/freeform/panels/ForecastStatsBadge.jsx` | Info badge for a saved forecast: best-model kind (e.g. `ANA`), AIC rank vs other 7 candidates, RMSE, MAE, MAPE. Click expands a table with all 8 candidate fits sorted by AIC. | Create |
| `frontend/src/components/dashboard/freeform/__tests__/ForecastDialog.integration.test.tsx` | RTL — open dialog, choose Auto + 12-period horizon + 95% CI, click Preview, assert best-model badge renders + per-factor row count = unique factor-value count. | Create |
| `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` | Mount `<ForecastDialog />` alongside the existing `<TrendLineDialog />` mount. | Modify |

### Documentation

| Path | Purpose | Touch |
|---|---|---|
| `docs/ANALYTICS_FORECAST.md` | User-facing: how forecast works, the 8 ETS model codes (Hyndman taxonomy), how to read AIC, when to use auto vs custom, partial-period guard rationale, CI interpretation. | Create |
| `docs/analyst_pro_tableau_parity_roadmap.md` | Update Phase 9 status: `Plan 9c — Forecast (Holt-Winters + AIC model selection)` → `✅ Shipped 2026-04-20` + brief artifact list. | Modify |

---

## Task 1: Dependencies + dataclasses + config

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config.py`
- Modify: `docs/claude/config-defaults.md`
- Create: `backend/vizql/forecast.py`
- Create: `backend/tests/test_forecast_types.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_forecast_types.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_forecast_types.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vizql.forecast'`.

- [ ] **Step 3: Add `statsmodels` dep + 4 config constants**

Add to `backend/requirements.txt` under `# ── ML Engine ───`:

```
statsmodels>=0.14
```

Add to `backend/config.py` (next to `TREND_*` constants from Plan 9b):

```python
    # ── Forecast (Plan 9c) ────────────────────────────────────
    FORECAST_RATE_LIMIT_PER_60S: int = 10
    FORECAST_MAX_ROWS: int = 10_000
    FORECAST_TIMEOUT_SECONDS: float = 10.0
    FORECAST_MAX_HORIZON: int = 200
```

Add to `docs/claude/config-defaults.md` (after the `### Trend line (Plan 9b)` block):

```markdown
### Forecast (Plan 9c)

| Constant | Value | Notes |
|---|---|---|
| `FORECAST_RATE_LIMIT_PER_60S` | `10` | Per-user sliding-window cap on `/api/v1/analytics/forecast`. 429 when exceeded. |
| `FORECAST_MAX_ROWS` | `10_000` | Reject input series over this count (413). Hard cap, not sampled. |
| `FORECAST_TIMEOUT_SECONDS` | `10.0` | Per-request wall-clock budget (504 when exceeded). |
| `FORECAST_MAX_HORIZON` | `200` | Hard sanity cap on `forecast_length` regardless of unit (400 if exceeded). |
```

- [ ] **Step 4: Implement dataclasses** — create `backend/vizql/forecast.py`:

```python
"""Plan 9c — Forecast dataclasses (Holt-Winters + AIC).

Tableau parity (Build_Tableau §XIII.3): exponential smoothing tries 8
ETS combinations from the Hyndman taxonomy and selects by AIC. We
surface alpha/beta/gamma + SSE/AIC/RMSE/MAE/MAPE per candidate so the
user sees why one model won.

Wire-only (not proto-backed) — same precedent as Plan 9b TrendFitResult.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


_VALID_UNITS = {
    "auto", "years", "quarters", "months", "weeks",
    "days", "hours", "minutes", "seconds",
}
_VALID_MODELS = {"auto", "additive", "multiplicative", "custom"}
_VALID_LEVELS = {0.90, 0.95, 0.99}
_VALID_KINDS = {"AAA", "AAM", "AMA", "AMM", "ANA", "ANM", "ANN", "MNN"}


@dataclass(frozen=True, slots=True)
class ForecastSpec:
    forecast_length: int
    forecast_unit: str
    model: str
    season_length: Optional[int]
    confidence_level: float
    ignore_last: int

    def validate(self) -> None:
        if self.forecast_length <= 0:
            raise ValueError(f"forecast_length must be > 0, got {self.forecast_length}")
        if self.forecast_unit not in _VALID_UNITS:
            raise ValueError(
                f"forecast_unit must be one of {sorted(_VALID_UNITS)}, got {self.forecast_unit!r}"
            )
        if self.model not in _VALID_MODELS:
            raise ValueError(
                f"model must be one of {sorted(_VALID_MODELS)}, got {self.model!r}"
            )
        if self.confidence_level not in _VALID_LEVELS:
            raise ValueError(
                f"confidence_level must be one of {sorted(_VALID_LEVELS)}, got {self.confidence_level}"
            )
        if self.ignore_last < 0:
            raise ValueError(f"ignore_last must be >= 0, got {self.ignore_last}")
        if self.model in {"additive", "multiplicative", "custom"} and self.season_length is None:
            raise ValueError("season_length required when model != 'auto'")
        if self.season_length is not None and self.season_length < 2:
            raise ValueError(f"season_length must be >= 2, got {self.season_length}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "forecast_length": self.forecast_length,
            "forecast_unit": self.forecast_unit,
            "model": self.model,
            "season_length": self.season_length,
            "confidence_level": self.confidence_level,
            "ignore_last": self.ignore_last,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ForecastSpec":
        return cls(
            forecast_length=int(d["forecast_length"]),
            forecast_unit=str(d.get("forecast_unit", "auto")),
            model=str(d.get("model", "auto")),
            season_length=(int(d["season_length"]) if d.get("season_length") is not None else None),
            confidence_level=float(d.get("confidence_level", 0.95)),
            ignore_last=int(d.get("ignore_last", 0)),
        )


@dataclass(frozen=True, slots=True)
class ForecastModelFit:
    kind: str
    alpha: Optional[float]
    beta: Optional[float]
    gamma: Optional[float]
    sse: float
    aic: float
    rmse: float
    mae: float
    mape: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "kind": self.kind, "alpha": self.alpha, "beta": self.beta, "gamma": self.gamma,
            "sse": self.sse, "aic": self.aic, "rmse": self.rmse, "mae": self.mae, "mape": self.mape,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ForecastModelFit":
        return cls(
            kind=str(d["kind"]),
            alpha=(float(d["alpha"]) if d.get("alpha") is not None else None),
            beta=(float(d["beta"]) if d.get("beta") is not None else None),
            gamma=(float(d["gamma"]) if d.get("gamma") is not None else None),
            sse=float(d["sse"]), aic=float(d["aic"]), rmse=float(d["rmse"]),
            mae=float(d["mae"]), mape=float(d["mape"]),
        )


@dataclass(frozen=True, slots=True)
class ForecastResult:
    best_model: ForecastModelFit
    forecasts: List[Dict[str, float]] = field(default_factory=list)
    actuals: List[Dict[str, float]] = field(default_factory=list)
    model_candidates: List[ForecastModelFit] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "best_model": self.best_model.to_dict(),
            "forecasts": [dict(p) for p in self.forecasts],
            "actuals": [dict(p) for p in self.actuals],
            "model_candidates": [m.to_dict() for m in self.model_candidates],
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ForecastResult":
        return cls(
            best_model=ForecastModelFit.from_dict(d["best_model"]),
            forecasts=[dict(p) for p in d.get("forecasts", [])],
            actuals=[dict(p) for p in d.get("actuals", [])],
            model_candidates=[ForecastModelFit.from_dict(m) for m in d.get("model_candidates", [])],
        )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pip install statsmodels && python -m pytest tests/test_forecast_types.py -v`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/requirements.txt backend/config.py docs/claude/config-defaults.md backend/vizql/forecast.py backend/tests/test_forecast_types.py
git commit -m "feat(analyst-pro): forecast dataclasses + statsmodels dep + config (Plan 9c T1)"
```

---

## Task 2: Forecast preflight (temporal validation + uniform grid)

**Files:**
- Create: `backend/vizql/forecast_preflight.py`
- Create: `backend/tests/test_forecast_preflight.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_forecast_preflight.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_forecast_preflight.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vizql.forecast_preflight'`.

- [ ] **Step 3: Implement preflight** — create `backend/vizql/forecast_preflight.py`:

```python
"""Plan 9c — Forecast preflight: temporal-dim guard + uniform-grid resampling.

Tableau requires a temporal dim on the series for forecast (Build_Tableau
§XIII.3). statsmodels Holt-Winters expects a strictly-uniform index — gaps
must be NaN-filled before fit. Both responsibilities live here.
"""
from __future__ import annotations

import math
from typing import Any, List, Optional, Sequence, Tuple

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
    """Raised when input series fails preflight checks (caller maps → HTTP 400)."""


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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_forecast_preflight.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/forecast_preflight.py backend/tests/test_forecast_preflight.py
git commit -m "feat(analyst-pro): forecast preflight + uniform-grid resampler (Plan 9c T2)"
```

---

## Task 3: Single-model fit + AIC computation

**Files:**
- Create: `backend/vizql/forecast_engine.py` (initial skeleton + `fit_one`)
- Create: `backend/tests/test_forecast_engine.py` (single-model tests)

- [ ] **Step 1: Write the failing test** — `backend/tests/test_forecast_engine.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_forecast_engine.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vizql.forecast_engine'`.

- [ ] **Step 3: Implement single-fit primitive** — create `backend/vizql/forecast_engine.py`:

```python
"""Plan 9c — Forecast engine (Holt-Winters ETS + AIC selection).

Tableau parity (Build_Tableau §XIII.3): try 8 ETS models from the
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
from typing import List, Optional, Sequence, Tuple

import numpy as np
from statsmodels.tsa.exponential_smoothing.ets import ETSModel

from vizql.forecast import ForecastModelFit


# Hyndman taxonomy: (Error, Trend, Seasonal). Brief-mandated 8-tuple.
_MODEL_KINDS: Tuple[str, ...] = (
    "AAA", "AAM", "AMA", "AMM", "ANA", "ANM", "ANN", "MNN",
)


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

    params = res.params if hasattr(res, "params") else {}
    alpha = float(params.get("smoothing_level")) if "smoothing_level" in getattr(params, "index", []) else None
    beta = float(params.get("smoothing_trend")) if "smoothing_trend" in getattr(params, "index", []) else None
    gamma = float(params.get("smoothing_seasonal")) if "smoothing_seasonal" in getattr(params, "index", []) else None

    fit = ForecastModelFit(
        kind=kind, alpha=alpha, beta=beta, gamma=gamma,
        sse=sse, aic=aic, rmse=rmse, mae=mae, mape=mape,
    )
    # Stash the fit result on the summary as a private attribute so
    # confidence-band step (T5) can re-use the trained statsmodels
    # object without re-fitting. dataclass is frozen; use object.__setattr__.
    object.__setattr__(fit, "_sm_result", res)
    return fit, fitted.tolist(), residuals.tolist()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_forecast_engine.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/forecast_engine.py backend/tests/test_forecast_engine.py
git commit -m "feat(analyst-pro): forecast engine fit_one + AIC computation (Plan 9c T3)"
```

---

## Task 4: 8-model auto search + best-by-AIC selection + season detection

**Files:**
- Modify: `backend/vizql/forecast_engine.py` (add `fit_auto` + `_detect_season_length`)
- Modify: `backend/tests/test_forecast_engine.py` (add auto-selection tests)

- [ ] **Step 1: Add the failing test** — append to `backend/tests/test_forecast_engine.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_forecast_engine.py -v -k "auto or detect_season"`
Expected: FAIL — `ImportError: cannot import name 'fit_auto'`.

- [ ] **Step 3: Implement `fit_auto` + `_detect_season_length`** — append to `backend/vizql/forecast_engine.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_forecast_engine.py -v`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/forecast_engine.py backend/tests/test_forecast_engine.py
git commit -m "feat(analyst-pro): 8-model ETS auto-search + AIC selection + season detection (Plan 9c T4)"
```

---

## Task 5: Confidence bands + fit_all factor dispatcher

**Files:**
- Modify: `backend/vizql/forecast_engine.py` (add `_confidence_band` + `fit_all`)
- Modify: `backend/tests/test_forecast_engine.py` (add CI + dispatcher tests)

- [ ] **Step 1: Add the failing test** — append to `backend/tests/test_forecast_engine.py`:

```python
from vizql.forecast import ForecastSpec
from vizql.forecast_engine import fit_all, _confidence_band


def _spec_auto(horizon=12, level=0.95):
    return ForecastSpec(
        forecast_length=horizon, forecast_unit="months", model="auto",
        season_length=None, confidence_level=level, ignore_last=0,
    )


def test_confidence_band_widens_with_horizon():
    rng = np.random.default_rng(0)
    y = (np.arange(120) * 0.5 + rng.normal(0, 1.0, 120)).tolist()
    best, _ = fit_auto(y, season_length=12, ignore_last=0)
    point, lower, upper = _confidence_band(best, horizon=12, level=0.95)
    widths = [upper[i] - lower[i] for i in range(12)]
    assert widths[-1] > widths[0], "CI band should widen with horizon"


def test_confidence_band_coverage_above_85_percent():
    rng = np.random.default_rng(0)
    n = 240
    season = np.tile(np.array([1.0, 4.0, 2.0, 5.0]), n // 4)
    y_full = (season + 0.5 * np.arange(n) + rng.normal(0, 0.5, n)).tolist()
    train = y_full[:200]
    test = y_full[200:]
    best, _ = fit_auto(train, season_length=4, ignore_last=0)
    _, lower, upper = _confidence_band(best, horizon=len(test), level=0.90)
    inside = sum(1 for i, t in enumerate(test) if lower[i] <= t <= upper[i])
    coverage = inside / len(test)
    assert coverage >= 0.85, f"CI coverage {coverage:.2f} below 0.85"


def test_fit_all_groups_by_factor_field():
    series = []
    for region in ("east", "west"):
        for i in range(40):
            series.append({"t": float(i), "y": float(i * (1.0 if region == "east" else 2.0)), "region": region})
    spec = _spec_auto(horizon=4)
    results = fit_all(series, spec, factor_fields=["region"])
    factors = {r["factor_value"] for r in results}
    assert factors == {"east", "west"}
    for r in results:
        assert len(r["result"].forecasts) == 4
        assert len(r["result"].model_candidates) == 8


def test_fit_all_no_factor_returns_single_group():
    series = [{"t": float(i), "y": float(i)} for i in range(40)]
    results = fit_all(series, _spec_auto(horizon=4), factor_fields=[])
    assert len(results) == 1
    assert results[0]["factor_value"] is None


def test_fit_all_custom_model_skips_search():
    series = [{"t": float(i), "y": float(i + 1)} for i in range(40)]
    spec = ForecastSpec(
        forecast_length=4, forecast_unit="months", model="custom",
        season_length=4, confidence_level=0.95, ignore_last=0,
    )
    # Custom model defaults to AAA; only one candidate returned.
    results = fit_all(series, spec, factor_fields=[])
    assert len(results[0]["result"].model_candidates) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_forecast_engine.py -v -k "confidence or fit_all"`
Expected: FAIL — `ImportError: cannot import name 'fit_all'`.

- [ ] **Step 3: Implement CI bands + factor dispatcher** — append to `backend/vizql/forecast_engine.py`:

```python
from scipy import stats as _scipy_stats

from vizql.forecast import ForecastResult, ForecastSpec
from vizql.forecast_preflight import build_uniform_index, validate_series


_MODEL_TO_KIND = {
    "additive": "AAA",
    "multiplicative": "MAM",
    "custom": "AAA",
}


def _confidence_band(
    fit: ForecastModelFit,
    horizon: int,
    level: float,
) -> Tuple[List[float], List[float], List[float]]:
    """Hyndman prediction interval. Use statsmodels' get_prediction when
    available; fall back to RMSE * z * sqrt(h) widening if not."""
    res = getattr(fit, "_sm_result", None)
    if res is not None and hasattr(res, "get_prediction"):
        try:
            pred = res.get_prediction(start=res.nobs, end=res.nobs + horizon - 1)
            mean = np.asarray(pred.predicted_mean, dtype=float)
            ci = np.asarray(pred.pred_int(alpha=1.0 - level), dtype=float)
            lower = ci[:, 0].tolist()
            upper = ci[:, 1].tolist()
            return mean.tolist(), lower, upper
        except Exception:  # noqa: BLE001
            pass
    # Fallback: forecast point + z*RMSE*sqrt(h) widening.
    point = []
    if res is not None and hasattr(res, "forecast"):
        point = np.asarray(res.forecast(steps=horizon), dtype=float).tolist()
    if not point:
        point = [float("nan")] * horizon
    z = float(_scipy_stats.norm.ppf(0.5 + level / 2.0))
    sigma = max(fit.rmse, 1e-9)
    lower = [point[i] - z * sigma * math.sqrt(i + 1) for i in range(horizon)]
    upper = [point[i] + z * sigma * math.sqrt(i + 1) for i in range(horizon)]
    return point, lower, upper


def _group_by_factor(
    series: Sequence[dict],
    factor_fields: Sequence[str],
) -> List[Tuple[Optional[object], List[dict]]]:
    if not factor_fields:
        return [(None, list(series))]
    groups: dict = {}
    for row in series:
        key = tuple(row.get(f) for f in factor_fields)
        key_value = key[0] if len(key) == 1 else key
        groups.setdefault(key_value, []).append(row)
    return list(groups.items())


def fit_all(
    series: Sequence[dict],
    spec: ForecastSpec,
    factor_fields: Sequence[str] = (),
) -> List[dict]:
    """Group series by factor_fields, fit each group, return wire dicts.

    Each entry: { 'factor_value': <value>, 'result': ForecastResult }.
    """
    spec.validate()
    grouped = _group_by_factor(series, factor_fields)
    out: List[dict] = []
    for factor_value, rows in grouped:
        validate_series(rows, spec)
        ts, y = build_uniform_index(rows, unit=spec.forecast_unit)
        if spec.model == "auto":
            best, candidates = fit_auto(y, season_length=spec.season_length, ignore_last=spec.ignore_last)
        else:
            kind = _MODEL_TO_KIND[spec.model]
            season_length = spec.season_length
            if season_length is None:
                season_length = _detect_season_length(y)
            best, _, _ = fit_one(y, kind=kind, season_length=season_length, ignore_last=spec.ignore_last)
            candidates = [best]
        point, lower, upper = _confidence_band(best, spec.forecast_length, spec.confidence_level)
        # Project forecast timestamps off the uniform grid.
        if len(ts) >= 2:
            step = ts[1] - ts[0]
        else:
            step = 1.0
        last_t = ts[-1]
        forecasts = [
            {"t": float(last_t + (i + 1) * step), "y": float(point[i]),
             "lower": float(lower[i]), "upper": float(upper[i])}
            for i in range(spec.forecast_length)
        ]
        actuals = [
            {"t": float(ts[i]), "y": float(y[i])}
            for i in range(len(ts))
            if not math.isnan(y[i])
        ]
        result = ForecastResult(
            best_model=best, forecasts=forecasts, actuals=actuals,
            model_candidates=list(candidates),
        )
        out.append({"factor_value": factor_value, "result": result})
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_forecast_engine.py -v`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/forecast_engine.py backend/tests/test_forecast_engine.py
git commit -m "feat(analyst-pro): forecast confidence bands + factor dispatcher (Plan 9c T5)"
```

---

## Task 6: Endpoint POST /api/v1/analytics/forecast

**Files:**
- Modify: `backend/routers/query_routes.py` (add `_FORECAST_RL_*` + `_enforce_forecast_rate_limit` + `_forecast_router`)
- Create: `backend/tests/test_forecast_endpoint.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_forecast_endpoint.py`:

```python
"""Plan 9c T6 — POST /api/v1/analytics/forecast endpoint."""
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from main import app
from config import settings


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth(client):
    """Reuse the demo-user auth fixture pattern from test_trend_fit_endpoint.py."""
    # Implementations may vary; mirror the approach used in
    # backend/tests/test_trend_fit_endpoint.py for JWT/Depends overrides.
    from tests.test_trend_fit_endpoint import auth as trend_auth  # noqa: WPS433
    return trend_auth.__wrapped__(client) if hasattr(trend_auth, "__wrapped__") else trend_auth(client)


def _series(n=40):
    rng = np.random.default_rng(0)
    base = float(time.time())
    return [{"t": base + i * 86400.0, "y": float(i + rng.normal(0, 0.1))} for i in range(n)]


def _spec(horizon=4):
    return {
        "forecast_length": horizon, "forecast_unit": "auto", "model": "auto",
        "season_length": None, "confidence_level": 0.95, "ignore_last": 0,
    }


def test_forecast_happy_path(client, auth):
    body = {"series": _series(), "spec": _spec(), "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "fits" in payload
    assert len(payload["fits"]) == 1
    fit = payload["fits"][0]["result"]
    assert fit["best_model"]["kind"] in {"AAA", "AAM", "AMA", "AMM", "ANA", "ANM", "ANN", "MNN"}
    assert len(fit["forecasts"]) == 4
    assert len(fit["model_candidates"]) == 8


def test_forecast_rejects_non_temporal(client, auth):
    body = {
        "series": [{"x": i, "y": float(i)} for i in range(20)],
        "spec": _spec(), "factor_fields": [],
    }
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 400
    assert "temporal" in r.text.lower()


def test_forecast_rejects_short_series(client, auth):
    body = {"series": _series(n=5), "spec": _spec(), "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 400


def test_forecast_413_oversized_payload(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "FORECAST_MAX_ROWS", 30)
    body = {"series": _series(n=40), "spec": _spec(), "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 413


def test_forecast_403_when_feature_flag_off(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False)
    body = {"series": _series(), "spec": _spec(), "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 403


def test_forecast_429_after_rate_limit(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "FORECAST_RATE_LIMIT_PER_60S", 2)
    body = {"series": _series(), "spec": _spec(), "factor_fields": []}
    assert client.post("/api/v1/analytics/forecast", json=body, headers=auth).status_code == 200
    assert client.post("/api/v1/analytics/forecast", json=body, headers=auth).status_code == 200
    assert client.post("/api/v1/analytics/forecast", json=body, headers=auth).status_code == 429


def test_forecast_400_on_invalid_spec(client, auth):
    body = {"series": _series(), "spec": {**_spec(), "confidence_level": 0.80}, "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_forecast_endpoint.py -v`
Expected: FAIL — endpoint returns 404.

- [ ] **Step 3: Implement endpoint** — append to `backend/routers/query_routes.py` (immediately after the `# Splice _trend_router's routes onto the primary router so main.py mounts them.` block at line 1963-1964):

```python


# ---- Plan 9c: forecast analytics endpoint ----
# Separate sub-router spliced onto `router.routes` so FastAPI mounts it at
# /api/v1/analytics/forecast (cannot modify main.py).

_FORECAST_RL_LOCK = _Lock()
_FORECAST_RL_TIMESTAMPS: dict[str, list[float]] = _collections.defaultdict(list)


def _enforce_forecast_rate_limit(email: str) -> None:
    now = time.time()
    window = 60.0
    cap = settings.FORECAST_RATE_LIMIT_PER_60S
    with _FORECAST_RL_LOCK:
        ts = [t for t in _FORECAST_RL_TIMESTAMPS[email] if t > now - window]
        if len(ts) >= cap:
            raise HTTPException(
                status_code=429,
                detail=f"forecast rate limit: max {cap} per 60s",
            )
        ts.append(now)
        _FORECAST_RL_TIMESTAMPS[email] = ts


class _ForecastRequest(BaseModel):
    series: list[dict]
    spec: dict
    factor_fields: list[str] = []


_forecast_router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@_forecast_router.post("/forecast")
def forecast(
    req: _ForecastRequest,
    user: dict = Depends(get_current_user),
):
    """Holt-Winters forecast with AIC model selection. See backend/vizql/forecast_engine.py."""
    if not settings.FEATURE_ANALYST_PRO:
        raise HTTPException(status_code=403, detail="FEATURE_ANALYST_PRO disabled")

    email = user["email"]
    _enforce_forecast_rate_limit(email)

    if len(req.series) > settings.FORECAST_MAX_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"forecast payload exceeds FORECAST_MAX_ROWS={settings.FORECAST_MAX_ROWS}",
        )

    from vizql.forecast import ForecastSpec
    from vizql.forecast_engine import fit_all
    from vizql.forecast_preflight import PreflightError

    try:
        spec = ForecastSpec.from_dict(req.spec)
        spec.validate()
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=f"invalid spec: {exc}") from exc

    start = time.monotonic()
    try:
        fits = fit_all(req.series, spec, factor_fields=req.factor_fields)
    except PreflightError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"forecast failed: {exc}") from exc
    elapsed = time.monotonic() - start
    if elapsed > settings.FORECAST_TIMEOUT_SECONDS:
        raise HTTPException(
            status_code=504,
            detail=f"forecast exceeded {settings.FORECAST_TIMEOUT_SECONDS:.1f}s (took {elapsed:.2f}s)",
        )

    return {
        "fits": [
            {"factor_value": f["factor_value"], "result": f["result"].to_dict()}
            for f in fits
        ]
    }


router.routes.extend(_forecast_router.routes)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_forecast_endpoint.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full backend suite to confirm no regression**

Run: `cd backend && python -m pytest tests/ -v --tb=short -x`
Expected: PASS — pre-existing 516+ tests + new 31 forecast tests.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/query_routes.py backend/tests/test_forecast_endpoint.py
git commit -m "feat(analyst-pro): POST /api/v1/analytics/forecast endpoint (Plan 9c T6)"
```

---

## Task 7: Frontend store + api.js + AnalyticsPanel unpark

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx`
- Create: `frontend/src/__tests__/store.forecast.test.ts`

- [ ] **Step 1: Write the failing test** — `frontend/src/__tests__/store.forecast.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('Plan 9c — store forecast CRUD', () => {
  beforeEach(() => {
    useStore.setState({
      analystProForecasts: [],
      analystProForecastDialogCtx: null,
    });
  });

  it('addForecastAnalystPro pushes onto list', () => {
    useStore.getState().addForecastAnalystPro({
      id: 'fc-1', tileId: 't1', spec: {}, fits: [],
    });
    expect(useStore.getState().analystProForecasts).toHaveLength(1);
    expect(useStore.getState().analystProForecasts[0].id).toBe('fc-1');
  });

  it('updateForecastAnalystPro merges by id', () => {
    useStore.getState().addForecastAnalystPro({
      id: 'fc-1', tileId: 't1', spec: { model: 'auto' }, fits: [],
    });
    useStore.getState().updateForecastAnalystPro('fc-1', { spec: { model: 'additive' } });
    expect(useStore.getState().analystProForecasts[0].spec.model).toBe('additive');
  });

  it('deleteForecastAnalystPro removes by id', () => {
    useStore.getState().addForecastAnalystPro({ id: 'fc-1', tileId: 't1', spec: {}, fits: [] });
    useStore.getState().addForecastAnalystPro({ id: 'fc-2', tileId: 't1', spec: {}, fits: [] });
    useStore.getState().deleteForecastAnalystPro('fc-1');
    expect(useStore.getState().analystProForecasts.map((f) => f.id)).toEqual(['fc-2']);
  });

  it('open/closeForecastDialogAnalystPro toggles ctx', () => {
    useStore.getState().openForecastDialogAnalystPro({ tileId: 't1', preset: {}, rows: [] });
    expect(useStore.getState().analystProForecastDialogCtx).not.toBeNull();
    useStore.getState().closeForecastDialogAnalystPro();
    expect(useStore.getState().analystProForecastDialogCtx).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- store.forecast`
Expected: FAIL — `addForecastAnalystPro is not a function`.

- [ ] **Step 3: Add `fetchForecast` to `frontend/src/api.js`** — immediately after the existing `fetchTrendFit` block (~line 1080):

```javascript
// POST /api/v1/analytics/forecast
// req = { series: [{t, y, ...factor_field_values}], spec: ForecastSpec, factor_fields: string[] }
// returns { fits: [{ factor_value, result: ForecastResult }] }
export function fetchForecast(req) {
  return request("/analytics/forecast", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
```

- [ ] **Step 4: Add store fields + actions to `frontend/src/store.js`** — directly below the Plan 9b `analystProTrendLineDialogCtx` field (line 1478) and near the Plan 9b dialog actions (~line 1519-1520):

```javascript
  analystProForecasts: [],
  analystProForecastDialogCtx: null,

  addForecastAnalystPro: (forecast) => {
    set((s) => ({ analystProForecasts: [...s.analystProForecasts, forecast] }));
    if (typeof get().pushHistorySnapshot === 'function') get().pushHistorySnapshot();
  },
  updateForecastAnalystPro: (id, patch) => {
    set((s) => ({
      analystProForecasts: s.analystProForecasts.map((f) =>
        f.id === id ? { ...f, ...patch } : f,
      ),
    }));
    if (typeof get().pushHistorySnapshot === 'function') get().pushHistorySnapshot();
  },
  deleteForecastAnalystPro: (id) => {
    set((s) => ({ analystProForecasts: s.analystProForecasts.filter((f) => f.id !== id) }));
    if (typeof get().pushHistorySnapshot === 'function') get().pushHistorySnapshot();
  },
  openForecastDialogAnalystPro: (ctx) => set({ analystProForecastDialogCtx: ctx }),
  closeForecastDialogAnalystPro: () => set({ analystProForecastDialogCtx: null }),
```

- [ ] **Step 5: Unpark the catalogue item in `AnalyticsPanel.jsx`** — change line 26 from:

```javascript
  { id: 'forecast',               label: 'Forecast',               kind: 'forecast', disabled: true },
```

to:

```javascript
  { id: 'forecast',               label: 'Forecast',               kind: 'forecast' },
```

And add — directly after the `openTrendLineDialog` selector binding (~line 35):

```javascript
  const openForecastDialog = useStore((s) => s.openForecastDialogAnalystPro);
```

In the click-handler that currently dispatches the trend-line dialog (~line 74), add an `else if` branch for forecast:

```javascript
                  } else if (it.kind === 'forecast' && typeof openForecastDialog === 'function') {
                    openForecastDialog({ kind: it.kind, preset: it.preset ?? {} });
                  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm run test:chart-ir -- store.forecast`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api.js frontend/src/store.js frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx frontend/src/__tests__/store.forecast.test.ts
git commit -m "feat(analyst-pro): forecast store + api + analytics panel unpark (Plan 9c T7)"
```

---

## Task 8: forecastToVega.ts compiler

**Files:**
- Create: `frontend/src/chart-ir/analytics/forecastToVega.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/forecastToVega.test.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/forecast-simple.json`

- [ ] **Step 1: Write the failing test** — `frontend/src/chart-ir/analytics/__tests__/forecastToVega.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { compileForecast, ForecastSpec, ForecastResult } from '../forecastToVega';

const baseSpec: ForecastSpec = {
  forecast_length: 4, forecast_unit: 'months', model: 'auto',
  season_length: null, confidence_level: 0.95, ignore_last: 0,
};

const baseResult: ForecastResult = {
  best_model: {
    kind: 'AAA', alpha: 0.5, beta: 0.1, gamma: 0.2,
    sse: 1.0, aic: 10.0, rmse: 0.5, mae: 0.4, mape: 2.0,
  },
  actuals: [{ t: 1, y: 1 }, { t: 2, y: 2 }, { t: 3, y: 3 }],
  forecasts: [
    { t: 4, y: 4, lower: 3.5, upper: 4.5 },
    { t: 5, y: 5, lower: 4.0, upper: 6.0 },
  ],
  model_candidates: [],
};

describe('forecastToVega', () => {
  it('emits actuals line + forecast line + CI band + divider rule', () => {
    const layers = compileForecast(baseSpec, baseResult, /* lastActualT */ 3);
    const kinds = layers.map((l) => `${l.mark.type}:${(l.mark as any).strokeDash ? 'dashed' : 'solid'}`);
    // 4 layers expected: actuals (line/solid) + forecast (line/dashed) + CI (area) + divider (rule)
    expect(layers).toHaveLength(4);
    expect(kinds[0]).toBe('line:solid');
    expect(kinds[1]).toBe('line:dashed');
    expect(layers[2].mark.type).toBe('area');
    expect(layers[3].mark.type).toBe('rule');
  });

  it('CI area uses 30% opacity', () => {
    const layers = compileForecast(baseSpec, baseResult, 3);
    const ci = layers.find((l) => l.mark.type === 'area')!;
    expect((ci.mark as any).opacity).toBeCloseTo(0.3);
  });

  it('omits CI band when forecast points lack lower/upper', () => {
    const noCI: ForecastResult = {
      ...baseResult,
      forecasts: [{ t: 4, y: 4 }, { t: 5, y: 5 }],
    };
    const layers = compileForecast(baseSpec, noCI, 3);
    expect(layers.find((l) => l.mark.type === 'area')).toBeUndefined();
  });

  it('tooltip carries best-model kind + AIC + RMSE', () => {
    const layers = compileForecast(baseSpec, baseResult, 3);
    const forecastLayer = layers[1];
    const tooltips = (forecastLayer.encoding as any).tooltip as Array<{ field: string }>;
    const fields = tooltips.map((t) => t.field);
    expect(fields).toEqual(expect.arrayContaining(['t', 'y', 'model_kind', 'aic', 'rmse']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- forecastToVega`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement compiler** — create `frontend/src/chart-ir/analytics/forecastToVega.ts`:

```typescript
/**
 * Plan 9c — compile a ForecastSpec + ForecastResult into Vega-Lite layer
 * fragments: solid actuals line + dashed forecast line + (optional) CI
 * rect band + vertical rule divider at last_actual_t.
 *
 * Kept framework-agnostic: returns `VegaLiteLayer[]` for VegaRenderer
 * to merge into encoding.layer.
 */

export interface ForecastSpec {
  forecast_length: number;
  forecast_unit: string;
  model: 'auto' | 'additive' | 'multiplicative' | 'custom';
  season_length: number | null;
  confidence_level: number;
  ignore_last: number;
}

export interface ForecastModelFit {
  kind: string;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  sse: number;
  aic: number;
  rmse: number;
  mae: number;
  mape: number;
}

export interface ForecastResult {
  best_model: ForecastModelFit;
  forecasts: Array<{ t: number; y: number; lower?: number; upper?: number }>;
  actuals: Array<{ t: number; y: number }>;
  model_candidates: ForecastModelFit[];
}

export interface VegaLiteLayer {
  mark: { type: 'line' | 'area' | 'rule'; tooltip?: boolean; opacity?: number; strokeDash?: number[] };
  data: { values: Array<Record<string, unknown>> };
  encoding: Record<string, unknown>;
}

const FORECAST_COLOR = '#4C78A8';
const ACTUALS_COLOR = '#1F2937';
const DIVIDER_COLOR = '#9CA3AF';

export function compileForecast(
  spec: ForecastSpec,
  fit: ForecastResult,
  lastActualT: number,
): VegaLiteLayer[] {
  const layers: VegaLiteLayer[] = [];

  // 1. Actuals (solid line, darker).
  layers.push({
    mark: { type: 'line', tooltip: true },
    data: { values: fit.actuals.map((p) => ({ t: p.t, y: p.y, _series: 'actual' })) },
    encoding: {
      x: { field: 't', type: 'quantitative' },
      y: { field: 'y', type: 'quantitative' },
      color: { value: ACTUALS_COLOR },
      tooltip: [
        { field: 't', type: 'quantitative' },
        { field: 'y', type: 'quantitative' },
      ],
    },
  });

  // 2. Forecast (dashed line, primary color).
  const forecastValues = fit.forecasts.map((p) => ({
    t: p.t, y: p.y,
    model_kind: fit.best_model.kind,
    aic: fit.best_model.aic,
    rmse: fit.best_model.rmse,
  }));
  layers.push({
    mark: { type: 'line', tooltip: true, strokeDash: [6, 4] },
    data: { values: forecastValues },
    encoding: {
      x: { field: 't', type: 'quantitative' },
      y: { field: 'y', type: 'quantitative' },
      color: { value: FORECAST_COLOR },
      tooltip: [
        { field: 't', type: 'quantitative' },
        { field: 'y', type: 'quantitative' },
        { field: 'model_kind', type: 'nominal' },
        { field: 'aic', type: 'quantitative' },
        { field: 'rmse', type: 'quantitative' },
      ],
    },
  });

  // 3. CI band (rect / area, 30% opacity) — only when forecast points carry lower/upper.
  const hasCI = fit.forecasts.every((p) => typeof p.lower === 'number' && typeof p.upper === 'number');
  if (hasCI) {
    layers.push({
      mark: { type: 'area', opacity: 0.3 },
      data: {
        values: fit.forecasts.map((p) => ({ t: p.t, lower: p.lower, upper: p.upper })),
      },
      encoding: {
        x: { field: 't', type: 'quantitative' },
        y: { field: 'lower', type: 'quantitative' },
        y2: { field: 'upper' },
        color: { value: FORECAST_COLOR },
      },
    });
  }

  // 4. Divider rule at last_actual_t.
  layers.push({
    mark: { type: 'rule', strokeDash: [3, 3] },
    data: { values: [{ t: lastActualT }] },
    encoding: {
      x: { field: 't', type: 'quantitative' },
      color: { value: DIVIDER_COLOR },
    },
  });

  return layers;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test:chart-ir -- forecastToVega`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart-ir/analytics/forecastToVega.ts frontend/src/chart-ir/analytics/__tests__/forecastToVega.test.ts
git commit -m "feat(analyst-pro): forecastToVega.ts Vega-Lite compiler (Plan 9c T8)"
```

---

## Task 9: ForecastDialog + ForecastStatsBadge + integration test

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/ForecastDialog.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/ForecastStatsBadge.jsx`
- Modify: `frontend/src/components/dashboard/freeform/FloatingLayer.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ForecastDialog.integration.test.tsx`

- [ ] **Step 1: Write the failing integration test** — `frontend/src/components/dashboard/freeform/__tests__/ForecastDialog.integration.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import ForecastDialog from '../panels/ForecastDialog';

vi.mock('../../../../api', () => ({
  fetchForecast: vi.fn().mockResolvedValue({
    fits: [
      {
        factor_value: null,
        result: {
          best_model: {
            kind: 'ANA', alpha: 0.5, beta: null, gamma: 0.2,
            sse: 1.0, aic: 12.5, rmse: 0.5, mae: 0.4, mape: 2.0,
          },
          forecasts: [{ t: 4, y: 4, lower: 3.5, upper: 4.5 }],
          actuals: [{ t: 1, y: 1 }, { t: 2, y: 2 }, { t: 3, y: 3 }],
          model_candidates: [],
        },
      },
    ],
  }),
}));

describe('ForecastDialog integration', () => {
  beforeEach(() => {
    useStore.setState({
      analystProForecasts: [],
      analystProForecastDialogCtx: {
        tileId: 'tile-1',
        rows: [
          { t: 1, y: 1 }, { t: 2, y: 2 }, { t: 3, y: 3 },
          { t: 4, y: 4 }, { t: 5, y: 5 }, { t: 6, y: 6 },
          { t: 7, y: 7 }, { t: 8, y: 8 }, { t: 9, y: 9 }, { t: 10, y: 10 },
        ],
        preset: {},
      },
    });
  });

  it('renders best-model badge after Preview click', async () => {
    render(<ForecastDialog />);
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => {
      expect(screen.getByText(/ANA/)).toBeInTheDocument();
    });
    expect(screen.getByText(/AIC/)).toBeInTheDocument();
  });

  it('Save persists onto analystProForecasts list', async () => {
    render(<ForecastDialog />);
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => screen.getByText(/ANA/));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(useStore.getState().analystProForecasts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- ForecastDialog`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ForecastDialog.jsx`** — create `frontend/src/components/dashboard/freeform/panels/ForecastDialog.jsx`:

```jsx
import React, { useMemo, useState } from 'react';
import { useStore } from '../../../../store';
import { fetchForecast } from '../../../../api';
import ForecastStatsBadge from './ForecastStatsBadge';

/**
 * Plan 9c T9 — Forecast editor dialog.
 *
 * Mirrors TrendLineDialog shape. Posts row data + spec to
 * /api/v1/analytics/forecast, previews best-model stats per factor,
 * saves into analystProForecasts on Save.
 */
const FORECAST_UNITS = [
  'auto', 'years', 'quarters', 'months', 'weeks',
  'days', 'hours', 'minutes', 'seconds',
];
const MODELS = [
  { value: 'auto', label: 'Auto (8 models, AIC pick)' },
  { value: 'additive', label: 'Additive' },
  { value: 'multiplicative', label: 'Multiplicative' },
  { value: 'custom', label: 'Custom' },
];
const CONFIDENCE_LEVELS = [0.9, 0.95, 0.99];

export default function ForecastDialog() {
  const ctx = useStore((s) => s.analystProForecastDialogCtx);
  const close = useStore((s) => s.closeForecastDialogAnalystPro);
  const addForecast = useStore((s) => s.addForecastAnalystPro);
  const availableDims = useStore((s) => s.analystProCurrentMarksCardDims ?? []);

  const [forecastLength, setForecastLength] = useState(ctx?.preset?.forecast_length ?? 12);
  const [forecastUnit, setForecastUnit] = useState(ctx?.preset?.forecast_unit ?? 'auto');
  const [model, setModel] = useState(ctx?.preset?.model ?? 'auto');
  const [seasonLength, setSeasonLength] = useState(ctx?.preset?.season_length ?? 12);
  const [confidenceLevel, setConfidenceLevel] = useState(0.95);
  const [ignoreLast, setIgnoreLast] = useState(0);
  const [factorFields, setFactorFields] = useState([]);
  const [previewFits, setPreviewFits] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loading, setLoading] = useState(false);

  const spec = useMemo(
    () => ({
      forecast_length: forecastLength,
      forecast_unit: forecastUnit,
      model,
      season_length: model === 'auto' ? null : seasonLength,
      confidence_level: confidenceLevel,
      ignore_last: ignoreLast,
    }),
    [forecastLength, forecastUnit, model, seasonLength, confidenceLevel, ignoreLast],
  );

  async function handlePreview() {
    setLoading(true);
    setPreviewError(null);
    try {
      const series = ctx?.rows ?? [];
      const { fits } = await fetchForecast({ series, spec, factor_fields: factorFields });
      setPreviewFits(fits);
    } catch (e) {
      setPreviewError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    if (!ctx) return;
    addForecast({
      id: `forecast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tileId: ctx.tileId,
      spec,
      fits: previewFits ?? [],
    });
    close();
  }

  if (!ctx) return null;

  return (
    <div role="dialog" aria-label="Forecast editor" className="forecast-dialog">
      <header><h3>Forecast</h3></header>

      <label>
        Forecast length
        <input
          type="number" min={1} max={200}
          value={forecastLength}
          onChange={(e) => setForecastLength(Number(e.target.value))}
        />
        <select value={forecastUnit} onChange={(e) => setForecastUnit(e.target.value)}>
          {FORECAST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>

      <label>
        Model
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>

      {model !== 'auto' && (
        <label>
          Season length
          <input
            type="number" min={2} value={seasonLength}
            onChange={(e) => setSeasonLength(Number(e.target.value))}
          />
        </label>
      )}

      <fieldset>
        <legend>Confidence level</legend>
        {CONFIDENCE_LEVELS.map((lvl) => (
          <label key={lvl}>
            <input
              type="radio" name="confidence-level" value={lvl}
              checked={confidenceLevel === lvl}
              onChange={() => setConfidenceLevel(lvl)}
            />
            {Math.round(lvl * 100)}%
          </label>
        ))}
      </fieldset>

      <label>
        Ignore last N periods
        <input
          type="number" min={0} value={ignoreLast}
          onChange={(e) => setIgnoreLast(Number(e.target.value))}
        />
      </label>

      <fieldset>
        <legend>Factors</legend>
        {availableDims.map((d) => (
          <label key={d}>
            <input
              type="checkbox"
              checked={factorFields.includes(d)}
              onChange={(e) =>
                setFactorFields((prev) =>
                  e.target.checked ? [...prev, d] : prev.filter((f) => f !== d),
                )
              }
            />
            {d}
          </label>
        ))}
      </fieldset>

      <div className="actions">
        <button type="button" onClick={handlePreview} disabled={loading}>
          {loading ? 'Fitting…' : 'Preview'}
        </button>
        <button type="button" onClick={handleSave} disabled={!previewFits}>Save</button>
        <button type="button" onClick={close}>Cancel</button>
      </div>

      {previewError && <p className="error">{previewError}</p>}

      {previewFits && (
        <ul className="preview">
          {previewFits.map((f, i) => (
            <li key={i}>
              <strong>{String(f.factor_value ?? 'all')}</strong>
              <ForecastStatsBadge fit={f.result} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement `ForecastStatsBadge.jsx`** — create `frontend/src/components/dashboard/freeform/panels/ForecastStatsBadge.jsx`:

```jsx
import React, { useState } from 'react';

/**
 * Plan 9c — Best-model badge for a forecast. Click to expand to a table
 * of all 8 candidate fits sorted by AIC.
 */
export default function ForecastStatsBadge({ fit }) {
  const [expanded, setExpanded] = useState(false);
  if (!fit) return null;
  const best = fit.best_model;
  const candidates = fit.model_candidates ?? [];
  return (
    <span className="forecast-stats-badge">
      <button type="button" onClick={() => setExpanded((v) => !v)}>
        {best.kind} · AIC {best.aic.toFixed(2)} · RMSE {best.rmse.toFixed(3)}
      </button>
      {expanded && (
        <table>
          <thead>
            <tr><th>Kind</th><th>AIC</th><th>RMSE</th><th>MAE</th><th>MAPE</th></tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => (
              <tr key={i} className={c.kind === best.kind ? 'best' : ''}>
                <td>{c.kind}</td>
                <td>{Number.isFinite(c.aic) ? c.aic.toFixed(2) : '—'}</td>
                <td>{Number.isFinite(c.rmse) ? c.rmse.toFixed(3) : '—'}</td>
                <td>{Number.isFinite(c.mae) ? c.mae.toFixed(3) : '—'}</td>
                <td>{Number.isFinite(c.mape) ? c.mape.toFixed(2) + '%' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </span>
  );
}
```

- [ ] **Step 5: Mount the dialog in `FloatingLayer.jsx`** — locate the existing `<TrendLineDialog />` mount and add a sibling line:

```jsx
import ForecastDialog from './panels/ForecastDialog';
// ...
<ForecastDialog />
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm run test:chart-ir -- ForecastDialog`
Expected: PASS (2 tests).

- [ ] **Step 7: Run frontend test suite to confirm no regression beyond the known ~22-failure baseline**

Run: `cd frontend && npm run test:chart-ir 2>&1 | tail -30`
Expected: failure count unchanged (or improved) from the documented baseline.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/ForecastDialog.jsx frontend/src/components/dashboard/freeform/panels/ForecastStatsBadge.jsx frontend/src/components/dashboard/freeform/FloatingLayer.jsx frontend/src/components/dashboard/freeform/__tests__/ForecastDialog.integration.test.tsx
git commit -m "feat(analyst-pro): ForecastDialog + ForecastStatsBadge + FloatingLayer mount (Plan 9c T9)"
```

---

## Task 10: User documentation + roadmap status

**Files:**
- Create: `docs/ANALYTICS_FORECAST.md`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md`

- [ ] **Step 1: Write the user-facing doc** — `docs/ANALYTICS_FORECAST.md`:

```markdown
# Analytics — Forecast (Plan 9c)

Tableau-parity forecast on any temporal series. Built on Holt-Winters
exponential smoothing with automatic model selection.

## How it works

1. **Preflight.** Series must include a temporal field (`t`) and ≥10
   points. Gaps are NaN-filled to a uniform grid (auto-detected unit
   when `forecast_unit='auto'`).
2. **Fit.** When `model='auto'`, the engine fits all 8 ETS variants
   from the Hyndman taxonomy and picks the lowest-AIC winner.
3. **Predict.** Generates `forecast_length` future points plus
   prediction-interval bands at the chosen confidence level.

## The 8 ETS model codes

Each code is `Error · Trend · Seasonal` where each slot is `A`
(additive), `M` (multiplicative), or `N` (none).

| Code | Error | Trend | Seasonal | When it wins |
|---|---|---|---|---|
| `ANN` | additive | none | none | Stationary, no trend or seasonality. |
| `AAN` *not in our 8* | — | — | — | (Tableau-mandated subset only.) |
| `AAA` | additive | additive | additive | Trending + seasonal series. |
| `AAM` | additive | additive | multiplicative | Trending + amplifying seasonality. |
| `AMA` | additive | multiplicative | additive | Compounding growth + flat seasonality. |
| `AMM` | additive | multiplicative | multiplicative | Compounding growth + amplifying seasonality. |
| `ANA` | additive | none | additive | Seasonal series with no trend. |
| `ANM` | additive | none | multiplicative | Seasonal series, multiplicative seasonality, no trend. |
| `MNN` | multiplicative | none | none | Stationary positive series with proportional noise. |

Multiplicative slots require strictly-positive `y` values; on series
with non-positive values, multiplicative variants are scored
`AIC = +∞` and skipped.

## Reading AIC

`AIC = 2k + n·ln(SSE/n)`. Lower wins. AIC penalizes parameter count,
so a slightly worse-fitting simpler model can outrank a richer one
that overfits.

## Confidence intervals

Default on. Levels: 90 / 95 / 99 percent. Bands widen with horizon —
the further out you forecast, the more uncertain the point estimate.

## Partial-period guard (`ignore_last`)

The last reporting period is often incomplete (current month is still
in progress). Set `ignore_last` to drop the last N points before
fitting so the model isn't pulled toward a partial value.

## Auto vs Custom

- **Auto** — try all 8, pick best by AIC, auto-detect season length
  from FFT autocorrelation among `(4, 7, 12, 24, 52)` candidates.
- **Additive / Multiplicative** — force the corresponding ETS family
  (defaults: `AAA` / `MAM`).
- **Custom** — hand-specify season length; engine fits one model only.

## Limits

- Max 10,000 input points (`FORECAST_MAX_ROWS`).
- Max 200 forecast points per request (`FORECAST_MAX_HORIZON`).
- 10-second wall-clock budget (`FORECAST_TIMEOUT_SECONDS`).
- 10 requests / 60s / user (`FORECAST_RATE_LIMIT_PER_60S`).

## See also
- `Build_Tableau.md` §XIII.3 (Holt-Winters reference).
- `backend/vizql/forecast_engine.py` (engine source).
- `frontend/src/chart-ir/analytics/forecastToVega.ts` (Vega-Lite output).
```

- [ ] **Step 2: Update the roadmap status line** — in `docs/analyst_pro_tableau_parity_roadmap.md`, change line 762 from:

```markdown
### Plan 9c — Forecast (Holt-Winters + AIC model selection)
```

to:

```markdown
### Plan 9c — Forecast (Holt-Winters + AIC model selection) — ✅ Shipped 2026-04-20

**Status:** ✅ Shipped 2026-04-20. 10 tasks. Backend modules: `backend/vizql/{forecast,forecast_preflight,forecast_engine}.py`. Endpoint: `POST /api/v1/analytics/forecast` (feature-flagged on `FEATURE_ANALYST_PRO`, rate-limited 10/60s, 10s timeout, 10k-row hard cap). Frontend: `frontend/src/chart-ir/analytics/forecastToVega.ts`, `ForecastDialog.jsx`, `ForecastStatsBadge.jsx`. Dependency added: `statsmodels>=0.14`. New config: `FORECAST_RATE_LIMIT_PER_60S=10`, `FORECAST_MAX_ROWS=10_000`, `FORECAST_TIMEOUT_SECONDS=10.0`, `FORECAST_MAX_HORIZON=200`. Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-9c-forecast-holt-winters.md`.
```

- [ ] **Step 3: Final verification**

Run: `cd backend && python -m pytest tests/test_forecast*.py -v` — expect ~31 tests pass.
Run: `cd frontend && npm run test:chart-ir -- "forecast|Forecast"` — expect new forecast tests pass.

- [ ] **Step 4: Commit**

```bash
git add docs/ANALYTICS_FORECAST.md docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): user guide + roadmap status for forecast (Plan 9c T10)"
```

---

## Self-Review Checklist (already performed by plan author)

- [x] **Spec coverage.** Brief deliverables 1–8 each map to a task: 1 → T1; 2 → T3+T4+T5; 3 → T6; 4 → T8; 5 → T9; 6 → T2; 7 → T1+T3+T4+T5+T6 tests; 8 → T10.
- [x] **Placeholder scan.** All steps include concrete code, file paths, and commands.
- [x] **Type consistency.** `ForecastSpec`, `ForecastModelFit`, `ForecastResult`, `_MODEL_KINDS`, `fit_one`, `fit_auto`, `fit_all`, `_confidence_band`, `_detect_season_length`, `validate_series`, `build_uniform_index`, `PreflightError`, `_FORECAST_RL_*`, `analystProForecasts`, `analystProForecastDialogCtx`, `addForecastAnalystPro`, `updateForecastAnalystPro`, `deleteForecastAnalystPro`, `openForecastDialogAnalystPro`, `closeForecastDialogAnalystPro`, `fetchForecast`, `compileForecast`, `ForecastDialog`, `ForecastStatsBadge` — all consistently named across backend / frontend / tests.
- [x] **Hyndman taxonomy** matches the brief's 8-kind set verbatim.
- [x] **AIC formula** matches the brief: `2k + n·ln(SSE/n)`.
- [x] **Tableau citations** present: `Build_Tableau.md` §XIII.1, §XIII.3, Appendix C `tabdocforecast`.
