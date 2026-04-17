import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardTileCanvas from '../lib/DashboardTileCanvas';
import { api } from '../../../api';
import { useStore } from '../../../store';

const TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function hasTokens(sql) {
  if (typeof sql !== 'string' || sql.length === 0) return false;
  if (!sql.includes('{{')) return false;
  // Reset lastIndex since TOKEN_RE has the /g flag.
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(sql);
}

/**
 * AnalystProWorksheetTile — wraps DashboardTileCanvas so that a per-sheet
 * filter entry in analystProSheetFilters triggers a re-execution of the
 * tile's SQL with `additional_filters` injected. Plan 4c extends this so
 * a parameter change (analystProDashboard.parameters) also triggers a
 * re-query IF the tile SQL contains at least one {{token}}.
 */
export default function AnalystProWorksheetTile({ tile, sheetId, onTileClick }) {
  const filters = useStore((s) => s.analystProSheetFilters[sheetId] || null);
  const parameters = useStore((s) => s.analystProDashboard?.parameters || null);
  const cascadeToken = useStore((s) => s.analystProActionCascadeToken);
  const markStatus = useStore((s) => s.markCascadeTargetStatus);
  const connId = useStore((s) => s.activeConnId);

  const [override, setOverride] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const requestSeqRef = useRef(0);

  const tileHasTokens = useMemo(() => hasTokens(tile?.sql), [tile?.sql]);

  useEffect(() => {
    const filtersActive = Array.isArray(filters) && filters.length > 0;
    const paramsActive =
      tileHasTokens && Array.isArray(parameters) && parameters.length > 0;
    if ((!filtersActive && !paramsActive) || !tile?.sql) {
      setOverride(null);
      setErrorMsg(null);
      return;
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
          filtersActive ? filters : null,
          paramsActive ? parameters : null,
        );
        if (cancelled || seq !== requestSeqRef.current) return;
        setOverride({
          columns: Array.isArray(resp?.columns) ? resp.columns : [],
          rows: Array.isArray(resp?.rows) ? resp.rows : [],
          columnProfile: Array.isArray(resp?.columnProfile) ? resp.columnProfile : [],
        });
        setErrorMsg(null);
        markStatus(sheetId, 'done', tokenAtFire);
      } catch (err) {
        if (cancelled || seq !== requestSeqRef.current) return;
        setErrorMsg(err?.message || 'Tile re-query failed');
        markStatus(sheetId, 'error', tokenAtFire);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, parameters, tileHasTokens, sheetId, tile?.sql, tile?.question, connId]);

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
            bottom: 6, right: 6, fontSize: 10,
            color: 'var(--danger, #f87171)',
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 6px', borderRadius: 4,
            pointerEvents: 'none',
          }}
        >
          {errorMsg}
        </div>
      ) : null}
    </>
  );
}
