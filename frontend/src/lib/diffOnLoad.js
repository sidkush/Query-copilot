/**
 * diffOnLoad — per-dashboard-per-tile snapshot + delta primitive.
 *
 * Stores "last seen" metric values in localStorage so the next dashboard
 * load can tell what changed since the user was away. Also feeds the hot
 * metric detector and the diff-on-load banner.
 *
 * Storage shape: { [tileId]: { value: number, ts: number } }
 * Keyed per-dashboard so two dashboards don't collide on tile IDs.
 *
 * Failure mode: localStorage throws (quota, private mode) → silent no-op.
 * Never throw from a snapshot call. The feature is nice-to-have; it must
 * NEVER break the dashboard render path.
 */

const KEY_PREFIX = 'askdb.diffOnLoad.';

function readStore(dashboardId) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + dashboardId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(dashboardId, obj) {
  try {
    localStorage.setItem(KEY_PREFIX + dashboardId, JSON.stringify(obj));
  } catch {
    // quota exceeded or private-mode localStorage — fail silently
  }
}

/** Record the current value of a tile for future delta comparison. */
export function snapshotTile(dashboardId, tileId, value) {
  if (!dashboardId || !tileId) return;
  const num = Number(value);
  if (!isFinite(num)) return;
  const store = readStore(dashboardId);
  store[tileId] = { value: num, ts: Date.now() };
  writeStore(dashboardId, store);
}

/**
 * Compare current value to the last stored snapshot for this tile.
 * Returns percentage delta (signed), or null if:
 *   - no prior snapshot exists (first visit)
 *   - previous value was zero (division-by-zero guard)
 *   - either value fails numeric coercion
 */
export function diffSnapshot(dashboardId, tileId, currentValue) {
  if (!dashboardId || !tileId) return null;
  const store = readStore(dashboardId);
  const prev = store[tileId];
  if (!prev) return null;
  const p = Number(prev.value);
  const c = Number(currentValue);
  if (!isFinite(p) || !isFinite(c) || p === 0) return null;
  return ((c - p) / Math.abs(p)) * 100;
}

/** Get the timestamp of the last snapshot for a tile (ms since epoch, or null). */
export function snapshotAge(dashboardId, tileId) {
  if (!dashboardId || !tileId) return null;
  const store = readStore(dashboardId);
  return store[tileId]?.ts ?? null;
}

/** Clear snapshots for one dashboard, or ALL dashboards if id omitted. */
export function clearSnapshots(dashboardId) {
  try {
    if (dashboardId) {
      localStorage.removeItem(KEY_PREFIX + dashboardId);
    } else {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(KEY_PREFIX)) localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
}
