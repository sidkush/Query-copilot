// frontend/src/components/dashboard/freeform/hooks/useZoneTree.js
import { useStore } from '../../../../store';

/**
 * Read-only zone tree hook for Plan 1.
 * Plan 2 extends with insert/remove/move/resize operations.
 */
export function useZoneTree() {
  const dashboard = useStore((s) => s.analystProDashboard);
  const setDashboard = useStore((s) => s.setAnalystProDashboard);
  const size = useStore((s) => s.analystProSize);
  const setSize = useStore((s) => s.setAnalystProSize);

  return {
    dashboard,
    setDashboard,
    size,
    setSize,
    tiledRoot: dashboard?.tiledRoot ?? null,
    floatingLayer: dashboard?.floatingLayer ?? [],
  };
}
