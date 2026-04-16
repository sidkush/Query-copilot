import { useStore } from "../store";
import SemanticSettings from "../components/editor/SemanticSettings";

/**
 * SemanticSettingsPage — route wrapper for /semantic-settings.
 *
 * Reads activeConnId from Zustand store. Shows a "Connect first" prompt
 * when no connection is active, otherwise renders SemanticSettings.
 */
export default function SemanticSettingsPage() {
  const activeConnId = useStore((s) => s.activeConnId);

  if (!activeConnId) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          minHeight: 320,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "var(--text-muted, rgba(255,255,255,0.4))",
          fontSize: 14,
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 28, lineHeight: 1 }}>&#128268;</span>
        <span>Connect to a database first to manage semantic settings.</span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "24px 32px",
        maxWidth: 860,
        width: "100%",
        margin: "0 auto",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <h1
        style={{
          margin: "0 0 4px 0",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "'Outfit', system-ui, sans-serif",
          color: "var(--text-primary, #e7e7ea)",
          letterSpacing: "-0.01em",
        }}
      >
        Semantic Settings
      </h1>
      <p
        style={{
          margin: "0 0 24px 0",
          fontSize: 13,
          color: "var(--text-secondary, #b0b0b6)",
        }}
      >
        Manage synonyms, phrasings, color mappings, and custom metrics for this connection.
      </p>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <SemanticSettings connId={activeConnId} />
      </div>
    </div>
  );
}
