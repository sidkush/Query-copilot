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
