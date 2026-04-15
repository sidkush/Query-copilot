/**
 * Render Strategy Router — pure function that picks the rendering strategy
 * for a chart based on data shape, GPU tier, frame budget, and pool pressure.
 *
 * See strategy.js for the input/output types and thresholds.js for the
 * decision cutoffs. This file is pure — no DOM access, no globals, no I/O.
 * Easy to unit test; easy for telemetry to log.
 */

import { THRESHOLDS, DECK_ELIGIBLE_MARKS } from './thresholds.js';

/**
 * @param {any} spec
 * @returns {string}
 */
function getMarkType(spec) {
  if (!spec) return 'unknown';
  if (typeof spec.mark === 'string') return spec.mark;
  if (spec.mark && typeof spec.mark === 'object' && typeof spec.mark.type === 'string') {
    return spec.mark.type;
  }
  return 'unknown';
}

/**
 * @param {string} specType
 * @returns {import('./strategy.js').RendererFamily | null}
 */
function fixedFamily(specType) {
  if (specType === 'map') return 'maplibre';
  if (specType === 'creative') return 'creative';
  if (specType === 'geo-overlay') return 'deck';
  return null;
}

/**
 * @param {number} rowCount
 * @param {number} targetPoints
 * @param {string | undefined} xType
 * @param {string | undefined} yType
 * @param {number | undefined} pixelWidth
 * @returns {import('./strategy.js').DownsampleDecision}
 */
function pickDownsample(rowCount, targetPoints, xType, yType, pixelWidth) {
  if (rowCount <= targetPoints) {
    return { enabled: false, method: 'none', targetPoints };
  }
  if (pixelWidth && (xType === 'temporal' || xType === 'quantitative') && yType === 'quantitative') {
    return { enabled: true, method: 'pixel_min_max', targetPoints };
  }
  if ((xType === 'temporal' || xType === 'quantitative') && yType === 'quantitative') {
    return { enabled: true, method: 'lttb', targetPoints };
  }
  return { enabled: true, method: 'uniform', targetPoints };
}

/**
 * @param {import('./strategy.js').StrategyTier} tier
 * @returns {import('./strategy.js').StrategyTier}
 */
function downshift(tier) {
  if (tier === 't3') return 't2';
  if (tier === 't2') return 't1';
  if (tier === 't1') return 't0';
  return 't0';
}

/**
 * @param {import('./strategy.js').StrategyTier} tier
 * @returns {import('./strategy.js').StrategyTier}
 */
function escalate(tier) {
  if (tier === 't0') return 't1';
  if (tier === 't1') return 't2';
  if (tier === 't2') return 't3';
  return 't3';
}

/**
 * Pick the render strategy for a chart. Pure function — no side effects.
 *
 * @param {import('./strategy.js').RenderStrategyInput} input
 * @returns {import('./strategy.js').RenderStrategy}
 */
export function pickRenderStrategy(input) {
  const { spec, resultProfile, gpuTier, frameBudgetState, instancePressure, hint, pixelWidth } = input;
  const reasons = [];

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
  const markEligible = Boolean(resultProfile.markEligibleForDeck) && DECK_ELIGIBLE_MARKS.has(markName);
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
      /** @type {import('./strategy.js').RendererFamily} */
      const family = (hint === 't2' || hint === 't3') ? 'deck' : 'vega';
      /** @type {import('./strategy.js').RendererBackend} */
      const backend = hint === 't0' ? 'svg' : (hint === 't1' ? 'canvas' : 'webgl');
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
  /** @type {import('./strategy.js').StrategyTier} */
  let tier;
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
    reasons.push(`rowCount ${resultProfile.rowCount} > T1 cap but not deck-eligible -> server LTTB to T1`);
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
    reasons.push(`pressureRatio ${instancePressure.pressureRatio.toFixed(2)} > ${THRESHOLDS.INSTANCE_PRESSURE_DOWNSHIFT} -> downshift ${before} to ${tier}`);
  }

  // 2e. Frame budget escalation (only if mark is deck-eligible)
  if (frameBudgetState === 'tight' && markEligible && tier !== 't3') {
    const before = tier;
    tier = escalate(tier);
    reasons.push(`frame budget tight -> escalate ${before} to ${tier}`);
  }

  /** @type {import('./strategy.js').RendererFamily} */
  const family = (tier === 't2' || tier === 't3') ? 'deck' : 'vega';
  /** @type {import('./strategy.js').RendererBackend} */
  const backend = tier === 't0' ? 'svg' : (tier === 't1' ? 'canvas' : 'webgl');

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
