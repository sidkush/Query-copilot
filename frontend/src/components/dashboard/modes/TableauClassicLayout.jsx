import { useMemo, useState, useEffect, useCallback } from "react";
import GridLayout from "react-grid-layout";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import { ARCHETYPE_THEMES } from "../tokens";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

/**
 * TableauClassicLayout — SP-4 Tableau Classic archetype (#6).
 *
 * Familiar BI tool aesthetic: white/light gray background, Tableau 10 palette,
 * dense grid with minimal padding, dropdown filter bar across top, system
 * sans-serif font. Enterprise comfort zone — not flashy.
 *
 * Uses react-grid-layout like AnalystWorkbenchLayout but with Tableau-class
 * styling: light background, traditional blue/orange/green palette, 1px borders,
 * no glass effects, compact spacing (8-12px).
 */
const COLS = 12;
const ROW_HEIGHT = 56;
const DEFAULT_W = 4;
const DEFAULT_H = 4;

const theme = ARCHETYPE_THEMES.tableau;

function buildLayout(tiles, existing) {
  if (Array.isArray(existing) && existing.length > 0) return existing;
  return tiles.map((tile, i) => ({
    i: String(tile.id ?? i),
    x: (i * DEFAULT_W) % COLS,
    y: Math.floor((i * DEFAULT_W) / COLS) * DEFAULT_H,
    w: DEFAULT_W,
    h: DEFAULT_H,
  }));
}

function useWidth() {
  const [ref, setRef] = useState(null);
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    if (!ref) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setWidth(Math.floor(w));
    });
    ro.observe(ref);
    return () => ro.disconnect();
  }, [ref]);
  return [setRef, width];
}

/* ── Filter bar (dropdown style, not chips) ── */
function TableauFilterBar({ filters, onAdd, onRemove, onClear }) {
  const [field, setField] = useState("");
  const [op, setOp] = useState("=");
  const [value, setValue] = useState("");

  const handleAdd = (e) => {
    e.preventDefault();
    if (!field.trim()) return;
    onAdd({ field: field.trim(), op, value });
    setField("");
    setValue("");
  };

  return (
    <div
      data-testid="tableau-filter-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        background: theme.filterBar.bg,
        border: `1px solid ${theme.filterBar.border}`,
        borderRadius: 3,
        flexWrap: "wrap",
        fontFamily: theme.typography.bodyFont,
        fontSize: 11,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#6b7280",
          marginRight: 4,
        }}
      >
        Filters
      </span>

      {/* Active filter pills */}
      {filters.map((f) => (
        <span
          key={f.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 600,
            background: theme.filterBar.chipBg,
            color: theme.filterBar.chipText,
            borderRadius: 3,
          }}
        >
          {f.field} {f.op} {String(f.value)}
          <button
            type="button"
            onClick={() => onRemove(f.id)}
            style={{
              background: "none",
              border: "none",
              color: theme.filterBar.chipText,
              cursor: "pointer",
              fontSize: 12,
              padding: 0,
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </span>
      ))}

      {/* Dropdown-style filter form (single column input, op dropdown, value input) */}
      <form
        onSubmit={handleAdd}
        style={{ display: "inline-flex", gap: 4, marginLeft: "auto" }}
      >
        <input
          type="text"
          placeholder="column"
          value={field}
          onChange={(e) => setField(e.target.value)}
          style={inputStyle}
          aria-label="Filter column"
        />
        <select value={op} onChange={(e) => setOp(e.target.value)} style={dropdownStyle} aria-label="Filter operator">
          <option value="=">=</option>
          <option value="!=">!=</option>
          <option value=">=">≥</option>
          <option value="<=">≤</option>
          <option value="in">in</option>
        </select>
        <input
          type="text"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" style={btnStyle}>
          Apply
        </button>
        {filters.length > 0 && (
          <button type="button" onClick={onClear} style={clearBtnStyle}>
            Clear All
          </button>
        )}
      </form>
    </div>
  );
}

const dropdownStyle = {
  padding: "3px 6px",
  fontSize: 10,
  background: "#fff",
  color: "#111",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 2,
  fontFamily: "inherit",
};

const inputStyle = {
  padding: "3px 6px",
  fontSize: 10,
  background: "#fff",
  color: "#111",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 2,
  width: 80,
  fontFamily: "inherit",
};

const btnStyle = {
  padding: "3px 10px",
  fontSize: 10,
  fontWeight: 600,
  background: "#4E79A7",
  color: "#fff",
  border: "none",
  borderRadius: 2,
  cursor: "pointer",
};

const clearBtnStyle = {
  padding: "3px 10px",
  fontSize: 10,
  background: "transparent",
  color: "#dc2626",
  border: "1px solid rgba(220,38,38,0.3)",
  borderRadius: 2,
  cursor: "pointer",
};

/* ── Main layout ── */
export default function TableauClassicLayout({
  tiles = [],
  initialLayout,
  onLayoutChange,
  onTileClick,
}) {
  const [layout, setLayout] = useState(() => buildLayout(tiles, initialLayout));
  const [setContainerRef, width] = useWidth();
  const [filters, setFilters] = useState([]);
  let filterId = 0;

  useEffect(() => {
    setLayout((prev) => {
      const byId = new Map(prev.map((l) => [l.i, l]));
      const currentIds = new Set(tiles.map((t, i) => String(t.id ?? i)));
      let changed = false;
      const next = tiles.map((tile, i) => {
        const key = String(tile.id ?? i);
        const existing = byId.get(key);
        if (existing) return existing;
        changed = true;
        return {
          i: key,
          x: (i * DEFAULT_W) % COLS,
          y: Math.floor((i * DEFAULT_W) / COLS) * DEFAULT_H,
          w: DEFAULT_W,
          h: DEFAULT_H,
        };
      });
      const filtered = next.filter((l) => currentIds.has(l.i));
      if (!changed && filtered.length === prev.length) return prev;
      return filtered;
    });
  }, [tiles]);

  const handleLayoutChange = useCallback(
    (next) => {
      setLayout(next);
      if (onLayoutChange) onLayoutChange(next);
    },
    [onLayoutChange],
  );

  const tilesById = useMemo(() => {
    const m = new Map();
    tiles.forEach((t, i) => m.set(String(t.id ?? i), t));
    return m;
  }, [tiles]);

  const addFilter = (f) => {
    setFilters((prev) => [...prev, { ...f, id: `tf-${Date.now()}-${filterId++}` }]);
  };
  const removeFilter = (id) => setFilters((prev) => prev.filter((f) => f.id !== id));
  const clearFilters = () => setFilters([]);

  if (tiles.length === 0) {
    return (
      <div
        data-testid="layout-tableau"
        style={{
          padding: 24,
          textAlign: "center",
          fontSize: 12,
          color: "#6b7280",
          fontStyle: "italic",
          fontFamily: theme.typography.bodyFont,
          background: theme.background.dashboard,
          minHeight: "100%",
        }}
      >
        Tableau Classic view ready. Add tiles to begin analysis.
      </div>
    );
  }

  return (
    <div
      data-testid="layout-tableau"
      data-tile-count={tiles.length}
      ref={setContainerRef}
      style={{
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: theme.background.dashboard,
        color: "#111827",
        fontFamily: theme.typography.bodyFont,
        minHeight: "100%",
      }}
    >
      {/* Dropdown filter bar across top */}
      <TableauFilterBar
        filters={filters}
        onAdd={addFilter}
        onRemove={removeFilter}
        onClear={clearFilters}
      />

      {/* Dense grid */}
      <GridLayout
        className="layout-tableau-grid"
        layout={layout}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        width={width}
        margin={[theme.spacing.tileGap, theme.spacing.tileGap]}
        containerPadding={[0, 0]}
        compactType="vertical"
        preventCollision={false}
        draggableHandle=".dashboard-tile-canvas"
        isResizable
        isDraggable
        onLayoutChange={handleLayoutChange}
      >
        {layout.map((l) => {
          const tile = tilesById.get(l.i);
          if (!tile) return <div key={l.i} />;
          return (
            <div
              key={l.i}
              data-testid={`layout-tableau-tile-${l.i}`}
              style={{
                background: theme.background.tile,
                border: `1px solid rgba(0,0,0,0.08)`,
                borderRadius: theme.spacing.tileRadius,
                overflow: "hidden",
              }}
            >
              <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
            </div>
          );
        })}
      </GridLayout>
    </div>
  );
}
