interface Zone { id: string; children?: Zone[]; [key: string]: unknown }
interface Dashboard { tiledRoot?: Zone; floatingLayer?: Zone[] }

export interface ZoneDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

function collectZoneMap(dash: Dashboard | null | undefined): Map<string, Zone> {
  const map = new Map<string, Zone>();
  if (!dash) return map;
  const walk = (z: Zone | undefined) => {
    if (!z) return;
    map.set(z.id, z);
    if (Array.isArray(z.children)) z.children.forEach(walk);
  };
  walk(dash.tiledRoot);
  for (const f of dash.floatingLayer || []) walk(f);
  return map;
}

export function diffDashboardZones(
  prev: Dashboard | null,
  next: Dashboard | null,
): ZoneDiff {
  if (!prev || !next) return { added: [], removed: [], modified: [] };
  const prevMap = collectZoneMap(prev);
  const nextMap = collectZoneMap(next);
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  for (const [id, zn] of nextMap) {
    const zp = prevMap.get(id);
    if (!zp) added.push(id);
    else if (zp !== zn) modified.push(id);
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) removed.push(id);
  }
  return { added, removed, modified };
}
