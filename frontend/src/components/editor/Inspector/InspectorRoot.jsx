import { useState } from "react";

/**
 * InspectorRoot — right rail shell with Setup/Style tab switcher.
 * Phase 1 ships both tab contents as stubs. Phase 2 adds encoding tray
 * (Setup tab) + axis/color/label sections (Style tab).
 */
const TABS = [
  { id: "setup", label: "Setup" },
  { id: "style", label: "Style" },
];

export default function InspectorRoot({ spec }) {
  const [activeTab, setActiveTab] = useState("setup");

  return (
    <div
      data-testid="inspector-root"
      style={{
        height: "100%",
        borderLeft: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        role="tablist"
        aria-label="Inspector"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              data-testid={`inspector-tab-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: 12,
                background: "transparent",
                color: active
                  ? "var(--text-primary, #e7e7ea)"
                  : "var(--text-secondary, #b0b0b6)",
                border: "none",
                borderBottom: active
                  ? "2px solid var(--accent, rgba(96,165,250,0.85))"
                  : "2px solid transparent",
                cursor: "pointer",
                fontWeight: active ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        data-testid={`inspector-panel-${activeTab}`}
        style={{ flex: 1, padding: 12, overflowY: "auto" }}
      >
        {activeTab === "setup" ? (
          <Stub title="Setup" />
        ) : (
          <Stub title="Style" />
        )}
        {spec?.type && (
          <div
            data-testid="inspector-spec-type"
            style={{
              marginTop: 12,
              padding: "6px 8px",
              fontSize: 11,
              background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
              borderRadius: 4,
              color: "var(--text-secondary, #b0b0b6)",
            }}
          >
            spec.type: <code>{spec.type}</code>
          </div>
        )}
      </div>
    </div>
  );
}

function Stub({ title }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontStyle: "italic",
      }}
    >
      {title} — coming in Phase 2
    </div>
  );
}
