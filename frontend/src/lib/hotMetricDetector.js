import { diffSnapshot } from './diffOnLoad';

/**
 * hotMetricDetector — pure function that classifies each tile by
 * "heat" based on its delta-vs-previous-visit.
 *
 * Heat bands:
 *   cold          — |delta| < 5% (or no prior snapshot)
 *   warm          — 5% <= |delta| < 10%  (subtle border tint, no animation)
 *   warm-negative — same range, negative direction
 *   hot           — |delta| >= 10% AND top-3 by magnitude, positive direction
 *   hot-negative  — same, negative direction
 *
 * Cap of 3 simultaneously hot tiles prevents dashboard-wide jitter.
 * Remaining qualifiers fall back to warm. Acknowledged tiles (user
 * hovered for 2s / clicked / scrolled past) decay to warm for the
 * remainder of the session.
 *
 * This function is called from Dashboard.jsx on tile-data change
 * and writes the result into useStore.tileHeatMap. TileWrapper reads
 * its own heat via a selector so a tile re-renders only when its
 * own heat changes.
 */

const WARM_MIN_PCT = 5;
const HOT_MIN_PCT = 10;
const MAX_HOT = 3;
const ACK_KEY_PREFIX = 'askdb.hotAck.';

function readAcks(dashboardId) {
  try {
    const raw = localStorage.getItem(ACK_KEY_PREFIX + dashboardId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAcks(dashboardId, obj) {
  try {
    localStorage.setItem(ACK_KEY_PREFIX + dashboardId, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

/**
 * Returns `{ [tileId]: heat }` where heat is one of:
 *   'cold' | 'warm' | 'warm-negative' | 'hot' | 'hot-negative'
 */
export function detectHotMetrics(dashboardId, tiles) {
  if (!dashboardId || !Array.isArray(tiles) || tiles.length === 0) return {};

  // Session-start timestamp — ack made before this session should NOT
  // count (user gets fresh signals each time they reopen the app).
  if (typeof window !== 'undefined' && !window.__askdbSessionStart__) {
    window.__askdbSessionStart__ = Date.now();
  }
  const sessionStart = (typeof window !== 'undefined' && window.__askdbSessionStart__) || 0;
  const acks = readAcks(dashboardId);

  const scored = tiles.map((t) => {
    const valueCol = t.columns?.[1] || t.columns?.[0];
    const latestRow = t.rows?.[t.rows.length - 1];
    if (!latestRow || !valueCol || !t.id) {
      return { tileId: t.id, absDelta: 0, delta: 0, acked: true };
    }
    const currentValue = Number(latestRow[valueCol]);
    if (!isFinite(currentValue)) {
      return { tileId: t.id, absDelta: 0, delta: 0, acked: true };
    }
    const delta = diffSnapshot(dashboardId, t.id, currentValue);
    if (delta === null) {
      return { tileId: t.id, absDelta: 0, delta: 0, acked: true };
    }
    const ackedAt = acks[t.id] || 0;
    const acked = ackedAt >= sessionStart;
    return { tileId: t.id, absDelta: Math.abs(delta), delta, acked };
  });

  // Top-3 hot among unacknowledged qualifiers
  const hotSet = new Set(
    scored
      .filter((d) => d.absDelta >= HOT_MIN_PCT && !d.acked)
      .sort((a, b) => b.absDelta - a.absDelta)
      .slice(0, MAX_HOT)
      .map((d) => d.tileId)
  );

  const result = {};
  for (const d of scored) {
    if (!d.tileId) continue;
    if (hotSet.has(d.tileId)) {
      result[d.tileId] = d.delta >= 0 ? 'hot' : 'hot-negative';
    } else if (d.absDelta >= WARM_MIN_PCT && !d.acked) {
      result[d.tileId] = d.delta >= 0 ? 'warm' : 'warm-negative';
    } else {
      result[d.tileId] = 'cold';
    }
  }
  return result;
}

/** Mark a tile as acknowledged for the rest of the session. */
export function acknowledgeTile(dashboardId, tileId) {
  if (!dashboardId || !tileId) return;
  const acks = readAcks(dashboardId);
  acks[tileId] = Date.now();
  writeAcks(dashboardId, acks);
}

/** Clear acknowledgments — used by tests and reset flows. */
export function clearAcks(dashboardId) {
  try {
    if (dashboardId) {
      localStorage.removeItem(ACK_KEY_PREFIX + dashboardId);
    } else {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(ACK_KEY_PREFIX)) localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
}
