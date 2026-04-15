import { createContext, useContext, useMemo, useState } from "react";

/**
 * workbookFilterContext — shared filter bar state for the Workbook
 * archetype. Every tile inside a WorkbookLayout can subscribe via
 * `useWorkbookFilters()` and re-run its SQL with an extra `where`
 * clause appended from the filter array.
 *
 * Filter shape:
 *   { id: string, field: string, op: '=' | '!=' | 'in' | '>=' | '<=', value: unknown }
 *
 * Producer (filter bar) uses `setFilters(next)` / `addFilter(f)` /
 * `removeFilter(id)` / `clearFilters()`. Consumers (tile canvas) read
 * `filters` directly. The Phase 4c dev surface just reads the list for
 * display; real tile SQL blending integrates in Phase 4c+1 once the
 * `refreshTile` call is wired through DashboardTileCanvas.
 */
const WorkbookFilterContext = createContext({
  filters: [],
  setFilters: () => {},
  addFilter: () => {},
  removeFilter: () => {},
  clearFilters: () => {},
});

export function WorkbookFilterProvider({ children, initialFilters = [] }) {
  const [filters, setFilters] = useState(initialFilters);

  const api = useMemo(
    () => ({
      filters,
      setFilters,
      addFilter: (filter) =>
        setFilters((cur) => {
          const id = filter.id || `f-${cur.length + 1}`;
          return [...cur, { ...filter, id }];
        }),
      removeFilter: (id) =>
        setFilters((cur) => cur.filter((f) => f.id !== id)),
      clearFilters: () => setFilters([]),
    }),
    [filters],
  );

  return (
    <WorkbookFilterContext.Provider value={api}>
      {children}
    </WorkbookFilterContext.Provider>
  );
}

export function useWorkbookFilters() {
  return useContext(WorkbookFilterContext);
}
