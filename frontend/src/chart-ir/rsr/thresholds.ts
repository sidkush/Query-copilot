/**
 * Thresholds for the Render Strategy Router decision tree.
 *
 * Defaults mirror backend CHART_* settings in backend/config.py so server-side
 * downsampling stays in agreement with client-side strategy. Change here ==
 * change there.
 */

import type { Mark } from '../types';

export const THRESHOLDS = {
  // Marks budget per tier
  T0_MAX_MARKS: 4_000,
  T1_MAX_MARKS: 80_000,
  T2_MAX_MARKS: 500_000,
  // T3 has no upper bound — server LTTB caps the rendered point count

  // Default target points after downsampling
  DEFAULT_TARGET_POINTS: 4_000,

  // Streaming kicks in at this row count
  STREAMING_THRESHOLD_ROWS: 200_000,

  // Stream batch size. Matches CHART_STREAM_BATCH_ROWS in backend.
  STREAM_BATCH_ROWS: 5_000,

  // Pool pressure ratio at which RSR downshifts one tier
  INSTANCE_PRESSURE_DOWNSHIFT: 0.85,

  // Frame budget thresholds (in ms). Matches CHART_FRAME_BUDGET_*_MS.
  FRAME_BUDGET_TIGHT_MS: 28,
  FRAME_BUDGET_LOOSE_MS: 12,

  // Hold time before frame-budget state changes propagate
  FRAME_BUDGET_HYSTERESIS_MS: 200,

  // Cooldown after escalation to prevent oscillation
  ESCALATION_COOLDOWN_MS: 30_000,
} as const;

/** Mark types that deck.gl can render natively. */
export const DECK_ELIGIBLE_MARKS: ReadonlySet<Mark> = new Set<Mark>([
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
