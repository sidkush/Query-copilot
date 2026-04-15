import { useMemo, useState } from "react";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import {
  WorkbookFilterProvider,
  useWorkbookFilters,
} from "../lib/workbookFilterContext";

/**
 * WorkbookLayout — Phase 4c real implementation.
 *
 * Spec S7.6: Excel-style multi-tab workbook with a workbook-level
 * shared filter bar across tabs. Each tab hosts its own tile set; the
 * filter bar pushes a filter context down via
 * `WorkbookFilterProvider` so any tile (current tab or future ones)
 * can subscribe and append a `where` clause to its SQL.
 *
 * Phase 4c ships the filter bar UI + context + tab strip + real tile
 * renderer via DashboardTileCanvas. Real SQL blending (filter →
 * refreshTile) lands in Phase 4c+1 when the tile canvas is wired to
 * `api.refreshTile` through the active connection.
 */
function groupByTab(tiles) {
  const out = {};
  for (const tile of tiles) {
    const tab = tile.tab || "Tab 1";
    if (!out[tab]) out[tab] = [];
    out[tab].push(tile);
  }
  return out;
}

export default function WorkbookLayout({ tiles = [], onTileClick }) {
  const tabs = useMemo(() => groupByTab(tiles), [tiles]);
  const tabIds = Object.keys(tabs);
  const [activeTab, setActiveTab] = useState(tabIds[0] || "Tab 1");

  return (
    <WorkbookFilterProvider>
      <div
        data-testid="layout-workbook"
        data-active-tab={activeTab}
        style={{
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: "100%",
          background: "#f0f0f4",
          color: "#0c0c13",
        }}
      >
        <WorkbookFilterBar />
        <div
          role="tablist"
          aria-label="Workbook tabs"
          style={{
            display: "flex",
            gap: 2,
            borderBottom: "1px solid rgba(12,12,19,0.12)",
            paddingBottom: 4,
          }}
        >
          {(tabIds.length > 0 ? tabIds : ["Tab 1"]).map((tab) => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                data-testid={`workbook-tab-${tab}`}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "6px 16px",
                  fontSize: 11,
                  background: active ? "#ffffff" : "transparent",
                  color: active ? "#0c0c13" : "rgba(12,12,19,0.55)",
                  border: "none",
                  borderBottom: active
                    ? "2px solid #3b82f6"
                    : "2px solid transparent",
                  cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                  boxShadow: active ? "0 -1px 2px rgba(0,0,0,0.04)" : "none",
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gridAutoRows: "minmax(200px, auto)",
          }}
        >
          {(tabs[activeTab] || []).length === 0 && (
            <EmptyTab />
          )}
          {(tabs[activeTab] || []).map((tile, i) => (
            <div
              key={tile.id || i}
              data-testid={`layout-workbook-tile-${tile.id || i}`}
              style={{ minHeight: 200 }}
            >
              <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
            </div>
          ))}
        </div>
      </div>
    </WorkbookFilterProvider>
  );
}

function WorkbookFilterBar() {
  const { filters, addFilter, removeFilter, clearFilters } = useWorkbookFilters();
  const [field, setField] = useState("");
  const [op, setOp] = useState("=");
  const [value, setValue] = useState("");

  const handleAdd = (e) => {
    e.preventDefault();
    if (!field.trim()) return;
    addFilter({ field: field.trim(), op, value });
    setField("");
    setValue("");
  };

  return (
    <div
      data-testid="workbook-filter-bar"
      data-filter-count={filters.length}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "#ffffff",
        borderRadius: 4,
        border: "1px solid rgba(12,12,19,0.08)",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 700,
          color: "rgba(12,12,19,0.55)",
        }}
      >
        Workbook filters
      </span>
      {filters.map((f) => (
        <span
          key={f.id}
          data-testid={`workbook-filter-${f.id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            fontSize: 10,
            fontWeight: 600,
            background: "#eef2ff",
            color: "#1e3a8a",
            borderRadius: 10,
          }}
        >
          {f.field} {f.op} {String(f.value)}
          <button
            type="button"
            onClick={() => removeFilter(f.id)}
            aria-label="remove filter"
            style={{
              background: "none",
              border: "none",
              color: "#1e3a8a",
              cursor: "pointer",
              fontSize: 12,
              padding: 0,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <form
        onSubmit={handleAdd}
        style={{ display: "inline-flex", gap: 4, marginLeft: "auto" }}
      >
        <input
          type="text"
          data-testid="workbook-filter-field"
          placeholder="field"
          value={field}
          onChange={(e) => setField(e.target.value)}
          style={inputStyle}
        />
        <select
          data-testid="workbook-filter-op"
          value={op}
          onChange={(e) => setOp(e.target.value)}
          style={inputStyle}
        >
          <option value="=">=</option>
          <option value="!=">!=</option>
          <option value=">=">&ge;</option>
          <option value="<=">&le;</option>
          <option value="in">in</option>
        </select>
        <input
          type="text"
          data-testid="workbook-filter-value"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={inputStyle}
        />
        <button
          type="submit"
          data-testid="workbook-filter-add"
          style={{
            padding: "4px 10px",
            fontSize: 10,
            background: "#3b82f6",
            color: "#ffffff",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Add
        </button>
        {filters.length > 0 && (
          <button
            type="button"
            data-testid="workbook-filter-clear"
            onClick={clearFilters}
            style={{
              padding: "4px 10px",
              fontSize: 10,
              background: "transparent",
              color: "#dc2626",
              border: "1px solid rgba(220,38,38,0.4)",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </form>
    </div>
  );
}

const inputStyle = {
  padding: "4px 6px",
  fontSize: 10,
  background: "#ffffff",
  color: "#0c0c13",
  border: "1px solid rgba(12,12,19,0.12)",
  borderRadius: 3,
};

function EmptyTab() {
  return (
    <div
      data-testid="layout-empty"
      style={{
        gridColumn: "1 / -1",
        padding: 24,
        fontSize: 12,
        color: "rgba(12,12,19,0.45)",
        fontStyle: "italic",
        textAlign: "center",
      }}
    >
      Empty tab. Add tiles via the analytics drawer.
    </div>
  );
}
