// frontend/src/components/dashboard/freeform/hooks/useAnalystProAutosave.js
import { useEffect, useRef } from 'react';
import { useStore } from '../../../../store';
import * as api from '../../../../api';

/**
 * Plan 7 T8 — autosave the authored Analyst Pro dashboard back to the
 * backend. Subscribes to `analystProDashboard` and debounces 1500 ms after
 * the last mutation, then PATCHes the server via `api.updateDashboard`.
 *
 * Payload (matches backend `dashboard_routes.UpdateDashboardBody` whitelist,
 * Plan 3 T9):
 *   { schemaVersion, archetype, size, tiledRoot, floatingLayer }
 *
 * Note: `analystProSheetFilters` (Plan 4a) is per-session UI state, NOT
 * persisted. It is intentionally NOT part of this payload.
 *
 * Edge cases:
 * - `dashboardId` is null / undefined → hook is inert (no subscription side
 *   effects fire, no PATCH).
 * - Payload unchanged vs. last sent → short-circuit (no PATCH).
 * - Unmount cancels any pending debounce timer.
 * - PATCH failure logged via console.warn; editor continues to work.
 */
export default function useAnalystProAutosave(dashboardId) {
  const dashboard = useStore((s) => s.analystProDashboard);
  const timer = useRef(null);
  const lastSerialized = useRef(null);

  useEffect(() => {
    if (!dashboardId || !dashboard) return undefined;

    const payload = {
      schemaVersion: dashboard.schemaVersion,
      archetype: dashboard.archetype,
      size: dashboard.size,
      tiledRoot: dashboard.tiledRoot,
      floatingLayer: dashboard.floatingLayer,
    };
    const serialized = JSON.stringify(payload);
    if (serialized === lastSerialized.current) return undefined;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastSerialized.current = serialized;
      try {
        const result = api.updateDashboard(dashboardId, payload);
        if (result && typeof result.catch === 'function') {
          result.catch((err) => {
            // Surface but don't throw — editor must keep working.
            // eslint-disable-next-line no-console
            console.warn('[Plan 7 T8] autosave failed', err);
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[Plan 7 T8] autosave threw', err);
      }
    }, 1500);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [dashboard, dashboardId]);
}
