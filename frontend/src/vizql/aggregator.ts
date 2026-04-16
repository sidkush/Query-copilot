/**
 * Aggregator — GROUP BY + aggregation engine.
 *
 * Takes raw rows + compiled encoding, produces aggregated rows
 * with domain info for scale construction.
 *
 * This is our key perf advantage over Vega-Lite: direct JS aggregation
 * without the reactive dataflow graph overhead.
 */

import type { CompiledSpec, CompiledEncoding, EncodingChannel, AggregatedData } from './types';

type Row = Record<string, unknown>;

// ── Aggregation functions ───────────────────────────────────

function aggSum(values: number[]): number {
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s;
}

function aggAvg(values: number[]): number {
  return values.length > 0 ? aggSum(values) / values.length : 0;
}

function aggMin(values: number[]): number {
  let m = Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] < m) m = values[i];
  return m;
}

function aggMax(values: number[]): number {
  let m = -Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] > m) m = values[i];
  return m;
}

function aggMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function aggCount(values: unknown[]): number {
  return values.length;
}

const AGG_FNS: Record<string, (vals: number[]) => number> = {
  sum: aggSum,
  avg: aggAvg,
  mean: aggAvg,
  min: aggMin,
  max: aggMax,
  median: aggMedian,
  count: (v) => v.length,
  distinct: (v) => new Set(v).size,
};

// ── Binning ─────────────────────────────────────────────────

function binValues(
  rows: Row[],
  field: string,
  maxbins: number,
): { binField: string; rows: Row[] } {
  const values = rows.map((r) => Number(r[field])).filter((v) => !isNaN(v));
  if (values.length === 0) return { binField: `${field}_bin`, rows };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / maxbins || 1;
  const binField = `${field}_bin`;

  const binnedRows = rows.map((r) => {
    const v = Number(r[field]);
    const binIdx = isNaN(v) ? 0 : Math.min(Math.floor((v - min) / step), maxbins - 1);
    const binStart = min + binIdx * step;
    return { ...r, [binField]: binStart, [`${binField}_end`]: binStart + step };
  });

  return { binField, rows: binnedRows };
}

// ── Core aggregation ────────────────────────────────────────

function collectChannels(enc: CompiledEncoding): EncodingChannel[] {
  const channels: (EncodingChannel | undefined)[] = [
    enc.x, enc.y, enc.color, enc.size, enc.shape,
    enc.opacity, enc.text, enc.theta, enc.row, enc.column, enc.xOffset,
  ];
  if (enc.detail) channels.push(...enc.detail);
  return channels.filter(Boolean) as EncodingChannel[];
}

/**
 * Aggregate raw data based on compiled encoding.
 *
 * Group-by fields: all nominal/ordinal channels (dimensions).
 * Aggregate fields: all quantitative channels with an aggregate op.
 */
export function aggregate(data: Row[], spec: CompiledSpec): AggregatedData {
  const channels = collectChannels(spec.encoding);

  // Identify group-by dimensions and aggregate measures
  const groupByFields: string[] = [];
  const groupBySet = new Set<string>(); // O(1) dedup check
  const aggFields: { field: string; op: string; as: string }[] = [];

  for (const ch of channels) {
    if (!ch.field || ch.field === '__count__') {
      aggFields.push({ field: '__count__', op: 'count', as: '__count__' });
      continue;
    }
    if (ch.aggregate) {
      aggFields.push({ field: ch.field, op: ch.aggregate, as: ch.field });
    } else if (ch.type === 'nominal' || ch.type === 'ordinal' || ch.type === 'temporal') {
      if (!groupBySet.has(ch.field)) {
        groupBySet.add(ch.field);
        groupByFields.push(ch.field);
      }
    }
    // Quantitative without aggregate = raw (no grouping needed for that field)
  }

  // Handle binning
  let rows = data;
  for (const ch of channels) {
    if (ch.bin) {
      const maxbins = typeof ch.bin === 'object' ? ch.bin.maxbins : 30;
      const result = binValues(rows, ch.field, maxbins);
      rows = result.rows;
      // Replace channel field reference with binned field
      ch.field = result.binField;
      if (!groupByFields.includes(result.binField)) {
        groupByFields.push(result.binField);
      }
    }
  }

  // FAST PATH: no aggregation needed (scatter, raw line, etc.)
  // Skip the full computeDomains when possible — use a streaming single-pass
  if (aggFields.length === 0) {
    return { rows, domains: computeDomains(rows, channels) };
  }

  // FAST PATH: no group-by fields + only count → single output row
  if (groupByFields.length === 0 && aggFields.every((a) => a.op === 'count')) {
    const outRow: Row = { __count__: rows.length };
    return { rows: [outRow], domains: computeDomains([outRow], channels) };
  }

  // ═══════════════════════════════════════════════════════════════
  // DATAVORE-STYLE AGGREGATION: dictionary encode → flat array accumulators
  // 5-10x faster than Map.get() for low-cardinality GROUP BY (the chart case)
  // ═══════════════════════════════════════════════════════════════

  const n = rows.length;

  // Step 1: Dictionary-encode each group-by column → integer codes
  const dictionaries: Map<string, unknown>[] = [];   // code → original value per field
  const codedColumns: Int32Array[] = [];              // row → group code per field
  const cardinalities: number[] = [];

  for (const field of groupByFields) {
    const valueToCode = new Map<unknown, number>();
    const codeToValue: unknown[] = [];
    const codes = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      const val = rows[i][field];
      let code = valueToCode.get(val);
      if (code === undefined) {
        code = codeToValue.length;
        valueToCode.set(val, code);
        codeToValue.push(val);
      }
      codes[i] = code;
    }

    dictionaries.push(new Map(codeToValue.map((v, i) => [String(i), v])));
    codedColumns.push(codes);
    cardinalities.push(codeToValue.length);
  }

  // Step 2: Compute composite group key per row as single integer
  // key = c0 * (card1 * card2 * ...) + c1 * (card2 * ...) + ... + cN
  const numFields = groupByFields.length;
  let numGroups = 1;
  const strides = new Int32Array(numFields);
  for (let f = numFields - 1; f >= 0; f--) {
    strides[f] = numGroups;
    numGroups *= cardinalities[f];
  }
  // Cap for safety — fall back to Map if cardinality product explodes
  if (numGroups > 1_000_000) {
    return aggregateFallback(rows, groupByFields, aggFields, channels);
  }

  const groupKeys = new Int32Array(n);
  if (numFields === 1) {
    // Fast path: single field — key IS the code
    const codes = codedColumns[0];
    for (let i = 0; i < n; i++) groupKeys[i] = codes[i];
  } else {
    for (let i = 0; i < n; i++) {
      let key = 0;
      for (let f = 0; f < numFields; f++) {
        key += codedColumns[f][i] * strides[f];
      }
      groupKeys[i] = key;
    }
  }

  // Step 3: Flat array accumulators — one Float64Array per aggregate
  const sums: Float64Array[] = [];
  const counts = new Float64Array(numGroups);
  const aggOps: string[] = [];

  for (const agg of aggFields) {
    sums.push(new Float64Array(numGroups));
    aggOps.push(agg.op);
  }

  // Step 4: Single pass — accumulate
  for (let i = 0; i < n; i++) {
    const gk = groupKeys[i];
    counts[gk]++;

    for (let a = 0; a < aggFields.length; a++) {
      const agg = aggFields[a];
      if (agg.op === 'count') {
        sums[a][gk] = counts[gk];
      } else {
        const v = Number(rows[i][agg.field]);
        if (!isNaN(v)) {
          const op = aggOps[a];
          if (op === 'sum' || op === 'avg' || op === 'mean') {
            sums[a][gk] += v;
          } else if (op === 'min') {
            if (counts[gk] === 1 || v < sums[a][gk]) sums[a][gk] = v;
          } else if (op === 'max') {
            if (counts[gk] === 1 || v > sums[a][gk]) sums[a][gk] = v;
          } else {
            sums[a][gk] += v; // default to sum
          }
        }
      }
    }
  }

  // Step 5: Materialize output rows from flat arrays
  const aggregatedRows: Row[] = [];
  const codeToValues: unknown[][] = groupByFields.map((_, fi) => {
    const dict = dictionaries[fi];
    const vals: unknown[] = [];
    for (let c = 0; c < cardinalities[fi]; c++) vals.push(dict.get(String(c)));
    return vals;
  });

  for (let gk = 0; gk < numGroups; gk++) {
    if (counts[gk] === 0) continue; // skip empty groups

    const outRow: Row = {};
    // Decode dimension values from composite key
    let remainder = gk;
    for (let f = 0; f < numFields; f++) {
      const code = Math.floor(remainder / strides[f]);
      remainder %= strides[f];
      outRow[groupByFields[f]] = codeToValues[f][code];
    }
    // Write aggregates
    for (let a = 0; a < aggFields.length; a++) {
      let val = sums[a][gk];
      if (aggOps[a] === 'avg' || aggOps[a] === 'mean') {
        val = counts[gk] > 0 ? val / counts[gk] : 0;
      }
      outRow[aggFields[a].as] = val;
    }
    aggregatedRows.push(outRow);
  }

  return { rows: aggregatedRows, domains: computeDomains(aggregatedRows, channels) };
}

/** Fallback for extremely high cardinality (>1M composite groups) — uses Map */
function aggregateFallback(
  rows: Row[],
  groupByFields: string[],
  aggFields: { field: string; op: string; as: string }[],
  channels: EncodingChannel[],
): AggregatedData {
  const groups = new Map<string, Row[]>();
  const single = groupByFields.length === 1;

  for (const row of rows) {
    const key = single
      ? String(row[groupByFields[0]] ?? '')
      : groupByFields.map((f) => String(row[f] ?? '')).join('|||');
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(row);
  }

  const out: Row[] = [];
  for (const [, gr] of groups) {
    const outRow: Row = {};
    for (const f of groupByFields) outRow[f] = gr[0][f];
    for (const agg of aggFields) {
      if (agg.op === 'count') { outRow[agg.as] = gr.length; continue; }
      const vals = gr.map((r) => Number(r[agg.field])).filter((v) => !isNaN(v));
      outRow[agg.as] = (AGG_FNS[agg.op] ?? aggSum)(vals);
    }
    out.push(outRow);
  }
  return { rows: out, domains: computeDomains(out, channels) };
}

/**
 * Compute domains in a SINGLE PASS over rows.
 * Previous version did one pass per field — O(fields × rows).
 * This version does O(rows) total regardless of field count.
 */
function computeDomains(
  rows: Row[],
  channels: EncodingChannel[],
): Map<string, { values?: unknown[]; min?: number; max?: number; type: string }> {
  const domains = new Map<string, { values?: unknown[]; min?: number; max?: number; type: string }>();
  if (rows.length === 0) return domains;

  // Collect unique fields and their types
  type FieldInfo = { type: string; nominalSet?: Set<unknown>; min?: number; max?: number };
  const fieldInfos = new Map<string, FieldInfo>();

  for (const ch of channels) {
    if (!ch.field || ch.field === '__count__' || fieldInfos.has(ch.field)) continue;
    if (ch.type === 'nominal' || ch.type === 'ordinal') {
      fieldInfos.set(ch.field, { type: ch.type, nominalSet: new Set() });
    } else if (ch.type === 'quantitative') {
      fieldInfos.set(ch.field, { type: 'quantitative', min: Infinity, max: -Infinity });
    } else if (ch.type === 'temporal') {
      fieldInfos.set(ch.field, { type: 'temporal', min: Infinity, max: -Infinity });
    }
  }

  // Single pass over all rows
  const entries = [...fieldInfos.entries()];
  for (const row of rows) {
    for (const [field, info] of entries) {
      const val = row[field];
      if (val == null) continue;

      if (info.nominalSet) {
        info.nominalSet.add(val);
      } else if (info.type === 'temporal') {
        const ms = typeof val === 'number' ? val : new Date(val as string).getTime();
        if (!isNaN(ms)) {
          if (ms < info.min!) info.min = ms;
          if (ms > info.max!) info.max = ms;
        }
      } else {
        const v = Number(val);
        if (!isNaN(v)) {
          if (v < info.min!) info.min = v;
          if (v > info.max!) info.max = v;
        }
      }
    }
  }

  // Convert to domain objects
  for (const [field, info] of entries) {
    if (info.nominalSet) {
      domains.set(field, { values: [...info.nominalSet], type: info.type });
    } else {
      domains.set(field, { min: info.min, max: info.max, type: info.type });
    }
  }

  // __count__ domain from aggregated rows
  if (!fieldInfos.has('__count__')) {
    let cmin = Infinity, cmax = -Infinity;
    let found = false;
    for (const r of rows) {
      const v = Number(r.__count__ ?? 0);
      if (!isNaN(v) && r.__count__ != null) {
        found = true;
        if (v < cmin) cmin = v;
        if (v > cmax) cmax = v;
      }
    }
    if (found) {
      domains.set('__count__', { min: cmin, max: cmax, type: 'quantitative' });
    }
  }

  return domains;
}
