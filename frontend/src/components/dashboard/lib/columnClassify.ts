// Shared column-role inference for schema-driven pickers.
//
// The backend `/api/v1/connections/{id}/schema-profile` endpoint returns
// columns shaped as `{ name, type, nullable }` — it does NOT emit
// `role` / `semantic_type` / `cardinality`. Consumers that filter by
// role must therefore infer it from `type` alone.
//
// The canonical source of truth is the column's `role` if present;
// otherwise the inference rules below apply:
//
//   - Numeric SQL type (int, float, numeric, decimal, double, …) → measure.
//   - Everything else → dimension (strings, dates, booleans).
//
// Matches the inline fallback that AnalyticsShell.jsx already uses so
// components agree on classification everywhere.

export type ColumnShape = {
  name?: string;
  type?: string;
  dtype?: string;
  data_type?: string;
  role?: 'measure' | 'dimension' | string;
  semantic_type?: string;
  semanticType?: string;
  cardinality?: number;
  distinct_count?: number;
  table?: string;
  nullable?: boolean;
};

const NUMERIC_RE =
  /^(int|float|numeric|decimal|double|real|bigint|smallint|tinyint|number)/i;
const TEMPORAL_TYPE_RE = /^(date|time|timestamp|datetime)/i;
// Common column-name patterns for dates stored as strings (widespread on
// CSV-to-warehouse pipelines). Picks up `started_at`, `created_at`,
// `event_date`, `order_time`, `posted_on`, ...
const TEMPORAL_NAME_RE =
  /(^|_)(date|time|timestamp|datetime|day|month|year|week|quarter|hour|minute)(_|$)|_(at|on)$|^(created|updated|started|ended|completed|resolved|posted|published|expired|deleted|received|sent|requested)(_at|_on)?$/i;

function normType(col: ColumnShape): string {
  return String(col.type || col.dtype || col.data_type || '').toLowerCase();
}

export function isTemporalColumn(col: ColumnShape): boolean {
  if (!col) return false;
  const st = String(col.semantic_type || col.semanticType || '').toLowerCase();
  if (st === 'temporal') return true;
  if (TEMPORAL_TYPE_RE.test(normType(col))) return true;
  // Fall back to name-based inference for dates stored as strings
  // (warehouses without a proper DATE/TIMESTAMP import).
  const name = String(col.name || '').toLowerCase();
  return TEMPORAL_NAME_RE.test(name);
}

export function isNumericColumn(col: ColumnShape): boolean {
  if (!col) return false;
  return NUMERIC_RE.test(normType(col));
}

/** Resolve the column's role. Prefers an explicit `role`; falls back
 *  to type inference (numeric → measure, else → dimension). */
export function inferColumnRole(col: ColumnShape): 'measure' | 'dimension' {
  if (!col) return 'dimension';
  if (col.role === 'measure' || col.role === 'dimension') return col.role;
  const st = String(col.semantic_type || col.semanticType || '').toLowerCase();
  if (st === 'quantitative') return 'measure';
  return isNumericColumn(col) ? 'measure' : 'dimension';
}

export function isMeasureColumn(col: ColumnShape): boolean {
  return inferColumnRole(col) === 'measure';
}

export function isDimensionColumn(col: ColumnShape): boolean {
  return inferColumnRole(col) === 'dimension';
}

/** String-like heuristic for the entity-name picker. Covers VARCHAR,
 *  TEXT, STRING dialect variants. */
export function isStringColumn(col: ColumnShape): boolean {
  if (!col) return false;
  const t = normType(col);
  return (
    t.includes('char') ||
    t.includes('text') ||
    t.includes('string') ||
    t === 'varchar' ||
    t === 'str'
  );
}

/** Flatten a schema profile response into a single column list.
 *  Accepts both shapes:
 *    - { columns: [...] }
 *    - { tables: [{ name, columns: [...] }] }  (the backend's shape)
 *  Columns receive a `table` field tagged from the enclosing table. */
export function flattenSchemaColumns(profile: unknown): ColumnShape[] {
  if (!profile || typeof profile !== 'object') return [];
  const p = profile as Record<string, unknown>;
  if (Array.isArray(p.columns)) return p.columns as ColumnShape[];
  if (Array.isArray(p.tables)) {
    const out: ColumnShape[] = [];
    for (const raw of p.tables as Array<Record<string, unknown>>) {
      if (!raw || !Array.isArray(raw.columns)) continue;
      for (const col of raw.columns as ColumnShape[]) {
        out.push({ ...col, table: col?.table || (raw.name as string) });
      }
    }
    return out;
  }
  return [];
}
