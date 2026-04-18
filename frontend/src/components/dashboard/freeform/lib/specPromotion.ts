// Plan 7 T18 — promote a Vega-Lite spec whose mark is "text" but whose
// encoding is clearly an x/y chart (nominal x + quantitative y) into a
// "bar" spec. Agent-generated tiles occasionally ship with mark:"text",
// which renders as invisible text glyphs inside the plot area — the user
// sees only axes and a color legend, no readable marks, and cannot infer
// anything. Promoting to "bar" restores the intended chart.
//
// Pure, identity-preserving helper: returns the input unchanged when no
// promotion is needed so useMemo short-circuits work.

type AnySpec = Record<string, unknown>;

function hasEncodingPair(spec: AnySpec): boolean {
  const enc = spec.encoding as AnySpec | undefined;
  if (!enc || typeof enc !== 'object') return false;
  return 'x' in enc && 'y' in enc;
}

function currentMarkType(spec: AnySpec): string | null {
  const m = spec.mark;
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object' && typeof (m as { type?: unknown }).type === 'string') {
    return (m as { type: string }).type;
  }
  return null;
}

// Plan 7 T21 — marks we promote to 'bar' when paired with x/y encodings.
//   - 'text': renders invisible glyphs (T18)
//   - 'arc': pie-chart mark that IGNORES x/y and requires theta instead.
//            Agent specs occasionally emit arc+x/y, leaving the plot empty.
// Legitimate text annotations (no x/y) and theta-encoded pies are NOT
// promoted — we only touch x/y-shaped specs with a wrong mark.
const PROMOTABLE_MARKS = new Set(['text', 'arc']);

export function promoteSpecMark<T>(spec: T): T {
  if (!spec || typeof spec !== 'object') return spec;
  const s = spec as unknown as AnySpec;
  const mark = currentMarkType(s);
  if (mark == null || !PROMOTABLE_MARKS.has(mark)) return spec;
  if (!hasEncodingPair(s)) return spec;

  // Promote to bar, stripping mark-type-specific options if present.
  let nextMark: string | AnySpec = 'bar';
  if (typeof s.mark === 'object' && s.mark !== null) {
    // Drop options that only make sense for the source mark type.
    const TEXT_ONLY = new Set([
      'fontSize', 'fontWeight', 'font', 'dx', 'dy', 'baseline', 'align',
      'lineBreak', 'lineHeight', 'ellipsis', 'dir',
    ]);
    const ARC_ONLY = new Set(['innerRadius', 'outerRadius', 'cornerRadius', 'padAngle', 'radius', 'theta', 'theta2']);
    const STRIP = mark === 'text' ? TEXT_ONLY : ARC_ONLY;
    const preserved: AnySpec = {};
    for (const [k, v] of Object.entries(s.mark as AnySpec)) {
      if (k === 'type') continue;
      if (STRIP.has(k)) continue;
      preserved[k] = v;
    }
    nextMark = { type: 'bar', ...preserved };
  }
  return { ...s, mark: nextMark } as unknown as T;
}

// Plan 7 T21 — naming patterns that almost always indicate a NOMINAL
// (string-valued) column. Summing these is nonsense; agent-generated
// specs occasionally do `sum(<nominal>)` which Vega silently reduces to
// null → every bar renders at height 0.
const NOMINAL_NAME_SUFFIXES = [
  '_type', '_name', '_category', '_role', '_segment', '_status',
  '_kind', '_group', '_level', '_label', '_class', '_state',
];

function looksLikeNominalName(field: string): boolean {
  const lower = field.toLowerCase();
  return NOMINAL_NAME_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

// Plan 7 T21 — repair an obviously-broken aggregate: y.aggregate='sum' on
// a field that is either (a) referenced as nominal elsewhere in the same
// spec, or (b) has a name that strongly implies a nominal column (ends in
// `_type`, `_name`, etc.). Either way summing collapses bars to zero.
//
// Fix: change the aggregate to `count` and drop the field. count(*) is
// type-agnostic and gives a sensible row-count bar — almost always what
// the user wanted when the agent-generated spec did `sum(<nominal>)`.
export function repairBadAggregate<T>(spec: T): T {
  if (!spec || typeof spec !== 'object') return spec;
  const s = spec as unknown as AnySpec;
  const enc = s.encoding as AnySpec | undefined;
  if (!enc || typeof enc !== 'object') return spec;
  const y = enc.y as AnySpec | undefined;
  if (!y || y.aggregate !== 'sum' || typeof y.field !== 'string') return spec;

  const targetField = y.field as string;
  // (a) Referenced as nominal/ordinal in a separate channel?
  const nominalChannels: Array<keyof typeof enc> = ['x', 'color', 'column', 'row', 'shape', 'detail'];
  let usedAsNominal = false;
  for (const key of nominalChannels) {
    const ch = enc[key] as AnySpec | undefined;
    if (!ch) continue;
    if (ch.field === targetField && (ch.type === 'nominal' || ch.type === 'ordinal')) {
      usedAsNominal = true;
      break;
    }
  }
  // (b) Name-pattern heuristic on the y field itself.
  const suspiciousName = looksLikeNominalName(targetField);

  if (!usedAsNominal && !suspiciousName) return spec;

  const nextY: AnySpec = { ...y };
  delete nextY.field;
  nextY.aggregate = 'count';
  // Keep the original y.type = 'quantitative' so the axis stays numeric.
  const nextEnc: AnySpec = { ...enc, y: nextY };
  return { ...s, encoding: nextEnc } as unknown as T;
}
