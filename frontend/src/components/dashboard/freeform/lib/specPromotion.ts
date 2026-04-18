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

export function promoteSpecMark<T>(spec: T): T {
  if (!spec || typeof spec !== 'object') return spec;
  const s = spec as unknown as AnySpec;
  const mark = currentMarkType(s);
  if (mark !== 'text') return spec;
  if (!hasEncodingPair(s)) return spec;

  // Promote to bar, stripping text-only mark options if present.
  let nextMark: string | AnySpec = 'bar';
  if (typeof s.mark === 'object' && s.mark !== null) {
    // Preserve only generic options; drop text-specific options like
    // fontSize, dx, dy, baseline, align, fontWeight, font.
    const TEXT_ONLY = new Set([
      'fontSize', 'fontWeight', 'font', 'dx', 'dy', 'baseline', 'align',
      'lineBreak', 'lineHeight', 'ellipsis', 'dir',
    ]);
    const preserved: AnySpec = {};
    for (const [k, v] of Object.entries(s.mark as AnySpec)) {
      if (k === 'type') continue;
      if (TEXT_ONLY.has(k)) continue;
      preserved[k] = v;
    }
    nextMark = { type: 'bar', ...preserved };
  }
  return { ...s, mark: nextMark } as unknown as T;
}
