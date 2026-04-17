export type HighlightSlice = Record<string, unknown> | null | undefined;

function literal(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  return JSON.stringify(String(v));
}

function escapeFieldName(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Compile a highlight slice (`{field: scalar | scalar[]}`) into a Vega
 * expression string. Empty / null input returns `'true'` so callers can
 * embed unconditionally without branching.
 *
 * Multi-value fields render as OR-grouped equality (Tableau IN-list).
 * Multiple fields are AND-joined (every constraint must match).
 */
export function compileHighlightFilter(slice: HighlightSlice): string {
  if (!slice || typeof slice !== 'object') return 'true';
  const clauses: string[] = [];
  for (const [rawField, raw] of Object.entries(slice)) {
    const field = escapeFieldName(rawField);
    const accessor = `datum['${field}']`;
    if (raw === null || raw === undefined) continue;
    if (Array.isArray(raw)) {
      const ors = raw
        .map((v) => literal(v))
        .filter((v): v is string => v !== null)
        .map((v) => `${accessor} === ${v}`);
      if (ors.length > 0) clauses.push(`(${ors.join(' || ')})`);
    } else {
      const lit = literal(raw);
      if (lit !== null) clauses.push(`(${accessor} === ${lit})`);
    }
  }
  if (clauses.length === 0) return 'true';
  return clauses.join(' && ');
}

const HIGHLIGHT_STROKE = 'var(--accent, #5b8def)';

/**
 * Inject opacity + stroke conditions into a chart spec so non-matching marks
 * dim to 0.15 and matching marks gain a 2px stroke ring (Build_Tableau §XI.5).
 * Returns the spec unchanged (by reference) when slice is empty.
 */
export function applyHighlightToSpec<T extends { encoding?: Record<string, unknown> }>(
  spec: T,
  slice: HighlightSlice,
): T {
  if (!slice || typeof slice !== 'object' || Object.keys(slice).length === 0) {
    return spec;
  }
  const test = compileHighlightFilter(slice);
  if (test === 'true') return spec;
  const encoding: Record<string, unknown> = { ...(spec.encoding || {}) };
  encoding.opacity = { condition: { test, value: 1.0 }, value: 0.15 };
  encoding.stroke = { condition: { test, value: HIGHLIGHT_STROKE }, value: null };
  encoding.strokeWidth = { condition: { test, value: 2 }, value: 0 };
  return { ...spec, encoding };
}

function uniq<T>(xs: T[]): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const x of xs) {
    const key = typeof x === 'object' ? JSON.stringify(x) : x;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

/**
 * Merge a click's field values into the existing highlight slice.
 *  - `fields=null`         → clear (returns null).
 *  - `additive=false`      → replace prev with fields (single-select).
 *  - `additive=true`       → per-field append + dedupe; promote scalar→array.
 */
export function mergeMarkIntoHighlight(
  prev: HighlightSlice,
  fields: Record<string, unknown> | null,
  additive: boolean,
): Record<string, unknown> | null {
  if (fields === null) return null;
  if (!additive || !prev) return { ...fields };
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(fields)) {
    const existing = out[k];
    if (existing === undefined) {
      out[k] = v;
    } else if (Array.isArray(existing)) {
      out[k] = uniq([...existing, v]);
    } else {
      out[k] = uniq([existing, v]);
    }
  }
  return out;
}
