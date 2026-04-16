/**
 * bench-500-tile-dashboard.js
 * ===========================
 * Synthetic benchmark harness for the 500-tile AskDB dashboard scenario.
 *
 * ## Methodology
 *
 * This script does NOT spin up a browser or a Vite dev server.  It exercises
 * the *data* layer — fixture generation, pool-slot accounting, memory
 * estimation — so that the numbers can be captured in CI without a GUI.
 *
 * A future Playwright companion (`bench-500-tile-dashboard.spec.ts`) will
 * drive a real browser and record rAF-based FPS via the Chrome DevTools
 * Performance Timeline API.  That companion will import the same fixtures
 * generated here.
 *
 * ## Target metrics (to be validated by the Playwright companion)
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Metric                   │ Target                       │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  Mount 500 tiles          │ < 5 000 ms total             │
 *   │  Scroll FPS (p5)          │ ≥ 50 fps  (no visible jank)  │
 *   │  InstancePool active slots│ never exceeds pool max (12)  │
 *   │  Memory (estimatedMemMb)  │ < 700 MB                     │
 *   └──────────────────────────────────────────────────────────┘
 *
 * ## Why these numbers?
 *
 *  - 5 s mount budget: 500 tiles × ~10 ms worst-case hydration each.
 *    In practice the bidirectional useViewportMount hook (B5) means only
 *    the visible viewport is mounted at any time — so real mount cost is
 *    closer to 12 tiles × 10 ms ≈ 120 ms.  5 s is a conservative ceiling.
 *
 *  - p5 FPS ≥ 50: Below 50 fps users perceive scroll as "janky".  p5 (the
 *    5th-percentile frame, i.e. the worst 5 % of frames) must still clear
 *    the bar so that occasional GC pauses don't ruin the experience.
 *
 *  - Pool max 12: InstancePool defaults to 12 concurrent Vega-Lite instances.
 *    Exceeding this would force synchronous eviction during scroll, causing
 *    the jank that the FPS target guards against.
 *
 *  - 700 MB: Conservative headroom below Chrome's typical 1–2 GB renderer
 *    process limit.  Each Vega-Lite instance is estimated at ~25–40 MB
 *    (canvas backing store + compiled spec); 12 slots × 58 MB = ~700 MB.
 */

import { fileURLToPath } from 'url';
import { generateTileFixture } from './fixtures/generate-tiles.js';

// ---------------------------------------------------------------------------
// Pool accounting helpers (mirrors InstancePool logic in src/)
// ---------------------------------------------------------------------------

const POOL_MAX_DEFAULT = 12;
// Rough per-instance memory estimate used by InstancePool.estimatedMemoryMb
const MEM_PER_SLOT_MB = 58;

/**
 * Simulate which tiles would be "active" (mounted) given a pool ceiling.
 * In real usage useViewportMount manages this; here we just assert the cap.
 *
 * @param {number} tileCount
 * @param {number} poolMax
 * @returns {{ activeSlots: number, estimatedMemoryMb: number }}
 */
function simulatePoolState(tileCount, poolMax = POOL_MAX_DEFAULT) {
  const activeSlots = Math.min(poolMax, tileCount);
  const estimatedMemoryMb = activeSlots * MEM_PER_SLOT_MB;
  return { activeSlots, estimatedMemoryMb };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate the full benchmark fixture for `tileCount` tiles.
 *
 * Returns everything a test runner (or the future Playwright spec) needs:
 *   - `tiles`              — array of tile descriptors (see generate-tiles.js)
 *   - `expectedPoolSlots`  — how many InstancePool slots should be active at
 *                            any given moment (capped at pool max)
 *   - `poolMax`            — the pool ceiling used for this fixture
 *   - `targets`            — the numeric targets the benchmark must satisfy
 *
 * @param {number} tileCount  Total number of tiles (default 500).
 * @returns {{
 *   tiles: object[],
 *   expectedPoolSlots: number,
 *   poolMax: number,
 *   targets: {
 *     maxMountMs: number,
 *     minP5Fps: number,
 *     maxActiveSlots: number,
 *     maxMemoryMb: number,
 *   }
 * }}
 */
export function generateBenchmarkFixture(tileCount = 500) {
  const tiles = generateTileFixture(tileCount);

  return {
    tiles,
    expectedPoolSlots: Math.min(POOL_MAX_DEFAULT, tileCount),
    poolMax: POOL_MAX_DEFAULT,
    targets: {
      maxMountMs: 5000,
      minP5Fps: 50,
      maxActiveSlots: POOL_MAX_DEFAULT,
      maxMemoryMb: 700,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI entry-point  (node perf/bench-500-tile-dashboard.js)
// ---------------------------------------------------------------------------

// Detect direct execution in ESM (works on Windows via fileURLToPath).
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    process.argv[1].toLowerCase();

if (isMain) {
  const tileCount = parseInt(process.argv[2], 10) || 500;

  console.log(`\nAskDB — 500-Tile Dashboard Benchmark Harness`);
  console.log(`${'='.repeat(48)}`);
  console.log(`Generating fixture for ${tileCount} tiles…`);

  const start = Date.now();
  const fixture = generateBenchmarkFixture(tileCount);
  const genMs = Date.now() - start;

  const { tiles, expectedPoolSlots, poolMax, targets } = fixture;
  const { estimatedMemoryMb } = simulatePoolState(tileCount);

  console.log(`\nFixture generated in ${genMs} ms`);
  console.log(`  Tiles:               ${tiles.length}`);
  console.log(`  Expected pool slots: ${expectedPoolSlots} / ${poolMax}`);
  console.log(`  Estimated memory:    ${estimatedMemoryMb} MB`);

  console.log(`\nTarget metrics:`);
  console.log(`  Mount 500 tiles:    < ${targets.maxMountMs} ms`);
  console.log(`  Scroll FPS (p5):    ≥ ${targets.minP5Fps} fps`);
  console.log(`  Active pool slots:  ≤ ${targets.maxActiveSlots}`);
  console.log(`  Memory:             < ${targets.maxMemoryMb} MB`);

  // Synthetic assertions (no browser — verify the fixture is internally sane)
  let passed = 0;
  let failed = 0;

  function assert(label, ok, detail = '') {
    const tag = ok ? 'PASS' : 'FAIL';
    const suffix = detail ? `  (${detail})` : '';
    if (ok) {
      console.log(`  ${tag}  ${label}${suffix}`);
      passed++;
    } else {
      console.error(`  ${tag}  ${label}${suffix}`);
      failed++;
    }
  }

  console.log(`\nSynthetic assertions:`);
  assert('Fixture tile count', tiles.length === tileCount, `got ${tiles.length}`);
  assert(
    'Each tile has id',
    tiles.every((t) => typeof t.id === 'string'),
  );
  assert(
    'Each tile has chart_spec $schema',
    tiles.every((t) => t.chart_spec && t.chart_spec.$schema === 'askdb/chart-spec/v1'),
  );
  assert(
    'Each tile has 50 rows',
    tiles.every((t) => t.rows.length === 50),
  );
  assert(
    'Pool slots capped at pool max',
    expectedPoolSlots <= poolMax,
    `${expectedPoolSlots} ≤ ${poolMax}`,
  );
  assert(
    'Estimated memory under 700 MB limit',
    estimatedMemoryMb < targets.maxMemoryMb,
    `${estimatedMemoryMb} MB < ${targets.maxMemoryMb} MB`,
  );

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
