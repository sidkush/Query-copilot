export function resolveFilters(
  mapping: { source: string; target: string }[],
  markData: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of mapping) {
    if (m.source in markData) out[m.target] = markData[m.source];
  }
  return out;
}

export function substituteUrlTemplate(
  template: string,
  markData: Record<string, unknown>,
): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const v = markData[key];
    return v == null ? '' : encodeURIComponent(String(v));
  });
}

export function extractSetMembers(
  mapping: { source: string; target: string }[],
  events: Record<string, unknown>[],
): (string | number)[] {
  if (mapping.length === 0) return [];
  const sourceField = mapping[0].source;
  const seen = new Set<string | number>();
  for (const ev of events) {
    const v = ev[sourceField];
    if (typeof v === 'string' || typeof v === 'number') seen.add(v);
  }
  return [...seen];
}
