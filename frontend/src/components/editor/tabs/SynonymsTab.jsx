import { useState } from "react";
import { api } from "../../../api";

/**
 * SynonymsTab — editable synonym table for tables, columns, and values.
 *
 * Three sub-sections share the same [Key, Synonyms, Actions] table pattern.
 * Each change saves immediately via api.saveLinguisticModel().
 *
 * Props:
 *   connId     {string}   — active connection ID
 *   linguistic {object}   — linguisticModel from store
 *   onUpdate   {function} — called with the updated linguisticModel after save
 */
export default function SynonymsTab({ connId, linguistic, onUpdate }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const tableSynonyms = linguistic?.table_synonyms ?? {};
  const columnSynonyms = linguistic?.column_synonyms ?? {};
  const valueSynonyms = linguistic?.value_synonyms ?? {};

  // -------------------------------------------------------------------------
  // Persist
  // -------------------------------------------------------------------------

  async function persist(patch) {
    if (!connId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(linguistic ?? {}),
        ...patch,
        updated_at: new Date().toISOString(),
      };
      const saved = await api.saveLinguisticModel(connId, payload);
      if (onUpdate) onUpdate(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Section factory — keeps the three sections DRY
  // -------------------------------------------------------------------------

  function SynonymSection({ title, storeKey, current }) {
    const [newKey, setNewKey] = useState("");
    const [newSynonyms, setNewSynonyms] = useState("");

    const rows = Object.entries(current).sort(([a], [b]) => a.localeCompare(b));

    async function handleDelete(key) {
      const next = { ...current };
      delete next[key];
      await persist({ [storeKey]: next });
    }

    async function handleAdd() {
      const k = newKey.trim();
      const syns = newSynonyms.trim();
      if (!k || !syns) return;
      const next = { ...current, [k]: syns };
      await persist({ [storeKey]: next });
      if (!error) {
        setNewKey("");
        setNewSynonyms("");
      }
    }

    return (
      <div style={{ marginBottom: 24 }}>
        <h4 style={sectionHeadStyle}>{title}</h4>

        <table style={tableStyle}>
          <colgroup>
            <col style={{ width: "35%" }} />
            <col style={{ width: "55%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>

          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))" }}>
              {["Key", "Synonyms", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map(([key, syns]) => (
              <tr key={key} style={{ borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))" }}>
                <td style={tdStyle}>
                  <span style={ellipsisStyle} title={key}>{key}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ ...ellipsisStyle, color: "var(--text-secondary, #b0b0b6)" }} title={syns}>
                    {syns}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <button
                    aria-label={`Remove synonym ${key}`}
                    disabled={saving}
                    onClick={() => handleDelete(key)}
                    style={removeButtonStyle(saving)}
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={3} style={emptyStyle}>
                  No synonyms yet
                </td>
              </tr>
            )}

            {/* Add-new row */}
            <tr style={{ borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.10))", background: "var(--bg-elev-1, rgba(255,255,255,0.02))" }}>
              <td style={tdStyle}>
                <input
                  type="text"
                  placeholder="key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  disabled={saving}
                  aria-label={`New ${title} key`}
                  style={addInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  placeholder="synonym1, synonym2"
                  value={newSynonyms}
                  onChange={(e) => setNewSynonyms(e.target.value)}
                  disabled={saving}
                  aria-label={`New ${title} synonyms`}
                  style={addInputStyle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newKey.trim() && newSynonyms.trim()) handleAdd();
                  }}
                />
              </td>
              <td style={{ ...tdStyle, textAlign: "center" }}>
                <button
                  aria-label={`Add ${title} synonym`}
                  disabled={saving || !newKey.trim() || !newSynonyms.trim()}
                  onClick={handleAdd}
                  style={addButtonStyle(saving || !newKey.trim() || !newSynonyms.trim())}
                >
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      data-testid="synonyms-tab"
      style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, color: "var(--text-primary, #e7e7ea)" }}
    >
      {error && (
        <div role="alert" style={errorBannerStyle}>{error}</div>
      )}

      <SynonymSection
        title="Table Synonyms"
        storeKey="table_synonyms"
        current={tableSynonyms}
      />
      <SynonymSection
        title="Column Synonyms"
        storeKey="column_synonyms"
        current={columnSynonyms}
      />
      <SynonymSection
        title="Value Synonyms"
        storeKey="value_synonyms"
        current={valueSynonyms}
      />

      {saving && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.4))", textAlign: "right" }}>
          Saving&hellip;
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const sectionHeadStyle = {
  margin: "0 0 8px 0",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-secondary, #b0b0b6)",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const thStyle = {
  padding: "6px 8px",
  textAlign: "left",
  fontWeight: 600,
  color: "var(--text-secondary, #b0b0b6)",
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const tdStyle = {
  padding: "6px 8px",
  verticalAlign: "middle",
};

const ellipsisStyle = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const emptyStyle = {
  padding: "12px 8px",
  textAlign: "center",
  color: "var(--text-muted, rgba(255,255,255,0.4))",
  fontStyle: "italic",
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

const errorBannerStyle = {
  marginBottom: 8,
  padding: "6px 10px",
  borderRadius: 4,
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.35)",
  color: "#f87171",
  fontSize: 11,
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
