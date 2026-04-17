import { useEffect, useRef, useState } from 'react';
import DashboardTileCanvas from '../lib/DashboardTileCanvas';
import { api } from '../../../api';
import { useStore } from '../../../store';

/**
 * AnalystProWorksheetTile — wraps DashboardTileCanvas so a per-sheet entry
 * in `analystProSheetFilters` triggers a re-execution of the tile's SQL
 * with `additional_filters` injected. When the slice is empty for this
 * sheet, the wrapper passes no override and the tile renders from its own
 * persisted rows.
 *
 * Plan 4a scope: filter-only. Highlight semantics are visual-only and
 * handled elsewhere.
 */
export default function AnalystProWorksheetTile({ tile, sheetId, onTileClick }) {
  const filters = useStore(
    (s) => s.analystProSheetFilters[sheetId] || null,
  );
  const cascadeToken = useStore((s) => s.analystProActionCascadeToken);
  const markStatus = useStore((s) => s.markCascadeTargetStatus);
  const connId = useStore((s) => s.activeConnId);

  const [override, setOverride] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!filters || filters.length === 0 || !tile?.sql) {
      setOverride(null);
      setErrorMsg(null);
      return undefined;
    }

    const seq = ++requestSeqRef.current;
    const tokenAtFire = cascadeToken;
    let cancelled = false;

    (async () => {
      try {
        const resp = await api.executeSQL(
          tile.sql,
          tile.question || '',
          connId,
          null,
          filters,
        );
        if (cancelled || seq !== requestSeqRef.current) return;
        setOverride({
          columns: Array.isArray(resp?.columns) ? resp.columns : [],
          rows: Array.isArray(resp?.rows) ? resp.rows : [],
          columnProfile: Array.isArray(resp?.columnProfile)
            ? resp.columnProfile
            : [],
        });
        setErrorMsg(null);
        markStatus(sheetId, 'done', tokenAtFire);
      } catch (err) {
        if (cancelled || seq !== requestSeqRef.current) return;
        setErrorMsg(err?.message || 'Filter query failed');
        markStatus(sheetId, 'error', tokenAtFire);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters array identity covers all inputs
  }, [filters, sheetId, tile?.sql, tile?.question, connId]);

  return (
    <>
      <DashboardTileCanvas
        tile={tile}
        onTileClick={onTileClick}
        resultSetOverride={override}
      />
      {errorMsg ? (
        <div
          data-testid={`analyst-pro-worksheet-error-${sheetId}`}
          style={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            fontSize: 10,
            color: 'var(--danger, #f87171)',
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 6px',
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        >
          {errorMsg}
        </div>
      ) : null}
    </>
  );
}
