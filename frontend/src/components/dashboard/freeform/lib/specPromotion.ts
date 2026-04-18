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

// Plan 8 T22.2 — extend aggregate misuse detection to all numeric-only
// aggregates (mean/average/median/max/min) in addition to 'sum' (T21).
// Each one on a nominal field produces empty / nonsense marks.
const NUMERIC_AGGREGATES = new Set(['sum', 'mean', 'average', 'median', 'max', 'min']);

// Plan 7 T21 — repair an obviously-broken aggregate: y.aggregate='sum' on
// a field that is either (a) referenced as nominal elsewhere in the same
// spec, or (b) has a name that strongly implies a nominal column (ends in
// `_type`, `_name`, etc.). Either way summing collapses bars to zero.
//
// Plan 8 T22.2 — same fix extended to mean/avg/median/max/min.
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
  if (!y || typeof y.aggregate !== 'string' || !NUMERIC_AGGREGATES.has(y.aggregate as string)) return spec;
  if (typeof y.field !== 'string') return spec;

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

// =====================================================================
// Plan 8 T22 — additional repair passes.
// Each function is identity-preserving on a clean spec so useMemo
// short-circuits still work. Ordering inside repairSpec() matters:
// fallbackNullMark runs first so downstream passes see a real mark string.
// =====================================================================

// Plan 8 T22.1 — fallbackNullMark: default a missing / unknown mark. Also
// normalizes plural typos ('bars' → 'bar', etc.) that agent specs
// sometimes emit.
const KNOWN_MARKS = new Set([
  'bar', 'line', 'point', 'circle', 'square', 'tick', 'area', 'arc',
  'rect', 'rule', 'text', 'geoshape', 'trail', 'boxplot', 'errorbar',
  'errorband', 'image',
]);
const PLURAL_MARKS: Record<string, string> = {
  bars: 'bar', lines: 'line', points: 'point', circles: 'circle',
  squares: 'square', areas: 'area', arcs: 'arc', rects: 'rect',
  ticks: 'tick', texts: 'text', images: 'image',
};

export function fallbackNullMark<T>(spec: T): T {
  if (!spec || typeof spec !== 'object') return spec;
  const s = spec as unknown as AnySpec;
  const mark = currentMarkType(s);
  if (mark && KNOWN_MARKS.has(mark)) return spec;
  if (mark && PLURAL_MARKS[mark]) {
    return { ...s, mark: PLURAL_MARKS[mark] } as unknown as T;
  }
  // Missing or unknown: default by encoding shape.
  const fallback = hasEncodingPair(s) ? 'bar' : 'text';
  return { ...s, mark: fallback } as unknown as T;
}

// Plan 8 T22.3 — repairMissingMeasure: bar/line without y → inject count.
const MEASURE_MARKS = new Set(['bar', 'line', 'area']);

export function repairMissingMeasure<T>(spec: T): T {
  if (!spec || typeof spec !== 'object') return spec;
  const s = spec as unknown as AnySpec;
  const mark = currentMarkType(s);
  if (!mark || !MEASURE_MARKS.has(mark)) return spec;
  const enc = s.encoding as AnySpec | undefined;
  if (!enc || typeof enc !== 'object') return spec;
  if (enc.y) return spec;
  if (!enc.x) return spec; // nothing to measure against
  const nextEnc: AnySpec = {
    ...enc,
    y: { aggregate: 'count', type: 'quantitative' },
  };
  return { ...s, encoding: nextEnc } as unknown as T;
}

// Plan 8 T22.4 — repairColorTypeForMeasure: when color.field === y.field
// (the measure), a `nominal` color produces one entry per row — the T18
// "legend of raw numbers" symptom. Swap color.type to quantitative so
// Vega emits a continuous colour scale instead of a 50-entry legend.
export function repairColorTypeForMeasure<T>(spec: T): T {
  if (!spec || typeof spec !== 'object') return spec;
  const s = spec as unknown as AnySpec;
  const enc = s.encoding as AnySpec | undefined;
  if (!enc) return spec;
  const color = enc.color as AnySpec | undefined;
  const y = enc.y as AnySpec | undefined;
  if (!color || !y) return spec;
  if (color.type !== 'nominal') return spec;
  if (typeof color.field !== 'string' || typeof y.field !== 'string') return spec;
  if (color.field !== y.field) return spec;
  if (y.type !== 'quantitative') return spec;
  const nextEnc: AnySpec = { ...enc, color: { ...color, type: 'quantitative' } };
  return { ...s, encoding: nextEnc } as unknown as T;
}

// Plan 8 T22.5 — capColorCardinality: nominal color with > 20 distinct
// values on the data field consumes the whole chart with an unreadable
// legend. Drop the channel as a safe fallback when we can measure the
// cardinality from an inline data sample.
const COLOR_CARDINALITY_LIMIT = 20;

export function capColorCardinality<T>(spec: T): T {
  if (!spec || typeof spec !== 'object') return spec;
  const s = spec as unknown as AnySpec;
  const enc = s.encoding as AnySpec | undefined;
  const color = enc?.color as AnySpec | undefined;
  if (!enc || !color) return spec;
  if (color.type !== 'nominal' && color.type !== 'ordinal') return spec;
  const field = color.field;
  if (typeof field !== 'string') return spec;
  const data = s.data as AnySpec | undefined;
  const values = data && Array.isArray((data as { values?: unknown[] }).values)
    ? (data as { values: AnySpec[] }).values
    : null;
  if (!values) return spec;
  const distinct = new Set<unknown>();
  for (const row of values) {
    distinct.add((row as AnySpec)[field]);
    if (distinct.size > COLOR_CARDINALITY_LIMIT) break;
  }
  if (distinct.size <= COLOR_CARDINALITY_LIMIT) return spec;
  const nextEnc: AnySpec = { ...enc };
  delete nextEnc.color;
  return { ...s, encoding: nextEnc } as unknown as T;
}

// Plan 8 T22.6 — repairSpec: master pipeline composing every pass.
// Order matters: fallbackNullMark normalizes mark first so promoteSpecMark
// sees a real mark string; repairBadAggregate rewrites y before
// repairMissingMeasure would have injected a redundant count; color repairs
// run after measure repairs so they see the final y.
export function repairSpec<T>(spec: T, ctx?: unknown): T {
  void ctx; // reserved for future passes needing data context
  if (!spec || typeof spec !== 'object') return spec;
  let s: T = spec;
  s = fallbackNullMark(s);
  s = promoteSpecMark(s);
  s = repairBadAggregate(s);
  s = repairMissingMeasure(s);
  s = repairColorTypeForMeasure(s);
  s = capColorCardinality(s);
  return s;
}
