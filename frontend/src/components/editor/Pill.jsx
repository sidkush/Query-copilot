import { useState, useRef, useEffect } from "react";

/**
 * Pill — a draggable field pill with an aggregation dropdown.
 *
 * Renders as a compact badge: [agg · field ▾]. When `channel` is passed
 * (i.e. the pill is sitting in a MarksCard channel slot), the aggregation
 * dropdown is enabled and edits dispatch `onChange` with the new FieldRef.
 * When no channel is passed (i.e. the pill is in the DataRail), it acts
 * as a draggable source only.
 *
 * Drag payload schema (HTML5 drag-drop, media type `application/x-askdb-field`):
 *   { field: string, semanticType: SemanticType, role: 'dimension'|'measure',
 *     aggregate?: Aggregate }
 */
const AGGS_BY_ROLE = {
  measure: ["sum", "avg", "min", "max", "count", "distinct", "median", "none"],
  dimension: ["none", "count", "distinct"],
};

export default function Pill({
  fieldRef,          // { field, type, aggregate? } — from spec.encoding
  role = "dimension",
  channel,           // optional — when set, the pill lives in a MarksCard slot
  onChange,          // (next: FieldRef) => void
  onRemove,          // () => void (when in a slot)
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { x, y } | null
  const menuRef = useRef(null);
  const contextMenuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (!contextMenu) return;
    const onDoc = (e) => {
      if (!contextMenuRef.current?.contains(e.target)) setContextMenu(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const handleContextMenu = (e) => {
    if (!channel) return; // only placed pills get a context menu
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleSort = (dir) => {
    setContextMenu(null);
    if (!fieldRef) return;
    onChange && onChange({ ...fieldRef, sort: dir });
  };
  const handleClearSort = () => {
    setContextMenu(null);
    if (!fieldRef) return;
    const { sort, ...rest } = fieldRef;
    void sort;
    onChange && onChange(rest);
  };
  const handleFormat = (fmt) => {
    setContextMenu(null);
    if (!fieldRef) return;
    onChange && onChange({ ...fieldRef, format: fmt || undefined });
  };

  const color = role === "measure" ? "#2dbf71" : "#4a8fe7";
  const agg = fieldRef?.aggregate || (role === "measure" ? "sum" : "none");
  const displayAgg = agg && agg !== "none" ? agg.toUpperCase() : null;
  const aggOptions = AGGS_BY_ROLE[role] || AGGS_BY_ROLE.dimension;

  return (
    <div
      data-testid={`pill-${fieldRef?.field || "unknown"}${channel ? `-${channel}` : ""}`}
      data-kind={role}
      data-channel={channel || ""}
      draggable={!channel} // Already-placed pills don't re-drag in Phase 2a
      onContextMenu={handleContextMenu}
      onDragStart={(e) => {
        if (channel) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData(
          "application/x-askdb-field",
          JSON.stringify({
            field: fieldRef.field,
            semanticType: fieldRef.type,
            role,
            aggregate: fieldRef.aggregate,
          })
        );
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        fontSize: 11,
        borderRadius: 3,
        background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
        border: `1px solid ${color}55`,
        borderLeft: `3px solid ${color}`,
        color: "var(--text-primary, #e7e7ea)",
        cursor: channel ? "default" : "grab",
        userSelect: "none",
        position: "relative",
      }}
    >
      {displayAgg && (
        <span
          data-testid={`pill-agg-${fieldRef?.field}`}
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: color,
            textTransform: "uppercase",
          }}
        >
          {displayAgg}
        </span>
      )}
      <span
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 140,
        }}
      >
        {fieldRef?.field}
      </span>
      {channel && (
        <>
          <button
            type="button"
            data-testid={`pill-menu-${fieldRef?.field}-${channel}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="Aggregation"
            aria-expanded={menuOpen}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              margin: 0,
              color: "var(--text-secondary, #b0b0b6)",
              cursor: "pointer",
              fontSize: 9,
            }}
          >
            ▾
          </button>
          <button
            type="button"
            data-testid={`pill-remove-${fieldRef?.field}-${channel}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove && onRemove();
            }}
            aria-label="Remove from channel"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              margin: 0,
              color: "var(--text-muted, rgba(255,255,255,0.4))",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            ×
          </button>
          {contextMenu && (
            <div
              ref={contextMenuRef}
              role="menu"
              data-testid={`pill-context-menu-${fieldRef?.field}-${channel}`}
              style={{
                position: "fixed",
                top: contextMenu.y,
                left: contextMenu.x,
                minWidth: 160,
                padding: 4,
                borderRadius: 4,
                background: "var(--bg-elev-3, #13131b)",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
                boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
                zIndex: 1001,
              }}
            >
              <ContextSection label="Sort">
                <ContextItem testId="pill-ctx-sort-asc" onClick={() => handleSort("asc")}>Ascending</ContextItem>
                <ContextItem testId="pill-ctx-sort-desc" onClick={() => handleSort("desc")}>Descending</ContextItem>
                <ContextItem testId="pill-ctx-sort-clear" onClick={handleClearSort}>Clear</ContextItem>
              </ContextSection>
              <ContextSection label="Format">
                <ContextItem testId="pill-ctx-fmt-int" onClick={() => handleFormat(",.0f")}>Integer</ContextItem>
                <ContextItem testId="pill-ctx-fmt-decimal" onClick={() => handleFormat(",.2f")}>Decimal (.2f)</ContextItem>
                <ContextItem testId="pill-ctx-fmt-percent" onClick={() => handleFormat(".0%")}>Percent</ContextItem>
                <ContextItem testId="pill-ctx-fmt-clear" onClick={() => handleFormat("")}>Clear</ContextItem>
              </ContextSection>
            </div>
          )}
          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              data-testid={`pill-menu-panel-${fieldRef?.field}-${channel}`}
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                minWidth: 120,
                padding: 4,
                borderRadius: 4,
                background: "var(--bg-elev-3, #13131b)",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                zIndex: 50,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted, rgba(255,255,255,0.4))",
                  padding: "4px 6px",
                }}
              >
                Aggregation
              </div>
              {aggOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="menuitem"
                  data-testid={`pill-agg-opt-${opt}`}
                  onClick={() => {
                    setMenuOpen(false);
                    onChange && onChange({ ...fieldRef, aggregate: opt === "none" ? undefined : opt });
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "4px 8px",
                    fontSize: 11,
                    background: agg === opt ? "var(--accent, rgba(96,165,250,0.18))" : "transparent",
                    color: "var(--text-primary, #e7e7ea)",
                    border: "none",
                    borderRadius: 2,
                    cursor: "pointer",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ContextSection({ label, children }) {
  return (
    <div style={{ padding: "2px 0" }}>
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted, rgba(255,255,255,0.4))",
          padding: "4px 6px",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ContextItem({ children, onClick, testId }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "4px 10px",
        fontSize: 11,
        background: "transparent",
        color: "var(--text-primary, #e7e7ea)",
        border: "none",
        borderRadius: 2,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
