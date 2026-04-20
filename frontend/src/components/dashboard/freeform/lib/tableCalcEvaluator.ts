// frontend/src/components/dashboard/freeform/lib/tableCalcEvaluator.ts
/**
 * Plan 8c — client-side table-calc evaluator.
 *
 * Runs only the calcs whose semantics depend on per-row state
 * (LOOKUP, PREVIOUS_VALUE, DIFF, IS_DISTINCT, IS_STACKED). All
 * window-representable calcs (RUNNING_*, WINDOW_*, RANK_*, INDEX,
 * FIRST, LAST, SIZE, TOTAL, PCT_TOTAL) are lowered to SQL by
 * `backend/vizql/table_calc.py`.
 *
 * Security: dispatch is a fixed lookup table keyed by the canonical
 * Tableau function name. The evaluator never compiles or evaluates
 * user-supplied code. Rows arrive PII-masked from /api/v1/queries/execute.
 *
 * Build_Tableau.md §V.3 — addressing = ORDER BY; partitioning =
 * PARTITION BY; default direction = pane-unordered.
 */
export type SortDir = 'asc' | 'desc';
export type Row = Record<string, unknown>;

export interface TableCalcSpec {
  calc_id: string;
  function: string;          // canonical Tableau name, e.g. 'LOOKUP'
  arg_field: string;
  addressing: string[];
  partitioning: string[];
  direction: 'across' | 'down' | 'table' | 'pane' | 'specific';
  sort: SortDir | null;
  offset: number | null;
}

const NULL_KEY = '\u0001NULL';

function partKey(row: Row, dims: string[]): string {
  if (dims.length === 0) return '';
  return dims.map(d => row[d] === null || row[d] === undefined ? NULL_KEY : String(row[d])).join('\u0000');
}

function addrCmp(a: Row, b: Row, addressing: string[], dir: SortDir): number {
  const sign = dir === 'desc' ? -1 : 1;
  for (const f of addressing) {
    const av = a[f], bv = b[f];
    if (av === bv) continue;
    if (av === null || av === undefined) return -1 * sign;
    if (bv === null || bv === undefined) return 1 * sign;
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
  }
  return 0;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface PartIndex { key: string; sortedIdx: number[]; }

function buildPartitions(rows: Row[], spec: TableCalcSpec): PartIndex[] {
  const map = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const k = partKey(rows[i], spec.partitioning);
    const bucket = map.get(k);
    if (bucket) bucket.push(i); else map.set(k, [i]);
  }
  const dir = spec.sort ?? 'asc';
  const out: PartIndex[] = [];
  for (const [key, idxs] of map.entries()) {
    idxs.sort((a, b) => addrCmp(rows[a], rows[b], spec.addressing, dir));
    out.push({ key, sortedIdx: idxs });
  }
  return out;
}

type ClientCalcFn = (rows: Row[], spec: TableCalcSpec) => unknown[];

const CALC_DISPATCH: Record<string, ClientCalcFn> = {
  LOOKUP(rows, spec) {
    const off = spec.offset ?? 0;
    const out: unknown[] = new Array(rows.length).fill(null);
    for (const part of buildPartitions(rows, spec)) {
      for (let pos = 0; pos < part.sortedIdx.length; pos++) {
        const tgt = pos + off;
        if (tgt < 0 || tgt >= part.sortedIdx.length) continue;
        out[part.sortedIdx[pos]] = rows[part.sortedIdx[tgt]][spec.arg_field];
      }
    }
    return out;
  },
  PREVIOUS_VALUE(rows, spec) {
    const out: unknown[] = new Array(rows.length).fill(null);
    for (const part of buildPartitions(rows, spec)) {
      let prev: unknown = null;
      for (let pos = 0; pos < part.sortedIdx.length; pos++) {
        const i = part.sortedIdx[pos];
        if (pos === 0) prev = rows[i][spec.arg_field];
        out[i] = prev;
      }
    }
    return out;
  },
  DIFF(rows, spec) {
    const lag = spec.offset ?? -1;
    const out: unknown[] = new Array(rows.length).fill(null);
    for (const part of buildPartitions(rows, spec)) {
      for (let pos = 0; pos < part.sortedIdx.length; pos++) {
        const tgt = pos + lag;
        if (tgt < 0 || tgt >= part.sortedIdx.length) continue;
        const cur = num(rows[part.sortedIdx[pos]][spec.arg_field]);
        const ref = num(rows[part.sortedIdx[tgt]][spec.arg_field]);
        out[part.sortedIdx[pos]] = (cur === null || ref === null) ? null : cur - ref;
      }
    }
    return out;
  },
  IS_DISTINCT(rows, spec) {
    const out: unknown[] = new Array(rows.length).fill(false);
    for (const part of buildPartitions(rows, spec)) {
      const seen = new Set<string>();
      for (const i of part.sortedIdx) {
        const k = partKey(rows[i], spec.addressing);
        if (seen.has(k)) { out[i] = false; continue; }
        seen.add(k); out[i] = true;
      }
    }
    return out;
  },
  IS_STACKED(rows, spec) {
    const out: unknown[] = new Array(rows.length).fill(false);
    for (const part of buildPartitions(rows, spec)) {
      const counts = new Map<string, number>();
      for (const i of part.sortedIdx) {
        const k = partKey(rows[i], spec.addressing);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      for (const i of part.sortedIdx) {
        const k = partKey(rows[i], spec.addressing);
        out[i] = (counts.get(k) ?? 0) > 1;
      }
    }
    return out;
  },
};

export function evaluateTableCalc(spec: TableCalcSpec, rows: Row[]): Row[] {
  const fn = CALC_DISPATCH[spec.function];
  if (!fn) throw new Error(`unknown table-calc ${spec.function}`);
  const values = fn(rows, spec);
  return rows.map((r, i) => ({ ...r, [spec.calc_id]: values[i] }));
}

export function evaluateTableCalcPipeline(
  specs: TableCalcSpec[], rows: Row[],
): Row[] {
  let out = rows;
  for (const s of specs) out = evaluateTableCalc(s, out);
  return out;
}
