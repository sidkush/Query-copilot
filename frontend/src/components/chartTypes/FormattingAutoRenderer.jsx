import { useState } from "react";

/**
 * FormattingAutoRenderer — Sub-project C Task 5.
 *
 * Auto-renders Inspector-style form controls from a `capabilities.formatting`
 * schema (an array of `FormattingGroup[]` as defined in the IChartType SDK).
 *
 * The component is stateless: current values come from `config` (merged
 * author defaults + user overrides by the host), and every change is
 * surfaced through `onConfigChange(key, value)`.
 *
 * Props:
 *   formatting      {FormattingGroup[]}              — from capabilities
 *   config          {Record<string, unknown>}         — current values
 *   onConfigChange  {(key: string, val: unknown) => void}
 *
 * Rendering rules:
 *   - Each FormattingGroup → collapsible section with a labelled header.
 *   - Each FormattingProperty → appropriate control based on `type`:
 *       'color'   → <input type="color">
 *       'number'  → <input type="number">
 *       'text'    → <input type="text">
 *       'boolean' → <input type="checkbox">
 *       'select'  → <select> with options
 *
 * Styling: matches dark-theme Inspector aesthetics (12–13 px font, tight
 * padding, CSS custom properties for colors).
 */
export default function FormattingAutoRenderer({
  formatting = [],
  config = {},
  onConfigChange,
}) {
  if (!formatting || formatting.length === 0) {
    return (
      <div
        data-testid="formatting-auto-renderer"
        style={styles.empty}
      >
        No formatting options available.
      </div>
    );
  }

  return (
    <div data-testid="formatting-auto-renderer" style={styles.root}>
      {formatting.map((group) => (
        <FormattingSection
          key={group.name}
          group={group}
          config={config}
          onConfigChange={onConfigChange}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormattingSection — collapsible group
// ---------------------------------------------------------------------------

function FormattingSection({ group, config, onConfigChange }) {
  const [open, setOpen] = useState(true);

  return (
    <div style={styles.section}>
      {/* Section header — click to collapse */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={styles.sectionHeader}
      >
        <span style={styles.sectionTitle}>{group.displayName}</span>
        <span
          style={{
            ...styles.chevron,
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          }}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div style={styles.propertyList}>
          {group.properties.map((prop) => (
            <FormattingControl
              key={prop.name}
              groupName={group.name}
              prop={prop}
              value={config[prop.name] ?? prop.default}
              onConfigChange={onConfigChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormattingControl — single property row
// ---------------------------------------------------------------------------

function FormattingControl({ groupName, prop, value, onConfigChange }) {
  const testId = `format-prop-${groupName}-${prop.name}`;

  function emit(rawValue) {
    if (onConfigChange) onConfigChange(prop.name, rawValue);
  }

  // Render the appropriate input control based on prop.type
  let control;

  switch (prop.type) {
    case "color":
      control = (
        <input
          type="color"
          data-testid={testId}
          value={typeof value === "string" ? value : String(prop.default ?? "#000000")}
          onChange={(e) => emit(e.target.value)}
          style={styles.colorInput}
        />
      );
      break;

    case "number":
      control = (
        <input
          type="number"
          data-testid={testId}
          value={value ?? ""}
          onChange={(e) => {
            const n = e.target.value === "" ? "" : Number(e.target.value);
            emit(n);
          }}
          style={styles.textInput}
        />
      );
      break;

    case "text":
      control = (
        <input
          type="text"
          data-testid={testId}
          value={value ?? ""}
          onChange={(e) => emit(e.target.value)}
          style={styles.textInput}
        />
      );
      break;

    case "boolean":
      control = (
        <div style={styles.checkboxWrapper}>
          <input
            type="checkbox"
            data-testid={testId}
            checked={Boolean(value)}
            onChange={(e) => emit(e.target.checked)}
            style={styles.checkbox}
            id={testId}
          />
          <label htmlFor={testId} style={styles.checkboxLabel}>
            {value ? "On" : "Off"}
          </label>
        </div>
      );
      break;

    case "select":
      control = (
        <select
          data-testid={testId}
          value={value ?? ""}
          onChange={(e) => emit(e.target.value)}
          style={styles.select}
        >
          {(prop.options ?? []).map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      );
      break;

    default:
      // Unknown type — render a read-only text fallback
      control = (
        <span
          data-testid={testId}
          style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.4))" }}
        >
          {String(value ?? "")}
        </span>
      );
  }

  return (
    <div style={styles.propRow}>
      <label style={styles.propLabel} title={prop.name}>
        {prop.displayName}
      </label>
      <div style={styles.propControl}>{control}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — dark-theme Inspector palette, 12-13 px font, tight padding
// ---------------------------------------------------------------------------

const styles = {
  root: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 12,
    color: "var(--text-primary, #e7e7ea)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },

  empty: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 11,
    color: "var(--text-muted, rgba(255,255,255,0.4))",
    fontStyle: "italic",
    padding: "6px 4px",
  },

  // ── Section ──────────────────────────────────────────────────────────────

  section: {
    display: "flex",
    flexDirection: "column",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "6px 0 4px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
    cursor: "pointer",
    gap: 6,
  },

  sectionTitle: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted, rgba(255,255,255,0.45))",
    fontWeight: 700,
    userSelect: "none",
  },

  chevron: {
    fontSize: 11,
    color: "var(--text-muted, rgba(255,255,255,0.35))",
    transition: "transform 0.15s ease",
    userSelect: "none",
    lineHeight: 1,
  },

  propertyList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingTop: 6,
    paddingBottom: 4,
  },

  // ── Property row ─────────────────────────────────────────────────────────

  propRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 24,
  },

  propLabel: {
    flex: "0 0 auto",
    width: 88,
    fontSize: 12,
    color: "var(--text-secondary, #b0b0b6)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    userSelect: "none",
    cursor: "default",
  },

  propControl: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
  },

  // ── Controls ─────────────────────────────────────────────────────────────

  colorInput: {
    width: 32,
    height: 22,
    padding: 0,
    border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
    borderRadius: 4,
    background: "transparent",
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    overflow: "hidden",
  },

  textInput: {
    width: "100%",
    padding: "3px 6px",
    fontSize: 12,
    background: "var(--bg-page, #06060e)",
    color: "var(--text-primary, #e7e7ea)",
    border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
    borderRadius: 4,
    outline: "none",
    boxSizing: "border-box",
  },

  select: {
    width: "100%",
    padding: "3px 6px",
    fontSize: 12,
    background: "var(--bg-page, #06060e)",
    color: "var(--text-primary, #e7e7ea)",
    border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
    borderRadius: 4,
    outline: "none",
    cursor: "pointer",
    boxSizing: "border-box",
    appearance: "auto",
  },

  checkboxWrapper: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },

  checkbox: {
    width: 13,
    height: 13,
    cursor: "pointer",
    accentColor: "var(--accent, rgba(96,165,250,0.85))",
    flexShrink: 0,
  },

  checkboxLabel: {
    fontSize: 11,
    color: "var(--text-secondary, #b0b0b6)",
    userSelect: "none",
    cursor: "pointer",
  },
};
