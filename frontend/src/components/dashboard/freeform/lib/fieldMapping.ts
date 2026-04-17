import type { FieldMappingEntry, SetRefMarker } from './actionTypes';

export function resolveFilters(
  mapping: FieldMappingEntry[],
  markData: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of mapping) {
    if ('setRef' in m) {
      const marker: SetRefMarker = { __setRef: m.setRef };
      out[m.target] = marker;
      continue;
    }
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
  mapping: FieldMappingEntry[],
  events: Record<string, unknown>[],
): (string | number)[] {
  if (mapping.length === 0) return [];
  const first = mapping[0];
  if (!('source' in first)) return [];   // setRef mapping is not valid for ChangeSet actions
  const sourceField = first.source;
  const seen = new Set<string | number>();
  for (const ev of events) {
    const v = ev[sourceField];
    if (typeof v === 'string' || typeof v === 'number') seen.add(v);
  }
  return [...seen];
}
