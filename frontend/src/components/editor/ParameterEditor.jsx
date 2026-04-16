import { useState } from "react";

/**
 * ParameterEditor — Sub-project C Task 1.
 *
 * Form for defining `UserChartTypeParam` entries on a user-authored chart
 * type. Each parameter carries a name, kind, optional semanticType (when
 * kind === "field"), required flag, and an optional default value.
 *
 * Props:
 *   parameters  {Array}                    — current list of param objects
 *   onChange    {(params: Array) => void}  — callback with updated list
 */

// ---------------------------------------------------------------------------
// Option tables
// ---------------------------------------------------------------------------

const KIND_OPTIONS = [
  { value: "field",     label: "Field (column reference)" },
  { value: "aggregate", label: "Aggregate (sum, avg, ...)" },
  { value: "literal",   label: "Literal (text value)" },
  { value: "number",    label: "Number" },
  { value: "boolean",   label: "Boolean (true/false)" },
];

const SEMANTIC_TYPE_OPTIONS = [
  { value: "nominal",      label: "Nominal (categorical)" },
  { value: "ordinal",      label: "Ordinal (ordered)" },
  { value: "quantitative", label: "Quantitative (numeric)" },
  { value: "temporal",     label: "Temporal (date/time)" },
  { value: "geographic",   label: "Geographic" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ParameterEditor({ parameters = [], onChange }) {
  const [newName, setNewName]       = useState("");
  const [newKind, setNewKind]       = useState("field");
  const [newSemType, setNewSemType] = useState("nominal");

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleAdd() {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    const param = {
      name: trimmedName,
      kind: newKind,
      required: true,
      ...(newKind === "field" ? { semanticType: newSemType } : {}),
    };

    onChange([...parameters, param]);

    // Reset add-row inputs
    setNewName("");
    setNewKind("field");
    setNewSemType("nominal");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  function handleRemove(index) {
    const next = parameters.filter((_, i) => i !== index);
    onChange(next);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const addDisabled = !newName.trim();

  return (
    <div
      data-testid="parameter-editor"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        color: "var(--text-primary, #e7e7ea)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Section header */}
      <div>
        <div
          style={{
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-muted, rgba(255,255,255,0.45))",
            fontWeight: 700,
            paddingBottom: 4,
            borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          }}
        >
          Parameters
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            color: "var(--text-muted, rgba(255,255,255,0.4))",
            lineHeight: 1.5,
          }}
        >
          Define the inputs your chart type exposes. Each parameter maps to a
          slot the user fills when instantiating this chart type.
        </div>
      </div>

      {/* Existing parameters list */}
      <div
        data-testid="parameter-editor-list"
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
      >
        {parameters.length === 0 && (
          <div
            data-testid="parameter-editor-empty"
            style={{
              fontSize: 10,
              color: "var(--text-muted, rgba(255,255,255,0.35))",
              fontStyle: "italic",
              padding: "6px 4px",
            }}
          >
            No parameters defined yet.
          </div>
        )}

        {parameters.map((param, index) => (
          <div
            key={`${param.name}-${index}`}
            data-testid={`parameter-row-${index}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 4,
              background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
            }}
          >
            {/* Name badge */}
            <code
              style={{
                padding: "2px 6px",
                borderRadius: 3,
                background: "rgba(96,165,250,0.12)",
                border: "1px solid rgba(96,165,250,0.25)",
                color: "rgba(147,197,253,1)",
                fontSize: 11,
                fontFamily: "ui-monospace, Menlo, Monaco, 'Courier New', monospace",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {param.name}
            </code>

            {/* Kind label */}
            <span
              style={{
                fontSize: 10,
                color: "var(--text-secondary, #b0b0b6)",
                flexShrink: 0,
              }}
            >
              {KIND_OPTIONS.find((k) => k.value === param.kind)?.label ?? param.kind}
            </span>

            {/* SemanticType (field-kind only) */}
            {param.kind === "field" && param.semanticType && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted, rgba(255,255,255,0.4))",
                  flexShrink: 0,
                }}
              >
                ·{" "}
                {SEMANTIC_TYPE_OPTIONS.find((s) => s.value === param.semanticType)?.label ??
                  param.semanticType}
              </span>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Remove button */}
            <button
              type="button"
              aria-label={`Remove parameter ${param.name}`}
              data-testid={`parameter-remove-${index}`}
              onClick={() => handleRemove(index)}
              style={{
                width: 22,
                height: 22,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 4,
                border: "none",
                background: "transparent",
                color: "var(--text-secondary, #b0b0b6)",
                cursor: "pointer",
                fontSize: 15,
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Add row */}
      <div
        data-testid="parameter-editor-add-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px",
          borderRadius: 4,
          background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
          flexWrap: "wrap",
        }}
      >
        {/* Name input */}
        <input
          type="text"
          placeholder="param name"
          value={newName}
          aria-label="New parameter name"
          data-testid="parameter-name-input"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            ...inputStyle,
            flex: "1 1 80px",
            minWidth: 80,
          }}
        />

        {/* Kind dropdown */}
        <select
          value={newKind}
          aria-label="New parameter kind"
          data-testid="parameter-kind-select"
          onChange={(e) => setNewKind(e.target.value)}
          style={{
            ...inputStyle,
            flex: "2 1 140px",
            minWidth: 140,
            cursor: "pointer",
          }}
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* SemanticType dropdown — only when kind === "field" */}
        {newKind === "field" && (
          <select
            value={newSemType}
            aria-label="New parameter semantic type"
            data-testid="parameter-semtype-select"
            onChange={(e) => setNewSemType(e.target.value)}
            style={{
              ...inputStyle,
              flex: "2 1 150px",
              minWidth: 150,
              cursor: "pointer",
            }}
          >
            {SEMANTIC_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {/* Add button */}
        <button
          type="button"
          aria-label="Add parameter"
          data-testid="parameter-add-button"
          disabled={addDisabled}
          onClick={handleAdd}
          style={{
            padding: "4px 12px",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            background: addDisabled
              ? "var(--bg-elev-2, rgba(255,255,255,0.04))"
              : "var(--accent, rgba(96,165,250,0.18))",
            color: addDisabled
              ? "var(--text-muted, rgba(255,255,255,0.3))"
              : "var(--accent-text, rgba(147,197,253,1))",
            cursor: addDisabled ? "not-allowed" : "pointer",
            transition: "background 0.12s, color 0.12s",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const inputStyle = {
  padding: "4px 6px",
  fontSize: 11,
  background: "var(--bg-page, #06060e)",
  color: "var(--text-primary, #e7e7ea)",
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
  borderRadius: 4,
  outline: "none",
  boxSizing: "border-box",
};
