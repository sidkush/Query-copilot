// Typed-Seeking-Spring Phase 4 / Wave 2-B — pure formatter.
//
// Deterministic helper that shapes a TileBinding + its fetched rows into
// what the slot's bespoke JSX actually wants to render. KPI returns
// { value, delta? }; chart / table return { rows }; narrative returns a
// plain string (rendered markdown or the template literal when no LLM
// copy has been generated yet).
//
// The helper is intentionally non-reactive — the Slot.jsx wrapper calls
// it once per render. Keep this file free of React imports so it can be
// tree-shaken into autogen debugging harnesses if needed.

import type { SlotKind } from './slots';

// ── Binding shape mirror ────────────────────────────────────────────
// Kept in sync with the TileBinding interface planned in
// frontend/src/components/dashboard/freeform/lib/types.ts (extended by
// Wave 1). We intentionally declare a *local* minimal shape here so
// this module has no runtime dependency on the types file — avoiding a
// circular import through slots.ts.

export type AggKind =
  | 'SUM'
  | 'AVG'
  | 'COUNT'
  | 'MIN'
  | 'MAX'
  | 'COUNT_DISTINCT';

export interface TileBinding {
  slotId: string;
  tileId: string;
  kind: SlotKind;
  measure?: { column: string; agg?: AggKind };
  dimension?: string;
  filter?: { column: string; op: string; value: unknown };
  markdownTemplate?: string;
  renderedMarkdown?: string;
  isUserPinned?: boolean;
  /** optional explicit formatter hint — currency | percent | ratio | duration */
  formatter?: 'currency' | 'percent' | 'ratio' | 'duration' | 'number';
}

export interface TileRows {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export type KpiFormatted = { value: string; delta?: string };
export type ChartFormatted = { rows: Array<Record<string, unknown>> };
export type TableFormatted = { rows: Array<Record<string, unknown>> };
export type NarrativeFormatted = string;

export type FormattedOutput =
  | KpiFormatted
  | ChartFormatted
  | TableFormatted
  | NarrativeFormatted
  | null;

// ── Formatters ──────────────────────────────────────────────────────

/** Minus sign used across the dashboards — matches the unicode already
 *  baked into the wireframe fallbacks (U+2212). */
const MINUS = '\u2212';

function pickFormatterHint(binding: TileBinding | undefined): TileBinding['formatter'] {
  if (!binding) return 'number';
  if (binding.formatter) return binding.formatter;
  const col = binding.measure?.column?.toLowerCase() ?? '';
  if (
    col.includes('rate') ||
    col.includes('churn') ||
    col.includes('percent') ||
    col.includes('ratio_pct') ||
    col.endsWith('_pct')
  ) {
    return 'percent';
  }
  if (col.includes('months') || col.includes('payback')) {
    return 'duration';
  }
  if (
    col.includes('ratio') ||
    col.endsWith('_x') ||
    col === 'ltv_cac'
  ) {
    return 'ratio';
  }
  if (
    col.includes('revenue') ||
    col.includes('mrr') ||
    col.includes('arr') ||
    col.includes('amount') ||
    col.includes('price') ||
    col.includes('value')
  ) {
    return 'currency';
  }
  return 'number';
}

function formatMagnitude(n: number, hint: TileBinding['formatter']): string {
  const abs = Math.abs(n);
  if (hint === 'percent') {
    // input could be 0–100 already or 0–1; heuristic — if abs <= 1 treat as fraction.
    const pct = abs <= 1 ? n * 100 : n;
    return `${pct.toFixed(2)}%`;
  }
  if (hint === 'ratio') {
    return `${n.toFixed(1)}\u00d7`;
  }
  if (hint === 'duration') {
    return `${n.toFixed(1)}mo`;
  }
  // Currency + generic number share the M/K compaction.
  const prefix = hint === 'currency' ? '$' : '';
  let body: string;
  if (abs >= 1_000_000) {
    body = `${(n / 1_000_000).toFixed(2)}M`;
  } else if (abs >= 1_000) {
    body = `${Math.round(n / 1_000)}K`;
  } else if (abs < 1 && abs > 0) {
    body = n.toFixed(2);
  } else {
    body = Math.round(n).toString();
  }
  if (n < 0) {
    return `${MINUS}${prefix}${body.replace(/^-/, '')}`;
  }
  return `${prefix}${body}`;
}

function formatDelta(current: number, prior: number): string {
  if (prior === 0 || !Number.isFinite(prior)) return '';
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded >= 0) return `+${rounded.toFixed(1)}%`;
  return `${MINUS}${Math.abs(rounded).toFixed(1)}%`;
}

function firstNumericValue(row: Record<string, unknown>, columns: string[]): number | null {
  // Try columns in order; first finite number wins.
  for (const c of columns) {
    const v = row[c];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const parsed = Number(v);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  // Fallback — scan all own values.
  for (const v of Object.values(row)) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/** Format a binding + its data for a given slot kind. */
export function formatValue(
  binding: TileBinding | undefined,
  tileData: TileRows | undefined,
  kind: SlotKind
): FormattedOutput {
  if (!binding) return null;

  if (kind === 'narrative') {
    return (
      binding.renderedMarkdown ??
      binding.markdownTemplate ??
      ''
    );
  }

  if (kind === 'chart' || kind === 'table') {
    if (!tileData) return { rows: [] };
    return { rows: tileData.rows };
  }

  // KPI — collapse to { value, delta? }.
  if (!tileData || !tileData.rows || tileData.rows.length === 0) {
    return { value: '' };
  }
  const hint = pickFormatterHint(binding);
  const columns = tileData.columns ?? Object.keys(tileData.rows[0] ?? {});
  const current = firstNumericValue(tileData.rows[0], columns);
  if (current === null) {
    return { value: '' };
  }
  const value = formatMagnitude(current, hint);
  let delta: string | undefined;
  if (tileData.rows.length >= 2) {
    const prior = firstNumericValue(tileData.rows[1], columns);
    if (prior !== null && prior !== current) {
      delta = formatDelta(current, prior);
    }
  }
  return delta ? { value, delta } : { value };
}
