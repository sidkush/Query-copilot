import { useState } from "react";
import { useStore } from "../../store";
import ColorMapEditor from "./ColorMapEditor";
import SynonymsTab from "./tabs/SynonymsTab";

/**
 * SemanticSettings — tabbed container for connection-scoped semantic overrides.
 *
 * Tabs:
 *   Synonyms       — SynonymsTab (table / column / value synonym tables)
 *   Phrasings      — coming soon (Task 2)
 *   Sample Questions — coming soon (Task 2)
 *   Color Map      — reuses ColorMapEditor from D2
 *   Metrics        — coming soon (Task 2)
 *
 * Reads linguisticModel, colorMap, activeSemanticModel from Zustand store.
 * Passes setLinguisticModel / setColorMap as onUpdate callbacks so store
 * stays in sync after a successful save.
 *
 * Props:
 *   connId {string} — active connection ID
 */

const TABS = [
  { id: "synonyms", label: "Synonyms" },
  { id: "phrasings", label: "Phrasings" },
  { id: "questions", label: "Sample Questions" },
  { id: "colormap", label: "Color Map" },
  { id: "metrics", label: "Metrics" },
];

export default function SemanticSettings({ connId }) {
  const [activeTab, setActiveTab] = useState("synonyms");

  const linguisticModel = useStore((s) => s.linguisticModel);
  const colorMap = useStore((s) => s.colorMap);
  const activeSemanticModel = useStore((s) => s.activeSemanticModel);
  const setLinguisticModel = useStore((s) => s.setLinguisticModel);
  const setColorMap = useStore((s) => s.setColorMap);

  // -------------------------------------------------------------------------
  // Tab content
  // -------------------------------------------------------------------------

  function renderTabContent() {
    switch (activeTab) {
      case "synonyms":
        return (
          <SynonymsTab
            connId={connId}
            linguistic={linguisticModel}
            onUpdate={setLinguisticModel}
          />
        );

      case "phrasings":
        return <div style={comingSoonStyle}>Coming soon</div>;

      case "questions":
        return <div style={comingSoonStyle}>Coming soon</div>;

      case "colormap":
        return (
          <ColorMapEditor
            connId={connId}
            colorMap={colorMap}
            onUpdate={setColorMap}
          />
        );

      case "metrics":
        return <div style={comingSoonStyle}>Coming soon</div>;

      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      data-testid="semantic-settings"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "var(--text-primary, #e7e7ea)",
      }}
    >
      {/* Optional active model badge */}
      {activeSemanticModel?.name && (
        <div style={modelBadgeStyle}>
          <span style={{ color: "var(--text-muted, rgba(255,255,255,0.4))", fontSize: 10 }}>
            Model:
          </span>{" "}
          <span style={{ fontSize: 11, fontWeight: 600 }}>{activeSemanticModel.name}</span>
        </div>
      )}

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Semantic settings tabs"
        style={tabBarStyle}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={tabButtonStyle(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panel */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        style={tabPanelStyle}
      >
        {renderTabContent()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const tabBarStyle = {
  display: "flex",
  gap: 2,
  padding: "0 0 0 0",
  borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
  flexShrink: 0,
  overflowX: "auto",
};

function tabButtonStyle(isActive) {
  return {
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: isActive ? 600 : 400,
    background: "none",
    border: "none",
    borderBottom: isActive
      ? "2px solid var(--accent-text, rgba(147,197,253,1))"
      : "2px solid transparent",
    color: isActive
      ? "var(--accent-text, rgba(147,197,253,1))"
      : "var(--text-secondary, #b0b0b6)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "color 0.15s, border-color 0.15s",
    marginBottom: -1, // overlap container border
    outline: "none",
  };
}

const tabPanelStyle = {
  flex: 1,
  overflowY: "auto",
  padding: "16px 0 0 0",
};

const modelBadgeStyle = {
  padding: "6px 0 10px 0",
  fontSize: 11,
  color: "var(--text-primary, #e7e7ea)",
  borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
  marginBottom: 4,
};

const comingSoonStyle = {
  padding: "32px 0",
  textAlign: "center",
  color: "var(--text-muted, rgba(255,255,255,0.35))",
  fontStyle: "italic",
  fontSize: 13,
};
