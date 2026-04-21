# Analyst Pro — Plan 9b: Trend Line (linear / log / exp / power / polynomial)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 9 (Analytics Pane) slice #2 — Tableau-parity trend line with five least-squares fit types (linear, logarithmic, exponential, power, polynomial degree 2–8), factor-per-group fitting, confidence bands, and surfaced R² / p-value / SSE / RMSE per fit — exactly the surface documented in `Build_Tableau.md` §XIII.2 (`TrendLineFitType`, `FieldCaptionPairStatePresModel`, `GetEnableConfidenceBands`) and §XXIII Appendix C `tabdoctrendline`.

**Architecture:** Fit engine runs **server-side** (keeps scipy off the frontend bundle, matches Tableau's `tabdoctrendline` → backend service boundary). A new endpoint `POST /api/v1/analytics/trend-fit` accepts `{ rows, spec }`, groups by `factor_fields` if supplied, dispatches per group to the fit function, computes t-distribution prediction intervals for confidence bands, and returns `{ fits: [{factor_value, result}] }` where each `result` carries coefficients + equation + R² + p-value + SSE + RMSE + per-sample predictions (with optional `lower`/`upper`). The endpoint is feature-flagged on `FEATURE_ANALYST_PRO`, sliding-window rate-limited (20 calls / 30s per user — the calc-validate pattern at `backend/routers/query_routes.py:1653`), hard-capped at 100k input rows, and terminates inside a 5-second wall-clock budget. The frontend turns each fit into `VegaLiteLayer[]` (rule/line for the fit, band for confidence interval, tooltip for stats) via `trendLineToVega.ts`. The authoring dialog (`TrendLineDialog.jsx`) unparks the `trend_line` catalogue item added as `disabled: true` in Plan 9a T9 (`AnalyticsPanel.jsx:25`) and writes into the store via new `AnalystPro` CRUD actions that mirror the Plan 9a reference-line shape.

**Tech Stack:** Python 3.10 / numpy / scipy / pytest / FastAPI; React 19 / TypeScript 5.x / Vega-Lite (via `react-vega`) / Zustand / Vitest.

**Authoritative references:**
- `docs/Build_Tableau.md` §XIII.1 (analytics-pane catalogue), §XIII.2 (trend line fit types + stats + confidence bands), Appendix C (`tabdoctrendline` → Phase 6 / our module).
- `docs/analyst_pro_tableau_parity_roadmap.md` §Phase 9 / Plan 9b (authoritative scope).
- `CLAUDE.md` (shared conventions) and `QueryCopilot V1/CLAUDE.md` (codegen + `FEATURE_ANALYST_PRO`, BYOK boundary — trend fit has no LLM; no provider guardrail needed).
- Plan 9a shipped artifacts (reuse): `backend/vizql/analytics_types.py`, `backend/vizql/analytics_compiler.py`, `frontend/src/chart-ir/analytics/referenceLineToVega.ts`, `frontend/src/components/dashboard/freeform/panels/{AnalyticsPanel,ReferenceLineDialog}.jsx`.
- Rate-limit pattern: `backend/routers/query_routes.py:1646-1670` (`_CALC_RL_*` + `_enforce_calc_rate_limit`).

**Hard conventions (per Plan 9b scheduled-task brief + shared conventions):**
- Store action suffix `…AnalystPro`; state field prefix `analystPro…`.
- Commit per task: `feat(analyst-pro): <verb> <object> (Plan 9b T<N>)`.
- Fit engine is **server-side only** — no scipy in the browser bundle.
- R² + p-value + SSE + RMSE surfaced **always** (Tableau parity via `FieldCaptionPairStatePresModel`).
- Confidence bands are an **authored choice**, default off; level ∈ {0.90, 0.95, 0.99}.
- Max 100k input rows; hard 5-second wall-clock cap per request.
- TDD: every fit type has a golden numeric test with `numpy.testing.assert_allclose(..., rtol=1e-6)`; tolerance `1e-6` is intentional and required by the Plan 9b scheduled-task brief.
- Rate limit: 20 requests per 30s per user (mirrors `CALC_RATE_LIMIT_PER_30S` pattern; distinct counter).
- Vega-Lite only on the client (no custom canvas).
- Feature-gate: `FEATURE_ANALYST_PRO`.

---

## File Structure

### Backend — Python

| Path | Purpose | Touch |
|---|---|---|
| `backend/requirements.txt` | Add `numpy>=1.26` (likely transitively present via pandas, but pin explicitly) and `scipy>=1.12` under a new `# ── Analytics — Trend / Forecast / Cluster ───` section. | Modify |
| `backend/vizql/trend_line.py` | `TrendLineSpec` + `TrendFitResult` dataclasses with validation + wire-format `to_dict`/`from_dict`. **Not** a proto message for 9b — the fit result is transient wire data, not persisted in `VisualSpec`. | Create |
| `backend/vizql/trend_fit.py` | `fit_linear`, `fit_polynomial`, `fit_logarithmic`, `fit_exponential`, `fit_power`, `fit_all` (dispatcher), `_confidence_band` helper, `_format_equation` helper. Pure functions; no I/O. | Create |
| `backend/routers/query_routes.py` | Mount `POST /api/v1/analytics/trend-fit` via the same spliced-router trick used for `/api/v1/calcs/*` (see `query_routes.py:1638-1670` + the `APIRouter(prefix="/api/v1/calcs")` sibling pattern already present). Add `_enforce_trend_rate_limit`, `_TREND_RL_*` globals, reuse feature-flag + `get_current_user` guards. | Modify |
| `backend/config.py` | Add `TREND_RATE_LIMIT_PER_30S: int = 20`, `TREND_MAX_ROWS: int = 100_000`, `TREND_TIMEOUT_SECONDS: float = 5.0`. Update `docs/claude/config-defaults.md` in the same commit (CLAUDE.md rule). | Modify |
| `docs/claude/config-defaults.md` | New row under a `### Trend line (Plan 9b)` section for the three constants above. | Modify |
| `backend/tests/fixtures/trend/` | Golden JSON fixtures (inputs + expected coefficients within 1e-6) for each fit type. | Create |
| `backend/tests/test_trend_fit.py` | Unit tests per fit type with synthetic recovery (`y = 2x+3+noise` → `a≈2, b≈3`; `y = exp(0.5x)` → recovers `0.5`; polynomial degrees 2..8), confidence-band widening property, error cases (x≤0 for log/power; y≤0 for exp/power; constant y → R²≈0; degree > 8 rejected). | Create |
| `backend/tests/test_trend_fit_endpoint.py` | FastAPI integration: factor-grouped fit, 100k guard, 429 after 20 calls, 403 when `FEATURE_ANALYST_PRO=False`. | Create |

### Frontend — TypeScript / React

| Path | Purpose | Touch |
|---|---|---|
| `frontend/src/chart-ir/analytics/trendLineToVega.ts` | `compileTrendLine(spec, fits, chartWidth) → VegaLiteLayer[]` — per-factor `line` + optional `area` (confidence band) + tooltip. Re-exports the `TrendLineSpec` / `TrendFitResult` TS types inline (no proto regen — spec is 9b-local, not persisted). | Create |
| `frontend/src/chart-ir/analytics/__tests__/trendLineToVega.test.ts` | Vitest — spec + golden fit → golden Vega layer JSON. | Create |
| `frontend/src/chart-ir/analytics/__tests__/__fixtures__/trend-line-*.json` | Golden layer fixtures (3 cases: linear no-factor, polynomial factor, logarithmic with CI band). | Create |
| `frontend/src/api.js` | Add `fetchTrendFit(req)` — POST `/api/v1/analytics/trend-fit` with JWT, returns typed result. | Modify |
| `frontend/src/store.js` | Add `analystProTrendLines` list + `addTrendLineAnalystPro` / `updateTrendLineAnalystPro` / `deleteTrendLineAnalystPro` / `openTrendLineDialogAnalystPro` (mirrors reference-line shape). Wire history snapshot identically to Plan 9a T8. | Modify |
| `frontend/src/__tests__/store.trendLine.test.ts` | Vitest — CRUD + undo/redo round-trip. | Create |
| `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx` | Flip `{ id: 'trend_line', disabled: true }` (line 25) to an enabled item wired to `openTrendLineDialogAnalystPro`. | Modify |
| `frontend/src/components/dashboard/freeform/panels/TrendLineDialog.jsx` | Editor: fit-type picker (5 options), polynomial degree slider (2–8, shown only when fit = polynomial), factor-fields multi-select (populated from current marks-card dimension fields passed in as prop), confidence-band checkbox + level selector (0.90/0.95/0.99), color-by-factor checkbox, "Preview" button → calls `fetchTrendFit` → shows per-factor R² / p-value table. | Create |
| `frontend/src/components/dashboard/freeform/panels/TrendStatsBadge.jsx` | Info badge near a trend line: equation (LaTeX via KaTeX if available, else plain string), R² (2dp), p-value (scientific), N (sample count). Click expands to a full table with per-coefficient standard error. | Create |
| `frontend/src/components/dashboard/freeform/__tests__/TrendLineDialog.integration.test.tsx` | RTL — open dialog, choose polynomial deg 3, click Preview, assert per-factor R² renders. | Create |

---

## Task 1: Dependencies + TrendLineSpec / TrendFitResult dataclasses

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config.py` (3 new settings)
- Modify: `docs/claude/config-defaults.md`
- Create: `backend/vizql/trend_line.py`
- Create: `backend/tests/test_trend_line_types.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_trend_line_types.py`:

```python
"""Plan 9b T1 — TrendLineSpec + TrendFitResult dataclass round-trip + validation."""
import pytest

from vizql.trend_line import TrendLineSpec, TrendFitResult


def test_spec_round_trip_linear():
    spec = TrendLineSpec(
        fit_type="linear",
        degree=None,
        factor_fields=["region"],
        show_confidence_bands=True,
        confidence_level=0.95,
        color_by_factor=True,
        trend_line_label=True,
    )
    assert TrendLineSpec.from_dict(spec.to_dict()) == spec


def test_spec_polynomial_requires_degree_in_range():
    with pytest.raises(ValueError, match="degree"):
        TrendLineSpec(fit_type="polynomial", degree=1,
                      factor_fields=[], show_confidence_bands=False,
                      confidence_level=0.95, color_by_factor=False,
                      trend_line_label=False).validate()
    with pytest.raises(ValueError, match="degree"):
        TrendLineSpec(fit_type="polynomial", degree=9,
                      factor_fields=[], show_confidence_bands=False,
                      confidence_level=0.95, color_by_factor=False,
                      trend_line_label=False).validate()


def test_spec_non_polynomial_ignores_degree():
    # Linear/log/exp/power reject a degree value to avoid silent misuse.
    with pytest.raises(ValueError, match="degree only valid for polynomial"):
        TrendLineSpec(fit_type="linear", degree=3, factor_fields=[],
                      show_confidence_bands=False, confidence_level=0.95,
                      color_by_factor=False, trend_line_label=False).validate()


def test_spec_confidence_level_allowlist():
    with pytest.raises(ValueError, match="confidence_level"):
        TrendLineSpec(fit_type="linear", degree=None, factor_fields=[],
                      show_confidence_bands=True, confidence_level=0.80,
                      color_by_factor=False, trend_line_label=False).validate()


def test_fit_result_round_trip():
    r = TrendFitResult(
        coefficients=[2.0, 3.0],
        r_squared=0.987654321,
        p_value=1.2345e-6,
        sse=0.5,
        rmse=0.25,
        equation="y = 2.000*x + 3.000",
        predictions=[{"x": 1.0, "y": 5.0, "lower": 4.8, "upper": 5.2}],
    )
    assert TrendFitResult.from_dict(r.to_dict()) == r
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_trend_line_types.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vizql.trend_line'`.

- [ ] **Step 3: Add numpy + scipy to requirements**

Append to `backend/requirements.txt` (keep section-comment style consistent with existing blocks):

```
# ── Analytics — Trend / Forecast / Cluster ────────────────
numpy>=1.26
scipy>=1.12
```

Then run `cd backend && pip install -r requirements.txt` and verify `python -c "import numpy, scipy; print(numpy.__version__, scipy.__version__)"` prints versions ≥ 1.26 / ≥ 1.12.

- [ ] **Step 4: Add config constants** — `backend/config.py`, alongside the Plan 8 calc-editor block:

```python
# Plan 9b — Trend Line analytics endpoint.
TREND_RATE_LIMIT_PER_30S: int = 20
TREND_MAX_ROWS: int = 100_000
TREND_TIMEOUT_SECONDS: float = 5.0
```

- [ ] **Step 5: Document constants** — append a new section to `docs/claude/config-defaults.md` directly after the "Calc editor (Plan 8d)" block:

```markdown
### Trend line (Plan 9b)

| Constant | Value | Notes |
|---|---|---|
| `TREND_RATE_LIMIT_PER_30S` | `20` | Per-user sliding-window cap on `/api/v1/analytics/trend-fit`. 429 when exceeded. |
| `TREND_MAX_ROWS` | `100_000` | Reject input payloads over this count (413). Hard cap, not sampled. |
| `TREND_TIMEOUT_SECONDS` | `5.0` | Per-request wall-clock budget (504 when exceeded). |
```

- [ ] **Step 6: Implement `TrendLineSpec` + `TrendFitResult`** — `backend/vizql/trend_line.py`:

```python
"""Plan 9b — Trend line dataclasses.

These mirror the editor's wire format and the server's fit output. They
are *not* proto-backed: a trend fit is transient wire data, not persisted
in VisualSpec. Keeping them as simple dataclasses sidesteps a proto regen
for a run-per-request payload.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


_VALID_FITS = {"linear", "logarithmic", "exponential", "power", "polynomial"}
_VALID_LEVELS = {0.90, 0.95, 0.99}


@dataclass(frozen=True, slots=True)
class TrendLineSpec:
    fit_type: str
    degree: Optional[int]
    factor_fields: List[str]
    show_confidence_bands: bool
    confidence_level: float
    color_by_factor: bool
    trend_line_label: bool

    def validate(self) -> None:
        if self.fit_type not in _VALID_FITS:
            raise ValueError(
                f"fit_type must be one of {sorted(_VALID_FITS)}, got {self.fit_type!r}"
            )
        if self.fit_type == "polynomial":
            if self.degree is None or not 2 <= self.degree <= 8:
                raise ValueError("polynomial degree must be in [2, 8]")
        else:
            if self.degree is not None:
                raise ValueError("degree only valid for polynomial fit")
        if self.confidence_level not in _VALID_LEVELS:
            raise ValueError(
                f"confidence_level must be one of {sorted(_VALID_LEVELS)}"
            )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fit_type": self.fit_type,
            "degree": self.degree,
            "factor_fields": list(self.factor_fields),
            "show_confidence_bands": self.show_confidence_bands,
            "confidence_level": self.confidence_level,
            "color_by_factor": self.color_by_factor,
            "trend_line_label": self.trend_line_label,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TrendLineSpec":
        return cls(
            fit_type=d["fit_type"],
            degree=d.get("degree"),
            factor_fields=list(d.get("factor_fields") or []),
            show_confidence_bands=bool(d.get("show_confidence_bands", False)),
            confidence_level=float(d.get("confidence_level", 0.95)),
            color_by_factor=bool(d.get("color_by_factor", False)),
            trend_line_label=bool(d.get("trend_line_label", False)),
        )


@dataclass(frozen=True, slots=True)
class TrendFitResult:
    coefficients: List[float]
    r_squared: float
    p_value: float
    sse: float
    rmse: float
    equation: str
    predictions: List[Dict[str, float]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "coefficients": list(self.coefficients),
            "r_squared": self.r_squared,
            "p_value": self.p_value,
            "sse": self.sse,
            "rmse": self.rmse,
            "equation": self.equation,
            "predictions": [dict(p) for p in self.predictions],
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TrendFitResult":
        return cls(
            coefficients=list(d["coefficients"]),
            r_squared=float(d["r_squared"]),
            p_value=float(d["p_value"]),
            sse=float(d["sse"]),
            rmse=float(d["rmse"]),
            equation=str(d["equation"]),
            predictions=[dict(p) for p in d.get("predictions", [])],
        )


__all__ = ["TrendLineSpec", "TrendFitResult"]
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_trend_line_types.py -v`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/config.py docs/claude/config-defaults.md \
        backend/vizql/trend_line.py backend/tests/test_trend_line_types.py
git commit -m "feat(analyst-pro): trend line dataclasses + numpy/scipy deps (Plan 9b T1)"
```

---

## Task 2: Fit engine — linear + polynomial (core stats: R² / p-value / SSE / RMSE)

**Files:**
- Create: `backend/vizql/trend_fit.py`
- Create: `backend/tests/test_trend_fit.py`
- Create: `backend/tests/fixtures/trend/linear_golden.json`
- Create: `backend/tests/fixtures/trend/polynomial_golden.json`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_trend_fit.py`:

```python
"""Plan 9b T2 — linear + polynomial least-squares fit with R² / p-value / SSE / RMSE."""
import numpy as np
import numpy.testing as npt
import pytest

from vizql.trend_fit import fit_linear, fit_polynomial


def test_fit_linear_recovers_slope_and_intercept():
    rng = np.random.default_rng(42)
    x = np.linspace(0, 10, 200)
    noise = rng.normal(0, 0.01, size=x.shape)
    y = 2.0 * x + 3.0 + noise

    result = fit_linear(x.tolist(), y.tolist())

    # Coefficients ordered [slope, intercept] (polyfit high-to-low order).
    npt.assert_allclose(result.coefficients[0], 2.0, rtol=1e-3)
    npt.assert_allclose(result.coefficients[1], 3.0, rtol=1e-3)
    assert result.r_squared > 0.9999
    assert result.p_value < 1e-10
    assert result.sse > 0.0
    assert result.rmse > 0.0
    # Equation string should contain coefficients + x.
    assert "x" in result.equation


def test_fit_linear_constant_y_has_zero_r_squared():
    x = np.linspace(0, 10, 100).tolist()
    y = [5.0] * 100
    result = fit_linear(x, y)
    # SST == 0 → R² is defined as 0 (constant-y guard).
    assert result.r_squared == 0.0


def test_fit_linear_needs_two_points():
    with pytest.raises(ValueError, match="at least 2"):
        fit_linear([1.0], [2.0])


def test_fit_polynomial_recovers_degree_3():
    rng = np.random.default_rng(7)
    x = np.linspace(-5, 5, 500)
    # y = 0.5 x³ - 2 x² + x + 4
    y = 0.5 * x**3 - 2.0 * x**2 + x + 4.0 + rng.normal(0, 0.05, size=x.shape)
    result = fit_polynomial(x.tolist(), y.tolist(), degree=3)
    # polyfit returns highest-power-first: [0.5, -2, 1, 4]
    npt.assert_allclose(result.coefficients, [0.5, -2.0, 1.0, 4.0], rtol=5e-3, atol=5e-3)
    assert result.r_squared > 0.999


@pytest.mark.parametrize("degree", [2, 3, 4, 5, 6, 7, 8])
def test_fit_polynomial_all_supported_degrees(degree):
    rng = np.random.default_rng(degree)
    true_coeffs = rng.normal(0, 1, size=degree + 1).tolist()
    x = np.linspace(-2, 2, 400)
    y = np.polyval(true_coeffs, x)
    result = fit_polynomial(x.tolist(), y.tolist(), degree=degree)
    npt.assert_allclose(result.coefficients, true_coeffs, rtol=1e-6, atol=1e-6)
    assert result.r_squared == pytest.approx(1.0, abs=1e-9)


def test_fit_polynomial_rejects_degree_gt_8():
    with pytest.raises(ValueError, match="degree"):
        fit_polynomial([1.0, 2.0, 3.0], [1.0, 4.0, 9.0], degree=9)


def test_fit_polynomial_requires_min_samples():
    # Need at least degree+1 distinct points.
    with pytest.raises(ValueError, match="at least"):
        fit_polynomial([1.0, 2.0], [1.0, 4.0], degree=3)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_trend_fit.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vizql.trend_fit'`.

- [ ] **Step 3: Implement the fit engine core** — `backend/vizql/trend_fit.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_trend_fit.py -v`
Expected: PASS (10 tests — 7 linear/constant/validation + 7 parametrised polynomial cases, minus param duplication).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/trend_fit.py backend/tests/test_trend_fit.py
git commit -m "feat(analyst-pro): linear + polynomial fits with R²/p/SSE/RMSE (Plan 9b T2)"
```

---

## Task 3: Transform-based fits (log / exp / power) + domain guards

**Files:**
- Modify: `backend/vizql/trend_fit.py`
- Modify: `backend/tests/test_trend_fit.py`

- [ ] **Step 1: Append failing tests** — at the bottom of `backend/tests/test_trend_fit.py`:

```python
from vizql.trend_fit import fit_logarithmic, fit_exponential, fit_power


def test_fit_logarithmic_recovers_coefficients():
    # y = 2 ln(x) + 3
    x = np.linspace(0.5, 50, 300)
    y = 2.0 * np.log(x) + 3.0
    r = fit_logarithmic(x.tolist(), y.tolist())
    npt.assert_allclose(r.coefficients, [2.0, 3.0], rtol=1e-6)
    assert r.r_squared == pytest.approx(1.0, abs=1e-9)
    assert "ln(x)" in r.equation


def test_fit_logarithmic_rejects_nonpositive_x():
    with pytest.raises(ValueError, match="x > 0"):
        fit_logarithmic([0.0, 1.0, 2.0], [1.0, 2.0, 3.0])
    with pytest.raises(ValueError, match="x > 0"):
        fit_logarithmic([-1.0, 2.0], [1.0, 2.0])


def test_fit_exponential_recovers_coefficients():
    # y = 1.5 * exp(0.4 x)
    x = np.linspace(0, 4, 200)
    y = 1.5 * np.exp(0.4 * x)
    r = fit_exponential(x.tolist(), y.tolist())
    npt.assert_allclose(r.coefficients, [1.5, 0.4], rtol=1e-6)
    assert "exp" in r.equation


def test_fit_exponential_rejects_nonpositive_y():
    with pytest.raises(ValueError, match="y > 0"):
        fit_exponential([1.0, 2.0], [1.0, 0.0])


def test_fit_power_recovers_coefficients():
    # y = 3 * x^0.5
    x = np.linspace(0.1, 10, 300)
    y = 3.0 * x ** 0.5
    r = fit_power(x.tolist(), y.tolist())
    npt.assert_allclose(r.coefficients, [3.0, 0.5], rtol=1e-6)
    assert "^" in r.equation


def test_fit_power_rejects_nonpositive():
    with pytest.raises(ValueError, match="x > 0 and y > 0"):
        fit_power([0.0, 1.0], [1.0, 2.0])
    with pytest.raises(ValueError, match="x > 0 and y > 0"):
        fit_power([1.0, 2.0], [-1.0, 2.0])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_trend_fit.py -v -k "logarithmic or exponential or power"`
Expected: FAIL — `ImportError: cannot import name 'fit_logarithmic' ...`.

- [ ] **Step 3: Add transform-based fits** — append to `backend/vizql/trend_fit.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_trend_fit.py -v`
Expected: PASS (all linear + polynomial + log + exp + power tests).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/trend_fit.py backend/tests/test_trend_fit.py
git commit -m "feat(analyst-pro): log/exp/power transform fits + domain guards (Plan 9b T3)"
```

---

## Task 4: Confidence bands + factor-grouped dispatcher

**Files:**
- Modify: `backend/vizql/trend_fit.py`
- Modify: `backend/tests/test_trend_fit.py`

- [ ] **Step 1: Append failing tests**:

```python
from vizql.trend_fit import fit_all, add_confidence_band
from vizql.trend_line import TrendLineSpec


def test_confidence_band_widens_at_extremes():
    """t-distribution prediction interval is narrowest near x̄, widest at the edges."""
    x = np.linspace(0, 10, 100)
    y = 2.0 * x + 3.0 + np.random.default_rng(0).normal(0, 1, size=x.shape)
    r = fit_linear(x.tolist(), y.tolist())
    r_band = add_confidence_band(r, x.tolist(), y.tolist(), level=0.95, fit_type="linear")
    preds = r_band.predictions
    # All prediction dicts now carry lower/upper.
    assert all("lower" in p and "upper" in p for p in preds)
    # Width at the boundary > width near the centre.
    widths = [p["upper"] - p["lower"] for p in preds]
    centre_idx = len(widths) // 2
    assert widths[0] > widths[centre_idx]
    assert widths[-1] > widths[centre_idx]


def test_fit_all_groups_by_factor():
    # Two factor groups with distinct slopes.
    rows = (
        [{"x": xi, "y": 2.0 * xi + 1.0, "factor": "A"} for xi in np.linspace(0, 10, 50)]
        + [{"x": xi, "y": -1.0 * xi + 5.0, "factor": "B"} for xi in np.linspace(0, 10, 50)]
    )
    spec = TrendLineSpec(
        fit_type="linear", degree=None, factor_fields=["factor"],
        show_confidence_bands=False, confidence_level=0.95,
        color_by_factor=True, trend_line_label=True,
    )
    fits = fit_all(rows, spec)
    by_factor = {f["factor_value"]: f["result"] for f in fits}
    assert set(by_factor.keys()) == {"A", "B"}
    npt.assert_allclose(by_factor["A"].coefficients[0], 2.0, rtol=1e-6)
    npt.assert_allclose(by_factor["B"].coefficients[0], -1.0, rtol=1e-6)


def test_fit_all_no_factor_returns_single_group():
    rows = [{"x": i, "y": 2 * i + 1} for i in range(10)]
    spec = TrendLineSpec(
        fit_type="linear", degree=None, factor_fields=[],
        show_confidence_bands=False, confidence_level=0.95,
        color_by_factor=False, trend_line_label=False,
    )
    fits = fit_all(rows, spec)
    assert len(fits) == 1
    assert fits[0]["factor_value"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_trend_fit.py -v -k "confidence or fit_all"`
Expected: FAIL — `ImportError: cannot import name 'fit_all' ...`.

- [ ] **Step 3: Add confidence bands + dispatcher** — append to `backend/vizql/trend_fit.py`:

```python
from collections import OrderedDict
from typing import Any, Dict, List, Optional

from vizql.trend_line import TrendLineSpec


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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_trend_fit.py -v`
Expected: PASS (all T2 + T3 + T4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/trend_fit.py backend/tests/test_trend_fit.py
git commit -m "feat(analyst-pro): confidence bands + factor dispatcher (Plan 9b T4)"
```

---

## Task 5: `POST /api/v1/analytics/trend-fit` endpoint

**Files:**
- Modify: `backend/routers/query_routes.py` (splice a sub-router like the Plan 8 `/api/v1/calcs/*` block at lines 1630+)
- Create: `backend/tests/test_trend_fit_endpoint.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_trend_fit_endpoint.py`:

```python
"""Plan 9b T5 — /api/v1/analytics/trend-fit endpoint."""
import pytest
from fastapi.testclient import TestClient

from config import settings
from main import app

pytestmark = pytest.mark.usefixtures("fresh_user")  # project-local fixture; mint JWT.


@pytest.fixture
def client_and_auth(fresh_user):
    c = TestClient(app)
    token = fresh_user["access_token"]
    return c, {"Authorization": f"Bearer {token}"}


def test_trend_fit_linear_no_factor(client_and_auth):
    c, auth = client_and_auth
    rows = [{"x": i, "y": 2 * i + 3} for i in range(20)]
    body = {
        "rows": rows,
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": True,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["fits"]) == 1
    fit = data["fits"][0]
    assert fit["factor_value"] is None
    assert fit["result"]["coefficients"][0] == pytest.approx(2.0, rel=1e-6)
    assert fit["result"]["r_squared"] > 0.9999


def test_trend_fit_by_factor(client_and_auth):
    c, auth = client_and_auth
    rows = (
        [{"x": i, "y": 2 * i + 1, "region": "A"} for i in range(20)]
        + [{"x": i, "y": -i + 5, "region": "B"} for i in range(20)]
    )
    body = {
        "rows": rows,
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": ["region"],
            "show_confidence_bands": True, "confidence_level": 0.95,
            "color_by_factor": True, "trend_line_label": True,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 200
    fits = r.json()["fits"]
    assert {f["factor_value"] for f in fits} == {"A", "B"}
    # Confidence bands → every prediction carries lower/upper.
    for f in fits:
        assert all("lower" in p for p in f["result"]["predictions"])


def test_trend_fit_rejects_too_many_rows(client_and_auth, monkeypatch):
    monkeypatch.setattr(settings, "TREND_MAX_ROWS", 10)
    c, auth = client_and_auth
    body = {
        "rows": [{"x": i, "y": i} for i in range(20)],
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": False,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 413


def test_trend_fit_rate_limit(client_and_auth, monkeypatch):
    monkeypatch.setattr(settings, "TREND_RATE_LIMIT_PER_30S", 2)
    c, auth = client_and_auth
    body = {
        "rows": [{"x": 1, "y": 1}, {"x": 2, "y": 2}, {"x": 3, "y": 3}],
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": False,
        },
    }
    assert c.post("/api/v1/analytics/trend-fit", json=body, headers=auth).status_code == 200
    assert c.post("/api/v1/analytics/trend-fit", json=body, headers=auth).status_code == 200
    assert c.post("/api/v1/analytics/trend-fit", json=body, headers=auth).status_code == 429


def test_trend_fit_feature_flag_gates(client_and_auth, monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False)
    c, auth = client_and_auth
    body = {
        "rows": [{"x": 1, "y": 1}, {"x": 2, "y": 2}],
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": False,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 403


def test_trend_fit_rejects_invalid_spec(client_and_auth):
    c, auth = client_and_auth
    body = {
        "rows": [{"x": 1, "y": 1}, {"x": 2, "y": 2}],
        "spec": {
            "fit_type": "polynomial", "degree": 9, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": False,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 400
    assert "degree" in r.text.lower()
```

> **Fixture note:** `fresh_user` is an existing fixture in `backend/tests/conftest.py` used by all Plan 7+ endpoint tests. If it is not present in the repo at implementation time, mirror the pattern from `backend/tests/test_analytics_endpoint.py` — do not invent a new auth shortcut.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_trend_fit_endpoint.py -v`
Expected: FAIL — 404 from unknown route.

- [ ] **Step 3: Add endpoint** — at the bottom of `backend/routers/query_routes.py`, directly after the calc-routes splice block (near line 1810, after the last `router.routes.append(...)` call for `_calc_router`), add:

```python
# Plan 9b — Trend line fit endpoint. Separate sub-router spliced onto
# `router.routes` so FastAPI mounts it at /api/v1/analytics/trend-fit
# (cannot modify main.py).

_TREND_RL_LOCK = _Lock()
_TREND_RL_TIMESTAMPS: dict[str, list[float]] = _collections.defaultdict(list)


def _enforce_trend_rate_limit(email: str) -> None:
    now = time.time()
    window = 30.0
    cap = settings.TREND_RATE_LIMIT_PER_30S
    with _TREND_RL_LOCK:
        ts = [t for t in _TREND_RL_TIMESTAMPS[email] if t > now - window]
        if len(ts) >= cap:
            raise HTTPException(
                status_code=429,
                detail=f"trend-fit rate limit: max {cap} per 30s",
            )
        ts.append(now)
        _TREND_RL_TIMESTAMPS[email] = ts


class _TrendFitRow(BaseModel):
    x: float
    y: float

    class Config:
        extra = "allow"  # factor columns pass through


class _TrendFitRequest(BaseModel):
    rows: list[dict]
    spec: dict


_trend_router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@_trend_router.post("/trend-fit")
def trend_fit(
    req: _TrendFitRequest,
    user: dict = Depends(get_current_user),
):
    """Fit a trend line per factor group. See `backend/vizql/trend_fit.py`."""
    if not settings.FEATURE_ANALYST_PRO:
        raise HTTPException(status_code=403, detail="FEATURE_ANALYST_PRO disabled")

    email = user["email"]
    _enforce_trend_rate_limit(email)

    if len(req.rows) > settings.TREND_MAX_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"trend-fit payload exceeds TREND_MAX_ROWS={settings.TREND_MAX_ROWS}",
        )

    from vizql.trend_fit import fit_all
    from vizql.trend_line import TrendLineSpec

    try:
        spec = TrendLineSpec.from_dict(req.spec)
        spec.validate()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid spec: {exc}") from exc

    # 5-second wall-clock budget via signal alarm is not portable (Windows).
    # Use a monotonic check around `fit_all` and bail with 504 if exceeded.
    start = time.monotonic()
    try:
        fits = fit_all(req.rows, spec)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    elapsed = time.monotonic() - start
    if elapsed > settings.TREND_TIMEOUT_SECONDS:
        raise HTTPException(
            status_code=504,
            detail=f"trend-fit exceeded {settings.TREND_TIMEOUT_SECONDS:.1f}s (took {elapsed:.2f}s)",
        )

    # Wire-format flatten: result → dict.
    return {
        "fits": [
            {"factor_value": f["factor_value"], "result": f["result"].to_dict()}
            for f in fits
        ]
    }


# Splice _trend_router's routes onto the primary router so main.py mounts them.
for _r in _trend_router.routes:
    router.routes.append(_r)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_trend_fit_endpoint.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Run full backend suite for regression**

Run: `cd backend && python -m pytest tests/ -v -x`
Expected: PASS (516+ existing + 20+ new from T1–T5).

- [ ] **Step 6: Commit**

```bash
git add backend/routers/query_routes.py backend/tests/test_trend_fit_endpoint.py
git commit -m "feat(analyst-pro): POST /api/v1/analytics/trend-fit endpoint (Plan 9b T5)"
```

---

## Task 6: Frontend `trendLineToVega.ts` compiler

**Files:**
- Create: `frontend/src/chart-ir/analytics/trendLineToVega.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/trendLineToVega.test.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/trend-line-linear.json`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/trend-line-polynomial-factor.json`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/trend-line-log-band.json`

- [ ] **Step 1: Write the failing test** — `frontend/src/chart-ir/analytics/__tests__/trendLineToVega.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { compileTrendLine, type TrendLineSpec, type TrendFit } from '../trendLineToVega';

import linearFixture from './__fixtures__/trend-line-linear.json';
import polyFactorFixture from './__fixtures__/trend-line-polynomial-factor.json';
import logBandFixture from './__fixtures__/trend-line-log-band.json';

describe('compileTrendLine', () => {
  it('emits a single line mark + tooltip for linear no-factor', () => {
    const spec: TrendLineSpec = linearFixture.spec;
    const fits: TrendFit[] = linearFixture.fits;
    const layers = compileTrendLine(spec, fits);
    expect(layers).toHaveLength(1);
    expect(layers[0].mark.type).toBe('line');
    expect(layers[0].mark.tooltip).toBe(true);
    expect(layers[0].data.values).toEqual(fits[0].result.predictions);
  });

  it('emits line + band layers per factor when confidence bands enabled', () => {
    const { spec, fits } = logBandFixture as any;
    const layers = compileTrendLine(spec, fits);
    // One band + one line per factor group. Fixture has 2 groups.
    expect(layers.filter((l: any) => l.mark.type === 'area')).toHaveLength(2);
    expect(layers.filter((l: any) => l.mark.type === 'line')).toHaveLength(2);
  });

  it('colors by factor when color_by_factor is set', () => {
    const { spec, fits } = polyFactorFixture as any;
    const layers = compileTrendLine(spec, fits);
    // Each line layer carries a constant color encoding derived from factor_value.
    const lines = layers.filter((l: any) => l.mark.type === 'line');
    const colors = lines.map((l: any) => l.encoding?.color?.value);
    expect(new Set(colors).size).toBe(lines.length);
  });

  it('surfaces equation + R² + p-value in tooltip channel', () => {
    const spec: TrendLineSpec = linearFixture.spec;
    const fits: TrendFit[] = linearFixture.fits;
    const layers = compileTrendLine(spec, fits);
    const tooltip = layers[0].encoding?.tooltip;
    expect(Array.isArray(tooltip)).toBe(true);
    const fields = (tooltip as any[]).map((t) => t.field ?? t.title);
    expect(fields.some((f: string) => /equation/i.test(f))).toBe(true);
    expect(fields.some((f: string) => /r.?squared/i.test(f))).toBe(true);
  });
});
```

- [ ] **Step 2: Create the fixtures** — minimal JSON that satisfies the assertions. Example `trend-line-linear.json`:

```json
{
  "spec": {
    "fit_type": "linear",
    "degree": null,
    "factor_fields": [],
    "show_confidence_bands": false,
    "confidence_level": 0.95,
    "color_by_factor": false,
    "trend_line_label": true
  },
  "fits": [
    {
      "factor_value": null,
      "result": {
        "coefficients": [2.0, 3.0],
        "r_squared": 0.9998,
        "p_value": 1.2e-15,
        "sse": 0.02,
        "rmse": 0.045,
        "equation": "y = 2.0000*x + 3.0000",
        "predictions": [
          {"x": 0, "y": 3.0},
          {"x": 1, "y": 5.0},
          {"x": 2, "y": 7.0}
        ]
      }
    }
  ]
}
```

Build the other two fixtures with two factor groups and (for `log-band`) `lower`/`upper` on each prediction and `show_confidence_bands: true`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- --run analytics/__tests__/trendLineToVega`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `trendLineToVega.ts`**:

```typescript
/**
 * Plan 9b — compile a TrendLineSpec + per-factor fit results into
 * Vega-Lite layered spec fragments (line + optional CI band + tooltip).
 *
 * Kept framework-agnostic: returns raw `VegaLiteLayer[]` that the
 * existing `VegaRenderer.tsx` can merge into an encoding.layer stanza.
 */

export interface TrendLineSpec {
  fit_type: 'linear' | 'logarithmic' | 'exponential' | 'power' | 'polynomial';
  degree: number | null;
  factor_fields: string[];
  show_confidence_bands: boolean;
  confidence_level: number;
  color_by_factor: boolean;
  trend_line_label: boolean;
}

export interface TrendFitResult {
  coefficients: number[];
  r_squared: number;
  p_value: number;
  sse: number;
  rmse: number;
  equation: string;
  predictions: Array<{ x: number; y: number; lower?: number; upper?: number }>;
}

export interface TrendFit {
  factor_value: string | number | (string | number)[] | null;
  result: TrendFitResult;
}

/** Deterministic Vega-compatible color palette (10-way). */
const PALETTE = [
  '#4C78A8', '#F58518', '#54A24B', '#E45756', '#72B7B2',
  '#EECA3B', '#B279A2', '#9D755D', '#BAB0AC', '#FF9DA6',
];

function colorFor(factorValue: TrendFit['factor_value'], index: number): string {
  if (factorValue == null) return PALETTE[0];
  // Stable, deterministic mapping keyed on string form for stability across renders.
  const key = JSON.stringify(factorValue);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length] ?? PALETTE[index % PALETTE.length];
}

export interface VegaLiteLayer {
  mark: { type: 'line' | 'area'; tooltip?: boolean; opacity?: number; interpolate?: string };
  data: { values: Array<Record<string, unknown>> };
  encoding: Record<string, unknown>;
}

export function compileTrendLine(spec: TrendLineSpec, fits: TrendFit[]): VegaLiteLayer[] {
  const layers: VegaLiteLayer[] = [];

  fits.forEach((fit, i) => {
    const color = spec.color_by_factor ? colorFor(fit.factor_value, i) : PALETTE[0];
    const statsValues = fit.result.predictions.map((p) => ({
      ...p,
      equation: fit.result.equation,
      r_squared: fit.result.r_squared,
      p_value: fit.result.p_value,
      n: fit.result.predictions.length,
      factor: fit.factor_value,
    }));

    if (spec.show_confidence_bands) {
      layers.push({
        mark: { type: 'area', opacity: 0.18 },
        data: { values: statsValues },
        encoding: {
          x: { field: 'x', type: 'quantitative' },
          y: { field: 'lower', type: 'quantitative' },
          y2: { field: 'upper' },
          color: { value: color },
        },
      });
    }

    layers.push({
      mark: { type: 'line', tooltip: true, interpolate: 'monotone' },
      data: { values: statsValues },
      encoding: {
        x: { field: 'x', type: 'quantitative' },
        y: { field: 'y', type: 'quantitative' },
        color: { value: color },
        tooltip: [
          { field: 'equation', type: 'nominal', title: 'equation' },
          { field: 'r_squared', type: 'quantitative', title: 'R²', format: '.4f' },
          { field: 'p_value', type: 'quantitative', title: 'p-value', format: '.2e' },
          { field: 'n', type: 'quantitative', title: 'N' },
        ],
      },
    });
  });

  return layers;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm run test:chart-ir -- --run analytics/__tests__/trendLineToVega`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/chart-ir/analytics/trendLineToVega.ts \
        frontend/src/chart-ir/analytics/__tests__/trendLineToVega.test.ts \
        frontend/src/chart-ir/analytics/__tests__/__fixtures__/trend-line-*.json
git commit -m "feat(analyst-pro): trendLineToVega.ts Vega-Lite compiler (Plan 9b T6)"
```

---

## Task 7: Store actions + un-park catalogue item + `TrendLineDialog.jsx`

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/TrendLineDialog.jsx`
- Create: `frontend/src/__tests__/store.trendLine.test.ts`

- [ ] **Step 1: Write the failing store test** — `frontend/src/__tests__/store.trendLine.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';

describe('store — analystProTrendLines CRUD + history', () => {
  beforeEach(() => {
    useStore.setState((s: any) => ({ ...s, analystProTrendLines: [], analystProHistory: [], analystProFuture: [] }));
  });

  it('addTrendLineAnalystPro appends + snapshots history', () => {
    const before = useStore.getState().analystProHistory?.length ?? 0;
    useStore.getState().addTrendLineAnalystPro({
      id: 't1',
      tileId: 'chart-1',
      spec: {
        fit_type: 'linear', degree: null, factor_fields: [],
        show_confidence_bands: false, confidence_level: 0.95,
        color_by_factor: false, trend_line_label: true,
      },
      fits: [],
    });
    const after = useStore.getState();
    expect(after.analystProTrendLines).toHaveLength(1);
    expect((after.analystProHistory?.length ?? 0)).toBe(before + 1);
  });

  it('updateTrendLineAnalystPro mutates matching id', () => {
    useStore.getState().addTrendLineAnalystPro({
      id: 't1', tileId: 'chart-1',
      spec: { fit_type: 'linear', degree: null, factor_fields: [], show_confidence_bands: false, confidence_level: 0.95, color_by_factor: false, trend_line_label: false },
      fits: [],
    });
    useStore.getState().updateTrendLineAnalystPro('t1', {
      spec: { fit_type: 'polynomial', degree: 3, factor_fields: [], show_confidence_bands: true, confidence_level: 0.99, color_by_factor: false, trend_line_label: true },
    });
    const tl = useStore.getState().analystProTrendLines[0];
    expect(tl.spec.fit_type).toBe('polynomial');
    expect(tl.spec.degree).toBe(3);
  });

  it('deleteTrendLineAnalystPro removes by id', () => {
    useStore.getState().addTrendLineAnalystPro({
      id: 't1', tileId: 'c', spec: { fit_type: 'linear', degree: null, factor_fields: [], show_confidence_bands: false, confidence_level: 0.95, color_by_factor: false, trend_line_label: false }, fits: [],
    });
    useStore.getState().deleteTrendLineAnalystPro('t1');
    expect(useStore.getState().analystProTrendLines).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:chart-ir -- --run __tests__/store.trendLine`
Expected: FAIL — `addTrendLineAnalystPro is not a function`.

- [ ] **Step 3: Add store actions + API helper**

In `frontend/src/store.js`, next to the Plan 9a `addReferenceLineAnalystPro` block, add:

```js
analystProTrendLines: [],

addTrendLineAnalystPro: (tl) => set((s) => {
  _snapshotHistory(s);  // same helper Plan 9a uses; keep import local
  return { analystProTrendLines: [...s.analystProTrendLines, tl] };
}),

updateTrendLineAnalystPro: (id, patch) => set((s) => {
  _snapshotHistory(s);
  return {
    analystProTrendLines: s.analystProTrendLines.map((tl) =>
      tl.id === id ? { ...tl, ...patch, spec: { ...tl.spec, ...(patch.spec ?? {}) } } : tl
    ),
  };
}),

deleteTrendLineAnalystPro: (id) => set((s) => {
  _snapshotHistory(s);
  return { analystProTrendLines: s.analystProTrendLines.filter((tl) => tl.id !== id) };
}),

openTrendLineDialogAnalystPro: (ctx) => set({ analystProTrendLineDialogCtx: ctx }),
closeTrendLineDialogAnalystPro: () => set({ analystProTrendLineDialogCtx: null }),
analystProTrendLineDialogCtx: null,
```

In `frontend/src/api.js`, add:

```js
export async function fetchTrendFit(body) {
  const r = await apiFetch('/api/v1/analytics/trend-fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
```

(Reuse the existing `apiFetch` wrapper — already injects the JWT Authorization header.)

- [ ] **Step 4: Run store test**

Run: `cd frontend && npm run test:chart-ir -- --run __tests__/store.trendLine`
Expected: PASS (3 tests).

- [ ] **Step 5: Un-park the catalogue item** — in `AnalyticsPanel.jsx` at line 25, replace:

```jsx
  { id: 'trend_line',             label: 'Trend Line',             kind: 'trend',    disabled: true },
```

with:

```jsx
  { id: 'trend_line', label: 'Trend Line', kind: 'trend_line' },
```

and extend the `onDoubleClick` handler to branch on `kind === 'trend_line'` → call `openTrendLineDialogAnalystPro({ kind, preset })` (pull the setter via `useStore` alongside the existing `openReferenceLineDialogAnalystPro`).

- [ ] **Step 6: Implement `TrendLineDialog.jsx`**

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../../store';
import { fetchTrendFit } from '../../../../api';

const FIT_TYPES = [
  { value: 'linear',       label: 'Linear' },
  { value: 'logarithmic',  label: 'Logarithmic' },
  { value: 'exponential',  label: 'Exponential' },
  { value: 'power',        label: 'Power' },
  { value: 'polynomial',   label: 'Polynomial' },
];

const CONFIDENCE_LEVELS = [0.90, 0.95, 0.99];

export default function TrendLineDialog() {
  const ctx = useStore((s) => s.analystProTrendLineDialogCtx);
  const close = useStore((s) => s.closeTrendLineDialogAnalystPro);
  const addTrendLine = useStore((s) => s.addTrendLineAnalystPro);
  const availableDims = useStore((s) => s.analystProCurrentMarksCardDims ?? []);

  const [fitType, setFitType] = useState(ctx?.preset?.fit_type ?? 'linear');
  const [degree, setDegree] = useState(ctx?.preset?.degree ?? 2);
  const [factorFields, setFactorFields] = useState([]);
  const [showBands, setShowBands] = useState(false);
  const [confidenceLevel, setConfidenceLevel] = useState(0.95);
  const [colorByFactor, setColorByFactor] = useState(false);
  const [trendLabel, setTrendLabel] = useState(true);
  const [previewFits, setPreviewFits] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loading, setLoading] = useState(false);

  const spec = useMemo(() => ({
    fit_type: fitType,
    degree: fitType === 'polynomial' ? degree : null,
    factor_fields: factorFields,
    show_confidence_bands: showBands,
    confidence_level: confidenceLevel,
    color_by_factor: colorByFactor,
    trend_line_label: trendLabel,
  }), [fitType, degree, factorFields, showBands, confidenceLevel, colorByFactor, trendLabel]);

  async function handlePreview() {
    setLoading(true); setPreviewError(null);
    try {
      const rows = ctx?.rows ?? [];
      const { fits } = await fetchTrendFit({ rows, spec });
      setPreviewFits(fits);
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    if (!ctx) return;
    addTrendLine({
      id: `trend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tileId: ctx.tileId,
      spec,
      fits: previewFits ?? [],
    });
    close();
  }

  if (!ctx) return null;

  return (
    <div role="dialog" aria-label="Trend line editor" className="trend-line-dialog">
      <header><h3>Trend Line</h3></header>

      <label>Fit type
        <select value={fitType} onChange={(e) => setFitType(e.target.value)}>
          {FIT_TYPES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </label>

      {fitType === 'polynomial' && (
        <label>Degree
          <input type="range" min={2} max={8} value={degree} onChange={(e) => setDegree(Number(e.target.value))} />
          <span>{degree}</span>
        </label>
      )}

      <fieldset>
        <legend>Factors</legend>
        {availableDims.map((d) => (
          <label key={d}>
            <input
              type="checkbox"
              checked={factorFields.includes(d)}
              onChange={(e) =>
                setFactorFields((prev) => e.target.checked ? [...prev, d] : prev.filter((f) => f !== d))
              }
            /> {d}
          </label>
        ))}
      </fieldset>

      <label>
        <input type="checkbox" checked={showBands} onChange={(e) => setShowBands(e.target.checked)} />
        Confidence bands
      </label>

      {showBands && (
        <label>Level
          <select value={confidenceLevel} onChange={(e) => setConfidenceLevel(Number(e.target.value))}>
            {CONFIDENCE_LEVELS.map((l) => <option key={l} value={l}>{(l * 100).toFixed(0)}%</option>)}
          </select>
        </label>
      )}

      <label>
        <input type="checkbox" checked={colorByFactor} onChange={(e) => setColorByFactor(e.target.checked)} />
        Color by factor
      </label>

      <label>
        <input type="checkbox" checked={trendLabel} onChange={(e) => setTrendLabel(e.target.checked)} />
        Show trend line label
      </label>

      <button type="button" onClick={handlePreview} disabled={loading}>
        {loading ? 'Fitting…' : 'Preview'}
      </button>

      {previewError && <p role="alert" style={{ color: 'var(--danger)' }}>{previewError}</p>}

      {previewFits && (
        <table className="trend-preview-stats">
          <thead><tr><th>Factor</th><th>R²</th><th>p-value</th><th>N</th></tr></thead>
          <tbody>
            {previewFits.map((f, i) => (
              <tr key={i}>
                <td>{f.factor_value == null ? '(all)' : String(f.factor_value)}</td>
                <td>{f.result.r_squared.toFixed(2)}</td>
                <td>{f.result.p_value.toExponential(2)}</td>
                <td>{f.result.predictions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer>
        <button type="button" onClick={close}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={!previewFits}>Save</button>
      </footer>
    </div>
  );
}
```

Mount the dialog in `AnalystProSidebar.jsx` (or wherever `ReferenceLineDialog` is already mounted — grep for `<ReferenceLineDialog` and add `<TrendLineDialog />` directly alongside).

- [ ] **Step 7: Run tests**

Run: `cd frontend && npm run test:chart-ir -- --run __tests__/store.trendLine`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/store.js frontend/src/api.js \
        frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx \
        frontend/src/components/dashboard/freeform/panels/TrendLineDialog.jsx \
        frontend/src/__tests__/store.trendLine.test.ts
git commit -m "feat(analyst-pro): TrendLineDialog + store actions (Plan 9b T7)"
```

---

## Task 8: `TrendStatsBadge.jsx` + integration test

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/TrendStatsBadge.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/TrendLineDialog.integration.test.tsx`

- [ ] **Step 1: Write the failing integration test**:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useStore } from '../../../../store';
import TrendLineDialog from '../panels/TrendLineDialog';
import * as api from '../../../../api';

describe('TrendLineDialog — integration', () => {
  beforeEach(() => {
    useStore.setState((s: any) => ({
      ...s,
      analystProTrendLines: [],
      analystProTrendLineDialogCtx: {
        kind: 'trend_line',
        tileId: 'c1',
        rows: [
          { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 },
        ],
      },
      analystProCurrentMarksCardDims: ['region'],
    }));
  });

  it('fits polynomial degree 3 and displays R² in preview table', async () => {
    vi.spyOn(api, 'fetchTrendFit').mockResolvedValue({
      fits: [{
        factor_value: null,
        result: {
          coefficients: [0.5, -2, 1, 4],
          r_squared: 0.9876,
          p_value: 1.2e-9,
          sse: 0.3,
          rmse: 0.1,
          equation: 'y = 0.5*x^3 -2*x^2 + x + 4',
          predictions: [{ x: 1, y: 3.5 }],
        },
      }],
    });

    render(<TrendLineDialog />);
    fireEvent.change(screen.getByLabelText(/fit type/i), { target: { value: 'polynomial' } });
    fireEvent.change(screen.getByLabelText(/degree/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));

    await waitFor(() => {
      expect(screen.getByText('0.99')).toBeInTheDocument();      // R² rounded
      expect(screen.getByText(/1\.20e-9/i)).toBeInTheDocument(); // p-value
    });
  });
});
```

- [ ] **Step 2: Implement `TrendStatsBadge.jsx`**:

```jsx
import React, { useState } from 'react';

export default function TrendStatsBadge({ fit }) {
  const [expanded, setExpanded] = useState(false);
  if (!fit?.result) return null;
  const r = fit.result;

  return (
    <div className="trend-stats-badge">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        title={r.equation}
        style={{
          fontSize: 11,
          padding: '2px 6px',
          borderRadius: 3,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
        }}
      >
        R²={r.r_squared.toFixed(2)} · p={r.p_value.toExponential(1)} · N={r.predictions.length}
      </button>
      {expanded && (
        <table className="trend-stats-table" style={{ fontSize: 11, marginTop: 4 }}>
          <tbody>
            <tr><th>Equation</th><td><code>{r.equation}</code></td></tr>
            <tr><th>R²</th><td>{r.r_squared.toFixed(6)}</td></tr>
            <tr><th>p-value</th><td>{r.p_value.toExponential(3)}</td></tr>
            <tr><th>SSE</th><td>{r.sse.toExponential(3)}</td></tr>
            <tr><th>RMSE</th><td>{r.rmse.toExponential(3)}</td></tr>
            {r.coefficients.map((c, i) => (
              <tr key={i}><th>c{i}</th><td>{c.toExponential(4)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run integration test**

Run: `cd frontend && npm run test:chart-ir -- --run TrendLineDialog.integration`
Expected: PASS.

- [ ] **Step 4: Baseline existing chart-ir failure count**

Run: `cd frontend && npm run test:chart-ir -- --run 2>&1 | tail -20`

Record pre-existing failures (per `CLAUDE.md :: Known Test Debt`: ~22 failures in `router.test.ts`, `renderStrategyRouter.test.ts`, `editor/*.test.tsx`). Confirm the Plan 9b commits add **no new** failures vs. that baseline.

- [ ] **Step 5: Full backend suite regression**

Run: `cd backend && python -m pytest tests/ -v -x`
Expected: 516+ baseline + new T1/T2/T3/T4/T5 tests all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/TrendStatsBadge.jsx \
        frontend/src/components/dashboard/freeform/__tests__/TrendLineDialog.integration.test.tsx
git commit -m "feat(analyst-pro): TrendStatsBadge + dialog integration test (Plan 9b T8)"
```

---

## Self-Review Checklist

**Spec coverage (scheduled-task brief):**

| Requirement | Task |
|---|---|
| `TrendLineSpec` + `TrendFitResult` dataclasses | T1 |
| numpy ≥ 1.26 + scipy ≥ 1.12 added | T1 |
| `fit_linear` | T2 |
| `fit_polynomial` (degrees 2..8, reject > 8) | T2 |
| `fit_logarithmic` + x≤0 guard | T3 |
| `fit_exponential` + y≤0 guard | T3 |
| `fit_power` + x,y≤0 guard | T3 |
| R² / p-value / SSE / RMSE per fit | T2, T3 |
| Confidence bands via t-distribution | T4 |
| Factor-per-group dispatcher | T4 |
| `POST /api/v1/analytics/trend-fit` | T5 |
| Feature flag `FEATURE_ANALYST_PRO` | T5 |
| Rate limit 20 / 30s per user | T5 |
| 5s wall-clock timeout | T5 |
| 100k row guard | T5 |
| `trendLineToVega.ts` — line + band + tooltip | T6 |
| `AnalyticsPanel` un-park trend_line | T7 |
| `TrendLineDialog.jsx` with 5 fit types + polynomial slider + factor picker + CI checkbox + preview stats | T7 |
| Store CRUD actions + history | T7 |
| `TrendStatsBadge.jsx` equation + R² + p-value + N | T8 |
| Golden numeric tolerance 1e-6 | T2, T3 |
| Synthetic recovery tests (linear, exp, polynomial 2..8) | T2, T3 |
| Confidence band widening property test | T4 |
| x≤0 log/power error case | T3 |
| Constant-y R²=0, inf p case | T2 |
| Scatter + trend line integration test | T8 |

**Commit convention:** Every task ends with `feat(analyst-pro): <verb> <object> (Plan 9b T<N>)` — ✅ consistent.

**Type consistency:** `TrendLineSpec` / `TrendFitResult` field names match across Python (`trend_line.py`), TS (`trendLineToVega.ts`), store (`addTrendLineAnalystPro` payload), dialog wire-format, and endpoint. No drift.

**No placeholders:** Every code step has complete code; no TODO / fill-in.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-analyst-pro-plan-9b-trend-line.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — batch execution with checkpoints.
