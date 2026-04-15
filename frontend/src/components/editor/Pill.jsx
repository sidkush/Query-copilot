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
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

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
