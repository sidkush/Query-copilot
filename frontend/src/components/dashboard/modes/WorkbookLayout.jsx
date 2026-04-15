import { useMemo, useState } from "react";

/**
 * WorkbookLayout — Phase 4a skeleton.
 *
 * Target experience (spec S7.6): multi-tab workbook with shared filter
 * bar across tabs. Excel-style tab strip. Each tab is its own dashboard
 * with its own tile set, and the filter bar pushes a shared filter
 * context to all of them.
 *
 * Phase 4a: tab strip + per-tab tile listing. Filter bar + filter
 * propagation is Phase 4b.
 *
 * TODO(a4b): shared filter bar via GlobalFilterBar extension.
 */
export default function WorkbookLayout({ tiles = [] }) {
  const tabs = useMemo(() => groupByTab(tiles), [tiles]);
  const tabIds = Object.keys(tabs);
  const [activeTab, setActiveTab] = useState(tabIds[0] || "Tab 1");

  return (
    <div
      data-testid="layout-workbook"
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        role="tablist"
        aria-label="Workbook tabs"
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
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
                padding: "4px 12px",
                fontSize: 11,
                background: active ? "var(--bg-elev-2, rgba(255,255,255,0.04))" : "transparent",
                color: active ? "var(--text-primary, #e7e7ea)" : "var(--text-secondary, #b0b0b6)",
                border: "none",
                borderBottom: active
                  ? "2px solid var(--accent, rgba(96,165,250,0.85))"
                  : "2px solid transparent",
                cursor: "pointer",
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
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        {(tabs[activeTab] || []).length === 0 && (
          <EmptyTab mode="Workbook" />
        )}
        {(tabs[activeTab] || []).map((tile, i) => (
          <div
            key={tile.id || i}
            data-testid={`layout-workbook-tile-${tile.id || i}`}
            style={{
              padding: 10,
              minHeight: 140,
              borderRadius: 4,
              background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.5))" }}>
              {tile.title || tile.id || "Untitled"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupByTab(tiles) {
  const out = {};
  for (const tile of tiles) {
    const tab = tile.tab || "Tab 1";
    if (!out[tab]) out[tab] = [];
    out[tab].push(tile);
  }
  return out;
}

function EmptyTab({ mode }) {
  return (
    <div
      data-testid="layout-empty"
      style={{
        gridColumn: "1 / -1",
        padding: 24,
        fontSize: 12,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontStyle: "italic",
        textAlign: "center",
      }}
    >
      Empty tab. {mode} layout persists per-tab tile state in Phase 4b.
    </div>
  );
}
