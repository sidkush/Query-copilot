import { useState } from "react";
import { api } from "../../api";

/**
 * ColorMapEditor — Sub-project D Task 3.
 *
 * Table-style editor for persistent color assignments. Each row represents a
 * `"column:value"` → hex color pairing. Users can add new assignments, change
 * colors via native <input type="color">, and delete rows.
 *
 * The key format in `colorMap.assignments` is `"column:value"` or
 * `"table.column:value"`. The editor splits on the first `:` to populate the
 * Column and Value columns in the table.
 *
 * Every color change and delete saves immediately via `api.saveColorMap()`.
 *
 * Props:
 *   connId    {string}       — active connection ID
 *   colorMap  {object|null}  — ColorMap from store (.assignments Record<string,string>)
 *   onUpdate  {function}     — called with the updated ColorMap after a save
 */
export default function ColorMapEditor({ connId, colorMap, onUpdate }) {
  const [newColumn, setNewColumn] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newColor, setNewColor] = useState("#4a8fe7");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const assignments = colorMap?.assignments ?? {};

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Split assignment key ("col:val" or "tbl.col:val") into [columnPart, value]. */
  function splitKey(key) {
    const idx = key.indexOf(":");
    if (idx === -1) return [key, ""];
    return [key.slice(0, idx), key.slice(idx + 1)];
  }

  async function persist(nextAssignments) {
    if (!connId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(colorMap ?? {}),
        assignments: nextAssignments,
        updated_at: new Date().toISOString(),
      };
      const saved = await api.saveColorMap(connId, payload);
      if (onUpdate) onUpdate(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleColorChange(key, hex) {
    const next = { ...assignments, [key]: hex };
    await persist(next);
  }

  async function handleDelete(key) {
    const next = { ...assignments };
    delete next[key];
    await persist(next);
  }

  async function handleAdd() {
    const col = newColumn.trim();
    const val = newValue.trim();
    if (!col || !val) return;
    const key = `${col}:${val}`;
    const next = { ...assignments, [key]: newColor };
    await persist(next);
    // Reset add-row inputs on success (error leaves them populated for retry)
    if (!error) {
      setNewColumn("");
      setNewValue("");
      setNewColor("#4a8fe7");
    }
  }

  // -------------------------------------------------------------------------
  // Sorted rows
  // -------------------------------------------------------------------------

  const rows = Object.entries(assignments).sort(([a], [b]) => a.localeCompare(b));

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      data-testid="color-map-editor"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        color: "var(--text-primary, #e7e7ea)",
      }}
    >
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 8,
            padding: "6px 10px",
            borderRadius: 4,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "#f87171",
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: "35%" }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: "60px" }} />
          <col style={{ width: "60px" }} />
        </colgroup>

        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            }}
          >
            {["Column", "Value", "Color", ""].map((h) => (
              <th
                key={h}
                style={{
                  padding: "6px 8px",
                  textAlign: "left",
                  fontWeight: 600,
                  color: "var(--text-secondary, #b0b0b6)",
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Existing assignment rows */}
          {rows.map(([key, hex]) => {
            const [col, val] = splitKey(key);
            return (
              <tr
                key={key}
                style={{
                  borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
                }}
              >
                {/* Column */}
                <td style={tdStyle}>
                  <span
                    title={col}
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--text-primary, #e7e7ea)",
                    }}
                  >
                    {col}
                  </span>
                </td>

                {/* Value */}
                <td style={tdStyle}>
                  <span
                    title={val}
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--text-secondary, #b0b0b6)",
                    }}
                  >
                    {val}
                  </span>
                </td>

                {/* Color swatch + native picker */}
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <label
                    title="Change color"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >
                    {/* Visible swatch */}
                    <span
                      style={{
                        display: "inline-block",
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        background: hex,
                        border: "1px solid rgba(255,255,255,0.15)",
                        boxShadow: `0 0 0 2px ${hex}33`,
                        transition: "box-shadow 0.15s",
                      }}
                    />
                    {/* Native picker, visually hidden behind the swatch */}
                    <input
                      type="color"
                      value={hex}
                      disabled={saving}
                      aria-label={`Color for ${col}:${val}`}
                      onChange={(e) => handleColorChange(key, e.target.value)}
                      style={{
                        position: "absolute",
                        width: 0,
                        height: 0,
                        opacity: 0,
                        pointerEvents: "none",
                      }}
                    />
                  </label>
                </td>

                {/* Remove */}
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <button
                    aria-label={`Remove ${col}:${val}`}
                    disabled={saving}
                    onClick={() => handleDelete(key)}
                    style={removeButtonStyle(saving)}
                  >
                    &times;
                  </button>
                </td>
              </tr>
            );
          })}

          {/* Empty state */}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={4}
                style={{
                  padding: "12px 8px",
                  textAlign: "center",
                  color: "var(--text-muted, rgba(255,255,255,0.4))",
                  fontStyle: "italic",
                }}
              >
                No color assignments yet
              </td>
            </tr>
          )}

          {/* Add-new row */}
          <tr
            style={{
              borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.10))",
              background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
            }}
          >
            {/* Column input */}
            <td style={tdStyle}>
              <input
                type="text"
                placeholder="column"
                value={newColumn}
                onChange={(e) => setNewColumn(e.target.value)}
                disabled={saving}
                aria-label="New assignment column"
                style={addInputStyle}
              />
            </td>

            {/* Value input */}
            <td style={tdStyle}>
              <input
                type="text"
                placeholder="value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                disabled={saving}
                aria-label="New assignment value"
                style={addInputStyle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newColumn.trim() && newValue.trim()) {
                    handleAdd();
                  }
                }}
              />
            </td>

            {/* Color picker for new row */}
            <td style={{ ...tdStyle, textAlign: "center" }}>
              <label
                title="Pick color"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    background: newColor,
                    border: "1px solid rgba(255,255,255,0.15)",
                    boxShadow: `0 0 0 2px ${newColor}33`,
                    transition: "box-shadow 0.15s",
                  }}
                />
                <input
                  type="color"
                  value={newColor}
                  disabled={saving}
                  aria-label="New assignment color"
                  onChange={(e) => setNewColor(e.target.value)}
                  style={{
                    position: "absolute",
                    width: 0,
                    height: 0,
                    opacity: 0,
                    pointerEvents: "none",
                  }}
                />
              </label>
            </td>

            {/* Add button */}
            <td style={{ ...tdStyle, textAlign: "center" }}>
              <button
                aria-label="Add color assignment"
                disabled={saving || !newColumn.trim() || !newValue.trim()}
                onClick={handleAdd}
                style={addButtonStyle(saving || !newColumn.trim() || !newValue.trim())}
              >
                Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Saving indicator */}
      {saving && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--text-muted, rgba(255,255,255,0.4))",
            textAlign: "right",
          }}
        >
          Saving…
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style helpers (keep out of render to avoid GC churn)
// ---------------------------------------------------------------------------

const tdStyle = {
  padding: "6px 8px",
  verticalAlign: "middle",
};

const addInputStyle = {
  width: "100%",
  background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
  borderRadius: 4,
  color: "var(--text-primary, #e7e7ea)",
  fontSize: 12,
  padding: "4px 6px",
  outline: "none",
  boxSizing: "border-box",
};

function removeButtonStyle(disabled) {
  return {
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    border: "none",
    background: "transparent",
    color: disabled ? "rgba(255,255,255,0.2)" : "var(--text-secondary, #b0b0b6)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 16,
    lineHeight: 1,
    padding: 0,
    transition: "background 0.12s, color 0.12s",
  };
}

function addButtonStyle(disabled) {
  return {
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 4,
    border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
    background: disabled
      ? "var(--bg-elev-2, rgba(255,255,255,0.04))"
      : "var(--accent, rgba(96,165,250,0.18))",
    color: disabled
      ? "var(--text-muted, rgba(255,255,255,0.3))"
      : "var(--accent-text, rgba(147,197,253,1))",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background 0.12s, color 0.12s",
    whiteSpace: "nowrap",
  };
}
