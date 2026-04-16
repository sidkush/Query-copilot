/**
 * correctionDetector — pure spec diff logic.
 *
 * Compares two ChartSpecs and returns typed CorrectionSuggestion objects
 * that the editor can surface as toast prompts ("remember this for next time?").
 *
 * Detection rules:
 *   synonym        — an encoding channel's field name changed
 *   measure_default — same field, same channel, but aggregate changed
 *   color_map      — the color channel's scale.range changed or appeared
 *
 * The function is PURE: no imports beyond the type system, no side effects,
 * no network calls. Safe to call on every spec mutation.
 */

import type { ChartSpec, Encoding } from '../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CorrectionType = 'synonym' | 'color_map' | 'measure_default';

export interface CorrectionSuggestion {
  /** Unique identifier, e.g. "corr-1713196800000-0". */
  id: string;
  type: CorrectionType;
  /** Human-readable toast text shown to the user. */
  message: string;
  /** Structured data consumed by the accept handler. */
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Channels whose FieldRef exposes a single .field + .aggregate.
 * Excludes multi-value channels (detail, tooltip) which use FieldRef[].
 */
const SINGLE_FIELD_CHANNELS = [
  'x', 'y', 'x2', 'y2',
  'color',
  'size', 'shape', 'opacity',
  'text', 'row', 'column', 'order',
] as const satisfies ReadonlyArray<keyof Encoding>;

type SingleFieldChannel = typeof SINGLE_FIELD_CHANNELS[number];

/** Counter incremented for each suggestion within a single detectCorrections call. */
let _callCounter = 0;

function makeId(ts: number, idx: number): string {
  return `corr-${ts}-${idx}`;
}

/** Returns a shallow copy of a scale.range array or undefined. */
function getScaleRange(
  colorEncoding: (Encoding['color'] & { scale?: { range?: unknown } }) | undefined,
): unknown[] | undefined {
  if (!colorEncoding) return undefined;
  const scale = (colorEncoding as Record<string, unknown>)['scale'];
  if (typeof scale !== 'object' || scale === null) return undefined;
  const range = (scale as Record<string, unknown>)['range'];
  if (!Array.isArray(range)) return undefined;
  return range as unknown[];
}

/** Stable JSON-comparable representation for an array. */
function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Diffs `before` and `after` ChartSpecs and returns an array of
 * CorrectionSuggestion objects classifying each detected change.
 *
 * Returns `[]` when either spec is null/undefined, when neither has an
 * encoding, or when the specs are semantically identical in the observed
 * dimensions.
 */
export function detectCorrections(
  before: ChartSpec | null | undefined,
  after: ChartSpec | null | undefined,
): CorrectionSuggestion[] {
  if (before == null || after == null) return [];

  const bEnc = before.encoding;
  const aEnc = after.encoding;

  if (!bEnc && !aEnc) return [];

  const suggestions: CorrectionSuggestion[] = [];
  const ts = Date.now();
  let idx = 0;

  // Reset per-call counter
  _callCounter = 0;

  // ------------------------------------------------------------------
  // Rule 1 + 2: per single-field channel — synonym and measure_default
  // ------------------------------------------------------------------

  for (const ch of SINGLE_FIELD_CHANNELS) {
    const bField = bEnc?.[ch];
    const aField = aEnc?.[ch];

    if (!bField || !aField) continue;

    const oldField = bField.field;
    const newField = aField.field;

    if (oldField === undefined || newField === undefined) continue;

    if (oldField !== newField) {
      // Rule 1: field rename → synonym suggestion
      suggestions.push({
        id: makeId(ts, idx++),
        type: 'synonym',
        message: `Remember "${newField}" as synonym for "${oldField}"?`,
        payload: { channel: ch, oldField, newField },
      });
      // No point checking aggregate when the field itself changed
      continue;
    }

    // Rule 2: same field, different aggregate → measure_default
    const oldAgg = bField.aggregate;
    const newAgg = aField.aggregate;

    if (oldAgg !== undefined && newAgg !== undefined && oldAgg !== newAgg) {
      suggestions.push({
        id: makeId(ts, idx++),
        type: 'measure_default',
        message: `Default aggregate for "${oldField}" is ${newAgg}?`,
        payload: { channel: ch, field: oldField, oldAggregate: oldAgg, newAggregate: newAgg },
      });
    }
  }

  // ------------------------------------------------------------------
  // Rule 3: color scale change → color_map
  // ------------------------------------------------------------------

  const bColor = bEnc?.color;
  const aColor = aEnc?.color;

  if (bColor && aColor) {
    const bRange = getScaleRange(bColor as Parameters<typeof getScaleRange>[0]);
    const aRange = getScaleRange(aColor as Parameters<typeof getScaleRange>[0]);

    const rangeChanged =
      aRange !== undefined &&
      (bRange === undefined || !arraysEqual(bRange, aRange));

    if (rangeChanged) {
      // Collect domain from the scale object if available
      const aScale = (aColor as Record<string, unknown>)['scale'];
      const domain =
        typeof aScale === 'object' && aScale !== null
          ? ((aScale as Record<string, unknown>)['domain'] ?? [])
          : [];

      suggestions.push({
        id: makeId(ts, idx++),
        type: 'color_map',
        message: `Save color assignments for "${aColor.field}" to all charts?`,
        payload: { field: aColor.field, domain, range: aRange },
      });
    }
  }

  _callCounter = idx;
  return suggestions;
}
