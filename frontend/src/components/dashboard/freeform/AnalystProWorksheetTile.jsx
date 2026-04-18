import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import DashboardTileCanvas from '../lib/DashboardTileCanvas';
import { api } from '../../../api';
import { useStore } from '../../../store';
import { applyHighlightToSpec, mergeMarkIntoHighlight } from './lib/highlightFilter';
import { repairSpec } from './lib/specPromotion';
import { publish as publishMarkEvent } from './lib/markEventBus';
import ChartTooltipCard from './ChartTooltipCard';

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
// Plan 5d T7: fitMode → Vega-Lite autosize via spec override. If the
// rendered tile is not on the Vega-Lite path (e.g. VizQL experimental),
// autosize is harmless metadata that Phase 7a will consume.
function fitModeToAutosize(fitMode) {
  switch (fitMode) {
    case 'fit':        return { type: 'fit',   contains: 'padding' };
    case 'fit-width':  return { type: 'fit-x', contains: 'padding' };
    case 'fit-height': return { type: 'fit-y', contains: 'padding' };
    case 'entire':     return { type: 'fit',   contains: 'content' };
    case 'fixed':      return { type: 'pad',   contains: 'padding' };
    // Plan 7 T15 — when the zone has no explicit fitMode, default to
    // autosize:fit so Vega reflows the chart to the cell's pixel rect
    // instead of rendering at its natural 280 px and overflow-clipping.
    default:           return { type: 'fit',   contains: 'padding' };
  }
}

export default function AnalystProWorksheetTile({ tile, sheetId, onTileClick, fitMode }) {
  const filters = useStore((s) => s.analystProSheetFilters[sheetId] || null);
  const parameters = useStore((s) => s.analystProDashboard?.parameters || null);
  const cascadeToken = useStore((s) => s.analystProActionCascadeToken);
  const markStatus = useStore((s) => s.markCascadeTargetStatus);
  const connId = useStore((s) => s.activeConnId);
  const highlight = useStore((s) => s.analystProSheetHighlights[sheetId] || null);
  const setSheetHighlight = useStore((s) => s.setSheetHighlightAnalystPro);
  const clearSheetHighlight = useStore((s) => s.clearSheetHighlightAnalystPro);
  const setSheetFilter = useStore((s) => s.setSheetFilterAnalystPro);
  const openViewDataDrawer = useStore((s) => s.openViewDataDrawer);

  const [hover, setHover] = useState(null); // { datum, x, y } | null
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

  const autosize = fitModeToAutosize(fitMode);
  const decoratedTile = useMemo(() => {
    if (!tile) return tile;
    const baseSpec = tile.chart_spec || tile.chartSpec;
    if (!baseSpec) return tile;
    let nextSpec = baseSpec;
    // Plan 8 T22.7 — single repair-pipeline call covering every bad-spec
    // case the agent can emit: null / unknown / typo marks, text+xy and
    // arc+xy mark mismatches, sum/mean/max/min on nominal fields, bar or
    // line without a y measure, nominal color on the measure field, and
    // high-cardinality nominal color channels. See
    // docs/superpowers/plans/2026-04-18-analyst-pro-plan-8-chart-robustness.md
    // for the full failure-mode catalog.
    nextSpec = repairSpec(nextSpec);
    if (autosize) nextSpec = { ...nextSpec, autosize };
    nextSpec = applyHighlightToSpec(nextSpec, highlight);
    if (nextSpec === baseSpec) return tile;
    const next = { ...tile };
    if (tile.chart_spec) next.chart_spec = nextSpec;
    if (tile.chartSpec && !tile.chart_spec) next.chartSpec = nextSpec;
    return next;
  }, [tile, autosize, highlight]);

  const warnedKeysRef = useRef(new Set());
  useEffect(() => {
    if (!highlight || typeof highlight !== 'object') return;
    const isProd = !!(import.meta.env && import.meta.env.PROD);
    if (isProd) return;
    const cols =
      (override?.columns && override.columns.length > 0 && override.columns) ||
      tile?.chart_spec?.columns ||
      tile?.columns ||
      [];
    if (!Array.isArray(cols) || cols.length === 0) return;
    const colsLower = new Set(cols.map((c) => String(c).toLowerCase()));
    for (const field of Object.keys(highlight)) {
      const key = `${sheetId}::${field}`;
      if (warnedKeysRef.current.has(key)) continue;
      if (!colsLower.has(field.toLowerCase())) {
        warnedKeysRef.current.add(key);
        console.warn(
          `[Plan 6d] highlight field "${field}" not in tile columns for sheet "${sheetId}" — ` +
          `re-query path not yet implemented (deferred to Plan 6e/7a). Mask shows nothing.`,
        );
      }
    }
  }, [highlight, override, tile, sheetId]);

  const handleMarkSelect = useCallback((selSheetId, fields, opts) => {
    if (!selSheetId) return;
    if (fields === null) {
      clearSheetHighlight(selSheetId);
      publishMarkEvent({
        sourceSheetId: selSheetId,
        trigger: 'select',
        markData: {},
        timestamp: Date.now(),
      });
      return;
    }
    const next = mergeMarkIntoHighlight(highlight, fields, !!opts?.shiftKey);
    if (next === null) clearSheetHighlight(selSheetId);
    else setSheetHighlight(selSheetId, next);
    publishMarkEvent({
      sourceSheetId: selSheetId,
      trigger: 'select',
      markData: fields,
      timestamp: Date.now(),
    });
  }, [highlight, setSheetHighlight, clearSheetHighlight]);

  const handleMarkHover = useCallback((selSheetId, datum, x, y) => {
    if (!selSheetId || !datum) return;
    setHover({ datum, x, y });
  }, []);

  const closeTooltip = useCallback(() => setHover(null), []);

  const appendFilter = useCallback(
    (op, datum) => {
      if (!datum) return;
      const current = Array.isArray(filters) ? filters : [];
      const next = [...current];
      for (const [field, value] of Object.entries(datum)) {
        if (value == null) continue;
        next.push({ field, op, values: [value] });
      }
      setSheetFilter(sheetId, next);
      setHover(null);
    },
    [filters, sheetId, setSheetFilter],
  );

  const handleKeepOnly = useCallback((datum) => appendFilter('in', datum), [appendFilter]);
  const handleExclude = useCallback((datum) => appendFilter('notIn', datum), [appendFilter]);

  const handleViewData = useCallback(
    (datum) => {
      openViewDataDrawer({
        sheetId,
        connId,
        sql: tile?.sql,
        markSelection: datum,
      });
      setHover(null);
    },
    [sheetId, connId, tile?.sql, openViewDataDrawer],
  );

  return (
    <>
      <DashboardTileCanvas
        tile={decoratedTile}
        onTileClick={onTileClick}
        resultSetOverride={override}
        sheetId={sheetId}
        onMarkSelect={handleMarkSelect}
        onMarkHover={handleMarkHover}
        /* Plan 7 T20 — Analyst Pro dashboards can be 6–10k px tall. Briefing
         * / Workbench / Pitch default to unmount-on-scroll-out for the
         * 500-tile perf path; here the user expects every tile to stay
         * readable while they scroll, so mount once and keep. */
        mountOnce={true}
      />
      <ChartTooltipCard
        open={!!hover}
        x={hover?.x ?? 0}
        y={hover?.y ?? 0}
        datum={hover?.datum ?? null}
        onKeepOnly={handleKeepOnly}
        onExclude={handleExclude}
        onViewData={handleViewData}
        onClose={closeTooltip}
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
