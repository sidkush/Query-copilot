import { api } from '../api';

/**
 * tileSurvivalTelemetry — thin fire-and-forget wrappers over the
 * /dashboards/audit/tile-event endpoint.
 *
 * Engagement signal for the falsifiable Phase 2 claim: "dense tiles
 * survive 24h > 70% of the time". Used later to compute
 *   survival_rate = 1 - (deleted_within_24h / created)
 * per chart family from the audit JSONL log.
 *
 * Telemetry MUST NOT throw — every call is wrapped in try/catch.
 * A broken network / logged-out session must never break tile CRUD.
 */

const SURVIVED_KEY = 'askdb.tileSurvivalEmitted';

function readEmitted() {
  try {
    return JSON.parse(localStorage.getItem(SURVIVED_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeEmitted(obj) {
  try {
    localStorage.setItem(SURVIVED_KEY, JSON.stringify(obj));
  } catch {
    // quota / private mode — ignore
  }
}

export async function emitTileCreated(dashboardId, tileId, chartType) {
  if (!dashboardId || !tileId) return;
  try {
    await api.auditTileEvent({
      event: 'tile_created',
      dashboardId,
      tileId,
      chartType: chartType || null,
    });
  } catch {
    // fire and forget
  }
}

export async function emitTileDeleted(dashboardId, tileId, chartType, ageMs) {
  if (!dashboardId || !tileId) return;
  try {
    await api.auditTileEvent({
      event: 'tile_deleted',
      dashboardId,
      tileId,
      chartType: chartType || null,
      ageMs: Number.isFinite(ageMs) ? Math.max(0, Math.floor(ageMs)) : null,
    });
  } catch {
    // ignore
  }
}

/**
 * Emit a "survived 24h" event for any tile older than 24h since its
 * createdAt timestamp. Deduplicated per-tile via localStorage so
 * reloading the dashboard doesn't spam the audit log.
 *
 * Call this on dashboard mount, passing the full tile list.
 */
export async function emitTilesSurvived24h(dashboardId, tiles) {
  if (!dashboardId || !Array.isArray(tiles) || tiles.length === 0) return;
  const emitted = readEmitted();
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  let dirty = false;

  for (const tile of tiles) {
    if (!tile?.id || emitted[tile.id]) continue;
    const createdAt = Number(tile.createdAt) || 0;
    if (!createdAt || now - createdAt < TWENTY_FOUR_HOURS) continue;
    try {
      await api.auditTileEvent({
        event: 'tile_survived_24h',
        dashboardId,
        tileId: tile.id,
        chartType: tile.chartType || null,
      });
      emitted[tile.id] = now;
      dirty = true;
    } catch {
      // ignore — try again next load
    }
  }

  if (dirty) writeEmitted(emitted);
}
