import { useMemo, useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../../../store";
import EditorCanvas from "../../editor/EditorCanvas";
import useViewportMount from "../../../lib/useViewportMount";
import TextTile from "../TextTile";
import InsightTile from "../InsightTile";
import ActivityTile from "../ActivityTile";
import { SPRINGS } from "../motion";
import { TOKENS } from "../tokens";

/**
 * DashboardTileCanvas — tile-sized ChartEditor view.
 *
 * Dashboard layouts (Briefing, Workbench, Pitch, Story, Workbook) mount
 * a miniature ChartEditor per tile. A full 3-pane ChartEditor (topbar +
 * data rail + inspector + dock) doesn't fit inside a 300×200 tile, so
 * we render EditorCanvas directly with a lightweight title bar on top.
 * This keeps every new-path tile flowing through the same VegaRenderer
 * / MapLibreRenderer / DeckRenderer dispatch as the full editor — no
 * ECharts, no legacy ResultsChart.
 *
 * Tile shape (accepts both):
 *   - New:    { id, title, chart_spec, columns?, rows? }
 *   - Legacy: { id, title, chartType, columns, rows }   (migration leaves
 *             legacy fields alongside chart_spec; rollback can still
 *             read them via the old path)
 *
 * For legacy tiles, we build a resultSet = {columns, rows, columnProfile:[]}
 * from the legacy columns/rows fields. Vega infers types from data when
 * no columnProfile is present.
 *
 * Props:
 *   - tile              the tile object
 *   - height            CSS height (default 100%)
 *   - showTitleBar      boolean (default true)
 *   - onTileClick       (tile) => void — click the canvas body to open
 *                       the full ChartEditor in a drawer (Phase 4c+1).
 *   - onDrillthrough    optional override; when omitted the canvas handles
 *                       drillthrough itself (scroll to target + toast).
 *   - onTileUpdate      (updates) => void — called when a content tile
 *                       (text/insight) saves inline edits.
 *   - onInsightRefresh   () => Promise<void> — regenerate AI insight
 */

// SP-3: Rich content tile types that bypass the ChartEditor path.
const RICH_TILE_TYPES = new Set(["text", "markdown", "insight", "ai_summary", "activity"]);

function getRichTileType(tile) {
  const ct = tile?.chartType || tile?.chart_type || "";
  if (RICH_TILE_TYPES.has(ct)) return ct;
  // Also check chart_spec.type for new-path tiles
  const specType = tile?.chart_spec?.type || tile?.chartSpec?.type || "";
  if (RICH_TILE_TYPES.has(specType)) return specType;
  return null;
}

export default function DashboardTileCanvas({
  tile,
  height = "100%",
  showTitleBar = true,
  onTileClick,
  resultSetOverride,
  onDrillthrough,
  onTileUpdate,
  onInsightRefresh,
}) {
  const spec = tile?.chart_spec || tile?.chartSpec || null;

  // SP-3: Rich content tile type detection
  const richType = getRichTileType(tile);

  // SP-2: Agent editing badge
  const agentEditingTiles = useStore((s) => s.agentEditingTiles);
  const isAgentEditing = tile?.id && agentEditingTiles.has(tile.id);

  const resultSet = useMemo(() => {
    // resultSetOverride wins when supplied (e.g. WorkbookLayout blends
    // filter-bar-driven SQL re-exec results in without mutating the
    // parent tile object). Falls back to the legacy tile fields.
    if (resultSetOverride && typeof resultSetOverride === "object") {
      const columns = Array.isArray(resultSetOverride.columns)
        ? resultSetOverride.columns
        : [];
      const rows = Array.isArray(resultSetOverride.rows)
        ? resultSetOverride.rows
        : [];
      const columnProfile = Array.isArray(resultSetOverride.columnProfile)
        ? resultSetOverride.columnProfile
        : [];
      return { columns, rows, columnProfile };
    }
    const columns = Array.isArray(tile?.columns) ? tile.columns : [];
    const rows = Array.isArray(tile?.rows) ? tile.rows : [];
    const columnProfile = Array.isArray(tile?.columnProfile) ? tile.columnProfile : [];
    return { columns, rows, columnProfile };
  }, [tile?.columns, tile?.rows, tile?.columnProfile, resultSetOverride]);

  const { ref: viewportRef, mounted: inViewport } = useViewportMount({ rootMargin: '300px' });

  // Toast state — shown when a drillthrough fires and no external handler
  // is provided. A ref holds the timeout so the cleanup path is stable.
  const toastTimerRef = useRef(null);
  const [drillToast, setDrillToast] = useState(null);

  /**
   * Default drillthrough handler (v1): scroll to the target tile and show a
   * small toast summarising the applied filter values.
   *
   * Full filter application (batch-refresh via workbook endpoint) is wired in
   * a later batch; for now this gives observable, testable feedback in the UI.
   */
  const handleDrillthrough = useCallback(
    (event) => {
      if (onDrillthrough) {
        // Caller owns the behaviour — pass through untouched.
        onDrillthrough(event);
        return;
      }

      // Built-in v1 behaviour: scroll to the target tile and show a toast.
      const targetEl = document.querySelector(
        `[data-testid="dashboard-tile-canvas-${event.targetTileId}"]`
      );
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        // Pulse a highlight outline so the user sees which tile was targeted.
        targetEl.style.outline = "2px solid var(--accent, #6366f1)";
        targetEl.style.outlineOffset = "2px";
        setTimeout(() => {
          targetEl.style.outline = "";
          targetEl.style.outlineOffset = "";
        }, 1800);
      }

      // Build a human-readable filter summary for the toast.
      const filterSummary = event.filters
        .map((f) => `${f.field} = ${f.value}`)
        .join(", ");
      const message = filterSummary
        ? `Drillthrough → ${event.targetTileId} (${filterSummary})`
        : `Drillthrough → ${event.targetTileId}`;

      setDrillToast(message);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setDrillToast(null), 3000);
    },
    [onDrillthrough]
  );

  // Distinguish click from drag — react-grid-layout captures mousedown for drag.
  // Track mouse position: if moved < 5px between down/up, treat as click.
  const mouseDownPos = useRef(null);
  const handleMouseDown = (e) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = (e) => {
    if (!mouseDownPos.current || !onTileClick) return;
    const dx = Math.abs(e.clientX - mouseDownPos.current.x);
    const dy = Math.abs(e.clientY - mouseDownPos.current.y);
    if (dx < 5 && dy < 5) {
      onTileClick(tile);
    }
    mouseDownPos.current = null;
  };
  const handleClick = () => {
    // Fallback for accessibility — keyboard Enter triggers click
    if (onTileClick) onTileClick(tile);
  };

  // Cursor-tracked spotlight — rAF-throttled on the mousemove event target
  // itself, so we avoid mutating the viewport ref from useViewportMount
  // (React hooks guard: hook-returned refs must not be written externally).
  const rafRef = useRef(0);
  const handleSpotlightMove = useCallback((e) => {
    const el = e.currentTarget;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      el.style.setProperty('--spot-x', `${x}%`);
      el.style.setProperty('--spot-y', `${y}%`);
    });
  }, []);

  // Flagship tile — gets the sheen hover sweep. Guarded so not every tile lights up.
  const isFlagship =
    tile?.importance === 'high' ||
    tile?.kind === 'hero' ||
    tile?.chart_spec?.importance === 'high';

  const spotlightClass = 'premium-spotlight';
  const sheenClass = isFlagship ? 'premium-sheen' : '';

  return (
    <motion.div
      ref={viewportRef}
      data-testid={`dashboard-tile-canvas-${tile?.id || "tile"}`}
      data-has-spec={spec ? "true" : "false"}
      className={`dashboard-tile-canvas ${spotlightClass} ${sheenClass}`.trim()}
      onMouseMove={handleSpotlightMove}
      whileHover={{ y: -2 }}
      transition={SPRINGS.fluid}
      style={{
        height,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
        border: isAgentEditing
          ? "1px solid rgba(139,92,246,0.45)"
          : "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
        boxShadow: isAgentEditing
          ? "0 0 20px rgba(139,92,246,0.15), inset 0 0 12px rgba(139,92,246,0.04)"
          : TOKENS.shadow.innerGlass,
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
        position: "relative",
      }}
    >
      {showTitleBar && (
        <div
          style={{
            padding: "10px 14px 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
            flexShrink: 0,
            minWidth: 0, // allow child title to truncate with ellipsis on narrow tiles (<220px)
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 650,
              color: "var(--text-primary, #e7e7ea)",
              fontFamily: TOKENS.fontDisplay,
              letterSpacing: "-0.018em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
              flex: "1 1 auto",
            }}
          >
            {tile?.title || tile?.id || "Untitled"}
          </span>
          {/* SP-2: AGENT EDITING badge — truncates to "Agent..." at extreme narrow widths */}
          {isAgentEditing && (
            <span
              data-testid="agent-editing-badge"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 9999,
                background: "rgba(139,92,246,0.15)",
                color: "#a78bfa",
                border: "1px solid rgba(139,92,246,0.3)",
                flexShrink: 0,
                maxWidth: 100,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Agent editing
            </span>
          )}
          {tile?.subtitle && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted, rgba(255,255,255,0.5))",
                whiteSpace: "nowrap",
              }}
            >
              {tile.subtitle}
            </span>
          )}
        </div>
      )}
      <div
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={richType ? undefined : handleClick}
        style={{
          flex: 1,
          minHeight: 0,
          cursor: richType ? "default" : (onTileClick ? "pointer" : "default"),
        }}
      >
        {/* SP-3: Rich content tiles — bypass EditorCanvas entirely */}
        {richType === "text" || richType === "markdown" ? (
          <TextTile tile={tile} onUpdate={onTileUpdate} />
        ) : richType === "insight" || richType === "ai_summary" ? (
          <InsightTile
            tile={tile}
            onRefresh={onInsightRefresh}
            onLinkedTileClick={(tid) => {
              const el = document.querySelector(`[data-testid="dashboard-tile-canvas-${tid}"]`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}
          />
        ) : richType === "activity" ? (
          <ActivityTile tile={tile} />
        ) : spec ? (
          inViewport ? (
            <EditorCanvas
              spec={spec}
              resultSet={resultSet}
              onDrillthrough={handleDrillthrough}
            />
          ) : (
            <div
              data-testid="tile-viewport-skeleton"
              style={{
                height: '100%',
                background: 'var(--overlay-faint)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted, rgba(255,255,255,0.3))',
                fontSize: 11,
              }}
            >
              Scroll to load
            </div>
          )
        ) : (
          <EmptyTile />
        )}
      </div>

      {/* Drillthrough toast — briefly visible after a click navigates to a target tile */}
      {drillToast && (
        <div
          data-testid="drillthrough-toast"
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-elev-3, rgba(30,30,40,0.92))",
            border: "1px solid var(--accent, #6366f1)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            color: "var(--text-primary, #e7e7ea)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 20,
            boxShadow: "0 4px 16px var(--shadow-mid)",
          }}
        >
          {drillToast}
        </div>
      )}
    </motion.div>
  );
}

function EmptyTile() {
  return (
    <div
      data-testid="dashboard-tile-canvas-empty"
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        color: "var(--text-muted, rgba(255,255,255,0.4))",
        fontStyle: "italic",
      }}
    >
      No chart spec
    </div>
  );
}
