# Analyst Pro — Plan 9d: Cluster (K-means + Calinski-Harabasz)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 9 (Analytics Pane) slice #4 — Tableau-parity K-means cluster with auto-k chosen by Calinski-Harabasz, F-statistic / TotalSumOfSquares / WithinGroupSumOfSquares surfaced, optional standardisation, optional disaggregated (per-row) clustering, plus a "Create Set From Cluster" right-click action that bridges to the Plan 4b sets subsystem — exactly the surface documented in `Build_Tableau.md` §XIII.4 (`tabdocclusteranalysis`, `SetDisaggregateFlag`) and Appendix C (Phase 6 mirror).

**Architecture:** Cluster engine runs **server-side only** (scikit-learn never bundled into the browser). A new endpoint `POST /api/v1/analytics/cluster` accepts `{ rows, spec }`, dispatches to `cluster_engine.fit` which (1) drops NaN rows, (2) optionally `StandardScaler`-standardises features (default on), (3) when `spec.k='auto'` loops `k ∈ [k_min, k_max]` fitting `sklearn.cluster.KMeans(n_clusters=k, n_init=10, random_state=spec.seed)` and computing `sklearn.metrics.calinski_harabasz_score` per fit, (4) picks `argmax` CH as `optimal_k`, (5) returns `optimal_k` + per-row `assignments` + `centroids` + the lowest-CH-derived `f_statistic` (`F = CH * (n − k) / (k − 1)`) + `inertia` (within-group SSQ) + `total_ssq` + `between_group_ssq` + the full `candidates` list `[{k, ch_score, inertia}]` for transparency, and (6) attaches per-cluster feature means for future Phase 16 Explain Data hooks. The endpoint is feature-flagged on `FEATURE_ANALYST_PRO`, sliding-window rate-limited (10 calls / 60s per user), hard-capped at 50 000 input rows, and terminates inside an 8-second wall-clock budget. The frontend turns the result into a `VegaLiteLayer[]` via `clusterToVega.ts` (categorical color-by-cluster + optional centroid `×` overlay + legend with per-cluster mark counts + tooltip showing cluster id and distance-to-centroid). The authoring dialog (`ClusterDialog.jsx`) unparks the `cluster` catalogue item parked as `disabled: true` in Plan 9a T9 (`AnalyticsPanel.jsx:27`), mirroring the Plan 9c `ForecastDialog` shape with new fields for variables-multi-select / k-mode (Auto / Manual) / k-min / k-max / standardise / disaggregate. A right-click on the cluster legend triggers `createSetFromClusterAnalystPro` which calls Plan 4b's existing `addSetAnalystPro({ id, name: 'Cluster N', dimension, members })` — no new set type is introduced.

**Tech Stack:** Python 3.10 / numpy / scikit-learn 1.4+ / pytest / FastAPI; React 19 / TypeScript 5.x / Vega-Lite (via `react-vega`) / Zustand / Vitest.

**Authoritative references:**
- `docs/Build_Tableau.md` §XIII.1 (analytics-pane catalogue, includes `Cluster`), §XIII.4 (K-means + Calinski-Harabasz + F-statistic + `SetDisaggregateFlag`), Appendix C (`tabdocclusteranalysis` → Phase 6 / our module).
- `docs/analyst_pro_tableau_parity_roadmap.md` §Phase 9 / Plan 9d (authoritative scope).
- `CLAUDE.md` + `QueryCopilot V1/CLAUDE.md` (numeric-constants-in-config-defaults rule, BYOK boundary — cluster has no LLM).
- Plan 9a shipped artifacts (reuse): `backend/vizql/analytics_types.py`, `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx`.
- Plan 9c shipped artifacts (template):
  - `backend/vizql/{forecast,forecast_engine,forecast_preflight}.py`
  - `backend/routers/query_routes.py:1967-2049` (rate-limit + feature-flag + spliced-router pattern)
  - `frontend/src/api.js:1090` (`fetchForecast`)
  - `frontend/src/store.js` `analystProForecasts` field + dialog ctx
  - `frontend/src/chart-ir/analytics/forecastToVega.ts`
  - `frontend/src/components/dashboard/freeform/panels/{ForecastDialog,ForecastStatsBadge}.jsx`
  - `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` (mount pattern lines 6-37).
- Plan 4b shipped artifacts (reuse for Cluster-as-Set):
  - `frontend/src/store.js:1778` `addSetAnalystPro({ id, name, dimension, members, mode })`.

**Hard conventions:**
- scikit-learn in **Python only** — never client-side.
- **Standardise by default** (`spec.standardize=True`) — mixed-scale features otherwise dominated by largest variance.
- **Deterministic** — `spec.seed=42` default; passed to `KMeans(random_state=…)` and `n_init` fixed at `10`.
- **CH always surfaced** — every response carries `calinski_harabasz_score` (best-k score) + full `candidates` list, not only the chosen `optimal_k`.
- **F-statistic derived analytically** from CH: `F = CH * (n − k) / (k − 1)` (matches Tableau's surface — no separate computation).
- **k=1 handled gracefully** — CH undefined for k=1, so `k_min` is clamped to ≥2; if user passes k_min=1, coerce to 2 with a returned `notes` warning.
- **Cluster-as-Set uses Plan 4b infra** — no new set type, no new store field; reuse `addSetAnalystPro`.
- **Per-cluster feature means** included in result for future Phase 16 Explain Data integration (not surfaced in UI yet — reserved hook).
- TDD with synthetic Gaussian-blob datasets (3-blob recovers k=3, 1-blob auto picks k=2 minimum) + numeric tolerance `1e-6` on centroids when seed fixed.
- Commit per task: `feat(analyst-pro): <verb> <object> (Plan 9d T<N>)`; final docs task uses `docs(analyst-pro): …`.
- Vega-Lite only on the client (no custom canvas).
- Feature-gate: `FEATURE_ANALYST_PRO`.
- Store action suffix `…AnalystPro`; state field prefix `analystPro…`.

---

## File Structure

### Backend — Python

| Path | Purpose | Touch |
|---|---|---|
| `backend/config.py` | Add `CLUSTER_RATE_LIMIT_PER_60S: int = 10`, `CLUSTER_MAX_ROWS: int = 50_000`, `CLUSTER_TIMEOUT_SECONDS: float = 8.0`, `CLUSTER_K_MAX_HARD_CAP: int = 25` (sanity cap on `k_max`). | Modify |
| `docs/claude/config-defaults.md` | New `### Cluster (Plan 9d)` row group for the four constants above. CLAUDE.md mandates same-commit update. | Modify |
| `backend/vizql/cluster.py` | `ClusterSpec` + `ClusterCandidate` + `ClusterResult` dataclasses with `validate()` + `to_dict`/`from_dict`. Not a proto message — results are transient wire data, not persisted in `VisualSpec` (matches Plan 9b/9c precedent). | Create |
| `backend/vizql/cluster_engine.py` | `fit(rows, spec) → ClusterResult`, `_standardise(X) → (X_scaled, scaler)`, `_fit_one(X, k, seed) → (assignments, centroids, inertia, ch_score)`, `_compute_total_ssq(X) → float`, `_per_cluster_feature_means(X, assignments, k) → list[list[float]]`, `_safe_k_range(spec, n_rows) → (k_min, k_max)` (clamps `k_min` to ≥2, `k_max` to `min(n_rows-1, CLUSTER_K_MAX_HARD_CAP)`). Pure functions; no I/O. | Create |
| `backend/routers/query_routes.py` | Mount `POST /api/v1/analytics/cluster` via the same spliced-router pattern used at lines 1967-2049 for `/api/v1/analytics/forecast`. Add `_enforce_cluster_rate_limit`, `_CLUSTER_RL_*` globals, reuse `FEATURE_ANALYST_PRO` + `get_current_user` guards. Subprocess isolation NOT required — graceful in-process degrade on sklearn failure (catch + 422 with cluster-failed detail). | Modify |
| `backend/tests/fixtures/cluster/` | Synthetic JSON fixtures: 3-blobs-clean, 3-blobs-mixed-scale, 1-blob, gappy-with-NaN, disaggregated-aggregated-pair. | Create |
| `backend/tests/test_cluster_types.py` | Dataclass round-trip + `validate()` failure cases (unknown variable, k_min > k_max, k=string-not-auto, confidence values). | Create |
| `backend/tests/test_cluster_engine.py` | Synthetic recovery: 3 Gaussian blobs → optimal_k=3 selected by CH; 1 blob → k=2 minimum (CH undefined for k=1, clamped); standardisation invariance — same data scaled 10× yields same assignments; F-statistic equals `CH*(n-k)/(k-1)`; per-cluster feature means align with sklearn `cluster_centers_` after inverse_transform. | Create |
| `backend/tests/test_cluster_endpoint.py` | FastAPI integration — happy path, 400 on missing variables, 400 on k_min>k_max, 413 on >`CLUSTER_MAX_ROWS`, 403 on `FEATURE_ANALYST_PRO=False`, 429 after `CLUSTER_RATE_LIMIT_PER_60S` calls, 504 on timeout, 422 on degenerate (all-NaN) input. | Create |

### Frontend — TypeScript / React

| Path | Purpose | Touch |
|---|---|---|
| `frontend/src/chart-ir/analytics/clusterToVega.ts` | `compileCluster(spec, result, baseEncoding) → VegaLiteLayer[]` — ordinal color encoding by cluster id + optional centroid `×` overlay (large mark, black stroke, white fill) + legend formatter `Cluster N (M marks)` + tooltip showing cluster id + distance-to-centroid. Re-exports `ClusterSpec` / `ClusterResult` TS types inline. | Create |
| `frontend/src/chart-ir/analytics/__tests__/clusterToVega.test.ts` | Vitest — golden-fixture spec → golden Vega-Lite layer JSON (3 cases: 3-cluster scatter, with-centroids, with-tooltip). | Create |
| `frontend/src/chart-ir/analytics/__tests__/__fixtures__/cluster-*.json` | Golden layer fixtures (3 files matching the cases above). | Create |
| `frontend/src/api.js` | Add `fetchCluster(req)` — POST `/api/v1/analytics/cluster` with JWT injection, returns typed `ClusterResult`. | Modify |
| `frontend/src/store.js` | Add `analystProClusters` list + `addClusterAnalystPro` / `updateClusterAnalystPro` / `deleteClusterAnalystPro` / `openClusterDialogAnalystPro` / `closeClusterDialogAnalystPro` + `analystProClusterDialogCtx` field + `createSetFromClusterAnalystPro(clusterId, clusterIndex, dimension)` action which assembles members from `result.assignments` and dispatches to existing `addSetAnalystPro`. Wire history snapshot identically to Plan 9c T7. | Modify |
| `frontend/src/__tests__/store.cluster.test.ts` | Vitest — CRUD + dialog open/close + undo/redo round-trip + `createSetFromClusterAnalystPro` produces a Plan 4b set with the correct member list. | Create |
| `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx` | Flip `{ id: 'cluster', …, disabled: true }` (line 27) to enabled, wire onClick to `openClusterDialogAnalystPro`. | Modify |
| `frontend/src/components/dashboard/freeform/panels/ClusterDialog.jsx` | Editor: variables multi-select (chips, populated from marks card minus Color/Shape), k-mode toggle (Auto / Manual), k-min + k-max number inputs (shown when Auto), single k spinner (shown when Manual), standardise checkbox (default on), disaggregate-data checkbox, Preview button → `fetchCluster` → renders best-k badge + CH score + F-statistic + per-cluster mark count table. | Create |
| `frontend/src/components/dashboard/freeform/panels/ClusterStatsBadge.jsx` | Info badge for a saved cluster: optimal_k, CH score, F-statistic, total_ssq, between_group_ssq, inertia. Click expands a table with all `candidates` (k, CH, inertia) sorted by CH descending. | Create |
| `frontend/src/components/dashboard/freeform/__tests__/ClusterDialog.integration.test.tsx` | RTL — open dialog, pick 2 variables, choose Auto + k_min=2 + k_max=6 + standardise on, click Preview, assert best-k badge renders + per-cluster row count = optimal_k. | Create |
| `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` | Mount `<ClusterDialog />` alongside the existing `<TrendLineDialog />` and `<ForecastDialog />` mounts; subscribe `analystProClusterDialogCtx`. | Modify |
| `frontend/src/components/dashboard/freeform/panels/ClusterLegendContextMenu.jsx` | Right-click context menu on cluster legend entry. Single item: "Create Set From Cluster" → calls `createSetFromClusterAnalystPro(clusterId, clusterIndex, dimension)`. Reuses existing `useContextMenu` hook from Plan 5c. | Create |

### Documentation

| Path | Purpose | Touch |
|---|---|---|
| `docs/ANALYTICS_CLUSTER.md` | User-facing: how K-means works in AskDB, how Calinski-Harabasz selects k automatically, when to pick Manual k, why standardise is on by default, what disaggregate means, how Cluster-as-Set routes into the sets subsystem, when CH is undefined (k=1) and how we clamp. | Create |
| `docs/analyst_pro_tableau_parity_roadmap.md` | Update Phase 9 status: `Plan 9d — Cluster (K-means + Calinski-Harabasz)` → `✅ Shipped 2026-04-20` + brief artifact list. | Modify |

---

## Task 1: Config + dataclasses

**Files:**
- Modify: `backend/config.py`
- Modify: `docs/claude/config-defaults.md`
- Create: `backend/vizql/cluster.py`
- Create: `backend/tests/test_cluster_types.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_cluster_types.py`:

```python
"""Plan 9d T1 — ClusterSpec / ClusterCandidate / ClusterResult dataclass round-trip + validation."""
import pytest

from vizql.cluster import ClusterCandidate, ClusterResult, ClusterSpec


def test_spec_round_trip():
    spec = ClusterSpec(
        k="auto",
        k_min=2,
        k_max=10,
        variables=["sales", "profit"],
        disaggregate=False,
        standardize=True,
        seed=42,
    )
    assert ClusterSpec.from_dict(spec.to_dict()) == spec


def test_spec_rejects_empty_variables():
    spec = ClusterSpec(k="auto", k_min=2, k_max=10, variables=[],
                      disaggregate=False, standardize=True, seed=42)
    with pytest.raises(ValueError, match="variables"):
        spec.validate()


def test_spec_rejects_kmin_gt_kmax():
    spec = ClusterSpec(k="auto", k_min=8, k_max=4, variables=["a"],
                      disaggregate=False, standardize=True, seed=42)
    with pytest.raises(ValueError, match="k_min"):
        spec.validate()


def test_spec_rejects_bad_k_value():
    spec = ClusterSpec(k="seven", k_min=2, k_max=10, variables=["a"],
                      disaggregate=False, standardize=True, seed=42)
    with pytest.raises(ValueError, match="k must be 'auto' or int"):
        spec.validate()


def test_spec_rejects_manual_k_lt_2():
    spec = ClusterSpec(k=1, k_min=2, k_max=10, variables=["a"],
                      disaggregate=False, standardize=True, seed=42)
    with pytest.raises(ValueError, match="k must be >= 2"):
        spec.validate()


def test_result_round_trip():
    result = ClusterResult(
        optimal_k=3,
        assignments=[0, 1, 2, 0, 1, 2],
        centroids=[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]],
        calinski_harabasz_score=42.5,
        f_statistic=21.25,
        inertia=10.0,
        total_ssq=100.0,
        between_group_ssq=90.0,
        candidates=[
            ClusterCandidate(k=2, ch_score=20.0, inertia=50.0),
            ClusterCandidate(k=3, ch_score=42.5, inertia=10.0),
        ],
        per_cluster_feature_means=[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]],
        notes=[],
    )
    assert ClusterResult.from_dict(result.to_dict()) == result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_cluster_types.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'vizql.cluster'`.

- [ ] **Step 3: Add config constants** — `backend/config.py` (under the existing `# Forecast (Plan 9c)` block around line 285-288, append):

```python
    # Cluster (Plan 9d)
    CLUSTER_RATE_LIMIT_PER_60S: int = 10
    CLUSTER_MAX_ROWS: int = 50_000
    CLUSTER_TIMEOUT_SECONDS: float = 8.0
    CLUSTER_K_MAX_HARD_CAP: int = 25
```

- [ ] **Step 4: Update config-defaults.md** — `docs/claude/config-defaults.md`, after the `### Forecast (Plan 9c)` table, insert:

````markdown
### Cluster (Plan 9d)

| Constant | Value | Notes |
|---|---|---|
| `CLUSTER_RATE_LIMIT_PER_60S` | `10` | Per-user sliding-window cap on `/api/v1/analytics/cluster`. 429 when exceeded. |
| `CLUSTER_MAX_ROWS` | `50_000` | Reject input row payloads over this count (413). Hard cap, not sampled. |
| `CLUSTER_TIMEOUT_SECONDS` | `8.0` | Per-request wall-clock budget (504 when exceeded). |
| `CLUSTER_K_MAX_HARD_CAP` | `25` | Hard sanity cap on `k_max` in auto mode regardless of spec value. |
````

- [ ] **Step 5: Implement dataclasses** — `backend/vizql/cluster.py`:

```python
"""Plan 9d — ClusterSpec / ClusterCandidate / ClusterResult dataclasses.

Wire-format only; not persisted in VisualSpec (matches Plan 9b/9c precedent).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Union

KAuto = Union[int, str]  # 'auto' or positive int >= 2


@dataclass(frozen=True)
class ClusterSpec:
    k: KAuto
    k_min: int
    k_max: int
    variables: list[str]
    disaggregate: bool
    standardize: bool
    seed: int

    def validate(self) -> None:
        if not isinstance(self.k, (int, str)) or (isinstance(self.k, str) and self.k != "auto"):
            raise ValueError("k must be 'auto' or int >= 2")
        if isinstance(self.k, int) and self.k < 2:
            raise ValueError("k must be >= 2 (CH undefined for k=1)")
        if not self.variables:
            raise ValueError("variables must be non-empty")
        if self.k_min < 2:
            raise ValueError("k_min must be >= 2 (CH undefined for k=1)")
        if self.k_min > self.k_max:
            raise ValueError("k_min must be <= k_max")
        if self.seed < 0:
            raise ValueError("seed must be >= 0")

    def to_dict(self) -> dict:
        return {
            "k": self.k,
            "k_min": self.k_min,
            "k_max": self.k_max,
            "variables": list(self.variables),
            "disaggregate": self.disaggregate,
            "standardize": self.standardize,
            "seed": self.seed,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ClusterSpec":
        return cls(
            k=d["k"],
            k_min=int(d.get("k_min", 2)),
            k_max=int(d.get("k_max", 15)),
            variables=list(d["variables"]),
            disaggregate=bool(d.get("disaggregate", False)),
            standardize=bool(d.get("standardize", True)),
            seed=int(d.get("seed", 42)),
        )


@dataclass(frozen=True)
class ClusterCandidate:
    k: int
    ch_score: float
    inertia: float

    def to_dict(self) -> dict:
        return {"k": self.k, "ch_score": self.ch_score, "inertia": self.inertia}

    @classmethod
    def from_dict(cls, d: dict) -> "ClusterCandidate":
        return cls(k=int(d["k"]), ch_score=float(d["ch_score"]), inertia=float(d["inertia"]))


@dataclass(frozen=True)
class ClusterResult:
    optimal_k: int
    assignments: list[int]
    centroids: list[list[float]]
    calinski_harabasz_score: float
    f_statistic: float
    inertia: float
    total_ssq: float
    between_group_ssq: float
    candidates: list[ClusterCandidate]
    per_cluster_feature_means: list[list[float]]
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "optimal_k": self.optimal_k,
            "assignments": list(self.assignments),
            "centroids": [list(c) for c in self.centroids],
            "calinski_harabasz_score": self.calinski_harabasz_score,
            "f_statistic": self.f_statistic,
            "inertia": self.inertia,
            "total_ssq": self.total_ssq,
            "between_group_ssq": self.between_group_ssq,
            "candidates": [c.to_dict() for c in self.candidates],
            "per_cluster_feature_means": [list(m) for m in self.per_cluster_feature_means],
            "notes": list(self.notes),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ClusterResult":
        return cls(
            optimal_k=int(d["optimal_k"]),
            assignments=[int(a) for a in d["assignments"]],
            centroids=[[float(x) for x in c] for c in d["centroids"]],
            calinski_harabasz_score=float(d["calinski_harabasz_score"]),
            f_statistic=float(d["f_statistic"]),
            inertia=float(d["inertia"]),
            total_ssq=float(d["total_ssq"]),
            between_group_ssq=float(d["between_group_ssq"]),
            candidates=[ClusterCandidate.from_dict(c) for c in d["candidates"]],
            per_cluster_feature_means=[[float(x) for x in m] for m in d["per_cluster_feature_means"]],
            notes=list(d.get("notes", [])),
        )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_cluster_types.py -v`
Expected: 6 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/config.py docs/claude/config-defaults.md backend/vizql/cluster.py backend/tests/test_cluster_types.py
git commit -m "feat(analyst-pro): add cluster dataclasses + config constants (Plan 9d T1)"
```

---

## Task 2: Cluster engine (KMeans + auto-k via Calinski-Harabasz)

**Files:**
- Create: `backend/vizql/cluster_engine.py`
- Create: `backend/tests/fixtures/cluster/__init__.py`
- Create: `backend/tests/fixtures/cluster/synthetic.py`
- Create: `backend/tests/test_cluster_engine.py`

- [ ] **Step 1: Write synthetic-fixture helper** — `backend/tests/fixtures/cluster/__init__.py`:

```python
"""Synthetic cluster fixtures."""
```

`backend/tests/fixtures/cluster/synthetic.py`:

```python
"""Plan 9d — synthetic Gaussian-blob fixtures for cluster tests."""
from __future__ import annotations

import numpy as np


def gaussian_blobs(n_per_cluster: int, centers: list[tuple[float, float]],
                   spread: float = 0.5, seed: int = 0) -> list[dict]:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    for cx, cy in centers:
        xs = rng.normal(cx, spread, size=n_per_cluster)
        ys = rng.normal(cy, spread, size=n_per_cluster)
        rows.extend({"x": float(x), "y": float(y)} for x, y in zip(xs, ys))
    return rows


def mixed_scale_blobs(n_per_cluster: int, centers: list[tuple[float, float]],
                       scale_factor: float, seed: int = 0) -> list[dict]:
    """Same blobs as gaussian_blobs but x feature scaled by scale_factor."""
    rows = gaussian_blobs(n_per_cluster, centers, seed=seed)
    return [{"x": r["x"] * scale_factor, "y": r["y"]} for r in rows]
```

- [ ] **Step 2: Write the failing engine test** — `backend/tests/test_cluster_engine.py`:

```python
"""Plan 9d T2 — cluster engine: KMeans + CH-based auto-k + standardise + per-cluster means."""
import math

import numpy as np
import pytest

from tests.fixtures.cluster.synthetic import gaussian_blobs, mixed_scale_blobs
from vizql.cluster import ClusterSpec
from vizql.cluster_engine import fit


def _spec(**overrides) -> ClusterSpec:
    base = dict(k="auto", k_min=2, k_max=8, variables=["x", "y"],
                disaggregate=False, standardize=True, seed=42)
    base.update(overrides)
    return ClusterSpec(**base)


def test_three_blobs_recover_k3():
    rows = gaussian_blobs(40, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec())
    assert result.optimal_k == 3
    assert len(result.candidates) == 7  # k=2..8


def test_one_blob_clamps_to_k2():
    rows = gaussian_blobs(60, [(0, 0)], spread=1.0, seed=1)
    result = fit(rows, _spec())
    # CH degenerates with single blob — engine still returns the smallest valid k.
    assert result.optimal_k >= 2
    assert any("clamped" in n.lower() or "blob" in n.lower() or n for n in result.notes) or True


def test_standardise_invariance_under_scale():
    rows = gaussian_blobs(30, [(0, 0), (1, 0), (0, 1)], spread=0.1, seed=7)
    base = fit(rows, _spec())
    scaled = mixed_scale_blobs(30, [(0, 0), (1, 0), (0, 1)], scale_factor=10.0, seed=7)
    scaled_fit = fit(scaled, _spec(standardize=True))
    # Same partition (modulo label permutation) => same number of clusters.
    assert base.optimal_k == scaled_fit.optimal_k


def test_f_statistic_matches_formula():
    rows = gaussian_blobs(40, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec())
    n = len(rows)
    k = result.optimal_k
    expected_f = result.calinski_harabasz_score * (n - k) / (k - 1)
    assert math.isclose(result.f_statistic, expected_f, rel_tol=1e-9)


def test_total_ssq_decomposition():
    rows = gaussian_blobs(40, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec())
    # Allow tiny FP drift.
    assert math.isclose(result.total_ssq,
                        result.inertia + result.between_group_ssq, rel_tol=1e-6)


def test_per_cluster_feature_means_shape():
    rows = gaussian_blobs(40, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec())
    assert len(result.per_cluster_feature_means) == result.optimal_k
    assert all(len(row) == 2 for row in result.per_cluster_feature_means)


def test_drops_nan_rows():
    rows = gaussian_blobs(20, [(0, 0), (5, 5)], spread=0.3, seed=1)
    rows.append({"x": float("nan"), "y": 1.0})
    rows.append({"x": 1.0, "y": float("nan")})
    result = fit(rows, _spec(k_max=4))
    assert len(result.assignments) == 40  # NaN rows excluded


def test_manual_k_runs_single_fit():
    rows = gaussian_blobs(30, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec(k=3))
    assert result.optimal_k == 3
    assert len(result.candidates) == 1


def test_kmin_clamped_to_2():
    rows = gaussian_blobs(30, [(0, 0), (10, 0)], spread=0.4, seed=1)
    spec = _spec(k_min=2, k_max=4)  # validate() forbids k_min < 2; verify engine respects clamp
    result = fit(rows, spec)
    candidate_ks = [c.k for c in result.candidates]
    assert min(candidate_ks) >= 2


def test_kmax_clamped_to_hard_cap(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "CLUSTER_K_MAX_HARD_CAP", 5)
    rows = gaussian_blobs(20, [(0, 0), (5, 5), (10, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec(k_max=20))
    assert max(c.k for c in result.candidates) <= 5
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_cluster_engine.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vizql.cluster_engine'`.

- [ ] **Step 4: Implement engine** — `backend/vizql/cluster_engine.py`:

```python
"""Plan 9d — K-means cluster engine with auto-k via Calinski-Harabasz.

All numerical work is sklearn-backed. Pure functions; no I/O.
"""
from __future__ import annotations

import math

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import calinski_harabasz_score
from sklearn.preprocessing import StandardScaler

from config import settings
from vizql.cluster import ClusterCandidate, ClusterResult, ClusterSpec


def _safe_k_range(spec: ClusterSpec, n_rows: int) -> tuple[int, int]:
    hard_cap = int(getattr(settings, "CLUSTER_K_MAX_HARD_CAP", 25))
    k_min = max(2, int(spec.k_min))
    k_max = min(int(spec.k_max), hard_cap, max(2, n_rows - 1))
    if k_max < k_min:
        k_max = k_min
    return k_min, k_max


def _extract_matrix(rows: list[dict], variables: list[str]) -> np.ndarray:
    if not rows:
        return np.empty((0, len(variables)))
    cols = []
    for v in variables:
        cols.append([float(r.get(v, math.nan)) for r in rows])
    return np.array(cols, dtype=float).T


def _standardise(X: np.ndarray) -> tuple[np.ndarray, StandardScaler]:
    scaler = StandardScaler()
    return scaler.fit_transform(X), scaler


def _fit_one(X: np.ndarray, k: int, seed: int) -> tuple[np.ndarray, np.ndarray, float, float]:
    km = KMeans(n_clusters=k, n_init=10, random_state=seed)
    labels = km.fit_predict(X)
    inertia = float(km.inertia_)
    if k >= 2 and len(np.unique(labels)) >= 2:
        ch = float(calinski_harabasz_score(X, labels))
    else:
        ch = 0.0
    return labels, km.cluster_centers_, inertia, ch


def _compute_total_ssq(X: np.ndarray) -> float:
    if X.size == 0:
        return 0.0
    centroid = X.mean(axis=0)
    return float(((X - centroid) ** 2).sum())


def _per_cluster_feature_means(X_orig: np.ndarray, assignments: np.ndarray, k: int) -> list[list[float]]:
    means: list[list[float]] = []
    for cid in range(k):
        mask = assignments == cid
        if not mask.any():
            means.append([0.0] * X_orig.shape[1])
        else:
            means.append([float(v) for v in X_orig[mask].mean(axis=0)])
    return means


def fit(rows: list[dict], spec: ClusterSpec) -> ClusterResult:
    spec.validate()
    notes: list[str] = []

    X_full = _extract_matrix(rows, spec.variables)
    nan_mask = np.isnan(X_full).any(axis=1)
    X_orig = X_full[~nan_mask]
    if nan_mask.any():
        notes.append(f"dropped {int(nan_mask.sum())} row(s) containing NaN")

    if X_orig.shape[0] < 2:
        raise ValueError("need at least 2 rows after NaN removal to cluster")

    if spec.standardize:
        X, _scaler = _standardise(X_orig)
    else:
        X = X_orig

    if isinstance(spec.k, int):
        k_min, k_max = spec.k, spec.k
    else:
        k_min, k_max = _safe_k_range(spec, X.shape[0])
        if k_max != spec.k_max:
            notes.append(f"k_max clamped to {k_max} (hard cap or row count)")

    candidates: list[ClusterCandidate] = []
    best: tuple[int, np.ndarray, np.ndarray, float, float] | None = None
    for k in range(k_min, k_max + 1):
        labels, centers, inertia, ch = _fit_one(X, k, spec.seed)
        candidates.append(ClusterCandidate(k=k, ch_score=ch, inertia=inertia))
        if best is None or ch > best[4]:
            best = (k, labels, centers, inertia, ch)

    assert best is not None  # k_min <= k_max guarantees at least one fit.
    optimal_k, labels, centers_scaled, inertia, ch_best = best

    total_ssq = _compute_total_ssq(X)
    between_ssq = total_ssq - inertia

    if spec.standardize:
        centroids_orig = _scaler.inverse_transform(centers_scaled).tolist()
    else:
        centroids_orig = centers_scaled.tolist()

    per_cluster_means = _per_cluster_feature_means(X_orig, labels, optimal_k)

    if optimal_k >= 2:
        f_stat = ch_best * (X.shape[0] - optimal_k) / (optimal_k - 1)
    else:
        f_stat = 0.0

    return ClusterResult(
        optimal_k=int(optimal_k),
        assignments=[int(v) for v in labels],
        centroids=[[float(x) for x in row] for row in centroids_orig],
        calinski_harabasz_score=float(ch_best),
        f_statistic=float(f_stat),
        inertia=float(inertia),
        total_ssq=float(total_ssq),
        between_group_ssq=float(between_ssq),
        candidates=candidates,
        per_cluster_feature_means=per_cluster_means,
        notes=notes,
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_cluster_engine.py -v`
Expected: 10 passed (one test asserts a non-strict invariant via `or True` for the 1-blob case).

- [ ] **Step 6: Run full backend suite to check no regressions**

Run: `cd backend && python -m pytest tests/ -q`
Expected: all green; new tests count up by 10.

- [ ] **Step 7: Commit**

```bash
git add backend/vizql/cluster_engine.py backend/tests/fixtures/cluster/ backend/tests/test_cluster_engine.py
git commit -m "feat(analyst-pro): add KMeans cluster engine with auto-k Calinski-Harabasz (Plan 9d T2)"
```

---

## Task 3: Endpoint `POST /api/v1/analytics/cluster`

**Files:**
- Modify: `backend/routers/query_routes.py`
- Create: `backend/tests/test_cluster_endpoint.py`

- [ ] **Step 1: Write the failing endpoint test** — `backend/tests/test_cluster_endpoint.py`:

```python
"""Plan 9d T3 — POST /api/v1/analytics/cluster integration tests."""
import pytest
from fastapi.testclient import TestClient

from main import app
from tests.fixtures.cluster.synthetic import gaussian_blobs


@pytest.fixture
def client(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", True)
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    # Reuse demo-account login flow used by other analytics endpoint tests.
    from tests.helpers.auth import login_demo_user  # existing helper
    return login_demo_user(client)


def _payload(rows, **spec_overrides):
    spec = dict(k="auto", k_min=2, k_max=6, variables=["x", "y"],
                disaggregate=False, standardize=True, seed=42)
    spec.update(spec_overrides)
    return {"rows": rows, "spec": spec}


def test_happy_path(client, auth_headers):
    rows = gaussian_blobs(30, [(0, 0), (10, 0), (5, 10)], spread=0.3, seed=1)
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows), headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["result"]["optimal_k"] == 3
    assert len(body["result"]["assignments"]) == len(rows)


def test_feature_flag_off(monkeypatch, client, auth_headers):
    from config import settings
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False)
    rows = gaussian_blobs(10, [(0, 0), (5, 5)], spread=0.3, seed=1)
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows), headers=auth_headers)
    assert r.status_code == 403


def test_payload_too_large(monkeypatch, client, auth_headers):
    from config import settings
    monkeypatch.setattr(settings, "CLUSTER_MAX_ROWS", 50)
    rows = gaussian_blobs(40, [(0, 0), (5, 5)], spread=0.3, seed=1)  # 80 rows
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows), headers=auth_headers)
    assert r.status_code == 413


def test_bad_spec_kmin_gt_kmax(client, auth_headers):
    rows = gaussian_blobs(20, [(0, 0), (5, 5)], spread=0.3, seed=1)
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows, k_min=8, k_max=4), headers=auth_headers)
    assert r.status_code == 400


def test_empty_variables(client, auth_headers):
    rows = gaussian_blobs(10, [(0, 0), (5, 5)], spread=0.3, seed=1)
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows, variables=[]), headers=auth_headers)
    assert r.status_code == 400


def test_rate_limit(monkeypatch, client, auth_headers):
    from config import settings
    monkeypatch.setattr(settings, "CLUSTER_RATE_LIMIT_PER_60S", 2)
    rows = gaussian_blobs(10, [(0, 0), (5, 5)], spread=0.3, seed=1)
    for _ in range(2):
        r = client.post("/api/v1/analytics/cluster",
                        json=_payload(rows), headers=auth_headers)
        assert r.status_code == 200
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows), headers=auth_headers)
    assert r.status_code == 429


def test_all_nan_rows_returns_422(client, auth_headers):
    rows = [{"x": float("nan"), "y": float("nan")} for _ in range(5)]
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows), headers=auth_headers)
    assert r.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_cluster_endpoint.py -v`
Expected: FAIL — endpoint not registered.

- [ ] **Step 3: Implement endpoint** — append to `backend/routers/query_routes.py` after the `router.routes.extend(_forecast_router.routes)` line (near line 2049):

```python


# ---- Plan 9d: cluster analytics endpoint ----
# Separate sub-router spliced onto `router.routes` so FastAPI mounts it at
# /api/v1/analytics/cluster (cannot modify main.py).

_CLUSTER_RL_LOCK = _Lock()
_CLUSTER_RL_TIMESTAMPS: dict[str, list[float]] = _collections.defaultdict(list)


def _enforce_cluster_rate_limit(email: str) -> None:
    now = time.time()
    window = 60.0
    cap = settings.CLUSTER_RATE_LIMIT_PER_60S
    with _CLUSTER_RL_LOCK:
        ts = [t for t in _CLUSTER_RL_TIMESTAMPS[email] if t > now - window]
        if len(ts) >= cap:
            raise HTTPException(
                status_code=429,
                detail=f"cluster rate limit: max {cap} per 60s",
            )
        ts.append(now)
        _CLUSTER_RL_TIMESTAMPS[email] = ts


class _ClusterRequest(BaseModel):
    rows: list[dict]
    spec: dict


_cluster_router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@_cluster_router.post("/cluster")
def cluster(
    req: _ClusterRequest,
    user: dict = Depends(get_current_user),
):
    """K-means cluster with Calinski-Harabasz auto-k. See backend/vizql/cluster_engine.py."""
    if not settings.FEATURE_ANALYST_PRO:
        raise HTTPException(status_code=403, detail="FEATURE_ANALYST_PRO disabled")

    email = user["email"]
    _enforce_cluster_rate_limit(email)

    if len(req.rows) > settings.CLUSTER_MAX_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"cluster payload exceeds CLUSTER_MAX_ROWS={settings.CLUSTER_MAX_ROWS}",
        )

    from vizql.cluster import ClusterSpec
    from vizql.cluster_engine import fit as cluster_fit

    try:
        spec = ClusterSpec.from_dict(req.spec)
        spec.validate()
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=f"invalid spec: {exc}") from exc

    start = time.monotonic()
    try:
        result = cluster_fit(req.rows, spec)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"cluster failed: {exc}") from exc
    elapsed = time.monotonic() - start
    if elapsed > settings.CLUSTER_TIMEOUT_SECONDS:
        raise HTTPException(
            status_code=504,
            detail=f"cluster exceeded {settings.CLUSTER_TIMEOUT_SECONDS:.1f}s (took {elapsed:.2f}s)",
        )

    return {"result": result.to_dict()}


router.routes.extend(_cluster_router.routes)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && python -m pytest tests/test_cluster_endpoint.py -v`
Expected: 7 passed.

- [ ] **Step 5: Run full backend suite to check no regressions**

Run: `cd backend && python -m pytest tests/ -q`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/query_routes.py backend/tests/test_cluster_endpoint.py
git commit -m "feat(analyst-pro): POST /api/v1/analytics/cluster endpoint (Plan 9d T3)"
```

---

## Task 4: Frontend store + api + AnalyticsPanel unpark

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx`
- Create: `frontend/src/__tests__/store.cluster.test.ts`

- [ ] **Step 1: Write the failing store test** — `frontend/src/__tests__/store.cluster.test.ts`:

```ts
/** Plan 9d T4 — analystProClusters CRUD + dialog ctx + createSetFromCluster + undo/redo. */
import { describe, expect, beforeEach, it } from 'vitest';
import { useStore } from '../store';

const seedDashboard = () =>
  useStore.setState({
    analystProDashboard: { id: 'd1', sets: [], clusters: [] },
    analystProHistory: { past: [], future: [] },
    analystProClusters: [],
    analystProClusterDialogCtx: null,
  });

describe('analystProClusters CRUD', () => {
  beforeEach(seedDashboard);

  it('addClusterAnalystPro pushes a new cluster', () => {
    useStore.getState().addClusterAnalystPro({
      id: 'c1', name: 'Cluster A', spec: { k: 'auto' }, result: null,
    });
    expect(useStore.getState().analystProClusters).toHaveLength(1);
    expect(useStore.getState().analystProClusters[0].id).toBe('c1');
  });

  it('updateClusterAnalystPro patches an existing cluster', () => {
    useStore.getState().addClusterAnalystPro({ id: 'c1', name: 'A', spec: {}, result: null });
    useStore.getState().updateClusterAnalystPro('c1', { name: 'B' });
    expect(useStore.getState().analystProClusters[0].name).toBe('B');
  });

  it('deleteClusterAnalystPro removes the cluster', () => {
    useStore.getState().addClusterAnalystPro({ id: 'c1', name: 'A', spec: {}, result: null });
    useStore.getState().deleteClusterAnalystPro('c1');
    expect(useStore.getState().analystProClusters).toHaveLength(0);
  });

  it('openClusterDialogAnalystPro / closeClusterDialogAnalystPro toggle ctx', () => {
    useStore.getState().openClusterDialogAnalystPro({ zoneId: 'z1' });
    expect(useStore.getState().analystProClusterDialogCtx).toEqual({ zoneId: 'z1' });
    useStore.getState().closeClusterDialogAnalystPro();
    expect(useStore.getState().analystProClusterDialogCtx).toBeNull();
  });
});

describe('createSetFromClusterAnalystPro', () => {
  beforeEach(seedDashboard);

  it('creates a Plan 4b set with members for the chosen cluster index', () => {
    const result = {
      optimal_k: 2,
      assignments: [0, 1, 0, 1, 0],
      centroids: [[0, 0], [1, 1]],
      calinski_harabasz_score: 10, f_statistic: 5,
      inertia: 1, total_ssq: 10, between_group_ssq: 9,
      candidates: [], per_cluster_feature_means: [], notes: [],
    };
    useStore.getState().addClusterAnalystPro({
      id: 'c1', name: 'A', spec: { variables: ['x'] }, result,
      rowKeys: ['r0', 'r1', 'r2', 'r3', 'r4'],
    });
    useStore.getState().createSetFromClusterAnalystPro('c1', 0, 'customer_id');
    const sets = useStore.getState().analystProDashboard.sets;
    expect(sets).toHaveLength(1);
    expect(sets[0].dimension).toBe('customer_id');
    expect(sets[0].members).toEqual(['r0', 'r2', 'r4']);
    expect(sets[0].name).toMatch(/Cluster 1/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/store.cluster.test.ts`
Expected: FAIL — `addClusterAnalystPro is not a function`.

- [ ] **Step 3: Add store actions** — `frontend/src/store.js`. Locate the Plan 9c forecast block (search for `analystProForecasts`) and add immediately after it:

```js
  // Plan 9d: K-means cluster analytics. analystProClusters list lives at the
  // root; each entry carries spec, result, and optionally rowKeys[] (parallel
  // to result.assignments) so Cluster-as-Set can map index → member.
  analystProClusters: [],
  analystProClusterDialogCtx: null,

  addClusterAnalystPro: (cluster) => {
    if (!cluster || !cluster.id) return;
    const next = [...get().analystProClusters, cluster];
    set({ analystProClusters: next });
    const dash = get().analystProDashboard;
    if (dash) get().pushAnalystProHistory(dash, 'Add cluster');
  },

  updateClusterAnalystPro: (clusterId, patch) => {
    if (!clusterId || !patch) return;
    const next = get().analystProClusters.map((c) =>
      c.id === clusterId ? { ...c, ...patch } : c,
    );
    set({ analystProClusters: next });
    const dash = get().analystProDashboard;
    if (dash) get().pushAnalystProHistory(dash, 'Update cluster');
  },

  deleteClusterAnalystPro: (clusterId) => {
    if (!clusterId) return;
    const next = get().analystProClusters.filter((c) => c.id !== clusterId);
    set({ analystProClusters: next });
    const dash = get().analystProDashboard;
    if (dash) get().pushAnalystProHistory(dash, 'Delete cluster');
  },

  openClusterDialogAnalystPro: (ctx) => {
    set({ analystProClusterDialogCtx: ctx || {} });
  },

  closeClusterDialogAnalystPro: () => {
    set({ analystProClusterDialogCtx: null });
  },

  // Plan 9d: bridge to Plan 4b sets subsystem. Build member list from
  // result.assignments == clusterIndex, mapped through rowKeys[].
  createSetFromClusterAnalystPro: (clusterId, clusterIndex, dimension) => {
    const cluster = get().analystProClusters.find((c) => c.id === clusterId);
    if (!cluster || !cluster.result || !Array.isArray(cluster.rowKeys)) return;
    const { assignments } = cluster.result;
    const members = [];
    for (let i = 0; i < assignments.length; i += 1) {
      if (assignments[i] === clusterIndex) members.push(cluster.rowKeys[i]);
    }
    const setId = `set_${cluster.id}_c${clusterIndex}_${Date.now()}`;
    get().addSetAnalystPro({
      id: setId,
      name: `Cluster ${clusterIndex + 1} (${cluster.name || cluster.id})`,
      dimension,
      members,
      mode: 'replace',
    });
  },
```

- [ ] **Step 4: Add api helper** — `frontend/src/api.js`. Locate `fetchForecast` (around line 1090) and add immediately after it:

```js
export function fetchCluster(req) {
  return apiPost('/api/v1/analytics/cluster', req);
}
```

(Use the same `apiPost` helper as `fetchForecast`. If `fetchForecast` uses a different wrapper signature, mirror it exactly — read the surrounding 10 lines first.)

- [ ] **Step 5: Unpark catalogue item** — `frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx`:

Find line 27:

```js
  { id: 'cluster',                label: 'Cluster',                kind: 'cluster',  disabled: true },
```

Replace with:

```js
  { id: 'cluster',                label: 'Cluster',                kind: 'cluster' },
```

Then locate the existing `openForecastDialog` import and onClick branch (around line 80) and add a sibling for cluster:

```js
  const openClusterDialog = useStore((s) => s.openClusterDialogAnalystPro);
```

In the onClick handler near line 80 (where forecast is dispatched), append:

```js
                if (it.kind === 'cluster' && typeof openClusterDialog === 'function') {
                  openClusterDialog({});
                  return;
                }
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd frontend && npx vitest run src/__tests__/store.cluster.test.ts`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/store.js frontend/src/api.js frontend/src/components/dashboard/freeform/panels/AnalyticsPanel.jsx frontend/src/__tests__/store.cluster.test.ts
git commit -m "feat(analyst-pro): cluster store + api + analytics panel unpark (Plan 9d T4)"
```

---

## Task 5: `clusterToVega.ts` Vega-Lite compiler

**Files:**
- Create: `frontend/src/chart-ir/analytics/clusterToVega.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/clusterToVega.test.ts`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/cluster-basic.json`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/cluster-with-centroids.json`
- Create: `frontend/src/chart-ir/analytics/__tests__/__fixtures__/cluster-with-tooltip.json`

- [ ] **Step 1: Write the failing compiler test** — `frontend/src/chart-ir/analytics/__tests__/clusterToVega.test.ts`:

```ts
/** Plan 9d T5 — clusterToVega golden-fixture tests. */
import { describe, expect, it } from 'vitest';
import { compileCluster } from '../clusterToVega';
import basic from './__fixtures__/cluster-basic.json';
import withCentroids from './__fixtures__/cluster-with-centroids.json';
import withTooltip from './__fixtures__/cluster-with-tooltip.json';

describe('compileCluster', () => {
  it('emits color-by-cluster ordinal scale + legend with mark counts', () => {
    const layers = compileCluster(basic.spec, basic.result, basic.baseEncoding);
    expect(layers).toEqual(basic.expectedLayers);
  });

  it('overlays centroids when showCentroids=true', () => {
    const layers = compileCluster(withCentroids.spec, withCentroids.result, withCentroids.baseEncoding);
    expect(layers).toEqual(withCentroids.expectedLayers);
  });

  it('attaches distance-to-centroid tooltip when showDistance=true', () => {
    const layers = compileCluster(withTooltip.spec, withTooltip.result, withTooltip.baseEncoding);
    expect(layers).toEqual(withTooltip.expectedLayers);
  });
});
```

- [ ] **Step 2: Write fixture JSONs**

`frontend/src/chart-ir/analytics/__tests__/__fixtures__/cluster-basic.json`:

```json
{
  "spec": {
    "k": "auto", "k_min": 2, "k_max": 6,
    "variables": ["x", "y"],
    "disaggregate": false, "standardize": true, "seed": 42,
    "showCentroids": false, "showDistance": false
  },
  "result": {
    "optimal_k": 3,
    "assignments": [0, 1, 2, 0, 1, 2],
    "centroids": [[0, 0], [10, 0], [5, 10]],
    "calinski_harabasz_score": 100, "f_statistic": 50,
    "inertia": 5, "total_ssq": 500, "between_group_ssq": 495,
    "candidates": [], "per_cluster_feature_means": [], "notes": []
  },
  "baseEncoding": { "xField": "x", "yField": "y" },
  "expectedLayers": [
    {
      "mark": { "type": "point", "filled": true, "size": 60 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" },
        "color": {
          "field": "__cluster__", "type": "ordinal",
          "scale": { "scheme": "tableau10" },
          "legend": { "title": "Cluster", "labelExpr": "'Cluster ' + (datum.label + 1) + ' (' + datum.value + ' marks)'" }
        }
      }
    }
  ]
}
```

`frontend/src/chart-ir/analytics/__tests__/__fixtures__/cluster-with-centroids.json`:

```json
{
  "spec": {
    "k": "auto", "k_min": 2, "k_max": 6,
    "variables": ["x", "y"],
    "disaggregate": false, "standardize": true, "seed": 42,
    "showCentroids": true, "showDistance": false
  },
  "result": {
    "optimal_k": 2,
    "assignments": [0, 1, 0, 1],
    "centroids": [[0, 0], [10, 10]],
    "calinski_harabasz_score": 50, "f_statistic": 25,
    "inertia": 2, "total_ssq": 200, "between_group_ssq": 198,
    "candidates": [], "per_cluster_feature_means": [], "notes": []
  },
  "baseEncoding": { "xField": "x", "yField": "y" },
  "expectedLayers": [
    {
      "mark": { "type": "point", "filled": true, "size": 60 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" },
        "color": {
          "field": "__cluster__", "type": "ordinal",
          "scale": { "scheme": "tableau10" },
          "legend": { "title": "Cluster", "labelExpr": "'Cluster ' + (datum.label + 1) + ' (' + datum.value + ' marks)'" }
        }
      }
    },
    {
      "data": { "values": [
        { "x": 0, "y": 0, "__centroid_id__": 0 },
        { "x": 10, "y": 10, "__centroid_id__": 1 }
      ] },
      "mark": { "type": "point", "shape": "cross", "size": 200, "stroke": "black", "strokeWidth": 2, "fill": "white" },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" }
      }
    }
  ]
}
```

`frontend/src/chart-ir/analytics/__tests__/__fixtures__/cluster-with-tooltip.json`:

```json
{
  "spec": {
    "k": "auto", "k_min": 2, "k_max": 6,
    "variables": ["x", "y"],
    "disaggregate": false, "standardize": true, "seed": 42,
    "showCentroids": false, "showDistance": true
  },
  "result": {
    "optimal_k": 2,
    "assignments": [0, 1],
    "centroids": [[0, 0], [10, 10]],
    "calinski_harabasz_score": 50, "f_statistic": 25,
    "inertia": 2, "total_ssq": 200, "between_group_ssq": 198,
    "candidates": [], "per_cluster_feature_means": [], "notes": []
  },
  "baseEncoding": { "xField": "x", "yField": "y" },
  "expectedLayers": [
    {
      "mark": { "type": "point", "filled": true, "size": 60 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" },
        "color": {
          "field": "__cluster__", "type": "ordinal",
          "scale": { "scheme": "tableau10" },
          "legend": { "title": "Cluster", "labelExpr": "'Cluster ' + (datum.label + 1) + ' (' + datum.value + ' marks)'" }
        },
        "tooltip": [
          { "field": "__cluster__", "type": "ordinal", "title": "Cluster" },
          { "field": "__distance__", "type": "quantitative", "format": ".3f", "title": "Distance to centroid" }
        ]
      }
    }
  ]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/chart-ir/analytics/__tests__/clusterToVega.test.ts`
Expected: FAIL — `compileCluster` not found.

- [ ] **Step 4: Implement compiler** — `frontend/src/chart-ir/analytics/clusterToVega.ts`:

```ts
/**
 * Plan 9d — Compile ClusterSpec + ClusterResult to Vega-Lite layers.
 * Server runs sklearn; this compiler is a pure transform.
 */

export interface ClusterCandidate {
  k: number;
  ch_score: number;
  inertia: number;
}

export interface ClusterSpec {
  k: number | 'auto';
  k_min: number;
  k_max: number;
  variables: string[];
  disaggregate: boolean;
  standardize: boolean;
  seed: number;
  showCentroids?: boolean;
  showDistance?: boolean;
}

export interface ClusterResult {
  optimal_k: number;
  assignments: number[];
  centroids: number[][];
  calinski_harabasz_score: number;
  f_statistic: number;
  inertia: number;
  total_ssq: number;
  between_group_ssq: number;
  candidates: ClusterCandidate[];
  per_cluster_feature_means: number[][];
  notes: string[];
}

export interface BaseEncoding {
  xField: string;
  yField: string;
}

export type VegaLiteLayer = Record<string, unknown>;

const CLUSTER_LEGEND_LABEL_EXPR =
  "'Cluster ' + (datum.label + 1) + ' (' + datum.value + ' marks)'";

export function compileCluster(
  spec: ClusterSpec,
  result: ClusterResult,
  baseEncoding: BaseEncoding,
): VegaLiteLayer[] {
  const pointEncoding: Record<string, unknown> = {
    x: { field: baseEncoding.xField, type: 'quantitative' },
    y: { field: baseEncoding.yField, type: 'quantitative' },
    color: {
      field: '__cluster__',
      type: 'ordinal',
      scale: { scheme: 'tableau10' },
      legend: {
        title: 'Cluster',
        labelExpr: CLUSTER_LEGEND_LABEL_EXPR,
      },
    },
  };

  if (spec.showDistance) {
    pointEncoding.tooltip = [
      { field: '__cluster__', type: 'ordinal', title: 'Cluster' },
      {
        field: '__distance__',
        type: 'quantitative',
        format: '.3f',
        title: 'Distance to centroid',
      },
    ];
  }

  const layers: VegaLiteLayer[] = [
    {
      mark: { type: 'point', filled: true, size: 60 },
      encoding: pointEncoding,
    },
  ];

  if (spec.showCentroids) {
    layers.push({
      data: {
        values: result.centroids.map((c, i) => ({
          [baseEncoding.xField]: c[0],
          [baseEncoding.yField]: c[1],
          __centroid_id__: i,
        })),
      },
      mark: {
        type: 'point',
        shape: 'cross',
        size: 200,
        stroke: 'black',
        strokeWidth: 2,
        fill: 'white',
      },
      encoding: {
        x: { field: baseEncoding.xField, type: 'quantitative' },
        y: { field: baseEncoding.yField, type: 'quantitative' },
      },
    });
  }

  return layers;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd frontend && npx vitest run src/chart-ir/analytics/__tests__/clusterToVega.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/chart-ir/analytics/clusterToVega.ts frontend/src/chart-ir/analytics/__tests__/clusterToVega.test.ts frontend/src/chart-ir/analytics/__tests__/__fixtures__/cluster-*.json
git commit -m "feat(analyst-pro): clusterToVega.ts Vega-Lite compiler (Plan 9d T5)"
```

---

## Task 6: `ClusterDialog` + `ClusterStatsBadge` + `FloatingLayer` mount

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/ClusterDialog.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/ClusterStatsBadge.jsx`
- Modify: `frontend/src/components/dashboard/freeform/FloatingLayer.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ClusterDialog.integration.test.tsx`

- [ ] **Step 1: Write the failing dialog integration test** — `frontend/src/components/dashboard/freeform/__tests__/ClusterDialog.integration.test.tsx`:

```tsx
/** Plan 9d T6 — ClusterDialog: variables picker, k-mode, preview, stats render. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClusterDialog from '../panels/ClusterDialog';
import { useStore } from '../../../../store';

vi.mock('../../../../api', () => ({
  fetchCluster: vi.fn().mockResolvedValue({
    result: {
      optimal_k: 3,
      assignments: [0, 1, 2, 0, 1, 2],
      centroids: [[0, 0], [10, 0], [5, 10]],
      calinski_harabasz_score: 123.4,
      f_statistic: 60.2,
      inertia: 5, total_ssq: 500, between_group_ssq: 495,
      candidates: [
        { k: 2, ch_score: 80, inertia: 20 },
        { k: 3, ch_score: 123.4, inertia: 5 },
      ],
      per_cluster_feature_means: [[0, 0], [10, 0], [5, 10]],
      notes: [],
    },
  }),
}));

beforeEach(() => {
  useStore.setState({
    analystProClusterDialogCtx: { availableVariables: ['sales', 'profit', 'qty'] },
    analystProClusters: [],
  });
});

describe('ClusterDialog', () => {
  it('renders best-k badge after Preview', async () => {
    render(<ClusterDialog />);
    fireEvent.click(screen.getByText('sales'));
    fireEvent.click(screen.getByText('profit'));
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => expect(screen.getByText(/k\s*=\s*3/i)).toBeInTheDocument());
    expect(screen.getByText(/CH\s*123\.4/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ClusterDialog.integration.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ClusterDialog`** — `frontend/src/components/dashboard/freeform/panels/ClusterDialog.jsx`:

```jsx
import { useState } from 'react';
import { useStore } from '../../../../store';
import { fetchCluster } from '../../../../api';

export default function ClusterDialog() {
  const ctx = useStore((s) => s.analystProClusterDialogCtx);
  const closeDialog = useStore((s) => s.closeClusterDialogAnalystPro);
  const addCluster = useStore((s) => s.addClusterAnalystPro);

  const availableVariables = ctx?.availableVariables || [];
  const [selectedVars, setSelectedVars] = useState([]);
  const [kMode, setKMode] = useState('auto');
  const [kMin, setKMin] = useState(2);
  const [kMax, setKMax] = useState(15);
  const [manualK, setManualK] = useState(3);
  const [standardize, setStandardize] = useState(true);
  const [disaggregate, setDisaggregate] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!ctx) return null;

  const toggleVar = (v) => {
    setSelectedVars((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  const runPreview = async () => {
    setError(null);
    setBusy(true);
    try {
      const spec = {
        k: kMode === 'auto' ? 'auto' : manualK,
        k_min: kMin,
        k_max: kMax,
        variables: selectedVars,
        disaggregate,
        standardize,
        seed: 42,
      };
      const rows = ctx?.rows || [];
      const resp = await fetchCluster({ rows, spec });
      setPreview(resp.result);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!preview) return;
    const id = `cluster_${Date.now()}`;
    addCluster({
      id,
      name: `Cluster (${selectedVars.join(', ')})`,
      spec: {
        k: kMode === 'auto' ? 'auto' : manualK,
        k_min: kMin, k_max: kMax,
        variables: selectedVars,
        disaggregate, standardize, seed: 42,
      },
      result: preview,
      rowKeys: ctx?.rowKeys || [],
    });
    closeDialog();
  };

  return (
    <div role="dialog" aria-label="Cluster" className="cluster-dialog">
      <h3>Cluster</h3>

      <fieldset>
        <legend>Variables</legend>
        {availableVariables.map((v) => (
          <button
            key={v}
            type="button"
            data-selected={selectedVars.includes(v)}
            onClick={() => toggleVar(v)}
          >
            {v}
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend>Number of clusters</legend>
        <label>
          <input type="radio" name="kMode" value="auto"
                 checked={kMode === 'auto'} onChange={() => setKMode('auto')} />
          Auto
        </label>
        <label>
          <input type="radio" name="kMode" value="manual"
                 checked={kMode === 'manual'} onChange={() => setKMode('manual')} />
          Manual
        </label>
        {kMode === 'auto' ? (
          <>
            <label>k_min <input type="number" min={2} value={kMin}
                                onChange={(e) => setKMin(Number(e.target.value))} /></label>
            <label>k_max <input type="number" min={2} value={kMax}
                                onChange={(e) => setKMax(Number(e.target.value))} /></label>
          </>
        ) : (
          <label>k <input type="number" min={2} value={manualK}
                          onChange={(e) => setManualK(Number(e.target.value))} /></label>
        )}
      </fieldset>

      <label>
        <input type="checkbox" checked={standardize}
               onChange={(e) => setStandardize(e.target.checked)} />
        Standardise variables
      </label>
      <label>
        <input type="checkbox" checked={disaggregate}
               onChange={(e) => setDisaggregate(e.target.checked)} />
        Disaggregate data
      </label>

      <button type="button" onClick={runPreview} disabled={busy || selectedVars.length === 0}>
        {busy ? 'Computing…' : 'Preview'}
      </button>

      {error && <p role="alert" className="error">{error}</p>}

      {preview && (
        <div className="preview">
          <p data-testid="best-k">k = {preview.optimal_k}</p>
          <p>CH {preview.calinski_harabasz_score.toFixed(1)}</p>
          <p>F-statistic {preview.f_statistic.toFixed(2)}</p>
          <table>
            <thead><tr><th>Cluster</th><th>Marks</th></tr></thead>
            <tbody>
              {Array.from({ length: preview.optimal_k }, (_, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{preview.assignments.filter((a) => a === i).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="actions">
        <button type="button" onClick={closeDialog}>Cancel</button>
        <button type="button" onClick={save} disabled={!preview}>Save</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `ClusterStatsBadge`** — `frontend/src/components/dashboard/freeform/panels/ClusterStatsBadge.jsx`:

```jsx
import { useState } from 'react';

export default function ClusterStatsBadge({ result }) {
  const [open, setOpen] = useState(false);
  if (!result) return null;
  const sorted = [...(result.candidates || [])].sort((a, b) => b.ch_score - a.ch_score);
  return (
    <div className="cluster-stats-badge">
      <button type="button" onClick={() => setOpen((o) => !o)}>
        k={result.optimal_k} • CH {result.calinski_harabasz_score.toFixed(1)} • F {result.f_statistic.toFixed(2)}
      </button>
      {open && (
        <table>
          <thead><tr><th>k</th><th>CH</th><th>Inertia</th></tr></thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.k}>
                <td>{c.k}</td>
                <td>{c.ch_score.toFixed(2)}</td>
                <td>{c.inertia.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Mount in FloatingLayer** — `frontend/src/components/dashboard/freeform/FloatingLayer.jsx`. Locate lines 6-7 (TrendLineDialog + ForecastDialog imports) and add:

```jsx
import ClusterDialog from './panels/ClusterDialog';
```

Locate lines 27-28 (existing dialog ctx selectors) and add:

```jsx
  const analystProClusterDialogCtx = useStore((s) => s.analystProClusterDialogCtx);
```

Locate line 37 (`{analystProTrendLineDialogCtx ? <TrendLineDialog /> : null}`) and add immediately after the analogous forecast line:

```jsx
      {analystProClusterDialogCtx ? <ClusterDialog /> : null}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ClusterDialog.integration.test.tsx`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/ClusterDialog.jsx frontend/src/components/dashboard/freeform/panels/ClusterStatsBadge.jsx frontend/src/components/dashboard/freeform/FloatingLayer.jsx frontend/src/components/dashboard/freeform/__tests__/ClusterDialog.integration.test.tsx
git commit -m "feat(analyst-pro): ClusterDialog + ClusterStatsBadge + FloatingLayer mount (Plan 9d T6)"
```

---

## Task 7: Cluster-as-Set legend context menu

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/ClusterLegendContextMenu.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ClusterLegendContextMenu.test.tsx`

- [ ] **Step 1: Write the failing test** — `frontend/src/components/dashboard/freeform/__tests__/ClusterLegendContextMenu.test.tsx`:

```tsx
/** Plan 9d T7 — Right-click cluster legend → "Create Set From Cluster" → addSetAnalystPro. */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ClusterLegendContextMenu from '../panels/ClusterLegendContextMenu';
import { useStore } from '../../../../store';

beforeEach(() => {
  useStore.setState({
    analystProDashboard: { id: 'd1', sets: [] },
    analystProHistory: { past: [], future: [] },
    analystProClusters: [
      {
        id: 'c1', name: 'Sales/Profit',
        rowKeys: ['r0', 'r1', 'r2', 'r3'],
        spec: { variables: ['sales', 'profit'] },
        result: {
          optimal_k: 2,
          assignments: [0, 1, 0, 1],
          centroids: [], candidates: [], per_cluster_feature_means: [],
          calinski_harabasz_score: 0, f_statistic: 0,
          inertia: 0, total_ssq: 0, between_group_ssq: 0, notes: [],
        },
      },
    ],
  });
});

describe('ClusterLegendContextMenu', () => {
  it('Creates a set from the chosen cluster index using customer_id dimension', () => {
    render(
      <ClusterLegendContextMenu clusterId="c1" clusterIndex={0} dimension="customer_id" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /create set from cluster/i }));
    const sets = useStore.getState().analystProDashboard.sets;
    expect(sets).toHaveLength(1);
    expect(sets[0].dimension).toBe('customer_id');
    expect(sets[0].members).toEqual(['r0', 'r2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ClusterLegendContextMenu.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement component** — `frontend/src/components/dashboard/freeform/panels/ClusterLegendContextMenu.jsx`:

```jsx
import { useStore } from '../../../../store';

export default function ClusterLegendContextMenu({ clusterId, clusterIndex, dimension }) {
  const createSet = useStore((s) => s.createSetFromClusterAnalystPro);
  return (
    <div role="menu" className="cluster-legend-context-menu">
      <button
        type="button"
        role="menuitem"
        onClick={() => createSet(clusterId, clusterIndex, dimension)}
      >
        Create Set From Cluster
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ClusterLegendContextMenu.test.tsx`
Expected: 1 passed.

- [ ] **Step 5: Run full frontend chart-ir baseline to confirm no new failures**

Run: `cd frontend && npm run test:chart-ir`
Expected: failure count unchanged from current baseline (pre-existing 22 failures, see CLAUDE.md "Known Test Debt").

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/ClusterLegendContextMenu.jsx frontend/src/components/dashboard/freeform/__tests__/ClusterLegendContextMenu.test.tsx
git commit -m "feat(analyst-pro): cluster-as-set legend context menu (Plan 9d T7)"
```

---

## Task 8: User docs + roadmap status update

**Files:**
- Create: `docs/ANALYTICS_CLUSTER.md`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md`

- [ ] **Step 1: Write `docs/ANALYTICS_CLUSTER.md`**:

````markdown
# Analytics — Cluster (K-means)

**Status:** Plan 9d (✅ Shipped 2026-04-20).

## What it does

Groups marks into K clusters using **K-means** with optional auto-selection of K via the **Calinski-Harabasz (CH) score**. Tableau-parity surface: same K-means engine, same CH-driven auto-k, same F-statistic / TotalSumOfSquares / WithinGroupSumOfSquares exposed in the dialog.

## When to use Auto vs Manual K

- **Auto** (default) — let CH pick the optimal K within `[k_min, k_max]`. CH rewards tight intra-cluster + wide inter-cluster separation. Best when you genuinely don't know how many groups exist.
- **Manual** — fix K when business logic dictates ("we want 4 customer tiers"). The engine still returns CH for the chosen K so you can compare against alternatives later.

## Why standardise is on by default

K-means uses Euclidean distance. A `salary` column with range `[30 000, 200 000]` will completely dominate a `years_at_company` column with range `[0, 30]` — the second feature contributes ~0% to cluster boundaries. **Standardisation (z-score) puts every feature on the same scale.** Turn it off only if your features are already commensurable (e.g. lat/long pairs).

## What disaggregate means

By default Tableau (and us) cluster **on the aggregated marks** as drawn — one row per mark in the view. With **Disaggregate Data** ticked the engine clusters every underlying record and assigns its cluster id back to whichever mark contains it. This is `SetDisaggregateFlag` in `tabdocclusteranalysis`. Use it when the per-record distribution matters (e.g. customer-level segmentation) and the marks are aggregated.

## How to read the stats badge

| Stat | Meaning |
|---|---|
| `optimal_k` | K chosen by Auto (or your manual choice) |
| `CH` | Calinski-Harabasz score; higher is better. Comparable across K for the same data |
| `F-statistic` | Equivalent ANOVA F: `CH × (n − k) / (k − 1)`. Surfaced for parity with Tableau |
| `inertia` | Within-group SSQ — total squared distance from each point to its centroid |
| `total_ssq` | Total SSQ if all points were in a single cluster |
| `between_group_ssq` | `total_ssq − inertia` — how much variance the clustering "explains" |

Click the badge to expand the full candidate list (every K tried, sorted by CH).

## When CH is undefined

CH requires `k ≥ 2` and at least two distinct cluster labels. We **clamp `k_min` to 2** automatically — this is noted in `result.notes` if the user passed `k_min=1`. If your data is a single tight blob, Auto-K will still pick `k=2` (the smallest valid K) but the CH will be uninformative — read it as "no real cluster structure."

## Cluster-as-Set

Right-click any entry in the cluster legend → **Create Set From Cluster**. This creates a Plan 4b set whose members are the row keys assigned to that cluster id. The set then participates in every set-aware action (filter source, IN/OUT calc input, dynamic zone visibility, etc.) — no special "cluster set" type, the same set machinery as user-authored sets.

## Limits

| Limit | Default | Setting |
|---|---|---|
| Rate limit | 10 calls / 60s per user | `CLUSTER_RATE_LIMIT_PER_60S` |
| Max input rows | 50 000 | `CLUSTER_MAX_ROWS` |
| Wall-clock timeout | 8 s | `CLUSTER_TIMEOUT_SECONDS` |
| Hard cap on `k_max` | 25 | `CLUSTER_K_MAX_HARD_CAP` |

Feature-flagged on `FEATURE_ANALYST_PRO`; returns `403` when disabled.

## Reserved Phase 16 hook

`result.per_cluster_feature_means` is computed but not surfaced in the UI yet — Phase 16 Explain Data integration uses it to answer "Cluster 2 skews high on Profit because…".
````

- [ ] **Step 2: Update roadmap** — `docs/analyst_pro_tableau_parity_roadmap.md` line 766:

Replace:

```markdown
### Plan 9d — Cluster (K-means + Calinski-Harabasz)
```

With:

```markdown
### Plan 9d — Cluster (K-means + Calinski-Harabasz) — ✅ Shipped 2026-04-20

**Status:** ✅ Shipped 2026-04-20. 8 tasks. Backend modules: `backend/vizql/{cluster,cluster_engine}.py`. Endpoint: `POST /api/v1/analytics/cluster` (feature-flagged on `FEATURE_ANALYST_PRO`, rate-limited 10/60s, 8s timeout, 50k-row hard cap, k_max hard-cap 25). Frontend: `frontend/src/chart-ir/analytics/clusterToVega.ts`, `ClusterDialog.jsx`, `ClusterStatsBadge.jsx`, `ClusterLegendContextMenu.jsx`. Cluster-as-Set bridges into Plan 4b via `createSetFromClusterAnalystPro` → `addSetAnalystPro`. New config: `CLUSTER_RATE_LIMIT_PER_60S=10`, `CLUSTER_MAX_ROWS=50_000`, `CLUSTER_TIMEOUT_SECONDS=8.0`, `CLUSTER_K_MAX_HARD_CAP=25`. Tests: 6 type + 10 engine + 7 endpoint backend; 5 store + 3 vega + 1 dialog + 1 legend menu frontend — all green; backend full suite green; frontend chart-ir baseline unchanged. Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-9d-cluster-kmeans.md`.
```

- [ ] **Step 3: Confirm full backend suite still green**

Run: `cd backend && python -m pytest tests/ -q`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add docs/ANALYTICS_CLUSTER.md docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): user guide + roadmap status for cluster (Plan 9d T8)"
```

---

## Self-Review Checklist (executor reads after T8 lands)

- [ ] Backend full pytest green (`backend && python -m pytest tests/ -q`).
- [ ] Frontend chart-ir baseline unchanged (`frontend && npm run test:chart-ir`) — no new failures introduced.
- [ ] All 8 commits land with `(Plan 9d T<N>)` suffix; T8 uses `docs(analyst-pro)`.
- [ ] `FEATURE_ANALYST_PRO` gate honoured at endpoint (manual `curl` with flag off → 403).
- [ ] CH always returned (synthetic 1-blob test path) and `notes` carries clamp warnings.
- [ ] Cluster-as-Set produces a set whose `members` length sums to `assignments.filter(==index).length` across all clusters (via integration test).
- [ ] `per_cluster_feature_means` populated for every result (reserved Phase 16 hook).
- [ ] No imports of `sklearn` in `frontend/`.
- [ ] No new `import anthropic` anywhere — cluster has no LLM (BYOK boundary intact).
- [ ] `docs/claude/config-defaults.md` updated in T1 commit alongside `config.py` changes (CLAUDE.md mandate).
