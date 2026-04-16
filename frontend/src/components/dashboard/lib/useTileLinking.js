import { useState, useCallback } from 'react';

/**
 * useTileLinking — manages brush-to-detail cross-tile filtering.
 *
 * Usage in DashboardShell:
 *   const { linkConfig, onBrush, getFiltersForTile } = useTileLinking();
 *
 * linkConfig: Map<sourceTileId, { detailTileIds: string[], field: string }>
 * onBrush: (sourceTileId, field, range) => void — called by source tile's VegaRenderer
 * getFiltersForTile: (tileId) => [{field, op, value}] | null — detail tile reads its active filters
 *
 * Brush flow:
 *   1. A "source" tile has an interval selection on its Vega-Lite spec.
 *   2. VegaRenderer fires onBrush(sourceTileId, field, [lo, hi]) when the
 *      user drags a selection, or onBrush(sourceTileId, field, null) when the
 *      brush is cleared.
 *   3. useTileLinking translates the brush range into a pair of comparison
 *      filters ({ field, op: '>=', value: lo }, { field, op: '<=', value: hi })
 *      and pushes them to every registered detail tile's filter slot.
 *   4. DashboardShell passes getFiltersForTile down so detail tiles can call
 *      batchRefreshTiles with the active brush range appended to backend filters.
 *
 * Link lifecycle:
 *   addLink(sourceTileId, detailTileIds, field) — register a source → detail(s) link
 *   removeLink(sourceTileId)                     — tear down a link and clear detail filters
 */
export default function useTileLinking() {
  const [linkConfig, setLinkConfig] = useState(new Map());
  const [activeFilters, setActiveFilters] = useState(new Map());

  const addLink = useCallback((sourceTileId, detailTileIds, field) => {
    setLinkConfig(prev => {
      const next = new Map(prev);
      next.set(sourceTileId, { detailTileIds, field });
      return next;
    });
  }, []);

  const removeLink = useCallback((sourceTileId) => {
    setLinkConfig(prev => {
      const config = prev.get(sourceTileId);
      if (!config) return prev;

      // Clear filters on all former detail tiles before removing the link.
      setActiveFilters(filterPrev => {
        const filterNext = new Map(filterPrev);
        for (const tid of config.detailTileIds) {
          filterNext.delete(tid);
        }
        return filterNext;
      });

      const next = new Map(prev);
      next.delete(sourceTileId);
      return next;
    });
  }, []);

  const onBrush = useCallback((sourceTileId, field, range) => {
    setLinkConfig(prev => {
      const config = prev.get(sourceTileId);
      if (!config) return prev; // no link registered for this source tile

      const filter = range
        ? [
            { field: config.field, op: '>=', value: range[0] },
            { field: config.field, op: '<=', value: range[1] },
          ]
        : null; // null = brush cleared

      setActiveFilters(filterPrev => {
        const filterNext = new Map(filterPrev);
        for (const tid of config.detailTileIds) {
          if (filter) {
            filterNext.set(tid, filter);
          } else {
            filterNext.delete(tid);
          }
        }
        return filterNext;
      });

      return prev; // linkConfig itself is unchanged
    });
  }, []);

  const getFiltersForTile = useCallback((tileId) => {
    return activeFilters.get(tileId) || null;
  }, [activeFilters]);

  /**
   * Flattened, de-duped list of every active brush-pushed filter across all
   * detail tiles. Each entry: { id, tileId, field, op, value }. Consumed by
   * layouts (e.g. AnalystWorkbenchLayout) that render a chip row showing
   * cross-filter state.
   */
  const allActiveFilters = [];
  const seenKeys = new Set();
  for (const [tileId, filters] of activeFilters.entries()) {
    for (const f of filters) {
      const key = `${f.field}|${f.op}|${f.value}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      allActiveFilters.push({ id: `${tileId}:${key}`, tileId, ...f });
    }
  }

  return {
    linkConfig,
    addLink,
    removeLink,
    onBrush,
    getFiltersForTile,
    allActiveFilters,
  };
}
