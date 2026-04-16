/**
 * Render Strategy Router (RSR) — pure function picking a rendering strategy
 * from (spec, data shape, GPU tier, frame budget, pool pressure).
 *
 * See strategy.ts for input/output types, thresholds.ts for cutoffs.
 * Pure — no DOM, no globals, no I/O. Unit-testable and telemetry-friendly.
 */

import type { ChartSpec, Mark } from '../types';
import type {
  DownsampleDecision,
  RenderStrategy,
  RenderStrategyInput,
  RendererBackend,
  RendererFamily,
  StrategyTier,
} from './strategy';
import { DECK_ELIGIBLE_MARKS, THRESHOLDS } from './thresholds';

function getMarkType(spec: ChartSpec): Mark | 'unknown' {
  const { mark } = spec;
  if (typeof mark === 'string') return mark;
  if (mark && typeof mark === 'object' && typeof mark.type === 'string') {
    return mark.type;
  }
  return 'unknown';
}

function fixedFamily(specType: string): RendererFamily | null {
  if (specType === 'map') return 'maplibre';
  if (specType === 'creative') return 'creative';
  if (specType === 'geo-overlay') return 'deck';
  return null;
}

function pickDownsample(
  rowCount: number,
  targetPoints: number,
  xType: string | undefined,
  yType: string | undefined,
  pixelWidth: number | undefined,
): DownsampleDecision {
  if (rowCount <= targetPoints) {
    return { enabled: false, method: 'none', targetPoints };
  }
  if (
    pixelWidth &&
    (xType === 'temporal' || xType === 'quantitative') &&
    yType === 'quantitative'
  ) {
    return { enabled: true, method: 'pixel_min_max', targetPoints };
  }
  if ((xType === 'temporal' || xType === 'quantitative') && yType === 'quantitative') {
    // Future: if network latency > 500ms and isDuckDBWasmAvailable(),
    // route through localLttbDownsample() instead of server-side LTTB.
    // See chart-ir/perf/duckdbWasm.ts
    return { enabled: true, method: 'lttb', targetPoints };
  }
  return { enabled: true, method: 'uniform', targetPoints };
}

function downshift(tier: StrategyTier): StrategyTier {
  if (tier === 't3') return 't2';
  if (tier === 't2') return 't1';
  if (tier === 't1') return 't0';
  return 't0';
}

function escalate(tier: StrategyTier): StrategyTier {
  if (tier === 't0') return 't1';
  if (tier === 't1') return 't2';
  if (tier === 't2') return 't3';
  return 't3';
}

export function pickRenderStrategy(input: RenderStrategyInput): RenderStrategy {
  const {
    spec,
    resultProfile,
    gpuTier,
    frameBudgetState,
    instancePressure,
    hint,
    pixelWidth,
  } = input;
  const reasons: string[] = [];

  // 1. Fixed families for non-cartesian spec types
  const fixed = fixedFamily(spec.type);
  if (fixed === 'maplibre') {
    return {
      tier: 't2',
      rendererFamily: 'maplibre',
      rendererBackend: 'webgl',
      downsample: pickDownsample(
        resultProfile.rowCount,
        THRESHOLDS.DEFAULT_TARGET_POINTS,
        resultProfile.xType,
        resultProfile.yType,
        pixelWidth,
      ),
      streaming: { enabled: false, batchRows: THRESHOLDS.STREAM_BATCH_ROWS },
      reason: 'spec.type=map -> maplibre fixed family',
    };
  }
  if (fixed === 'creative') {
    return {
      tier: 't2',
      rendererFamily: 'creative',
      rendererBackend: 'webgl',
      downsample: { enabled: false, method: 'none', targetPoints: 0 },
      streaming: { enabled: false, batchRows: THRESHOLDS.STREAM_BATCH_ROWS },
      reason: 'spec.type=creative -> creative fixed family',
    };
  }
  if (fixed === 'deck') {
    return {
      tier: 't2',
      rendererFamily: 'deck',
      rendererBackend: 'webgl',
      downsample: pickDownsample(
        resultProfile.rowCount,
        THRESHOLDS.DEFAULT_TARGET_POINTS,
        resultProfile.xType,
        resultProfile.yType,
        pixelWidth,
      ),
      streaming: {
        enabled: resultProfile.rowCount > THRESHOLDS.STREAMING_THRESHOLD_ROWS,
        batchRows: THRESHOLDS.STREAM_BATCH_ROWS,
      },
      reason: 'spec.type=geo-overlay -> deck fixed family',
    };
  }

  // 2. Cartesian — RSR decides
  const markName = getMarkType(spec);
  const markEligible =
    Boolean(resultProfile.markEligibleForDeck) &&
    markName !== 'unknown' &&
    DECK_ELIGIBLE_MARKS.has(markName as Mark);
  const targetPoints = THRESHOLDS.DEFAULT_TARGET_POINTS;

  // 2a. Hint override (sanity-checked).
  //
  // Precedence note: an accepted hint early-returns here, BEFORE the GPU tier
  // clamp (2c), pressure downshift (2d), or frame-budget escalation (2e). This
  // is intentional — hints exist for power users and tests, and should bypass
  // the automatic guards. The only sanity check is deck-eligibility for t2/t3.
  // Covered by the `Hint t3 bypasses gpuTier=low clamp` test.
  if (hint) {
    if ((hint === 't2' || hint === 't3') && !markEligible) {
      reasons.push(`hint=${hint} refused: mark not deck-eligible`);
      // fall through to normal decision tree
    } else {
      const family: RendererFamily = hint === 't2' || hint === 't3' ? 'deck' : 'vega';
      const backend: RendererBackend = hint === 't0' ? 'svg' : hint === 't1' ? 'canvas' : 'webgl';
      return {
        tier: hint,
        rendererFamily: family,
        rendererBackend: backend,
        downsample: pickDownsample(
          resultProfile.rowCount,
          targetPoints,
          resultProfile.xType,
          resultProfile.yType,
          pixelWidth,
        ),
        streaming: {
          enabled:
            hint === 't3' ||
            (hint === 't2' && resultProfile.rowCount > THRESHOLDS.STREAMING_THRESHOLD_ROWS),
          batchRows: THRESHOLDS.STREAM_BATCH_ROWS,
        },
        reason: `hint override: ${hint}`,
      };
    }
  }

  // 2b. Initial tier from row count
  let tier: StrategyTier;
  if (resultProfile.rowCount <= THRESHOLDS.T0_MAX_MARKS) {
    tier = 't0';
    reasons.push(`rowCount ${resultProfile.rowCount} <= T0 cap`);
  } else if (resultProfile.rowCount <= THRESHOLDS.T1_MAX_MARKS) {
    tier = 't1';
    reasons.push(`rowCount ${resultProfile.rowCount} <= T1 cap`);
  } else if (resultProfile.rowCount <= THRESHOLDS.T2_MAX_MARKS && markEligible) {
    tier = 't2';
    reasons.push(`rowCount ${resultProfile.rowCount} <= T2 cap + deck-eligible`);
  } else if (markEligible) {
    tier = 't3';
    reasons.push(`rowCount ${resultProfile.rowCount} > T2 cap + deck-eligible -> streaming`);
  } else {
    tier = 't1';
    reasons.push(
      `rowCount ${resultProfile.rowCount} > T1 cap but not deck-eligible -> server LTTB to T1`,
    );
  }

  // 2c. GPU tier clamp
  if (gpuTier === 'low' && (tier === 't2' || tier === 't3')) {
    tier = 't1';
    reasons.push('gpuTier=low clamps to T1');
  }

  // 2d. Instance pressure downshift
  if (
    instancePressure.pressureRatio > THRESHOLDS.INSTANCE_PRESSURE_DOWNSHIFT &&
    (tier === 't2' || tier === 't3')
  ) {
    const before = tier;
    tier = downshift(tier);
    reasons.push(
      `pressureRatio ${instancePressure.pressureRatio.toFixed(2)} > ${THRESHOLDS.INSTANCE_PRESSURE_DOWNSHIFT} -> downshift ${before} to ${tier}`,
    );
  }

  // 2e. Frame budget escalation (only if mark is deck-eligible)
  if (frameBudgetState === 'tight' && markEligible && tier !== 't3') {
    const before = tier;
    tier = escalate(tier);
    reasons.push(`frame budget tight -> escalate ${before} to ${tier}`);
  }

  const family: RendererFamily = tier === 't2' || tier === 't3' ? 'deck' : 'vega';
  const backend: RendererBackend = tier === 't0' ? 'svg' : tier === 't1' ? 'canvas' : 'webgl';

  return {
    tier,
    rendererFamily: family,
    rendererBackend: backend,
    downsample: pickDownsample(
      resultProfile.rowCount,
      targetPoints,
      resultProfile.xType,
      resultProfile.yType,
      pixelWidth,
    ),
    streaming: {
      enabled:
        tier === 't3' ||
        (tier === 't2' && resultProfile.rowCount > THRESHOLDS.STREAMING_THRESHOLD_ROWS),
      batchRows: THRESHOLDS.STREAM_BATCH_ROWS,
    },
    reason: reasons.join(' · '),
  };
}
