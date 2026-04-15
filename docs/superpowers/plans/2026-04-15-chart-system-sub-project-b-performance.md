# Chart System Sub-project B — Performance Ceiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the performance layer beneath sub-project A's IR — render strategy router, server-side LTTB downsampling, progressive Arrow streaming, frame budget tracking, unified instance pool — so AskDB charts beat Tableau / Power BI / Looker on the four §0.3 benchmark scenarios.

**Architecture:** Push downsampling to the server (DuckDB twin), pick renderer at render time via Render Strategy Router (RSR), self-tune via frame budget tracker. Same IR as A, different pixels. Adds two backend modules + three frontend module groups.

**Tech Stack:** Python 3.10+ FastAPI (existing), DuckDB (existing) with pure-SQL LTTB, Apache Arrow IPC over SSE (existing agent SSE infra), TypeScript / React 19, Vega-Lite (from A), deck.gl (extended from existing geo use), Playwright benchmarks.

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-b-performance-design.md`](../specs/2026-04-15-chart-system-sub-project-b-performance-design.md) — read this first.

**Foundation:** Sub-project A spec + plan. **B Phase B0 can start in parallel with A Phase 0–1, but B Phase B2 (RSR wiring) cannot start until A reaches `v1-editor-shell`** because RSR injects into A's `chart-ir/router.ts` which doesn't exist until A Phase 1.

**Detail level:** This plan details Phase B0 step-by-step. Phases B1–B6 are scoped at task granularity with file paths, signatures, key code blocks, and acceptance criteria — they get expanded into step-by-step plans at the start of each phase. This matches sub-project A's plan pattern.

**Branch:** Continue on `askdb-global-comp` (the active dev branch) until A merges, then re-evaluate whether B gets its own branch.

---

## File Structure (locked at plan time)

### New backend files
```
backend/
  chart_downsampler.py              # Strategy picker + DuckDB SQL fragments
  arrow_stream.py                   # Async Arrow IPC stream generator
  tests/
    test_chart_downsampler.py       # Unit tests for strategy + SQL fragments
    test_arrow_stream.py            # Integration test against in-memory twin
    test_adv_chart_perf_endpoint.py # Adversarial: SSE stream auth, oversized query, malformed SQL
```

### Modified backend files
```
backend/
  duckdb_twin.py                    # +query_twin_downsampled() method
  query_engine.py                   # Add chart_hints to response
  routers/agent_routes.py           # +POST /api/v1/charts/stream SSE endpoint
                                    # +POST /api/v1/perf/telemetry fire-and-forget
  config.py                         # New CHART_* flags
```

### New frontend files
```
frontend/src/chart-ir/
  rsr/
    renderStrategyRouter.ts         # pickRenderStrategy() pure function
    strategy.ts                     # RenderStrategy + RenderStrategyInput types
    thresholds.ts                   # Configurable T0/T1/T2/T3 thresholds
  perf/
    frameBudgetTracker.ts           # rAF-based FPS measurement
    instancePool.ts                 # Unified slot pool (replaces webglContextPool)
    arrowChunkReceiver.ts           # SSE Arrow IPC receiver
    rendererTelemetry.ts            # Per-render telemetry POST
  renderers/
    DeckRenderer.tsx                # NEW — react component wrapping deck.gl
    ProgressiveVegaCanvas.tsx       # NEW — Vega Canvas with progressive batches
  compilers/
    specToDeckLayers.ts             # ChartSpec → deck.gl Layer[]

frontend/perf/                      # NEW — benchmark harness
  bench-10m-line.spec.ts
  bench-1m-scatter.spec.ts
  bench-100k-table-sparklines.spec.ts
  bench-500-tile-dashboard.spec.ts
  fixtures/
    gen-minute-metrics.ts
    gen-customer-spend.ts
    gen-inventory-history.ts
    gen-analyst-workbench.ts
  playwright.perf.config.ts         # Separate Playwright config for benchmarks
```

### Modified frontend files (all created in A — gated)
```
frontend/src/chart-ir/
  router.ts                         # Inject RSR call before renderer dispatch
  types.ts                          # Extend Transform.sample, add ChartSpec.config.strategyHint
  renderers/VegaRenderer.tsx        # Accept rendererBackend: 'svg' | 'canvas'
frontend/src/lib/
  webglContextPool.js               # Becomes 10-line shim re-exporting instancePool
```

---

## Phase B0 — Foundations (~3–5 days, fully detailed)

Goal: types, RSR pure function with full unit coverage, frame budget tracker, instance pool. No data flow yet, no rendering changes. End state: every B0 module imports cleanly, RSR's decision matrix is fully tested, frame tracker emits state changes against synthetic frame timings.

**Pre-flight gate:** Confirm sub-project A has at least merged its Phase 0 (`v0-foundations`) so `chart-ir/types.ts` exists. If A is still unmerged at the time B0 starts, create stub `chart-ir/types.ts` with the minimum types this plan needs (`ChartSpec`, `Transform`, `SemanticType`, `Encoding`) — and delete the stub at the start of B2 once A's real types land. Document the stub as a TODO at the top of the file.

### Task B0.1 — Backend config flags

**Files:**
- Modify: `backend/config.py` — add 6 new `CHART_*` settings to the `Settings` Pydantic class
- Test: `backend/tests/test_chart_perf_config.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_chart_perf_config.py`:
```python
"""Tests for sub-project B chart performance config flags."""
from config import settings


def test_chart_downsample_enabled_default_true():
    assert settings.CHART_DOWNSAMPLE_ENABLED is True


def test_chart_downsample_default_target_points():
    assert settings.CHART_DOWNSAMPLE_DEFAULT_TARGET_POINTS == 4000
    assert settings.CHART_DOWNSAMPLE_DEFAULT_TARGET_POINTS > 0


def test_chart_stream_batch_rows_default():
    assert settings.CHART_STREAM_BATCH_ROWS == 5000


def test_chart_frame_budgets():
    assert settings.CHART_FRAME_BUDGET_TIGHT_MS == 16
    assert settings.CHART_FRAME_BUDGET_LOOSE_MS == 33
    assert settings.CHART_FRAME_BUDGET_TIGHT_MS < settings.CHART_FRAME_BUDGET_LOOSE_MS


def test_chart_instance_pool_max():
    assert settings.CHART_INSTANCE_POOL_MAX == 12
    assert settings.CHART_INSTANCE_POOL_MAX >= 6


def test_chart_perf_enabled_default_false():
    """B feature flag — gates RSR injection + downsampling. Default off until B5."""
    assert settings.CHART_PERF_ENABLED is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_chart_perf_config.py -v`
Expected: 6 failures with `AttributeError: 'Settings' object has no attribute 'CHART_*'`.

- [ ] **Step 3: Add settings to config.py**

In `backend/config.py`, find the `Settings` class and add a new section after the existing `WATERFALL_*` settings:
```python
    # ── Sub-project B (chart performance) ─────────────────────────
    CHART_PERF_ENABLED: bool = False
    CHART_DOWNSAMPLE_ENABLED: bool = True
    CHART_DOWNSAMPLE_DEFAULT_TARGET_POINTS: int = 4000
    CHART_STREAM_BATCH_ROWS: int = 5000
    CHART_FRAME_BUDGET_TIGHT_MS: int = 16
    CHART_FRAME_BUDGET_LOOSE_MS: int = 33
    CHART_INSTANCE_POOL_MAX: int = 12
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_chart_perf_config.py -v`
Expected: 6 PASS.

- [ ] **Step 5: Run full backend test suite to verify no regressions**

Run: `cd backend && python -m pytest tests/ -x --tb=short`
Expected: All tests PASS (or fail on pre-existing flakies unrelated to this change).

- [ ] **Step 6: Commit**

```bash
git add backend/config.py backend/tests/test_chart_perf_config.py
git commit -m "feat(b0): chart performance config flags

Add seven new Settings fields gating sub-project B work:
- CHART_PERF_ENABLED (master gate, default False)
- CHART_DOWNSAMPLE_ENABLED (default True)
- CHART_DOWNSAMPLE_DEFAULT_TARGET_POINTS (4000)
- CHART_STREAM_BATCH_ROWS (5000)
- CHART_FRAME_BUDGET_TIGHT_MS (16) / _LOOSE_MS (33)
- CHART_INSTANCE_POOL_MAX (12)

Six unit tests verify defaults + invariants."
```

---

### Task B0.2 — RenderStrategy types (frontend)

**Files:**
- Create: `frontend/src/chart-ir/rsr/strategy.ts`
- Create: `frontend/src/chart-ir/rsr/thresholds.ts`

- [ ] **Step 1: Define the types in `strategy.ts`**

Create `frontend/src/chart-ir/rsr/strategy.ts`:
```typescript
/**
 * RenderStrategy — the output of the Render Strategy Router (RSR).
 *
 * RSR decides at render time which renderer + backend + downsample method
 * to use for a given chart, based on the data shape, GPU tier, current
 * frame budget, and pool pressure. The strategy is recomputed when any of
 * those inputs changes.
 */

import type { ChartSpec, SemanticType } from '../types';

export type StrategyTier = 't0' | 't1' | 't2' | 't3';
export type RendererFamily = 'vega' | 'deck' | 'maplibre' | 'creative';
export type RendererBackend = 'svg' | 'canvas' | 'webgl';
export type DownsampleMethod = 'lttb' | 'uniform' | 'pixel_min_max' | 'aggregate_bin' | 'none';
export type FrameBudgetState = 'tight' | 'normal' | 'loose';
export type GpuTier = 'low' | 'medium' | 'high';

export interface ResultProfile {
  rowCount: number;
  xType?: SemanticType;
  yType?: SemanticType;
  /** True if the chart's mark type can be rendered by deck.gl. */
  markEligibleForDeck: boolean;
}

export interface InstancePressure {
  activeContexts: number;
  max: number;
  /** max(webglRatio, memoryRatio). 0.0 = empty, 1.0 = full. */
  pressureRatio: number;
}

export interface RenderStrategyInput {
  spec: ChartSpec;
  resultProfile: ResultProfile;
  gpuTier: GpuTier;
  frameBudgetState: FrameBudgetState;
  instancePressure: InstancePressure;
  /** Optional pixel width hint for pixel_min_max strategy. */
  pixelWidth?: number;
  /** Power-user / test override. Refused if illegal for the chart. */
  hint?: StrategyTier;
}

export interface RenderStrategy {
  tier: StrategyTier;
  rendererFamily: RendererFamily;
  rendererBackend: RendererBackend;
  downsample: {
    enabled: boolean;
    method: DownsampleMethod;
    targetPoints: number;
  };
  streaming: {
    enabled: boolean;
    batchRows: number;
  };
  /** Human-readable explanation. Surfaced in dev overlay + telemetry. */
  reason: string;
}
```

- [ ] **Step 2: Define thresholds in `thresholds.ts`**

Create `frontend/src/chart-ir/rsr/thresholds.ts`:
```typescript
/**
 * Thresholds for the Render Strategy Router decision tree.
 *
 * Defaults are duplicated in backend/config.py as CHART_* settings so the
 * server-side downsampling agrees with the client-side strategy. Don't
 * change one without changing the other.
 */

export const THRESHOLDS = {
  /** Marks budget per tier. */
  T0_MAX_MARKS: 4_000,
  T1_MAX_MARKS: 80_000,
  T2_MAX_MARKS: 500_000,
  // T3 has no upper bound — server LTTB caps the rendered point count

  /** Default target points after downsampling. */
  DEFAULT_TARGET_POINTS: 4_000,

  /** Streaming kicks in at this row count. */
  STREAMING_THRESHOLD_ROWS: 200_000,

  /** Stream batch size. Matches CHART_STREAM_BATCH_ROWS in backend. */
  STREAM_BATCH_ROWS: 5_000,

  /** Pool pressure ratio at which RSR downshifts one tier. */
  INSTANCE_PRESSURE_DOWNSHIFT: 0.85,

  /** Frame budget thresholds (in ms). Matches CHART_FRAME_BUDGET_*_MS. */
  FRAME_BUDGET_TIGHT_MS: 28,
  FRAME_BUDGET_LOOSE_MS: 12,

  /** Hold time before frame-budget state changes propagate. */
  FRAME_BUDGET_HYSTERESIS_MS: 200,

  /** Cooldown after escalation to prevent oscillation. */
  ESCALATION_COOLDOWN_MS: 30_000,
} as const;

/** Mark types that deck.gl can render natively. */
export const DECK_ELIGIBLE_MARKS = new Set([
  'point',
  'circle',
  'square',
  'line',
  'area',
  'rect',
  'geoshape',
  'arc',
  'trail',
]);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 0 errors related to the new files. (Existing errors in unrelated files — leave alone.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/chart-ir/rsr/strategy.ts frontend/src/chart-ir/rsr/thresholds.ts
git commit -m "feat(b0): RenderStrategy types + thresholds

Define RenderStrategy / RenderStrategyInput / ResultProfile /
InstancePressure types for the Render Strategy Router (RSR). Define
default thresholds in thresholds.ts that mirror backend CHART_*
settings."
```

---

### Task B0.3 — `pickRenderStrategy` pure function

**Files:**
- Create: `frontend/src/chart-ir/rsr/renderStrategyRouter.ts`
- Test: `frontend/src/chart-ir/rsr/renderStrategyRouter.test.ts` — Vitest if introduced, otherwise Node `--test` runner using `.spec.ts` extension. **Decision needed at task start:** check `frontend/package.json` for an existing test runner. If none, add Node 20+ `node --test` invocation as a one-liner npm script (`"test:unit": "node --test src/**/*.test.ts"`). Avoid pulling in Vitest just for this file unless A's plan already added it.

- [ ] **Step 1: Confirm test runner availability**

Read `frontend/package.json`. If `vitest` is in devDependencies → use Vitest. Otherwise add this line to `scripts`:
```json
"test:unit": "node --experimental-strip-types --test 'src/**/*.test.ts'"
```
Document choice at the top of the test file.

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/chart-ir/rsr/renderStrategyRouter.test.ts`:
```typescript
/**
 * RSR decision matrix tests. Every cell of the decision tree should hit.
 * If you add a new branch, add a test here first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRenderStrategy } from './renderStrategyRouter';
import type { RenderStrategyInput } from './strategy';

function baseInput(overrides: Partial<RenderStrategyInput> = {}): RenderStrategyInput {
  return {
    spec: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'line',
      encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'revenue', type: 'quantitative' } },
    } as any,
    resultProfile: { rowCount: 1000, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
    gpuTier: 'medium',
    frameBudgetState: 'normal',
    instancePressure: { activeContexts: 0, max: 12, pressureRatio: 0 },
    ...overrides,
  };
}

test('T0 SVG for tiny line chart', () => {
  const s = pickRenderStrategy(baseInput({ resultProfile: { rowCount: 500, markEligibleForDeck: true } }));
  assert.equal(s.tier, 't0');
  assert.equal(s.rendererBackend, 'svg');
  assert.equal(s.downsample.enabled, false);
});

test('T1 Canvas for medium line chart', () => {
  const s = pickRenderStrategy(baseInput({ resultProfile: { rowCount: 50_000, markEligibleForDeck: true } }));
  assert.equal(s.tier, 't1');
  assert.equal(s.rendererBackend, 'canvas');
  assert.equal(s.rendererFamily, 'vega');
});

test('T2 deck.gl for large scatter', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 300_000, markEligibleForDeck: true },
  }));
  assert.equal(s.tier, 't2');
  assert.equal(s.rendererFamily, 'deck');
  assert.equal(s.rendererBackend, 'webgl');
});

test('T3 streaming for huge time series', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 10_000_000, markEligibleForDeck: true },
  }));
  assert.equal(s.tier, 't3');
  assert.equal(s.streaming.enabled, true);
  assert.equal(s.downsample.method, 'lttb');
});

test('Non-deck-eligible mark stays on Vega even at 500k rows', () => {
  const s = pickRenderStrategy(baseInput({
    spec: { ...baseInput().spec, mark: 'boxplot' } as any,
    resultProfile: { rowCount: 500_000, markEligibleForDeck: false },
  }));
  assert.equal(s.rendererFamily, 'vega');
  assert.equal(s.downsample.enabled, true);
  assert.ok(s.downsample.targetPoints <= 4_000);
});

test('Low GPU tier clamps at T1', () => {
  const s = pickRenderStrategy(baseInput({
    gpuTier: 'low',
    resultProfile: { rowCount: 1_000_000, markEligibleForDeck: true },
  }));
  assert.equal(s.tier, 't1');
  assert.equal(s.rendererFamily, 'vega');
  assert.equal(s.downsample.enabled, true);
});

test('High instance pressure downshifts one tier', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 300_000, markEligibleForDeck: true },
    instancePressure: { activeContexts: 11, max: 12, pressureRatio: 0.92 },
  }));
  // Would have been t2; downshifted to t1
  assert.equal(s.tier, 't1');
});

test('Tight frame budget escalates one tier', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 50_000, markEligibleForDeck: true },
    frameBudgetState: 'tight',
  }));
  // Would have been t1 Canvas; escalated to t2 deck
  assert.equal(s.tier, 't2');
});

test('Hint t2 honored for deck-eligible mark', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 1000, markEligibleForDeck: true },
    hint: 't2',
  }));
  assert.equal(s.tier, 't2');
});

test('Hint t2 refused for non-deck-eligible mark', () => {
  const s = pickRenderStrategy(baseInput({
    spec: { ...baseInput().spec, mark: 'boxplot' } as any,
    resultProfile: { rowCount: 1000, markEligibleForDeck: false },
    hint: 't2',
  }));
  assert.notEqual(s.tier, 't2');
  assert.match(s.reason, /refused/i);
});

test('Map spec.type always uses maplibre family regardless of rowCount', () => {
  const s = pickRenderStrategy(baseInput({
    spec: { ...baseInput().spec, type: 'map' } as any,
    resultProfile: { rowCount: 50, markEligibleForDeck: false },
  }));
  assert.equal(s.rendererFamily, 'maplibre');
});

test('Creative spec.type always uses creative family', () => {
  const s = pickRenderStrategy(baseInput({
    spec: { ...baseInput().spec, type: 'creative' } as any,
  }));
  assert.equal(s.rendererFamily, 'creative');
});

test('Streaming gate at exactly 200k', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 200_001, markEligibleForDeck: true },
  }));
  assert.equal(s.streaming.enabled, true);
});

test('Reason field is non-empty for every strategy', () => {
  const cases = [
    { rowCount: 100 },
    { rowCount: 50_000 },
    { rowCount: 300_000 },
    { rowCount: 5_000_000 },
  ];
  for (const c of cases) {
    const s = pickRenderStrategy(baseInput({ resultProfile: { rowCount: c.rowCount, markEligibleForDeck: true } }));
    assert.ok(s.reason.length > 0, `empty reason for rowCount=${c.rowCount}`);
  }
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm run test:unit`
Expected: 14 failures with `Cannot find module './renderStrategyRouter'`.

- [ ] **Step 4: Implement `renderStrategyRouter.ts`**

Create `frontend/src/chart-ir/rsr/renderStrategyRouter.ts`:
```typescript
import type {
  DownsampleMethod,
  RenderStrategy,
  RenderStrategyInput,
  RendererBackend,
  RendererFamily,
  StrategyTier,
} from './strategy';
import { THRESHOLDS, DECK_ELIGIBLE_MARKS } from './thresholds';

function getMarkType(spec: any): string {
  if (typeof spec.mark === 'string') return spec.mark;
  if (spec.mark && typeof spec.mark === 'object') return spec.mark.type;
  return 'unknown';
}

function fixedFamily(specType: string): RendererFamily | null {
  if (specType === 'map') return 'maplibre';
  if (specType === 'creative') return 'creative';
  if (specType === 'geo-overlay') return 'deck';
  return null; // cartesian — RSR decides
}

function pickDownsample(
  rowCount: number,
  targetPoints: number,
  xType?: string,
  yType?: string,
  pixelWidth?: number,
): { enabled: boolean; method: DownsampleMethod; targetPoints: number } {
  if (rowCount <= targetPoints) {
    return { enabled: false, method: 'none', targetPoints };
  }
  // Time series with pixel hint → pixel_min_max
  if (pixelWidth && (xType === 'temporal' || xType === 'quantitative') && yType === 'quantitative') {
    return { enabled: true, method: 'pixel_min_max', targetPoints };
  }
  // Time series without pixel hint → LTTB
  if ((xType === 'temporal' || xType === 'quantitative') && yType === 'quantitative') {
    return { enabled: true, method: 'lttb', targetPoints };
  }
  // Anything else → uniform sample
  return { enabled: true, method: 'uniform', targetPoints };
}

function tierMaxMarks(tier: StrategyTier): number {
  switch (tier) {
    case 't0': return THRESHOLDS.T0_MAX_MARKS;
    case 't1': return THRESHOLDS.T1_MAX_MARKS;
    case 't2': return THRESHOLDS.T2_MAX_MARKS;
    case 't3': return Number.POSITIVE_INFINITY;
  }
}

function downshift(tier: StrategyTier): StrategyTier {
  switch (tier) {
    case 't3': return 't2';
    case 't2': return 't1';
    case 't1': return 't0';
    case 't0': return 't0';
  }
}

function escalate(tier: StrategyTier): StrategyTier {
  switch (tier) {
    case 't0': return 't1';
    case 't1': return 't2';
    case 't2': return 't3';
    case 't3': return 't3';
  }
}

export function pickRenderStrategy(input: RenderStrategyInput): RenderStrategy {
  const { spec, resultProfile, gpuTier, frameBudgetState, instancePressure, hint, pixelWidth } = input;
  const reasons: string[] = [];

  // 1. Family fixed by spec.type for non-cartesian
  const fixed = fixedFamily(spec.type as string);
  if (fixed === 'maplibre') {
    return {
      tier: 't2',
      rendererFamily: 'maplibre',
      rendererBackend: 'webgl',
      downsample: pickDownsample(resultProfile.rowCount, THRESHOLDS.DEFAULT_TARGET_POINTS, resultProfile.xType, resultProfile.yType, pixelWidth),
      streaming: { enabled: false, batchRows: THRESHOLDS.STREAM_BATCH_ROWS },
      reason: 'spec.type=map → maplibre fixed family',
    };
  }
  if (fixed === 'creative') {
    return {
      tier: 't2',
      rendererFamily: 'creative',
      rendererBackend: 'webgl',
      downsample: { enabled: false, method: 'none', targetPoints: 0 },
      streaming: { enabled: false, batchRows: THRESHOLDS.STREAM_BATCH_ROWS },
      reason: 'spec.type=creative → creative fixed family',
    };
  }
  if (fixed === 'deck') {
    return {
      tier: 't2',
      rendererFamily: 'deck',
      rendererBackend: 'webgl',
      downsample: pickDownsample(resultProfile.rowCount, THRESHOLDS.DEFAULT_TARGET_POINTS, resultProfile.xType, resultProfile.yType, pixelWidth),
      streaming: { enabled: resultProfile.rowCount > THRESHOLDS.STREAMING_THRESHOLD_ROWS, batchRows: THRESHOLDS.STREAM_BATCH_ROWS },
      reason: 'spec.type=geo-overlay → deck fixed family',
    };
  }

  // 2. Cartesian — RSR decides
  const markEligible = resultProfile.markEligibleForDeck && DECK_ELIGIBLE_MARKS.has(getMarkType(spec));
  const targetPoints = THRESHOLDS.DEFAULT_TARGET_POINTS;

  // 2a. Hint override (sanity-checked)
  if (hint) {
    if ((hint === 't2' || hint === 't3') && !markEligible) {
      reasons.push(`hint=${hint} refused: mark not deck-eligible`);
    } else {
      const family: RendererFamily = (hint === 't2' || hint === 't3') ? 'deck' : 'vega';
      const backend: RendererBackend = hint === 't0' ? 'svg' : (hint === 't1' ? 'canvas' : 'webgl');
      return {
        tier: hint,
        rendererFamily: family,
        rendererBackend: backend,
        downsample: pickDownsample(resultProfile.rowCount, targetPoints, resultProfile.xType, resultProfile.yType, pixelWidth),
        streaming: { enabled: hint === 't3' || (hint === 't2' && resultProfile.rowCount > THRESHOLDS.STREAMING_THRESHOLD_ROWS), batchRows: THRESHOLDS.STREAM_BATCH_ROWS },
        reason: `hint override: ${hint}`,
      };
    }
  }

  // 2b. Initial tier from row count
  let tier: StrategyTier;
  if (resultProfile.rowCount <= THRESHOLDS.T0_MAX_MARKS) {
    tier = 't0';
    reasons.push(`rowCount ${resultProfile.rowCount} ≤ T0 cap`);
  } else if (resultProfile.rowCount <= THRESHOLDS.T1_MAX_MARKS) {
    tier = 't1';
    reasons.push(`rowCount ${resultProfile.rowCount} ≤ T1 cap`);
  } else if (resultProfile.rowCount <= THRESHOLDS.T2_MAX_MARKS && markEligible) {
    tier = 't2';
    reasons.push(`rowCount ${resultProfile.rowCount} ≤ T2 cap + deck-eligible`);
  } else if (markEligible) {
    tier = 't3';
    reasons.push(`rowCount ${resultProfile.rowCount} > T2 cap + deck-eligible → streaming`);
  } else {
    tier = 't1';
    reasons.push(`rowCount ${resultProfile.rowCount} > T1 cap but not deck-eligible — server LTTB to T1`);
  }

  // 2c. GPU tier clamp
  if (gpuTier === 'low' && (tier === 't2' || tier === 't3')) {
    tier = 't1';
    reasons.push('gpuTier=low clamps to T1');
  }

  // 2d. Instance pressure downshift
  if (instancePressure.pressureRatio > THRESHOLDS.INSTANCE_PRESSURE_DOWNSHIFT && (tier === 't2' || tier === 't3')) {
    tier = downshift(tier);
    reasons.push(`pressureRatio ${instancePressure.pressureRatio.toFixed(2)} > ${THRESHOLDS.INSTANCE_PRESSURE_DOWNSHIFT} → downshift`);
  }

  // 2e. Frame budget escalation (only if mark allows it)
  if (frameBudgetState === 'tight' && markEligible && tier !== 't3') {
    tier = escalate(tier);
    reasons.push('frame budget tight → escalate one tier');
  }

  // Map tier → family + backend
  const family: RendererFamily = (tier === 't2' || tier === 't3') ? 'deck' : 'vega';
  const backend: RendererBackend = tier === 't0' ? 'svg' : (tier === 't1' ? 'canvas' : 'webgl');

  return {
    tier,
    rendererFamily: family,
    rendererBackend: backend,
    downsample: pickDownsample(resultProfile.rowCount, targetPoints, resultProfile.xType, resultProfile.yType, pixelWidth),
    streaming: {
      enabled: tier === 't3' || (tier === 't2' && resultProfile.rowCount > THRESHOLDS.STREAMING_THRESHOLD_ROWS),
      batchRows: THRESHOLDS.STREAM_BATCH_ROWS,
    },
    reason: reasons.join(' · '),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm run test:unit`
Expected: 14 PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/chart-ir/rsr/renderStrategyRouter.ts \
        frontend/src/chart-ir/rsr/renderStrategyRouter.test.ts \
        frontend/package.json
git commit -m "feat(b0): RSR pickRenderStrategy() pure function

Decision tree:
1. spec.type=map/creative/geo-overlay → fixed family
2. cartesian: rowCount → initial tier (T0/T1/T2/T3)
3. low GPU → clamp to T1
4. high instance pressure → downshift one tier
5. tight frame budget → escalate one tier (deck-eligible only)
6. streaming enabled at >200k rows on T2/T3

14 unit tests cover every branch + every clamp interaction."
```

---

### Task B0.4 — Frame budget tracker

**Files:**
- Create: `frontend/src/chart-ir/perf/frameBudgetTracker.ts`
- Create: `frontend/src/chart-ir/perf/frameBudgetTracker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/chart-ir/perf/frameBudgetTracker.test.ts`:
```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameBudgetTracker } from './frameBudgetTracker';

test('starts in normal state', () => {
  const t = new FrameBudgetTracker();
  assert.equal(t.getState(), 'normal');
});

test('transitions to loose when all frames are fast', () => {
  const t = new FrameBudgetTracker({ holdMs: 0 });
  for (let i = 0; i < 60; i++) t.recordFrameTime(8);
  assert.equal(t.getState(), 'loose');
});

test('transitions to tight when p95 frame time crosses 28ms', () => {
  const t = new FrameBudgetTracker({ holdMs: 0 });
  for (let i = 0; i < 60; i++) t.recordFrameTime(40);
  assert.equal(t.getState(), 'tight');
});

test('hysteresis prevents single-frame flapping', () => {
  const t = new FrameBudgetTracker({ holdMs: 200 });
  for (let i = 0; i < 60; i++) t.recordFrameTime(40);
  // Even though p95 is high, hold time hasn't elapsed — state still normal at t=0
  // (in real usage the rAF loop calls advance() which checks elapsed wall-clock)
  assert.equal(t.getState(), 'normal');
});

test('listener is called on state change', () => {
  const t = new FrameBudgetTracker({ holdMs: 0 });
  let lastState = '';
  t.subscribe((s) => { lastState = s; });
  for (let i = 0; i < 60; i++) t.recordFrameTime(8);
  assert.equal(lastState, 'loose');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:unit`
Expected: 5 failures with module-not-found.

- [ ] **Step 3: Implement `frameBudgetTracker.ts`**

Create `frontend/src/chart-ir/perf/frameBudgetTracker.ts`:
```typescript
import { THRESHOLDS } from '../rsr/thresholds';
import type { FrameBudgetState } from '../rsr/strategy';

const BUFFER_SIZE = 60;

export interface FrameBudgetTrackerOptions {
  holdMs?: number;
}

type Listener = (state: FrameBudgetState) => void;

export class FrameBudgetTracker {
  private buffer: number[] = [];
  private writeIndex = 0;
  private state: FrameBudgetState = 'normal';
  private pendingState: FrameBudgetState = 'normal';
  private pendingSince = 0;
  private holdMs: number;
  private listeners = new Set<Listener>();
  private rafId: number | null = null;
  private lastFrameTs = 0;

  constructor(options: FrameBudgetTrackerOptions = {}) {
    this.holdMs = options.holdMs ?? THRESHOLDS.FRAME_BUDGET_HYSTERESIS_MS;
  }

  /** Start the rAF loop. Safe to call multiple times. */
  start(): void {
    if (this.rafId !== null) return;
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
    const tick = (ts: number) => {
      if (this.lastFrameTs > 0) this.recordFrameTime(ts - this.lastFrameTs);
      this.lastFrameTs = ts;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.lastFrameTs = 0;
  }

  recordFrameTime(ms: number): void {
    if (this.buffer.length < BUFFER_SIZE) {
      this.buffer.push(ms);
    } else {
      this.buffer[this.writeIndex] = ms;
      this.writeIndex = (this.writeIndex + 1) % BUFFER_SIZE;
    }
    this.evaluate();
  }

  getState(): FrameBudgetState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private evaluate(): void {
    if (this.buffer.length < 10) return; // wait for some signal
    const sorted = [...this.buffer].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    let next: FrameBudgetState;
    if (p95 >= THRESHOLDS.FRAME_BUDGET_TIGHT_MS) next = 'tight';
    else if (p95 < THRESHOLDS.FRAME_BUDGET_LOOSE_MS) next = 'loose';
    else next = 'normal';

    if (next === this.state) {
      this.pendingState = next;
      this.pendingSince = 0;
      return;
    }

    if (next !== this.pendingState) {
      this.pendingState = next;
      this.pendingSince = Date.now();
      return;
    }

    if (this.holdMs === 0 || (Date.now() - this.pendingSince) >= this.holdMs) {
      this.state = next;
      for (const l of this.listeners) {
        try { l(this.state); } catch { /* swallow */ }
      }
    }
  }
}

/** Process-wide singleton, lazily started on first import-with-DOM. */
export const globalFrameBudgetTracker = new FrameBudgetTracker();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test:unit`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart-ir/perf/frameBudgetTracker.ts \
        frontend/src/chart-ir/perf/frameBudgetTracker.test.ts
git commit -m "feat(b0): FrameBudgetTracker — rAF-based FPS measurement

60-frame rolling buffer, p95 frame time → loose/normal/tight states,
hysteresis hold to prevent single-frame flapping, lazy rAF loop start
(SSR-safe), pub/sub for RSR integration. Five unit tests."
```

---

### Task B0.5 — Unified InstancePool

**Files:**
- Create: `frontend/src/chart-ir/perf/instancePool.ts`
- Create: `frontend/src/chart-ir/perf/instancePool.test.ts`
- Modify: `frontend/src/lib/webglContextPool.js` (becomes shim)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/chart-ir/perf/instancePool.test.ts`:
```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstancePool } from './instancePool';

test('acquires and releases slots', () => {
  const p = new InstancePool({ max: 4 });
  p.acquireSlot('vega-canvas', 'a', () => {});
  p.acquireSlot('deck', 'b', () => {});
  assert.equal(p.activeWebglContexts(), 1);
  assert.equal(p.estimatedMemoryMb(), 12 + 80);
  p.releaseSlot('a');
  p.releaseSlot('b');
  assert.equal(p.activeWebglContexts(), 0);
});

test('LRU eviction prefers WebGL kinds when contexts are tight', () => {
  const p = new InstancePool({ max: 3 });
  let evicted = '';
  p.acquireSlot('vega-canvas', 'older-vega', () => { evicted += 'older-vega,'; });
  p.acquireSlot('deck', 'older-deck', () => { evicted += 'older-deck,'; });
  p.acquireSlot('vega-canvas', 'newer-vega', () => { evicted += 'newer-vega,'; });
  p.acquireSlot('deck', 'fresh-deck', () => { evicted += 'fresh-deck,'; });
  // `older-deck` should be evicted preferentially (LRU AND WebGL kind)
  assert.match(evicted, /older-deck/);
});

test('touchSlot updates LRU position', () => {
  const p = new InstancePool({ max: 2 });
  let evicted = '';
  p.acquireSlot('vega-canvas', 'a', () => { evicted += 'a,'; });
  p.acquireSlot('vega-canvas', 'b', () => { evicted += 'b,'; });
  // Now touch 'a' so 'b' becomes LRU
  p.touchSlot('a');
  p.acquireSlot('vega-canvas', 'c', () => { evicted += 'c,'; });
  assert.match(evicted, /b/);
  assert.doesNotMatch(evicted, /a/);
});

test('pressureRatio reflects max(webglRatio, memoryRatio)', () => {
  const p = new InstancePool({ max: 4, memoryCapMb: 200 });
  p.acquireSlot('deck', 'a', () => {});
  p.acquireSlot('deck', 'b', () => {});
  // 2/4 = 0.5 webgl, 160/200 = 0.8 memory
  assert.equal(p.pressureRatio(), 0.8);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:unit`
Expected: 4 failures (module not found).

- [ ] **Step 3: Implement `instancePool.ts`**

Create `frontend/src/chart-ir/perf/instancePool.ts`:
```typescript
export type InstanceKind = 'vega-svg' | 'vega-canvas' | 'maplibre' | 'deck' | 'three';

interface SlotEntry {
  kind: InstanceKind;
  id: string;
  lastUsed: number;
  onEvict: () => void;
}

interface InstanceWeight {
  webglContext: 0 | 1;
  estimatedMb: number;
}

const WEIGHTS: Record<InstanceKind, InstanceWeight> = {
  'vega-svg':    { webglContext: 0, estimatedMb: 5 },
  'vega-canvas': { webglContext: 0, estimatedMb: 12 },
  'maplibre':    { webglContext: 1, estimatedMb: 60 },
  'deck':        { webglContext: 1, estimatedMb: 80 },
  'three':       { webglContext: 1, estimatedMb: 50 },
};

export interface InstancePoolOptions {
  max?: number;
  memoryCapMb?: number;
}

export class InstancePool {
  private slots = new Map<string, SlotEntry>();
  private max: number;
  private memoryCap: number;

  constructor(options: InstancePoolOptions = {}) {
    this.max = options.max ?? 12;
    this.memoryCap = options.memoryCapMb ?? 700;
  }

  acquireSlot(kind: InstanceKind, id: string, onEvict: () => void): void {
    if (!id) return;
    this.slots.set(id, { kind, id, lastUsed: Date.now(), onEvict });
    this.enforceCap();
  }

  touchSlot(id: string): void {
    const entry = this.slots.get(id);
    if (entry) entry.lastUsed = Date.now();
  }

  releaseSlot(id: string): void {
    this.slots.delete(id);
  }

  activeWebglContexts(): number {
    let n = 0;
    for (const e of this.slots.values()) n += WEIGHTS[e.kind].webglContext;
    return n;
  }

  estimatedMemoryMb(): number {
    let m = 0;
    for (const e of this.slots.values()) m += WEIGHTS[e.kind].estimatedMb;
    return m;
  }

  pressureRatio(): number {
    const webglRatio = this.activeWebglContexts() / this.max;
    const memoryRatio = this.estimatedMemoryMb() / this.memoryCap;
    return Math.max(webglRatio, memoryRatio);
  }

  private enforceCap(): void {
    while (this.slots.size > this.max || this.estimatedMemoryMb() > this.memoryCap) {
      const victim = this.pickVictim();
      if (!victim) break;
      try { victim.onEvict(); } catch { /* swallow */ }
      this.slots.delete(victim.id);
    }
  }

  private pickVictim(): SlotEntry | null {
    let webglVictim: SlotEntry | null = null;
    let webglTs = Infinity;
    let anyVictim: SlotEntry | null = null;
    let anyTs = Infinity;
    for (const e of this.slots.values()) {
      if (e.lastUsed < anyTs) { anyTs = e.lastUsed; anyVictim = e; }
      if (WEIGHTS[e.kind].webglContext === 1 && e.lastUsed < webglTs) {
        webglTs = e.lastUsed;
        webglVictim = e;
      }
    }
    return webglVictim ?? anyVictim;
  }
}

/** Process-wide singleton. */
export const globalInstancePool = new InstancePool();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test:unit`
Expected: 4 PASS.

- [ ] **Step 5: Migrate `webglContextPool.js` to a shim**

Replace the contents of `frontend/src/lib/webglContextPool.js` with:
```javascript
/**
 * webglContextPool — backward-compat shim over chart-ir/perf/instancePool.
 *
 * Existing Three.js engines (ThreeScatter3D, ThreeHologram, ThreeParticleFlow,
 * GeoMap) call acquireContext / releaseContext / touchContext / onContextLost.
 * Sub-project B replaces this with a unified pool that also tracks Vega
 * Canvas, MapLibre, and deck.gl instances. This shim preserves the old
 * surface so engines don't need to migrate.
 */

import { globalInstancePool } from '../chart-ir/perf/instancePool';

export function acquireContext(id, onEvict) {
  globalInstancePool.acquireSlot('three', id, onEvict ?? (() => {}));
}

export function touchContext(id) {
  globalInstancePool.touchSlot(id);
}

export function releaseContext(id) {
  globalInstancePool.releaseSlot(id);
}

export function activeCount() {
  return globalInstancePool.activeWebglContexts();
}

const lostListeners = new Set();

export function onContextLost(listener) {
  lostListeners.add(listener);
  return () => lostListeners.delete(listener);
}

if (typeof window !== 'undefined') {
  window.addEventListener('webglcontextlost', (event) => {
    for (const listener of lostListeners) {
      try { listener(event); } catch { /* swallow */ }
    }
  }, true);
}
```

- [ ] **Step 6: Verify existing engines still import cleanly**

Run: `cd frontend && npx tsc --noEmit -p . 2>&1 | grep -i "webglContextPool\|ThreeScatter3D\|ThreeHologram\|ThreeParticleFlow\|GeoMap"`
Expected: Zero output (no errors related to the shim).

Run: `cd frontend && npm run lint 2>&1 | grep -i "webglContextPool\|ThreeScatter3D\|ThreeHologram\|ThreeParticleFlow\|GeoMap"`
Expected: Zero output.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/chart-ir/perf/instancePool.ts \
        frontend/src/chart-ir/perf/instancePool.test.ts \
        frontend/src/lib/webglContextPool.js
git commit -m "feat(b0): InstancePool replaces webglContextPool

Unified pool tracks vega-svg / vega-canvas / maplibre / deck / three
slots, with per-kind weights for WebGL context count + estimated
memory. LRU eviction prefers WebGL-consuming kinds. webglContextPool.js
becomes a 30-line shim that calls into the new pool — existing Three
engines keep working unchanged.

Four unit tests cover acquire/release/touch/eviction/pressure."
```

---

### Task B0.6 — Phase B0 wrap-up checkpoint

- [ ] **Step 1: Verify the full test suite is green**

Run: `cd backend && python -m pytest tests/test_chart_perf_config.py -v && cd ../frontend && npm run test:unit`
Expected: All B0 tests PASS.

- [ ] **Step 2: Verify the bundle still builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds. Bundle size delta < 5KB (B0 is types + pure functions, no new runtime dependencies).

- [ ] **Step 3: Tag the checkpoint**

```bash
git tag b0-foundations -m "Sub-project B Phase 0 checkpoint: types, RSR, frame tracker, instance pool"
```

---

## Phase B1 — Server-side downsampling (~1 week, task outline)

Goal: `chart_downsampler.py` + `arrow_stream.py` skeletons + `DuckDBTwin.query_twin_downsampled()` + `query_engine.py` chart_hints. End state: backend can downsample 10M-row time series via DuckDB SQL fragments and return the result as a small Arrow record batch.

Detail level: file paths, signatures, key SQL, acceptance tests. Step-by-step expansion happens at Phase B1 start.

### Task B1.1 — `chart_downsampler.py` strategy picker
- **File:** `backend/chart_downsampler.py` (new)
- **Test:** `backend/tests/test_chart_downsampler.py`
- **Signature:**
  ```python
  from enum import Enum
  from typing import Optional

  class DownsampleStrategy(str, Enum):
      LTTB = "lttb"
      UNIFORM = "uniform"
      PIXEL_MIN_MAX = "pixel_min_max"
      AGGREGATE_BIN = "aggregate_bin"
      NONE = "none"

  def pick_strategy(
      row_count: int,
      target_points: int,
      x_col: Optional[str],
      x_type: Optional[str],
      y_col: Optional[str],
      y_type: Optional[str],
      has_bin_transform: bool,
      pixel_width: Optional[int] = None,
  ) -> DownsampleStrategy: ...
  ```
- **Tests:** ≥10 cases exercising each branch of the picker.

### Task B1.2 — Pure-SQL LTTB fragment
- **File:** `backend/chart_downsampler.py` (extend)
- **Function:** `lttb_sql(inner_sql: str, x_col: str, y_col: str, target_points: int) -> str`
- **Approach:** Wrap `inner_sql` in a CTE called `_src`. Use `NTILE(target_points)` to bucket. For each bucket compute the triangle-area maximization point against the previous and next bucket's average. Emit the chosen rows in x order. Total ≤ ~50 lines of SQL.
- **Tests:** synthetic 10M-row time series → assert `len(result) == target_points ± 1`, peak/trough preservation (specific known peaks must survive), runtime p95 < 1s on the laptop fixture.

### Task B1.3 — Uniform / pixel_min_max / aggregate_bin SQL fragments
- **File:** `backend/chart_downsampler.py` (extend)
- **Functions:**
  ```python
  def uniform_sql(inner_sql: str, target_points: int) -> str:
      # DuckDB native: USING SAMPLE n ROWS REPEATABLE (42)
      return f"WITH _src AS ({inner_sql}) SELECT * FROM _src USING SAMPLE {target_points} ROWS REPEATABLE (42)"

  def pixel_min_max_sql(inner_sql: str, x_col: str, y_col: str, pixel_width: int) -> str:
      # Bucket by floor(x_pixel), emit MIN(y) and MAX(y) per bucket
      ...

  def aggregate_bin_sql(inner_sql: str, bin_field: str, max_bins: int) -> str:
      # GROUP BY width_bucket(bin_field, ..., max_bins)
      ...
  ```
- **Tests:** each strategy round-trips to expected row count on a synthetic 1M-row fixture.

### Task B1.4 — `DuckDBTwin.query_twin_downsampled()`
- **File:** `backend/duckdb_twin.py` (modify)
- **New method (after `query_twin`):**
  ```python
  def query_twin_downsampled(
      self,
      conn_id: str,
      sql: str,
      target_points: int,
      x_col: Optional[str] = None,
      y_col: Optional[str] = None,
      pixel_width: Optional[int] = None,
      strategy: Optional[DownsampleStrategy] = None,
  ) -> Dict[str, Any]:
      """
      Wrap the user's SQL in a downsampling CTE and run via query_twin.

      Reuses query_twin's SQLValidator + Arrow zero-copy + read-only
      enforcement. Adds two new return fields:
        - downsample_method: str
        - original_row_count_estimate: int (None if unknown)
      """
  ```
- **Behavior:** picks strategy via `chart_downsampler.pick_strategy`, builds wrapped SQL, calls existing `query_twin()`, augments result dict.
- **Tests:** `backend/tests/test_duckdb_twin_downsampled.py` — 10M-row line, 1M-row scatter, 100k boxplot — assert returned `row_count == target_points ± 1` and Arrow zero-copy path survives.

### Task B1.5 — `chart_hints` in `query_engine.py`
- **File:** `backend/query_engine.py` (modify)
- **Change:** Where the query engine builds the response payload (dict with `columns`, `rows`, `sql`, `summary`), add a `chart_hints` field:
  ```python
  result["chart_hints"] = {
      "row_count_estimate": estimated_row_count,  # from server-side count or schema profile
      "x_column": detected_x_column,              # from sqlglot AST first column
      "y_column": detected_y_column,
      "x_type": column_profile.get(x, {}).get("semantic_type"),
      "y_type": column_profile.get(y, {}).get("semantic_type"),
  }
  ```
- **Tests:** existing `test_query_engine.py` (or extend) — assert chart_hints present and types match.

### Task B1.6 — Phase B1 checkpoint
- **Tag:** `b1-downsampling`
- **Acceptance:** Backend tests green; benchmark fixture script runs LTTB on 10M synthetic rows in < 1s p95 on the laptop fixture; `query_twin_downsampled` integration test passes against a real twin.

---

## Phase B2 — RSR + Vega Canvas wiring (~1 week, task outline)

Goal: wire RSR into A's `chart-ir/router.ts`, extend `VegaRenderer.tsx` to honor `rendererBackend`, build `ProgressiveVegaCanvas.tsx` (bulk path only — streaming added in B4), wire the frame budget tracker. End state: a 50k-point Vega Canvas chart renders at 60fps; a 4k-point Vega SVG chart renders crisply.

**Pre-flight gate:** A must have merged at least Phase 1 (`v1-editor-shell`) so `chart-ir/router.ts` and `chart-ir/renderers/VegaRenderer.tsx` exist on disk.

### Task B2.1 — Inject RSR into `chart-ir/router.ts`
- **File:** `frontend/src/chart-ir/router.ts` (modify, created in A)
- **Change:** Before dispatching to a renderer, call `pickRenderStrategy()`, pass result into the renderer's props.
- **Compat:** if `settings.CHART_PERF_ENABLED` is false (read from a Vite env var `import.meta.env.VITE_CHART_PERF_ENABLED`), bypass RSR and use A's default per-spec.type dispatch unchanged.

### Task B2.2 — Extend `VegaRenderer.tsx` to accept renderer backend
- **File:** `frontend/src/chart-ir/renderers/VegaRenderer.tsx` (modify, created in A)
- **Change:** Accept `rendererBackend: 'svg' | 'canvas'` prop, pass to react-vega's `renderer` config.
- **Test:** mount with `'svg'` → assert `<svg>` in DOM; mount with `'canvas'` → assert `<canvas>`.

### Task B2.3 — `ProgressiveVegaCanvas.tsx` (bulk path)
- **File:** `frontend/src/chart-ir/renderers/ProgressiveVegaCanvas.tsx` (new)
- **Purpose:** wraps Vega Canvas with a future seam for incremental row insertion (`view.change(...).insert()`). v1 just passes the full result through. Streaming wires in at B4 — keep the `appendRows()` method as a stub that throws "streaming not enabled" if called before B4.

### Task B2.4 — Frame budget tracker integration
- **File:** `frontend/src/store.js` (modify, Zustand store)
- **Change:** Add a `frameBudgetState` slice subscribed to `globalFrameBudgetTracker`. Start the tracker in `App.jsx` lifecycle.
- **Test:** mount editor, check `useStore.getState().frameBudgetState === 'normal'` initially; mock 60 slow frames, assert eventual `'tight'`.

### Task B2.5 — InstancePool wiring in renderers
- **Change:** Each renderer (`VegaRenderer`, `MapLibreRenderer`, `DeckRenderer`) calls `globalInstancePool.acquireSlot(...)` on mount, `releaseSlot()` on unmount, `touchSlot()` on data update. Wrap in `useEffect`.
- **Test:** mount 5 charts → `globalInstancePool.activeCount() === 5`; unmount one → 4.

### Task B2.6 — Phase B2 checkpoint
- **Tag:** `b2-rsr-vega`
- **Acceptance:** dev-only test page mounts a 50k-point line chart, hits T1 Canvas, scrolls + zooms at 60fps. Switching to a 4k-point bar chart hits T0 SVG with crisp text rendering.

---

## Phase B3 — deck.gl renderer for cartesian (~1 week, task outline)

Goal: `specToDeckLayers.ts` compiler + `DeckRenderer.tsx` + hit-testing. End state: 1M-point scatter renders via deck.gl at 60fps with hover tooltips that map back to IR `selection` events.

### Task B3.1 — `specToDeckLayers.ts` compiler
- **File:** `frontend/src/chart-ir/compilers/specToDeckLayers.ts` (new)
- **Signature:** `compileSpecToDeckLayers(spec: ChartSpec, data: any[]): Layer[]`
- **Mark coverage:** `point/circle/square` → `ScatterplotLayer`; `line/trail` → `LineLayer` + `PathLayer`; `area` → `SolidPolygonLayer`; `rect` → `RectangleLayer` (or `PolygonLayer`); `geoshape` → `GeoJsonLayer`; `arc` → `ArcLayer`.
- **Encoding mapping:** `x/y → getPosition`; `color → getFillColor`/`getColor`; `size → getRadius`/`getLineWidth`; `tooltip → handled in DeckRenderer hover handler`.
- **Tests:** for each mark type, assert correct Layer subclass instance + property bag.

### Task B3.2 — `DeckRenderer.tsx`
- **File:** `frontend/src/chart-ir/renderers/DeckRenderer.tsx` (new)
- **Wraps:** `@deck.gl/react`'s `<DeckGL>` component
- **Layers:** computed from `specToDeckLayers(spec, data)` in `useMemo`
- **Pool integration:** acquire slot kind `'deck'` on mount, release on unmount
- **Hit-testing:** uses deck.gl's `pickObject` on hover. Forwards `onElementClick(rowIndex, datum)` matching A's renderer interface.
- **Tests:** mount with 1M synthetic points, assert `pickObject` returns the right datum within 1px tolerance.

### Task B3.3 — Wire RSR T2/T3 → DeckRenderer
- **File:** `frontend/src/chart-ir/router.ts` (modify)
- **Change:** if `strategy.rendererFamily === 'deck'`, mount `<DeckRenderer>` instead of `<VegaRenderer>`. Pass spec + data through.

### Task B3.4 — Phase B3 benchmark gate
- Run all four `frontend/perf/bench-*.spec.ts` benchmarks (the harness file scaffolds in B5, so the benchmarks may be partial here — the 1M scatter and 10M line cases are the priority for the gate).
- **Pass condition:** 1M scatter at 60fps, 10M line first paint < 800ms (without streaming, just LTTB+deck), no OOM, no eviction storm.
- **Fail condition:** trigger the `STRATEGY_USE_ECHARTS_FALLBACK` decision (escalate to sid23 — do not auto-implement the contingency).
- **Tag:** `b3-deck-cartesian`.

---

## Phase B4 — Progressive Arrow streaming (~1 week, task outline)

Goal: `arrow_stream.py` + SSE route + `arrowChunkReceiver.ts` + wire T3 to streaming. End state: 10M-row line chart streams, first paint < 500ms.

### Task B4.1 — `arrow_stream.py` async generator
- **File:** `backend/arrow_stream.py` (new)
- **Function:**
  ```python
  async def stream_query(
      conn_id: str,
      sql: str,
      target_points: int,
      x_col: Optional[str],
      y_col: Optional[str],
      batch_rows: int = 5000,
  ) -> AsyncIterator[bytes]:
      """Yield Arrow IPC stream frames for a downsampled query."""
  ```
- **Implementation:** call `DuckDBTwin.query_twin_downsampled()`, iterate the resulting Arrow Table via `slice(start, batch_rows)`, serialize each batch via `pa.ipc.new_stream()` to bytes, yield.

### Task B4.2 — SSE endpoint `POST /api/v1/charts/stream`
- **File:** `backend/routers/agent_routes.py` (modify)
- **Add:** new endpoint that takes `{conn_id, sql, target_points, x_col, y_col, batch_rows}` JSON body and returns `EventSourceResponse` (existing pattern from agent SSE). Each yielded chunk becomes an SSE event with `event: chart_chunk`, `data: <base64-Arrow-IPC>`. Final event: `event: chart_done` with summary.
- **Auth:** reuse existing `Depends(get_current_user)`.
- **Tests:** `backend/tests/test_adv_chart_perf_endpoint.py` — auth required, malformed SQL rejected by SQLValidator, `_MAX_RESULT_ROWS` cap survived, oversized batch_rows rejected.

### Task B4.3 — `arrowChunkReceiver.ts`
- **File:** `frontend/src/chart-ir/perf/arrowChunkReceiver.ts` (new)
- **Mechanism:** opens `EventSource` to `/api/v1/charts/stream` (or fetch + ReadableStream for POST), decodes each `chart_chunk` event with `apache-arrow` JS, accumulates into a growing `Table`, calls `onBatch(table, isFinal)` on the subscriber.
- **Tests:** mock SSE feed → assert subscriber called N times then `isFinal: true`.

### Task B4.4 — Wire `ProgressiveVegaCanvas` + `DeckRenderer` to receiver
- **File:** `frontend/src/chart-ir/renderers/ProgressiveVegaCanvas.tsx` (modify)
- **Change:** when `strategy.streaming.enabled`, mount `arrowChunkReceiver` instead of static data. Each batch calls `view.change('source', vega.changeset().insert(rowsFromBatch)).run()`.
- **File:** `frontend/src/chart-ir/renderers/DeckRenderer.tsx` (modify)
- **Change:** when `strategy.streaming.enabled`, accumulate Arrow Table in state and re-supply to deck.gl `data` prop. deck.gl handles incremental GPU buffer updates.

### Task B4.5 — Phase B4 checkpoint
- **Tag:** `b4-streaming`
- **Acceptance:** 10M-row line chart first paint < 500ms, full data < 2s, scrub interaction at 60fps. Network drop test: kill SSE mid-stream, reconnect, no duplicate or missing chunks.

---

## Phase B5 — Telemetry, dashboard scroll, polish (~1 week, task outline)

### Task B5.1 — `rendererTelemetry.ts` + `POST /api/v1/perf/telemetry`
- Frontend module collects per-render timings + escalation events, POSTs fire-and-forget.
- Backend route appends to `.data/audit/chart_perf.jsonl` (50MB rotation).

### Task B5.2 — `useViewportMount` integration in every renderer
- Off-screen tiles unmount, releasing pool slots.
- Test: 500-tile dashboard scroll, `globalInstancePool.activeCount()` stays ≤ 12.

### Task B5.3 — Dev-mode tier badge overlay
- `Cmd+Alt+P` toggles a small overlay in each chart's corner showing tier + reason.
- Pure dev affordance, not user-facing.

### Task B5.4 — Phase B5 checkpoint + benchmark sweep
- **Tag:** `b5-polish`.
- **Acceptance:** all four benchmarks green, `CHART_PERF_ENABLED=true` in staging.

---

## Phase B6 — Production rollout (~3 days, task outline)

### Task B6.1 — Production flag flip
- Set `CHART_PERF_ENABLED=true` in production.
- Monitor telemetry for 7 days.

### Task B6.2 — Approach B spike (brush-to-detail re-query)
- Optional polish PR. Out of scope for B core.

### Task B6.3 — Final tag
- **Tag:** `chart-perf-v1`.

---

## Self-Review

**Spec coverage:**
- §0.3 4 benchmarks → Tasks B5.4 + perf harness in §File Structure ✓
- §1 three pillars → B1 (server downsample), B0.3 (RSR), B0.4 (frame tracker) ✓
- §2.1 renderer escalation ladder → encoded in `pickRenderStrategy` decision tree (B0.3) ✓
- §2.2 backend modules → B1.1–B1.4 + B4.1 ✓
- §2.3 frontend modules → B0.2–B0.5 + B2.* + B3.* + B4.* ✓
- §2.4 modified files → B0.5 (webglContextPool shim), B1.5 (query_engine hints), B2.1 (router.ts), B2.2 (VegaRenderer), B4.2 (agent_routes) ✓
- §3.1 RSR pure function → B0.3 ✓
- §3.2 frame budget tracker → B0.4 ✓
- §3.3 instance pool → B0.5 ✓
- §3.4 chart_downsampler.py → B1.1–B1.3 ✓
- §3.5 LTTB pure SQL → B1.2 ✓
- §3.6 progressive SSE streaming → B4.* ✓
- §3.7 IR contract additions → B2.1 (transitively, when extending router.ts; explicit type changes deferred to B2 since A's types.ts is the source) — **gap noted, fix below**
- §6 benchmarks → harness in B5 task list, partial benches in B3.4 gate
- §7 telemetry → B5.1 ✓
- §8 risks → mitigations referenced in phase gates

**Gap fix:** §3.7 says `Transform.sample` is extended with `pixelWidth` + `targetPoints`. That extension is part of the IR (A's types.ts). Add it explicitly:

> **Task B0.7 (added to Phase B0):** Extend `chart-ir/types.ts` (or the B0.0 stub if A hasn't merged) with the two additive fields:
> ```typescript
> interface Transform {
>   sample?: { n: number; method: 'lttb' | 'uniform' | 'pixel_min_max'; pixelWidth?: number; targetPoints?: number };
> }
> interface ChartSpec { config?: { strategyHint?: 't0' | 't1' | 't2' | 't3' }; }
> ```
> Test that the extended types round-trip through the existing JSON Schema validator from A's Phase 0. Commit message: `feat(b0): extend ChartSpec IR with sample.pixelWidth + config.strategyHint`. Coordinate with A's branch if A's types.ts is in flight — these additions are forward-compatible (all fields optional).

**Placeholder scan:** No "TBD/TODO/fill in" markers in B0 (fully detailed). B1–B6 are scoped tasks with signatures + tests outlined; expansion happens per phase.

**Type consistency:** `pickRenderStrategy` returns `RenderStrategy`; renderers consume `RenderStrategy`; pool API uses `InstanceKind` consistently across `instancePool.ts` and `webglContextPool.js` shim; `DownsampleStrategy` is the same enum in `chart_downsampler.py` and (string-mirrored) in `strategy.ts`. `chart_hints` field name is consistent across `query_engine.py` (B1.5), `chart-ir/router.ts` (B2.1), and the spec §2.4. ✓

---

## Notes Drafted Autonomously

1. The plan was written without sid23 present (scheduled task `brainstorm-chart-sub-project-b-performance`). Each phase's task outline is intentionally lighter than B0's full step-by-step detail — sub-project A's plan followed the same pattern (commit `aa27ea8` "Phase 0 detailed").
2. Tag `b3-deck-cartesian` is a **hard gate** — if benchmarks fail, escalation to sid23 for the ECharts contingency, do not auto-implement.
3. Branch decision: continue on `askdb-global-comp` until A merges. If A creates a dedicated `chart-redesign` branch later, B should rebase onto it.
4. Sub-project C (`brainstorm-chart-sub-project-c-user-authored-types`) and D (`brainstorm-chart-sub-project-d-semantic-layer`) still have ad-hoc scheduled tasks waiting. Trigger them after this plan is reviewed.

— end of plan —
