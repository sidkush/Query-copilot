import { useState, useCallback } from 'react';
import { api } from '../../../api';

/**
 * MetricsTab — Sub-project D Task 2.
 *
 * Editable table of computed metrics attached to a semantic model.
 * Each metric has: id, label, formula, dependencies[], format, description.
 *
 * Props:
 *   connId   {string}        — active connection ID
 *   model    {object|null}   — SemanticModel (global catalog entry)
 *   onUpdate {function}      — called with the updated SemanticModel after save
 */
export default function MetricsTab({ connId, model, onUpdate }) {
  const [newLabel, setNewLabel] = useState('');
  const [newFormula, setNewFormula] = useState('');
  const [newDependencies, setNewDependencies] = useState('');
  const [newFormat, setNewFormat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const metrics = model?.metrics ?? [];

  // -------------------------------------------------------------------------
  // Persist
  // -------------------------------------------------------------------------

  const persist = useCallback(async (nextMetrics) => {
    if (!connId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(model ?? {}),
        metrics: nextMetrics,
        updated_at: new Date().toISOString(),
      };
      const saved = await api.saveSemanticModelConn(connId, payload);
      if (onUpdate) onUpdate(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [connId, model, onUpdate]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleDelete = useCallback(async (id) => {
    const next = metrics.filter((m) => m.id !== id);
    await persist(next);
  }, [metrics, persist]);

  const handleAdd = useCallback(async () => {
    const label = newLabel.trim();
    const formula = newFormula.trim();
    if (!label || !formula) return;
    const dependencies = newDependencies
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    const newMetric = {
      id: `m-${Date.now()}`,
      label,
      formula,
      dependencies,
      format: newFormat.trim() || null,
      description: null,
    };
    const next = [...metrics, newMetric];
    await persist(next);
    if (!error) {
      setNewLabel('');
      setNewFormula('');
      setNewDependencies('');
      setNewFormat('');
    }
  }, [newLabel, newFormula, newDependencies, newFormat, metrics, persist, error]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      data-testid="metrics-tab"
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        color: 'var(--text-primary, #e7e7ea)',
      }}
    >
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 8,
            padding: '6px 10px',
            borderRadius: 4,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: '#f87171',
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '28%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '80px' }} />
          <col style={{ width: '44px' }} />
        </colgroup>

        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
            {['Label', 'Formula', 'Dependencies', 'Format', ''].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Existing metric rows */}
          {metrics.map((m) => (
            <tr
              key={m.id}
              style={{ borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.05))' }}
            >
              {/* Label */}
              <td style={tdStyle}>
                <span
                  title={m.label}
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-primary, #e7e7ea)',
                    fontWeight: 500,
                  }}
                >
                  {m.label}
                </span>
              </td>

              {/* Formula */}
              <td style={tdStyle}>
                <span
                  title={m.formula}
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-secondary, #b0b0b6)',
                    fontFamily: 'monospace',
                    fontSize: 11,
                  }}
                >
                  {m.formula}
                </span>
              </td>

              {/* Dependencies */}
              <td style={tdStyle}>
                <span
                  title={(m.dependencies ?? []).join(', ')}
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-secondary, #b0b0b6)',
                    fontSize: 11,
                  }}
                >
                  {(m.dependencies ?? []).join(', ') || '—'}
                </span>
              </td>

              {/* Format */}
              <td style={tdStyle}>
                {m.format ? (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(99,102,241,0.15)',
                      color: '#a5b4fc',
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: 'monospace',
                    }}
                  >
                    {m.format}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted, rgba(255,255,255,0.3))' }}>—</span>
                )}
              </td>

              {/* Delete */}
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <button
                  aria-label={`Delete metric ${m.id}`}
                  disabled={saving}
                  onClick={() => handleDelete(m.id)}
                  style={deleteBtn(saving)}
                >
                  &times;
                </button>
              </td>
            </tr>
          ))}

          {/* Empty state */}
          {metrics.length === 0 && (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: '12px 8px',
                  textAlign: 'center',
                  color: 'var(--text-muted, rgba(255,255,255,0.4))',
                  fontStyle: 'italic',
                }}
              >
                No metrics defined yet
              </td>
            </tr>
          )}

          {/* Add-new row */}
          <tr
            style={{
              borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.10))',
              background: 'var(--bg-elev-1, rgba(255,255,255,0.02))',
            }}
          >
            {/* Label input */}
            <td style={tdStyle}>
              <input
                type="text"
                placeholder="e.g. ARPU"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                disabled={saving}
                aria-label="New metric label"
                style={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabel.trim() && newFormula.trim()) handleAdd();
                }}
              />
            </td>

            {/* Formula input */}
            <td style={tdStyle}>
              <input
                type="text"
                placeholder="SUM(revenue) / COUNT(DISTINCT id)"
                value={newFormula}
                onChange={(e) => setNewFormula(e.target.value)}
                disabled={saving}
                aria-label="New metric formula"
                style={{ ...inputStyle, fontFamily: 'monospace' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabel.trim() && newFormula.trim()) handleAdd();
                }}
              />
            </td>

            {/* Dependencies input */}
            <td style={tdStyle}>
              <input
                type="text"
                placeholder="measure_id1, measure_id2"
                value={newDependencies}
                onChange={(e) => setNewDependencies(e.target.value)}
                disabled={saving}
                aria-label="New metric dependencies (comma-separated measure ids)"
                style={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabel.trim() && newFormula.trim()) handleAdd();
                }}
              />
            </td>

            {/* Format input */}
            <td style={tdStyle}>
              <input
                type="text"
                placeholder="$,.2f"
                value={newFormat}
                onChange={(e) => setNewFormat(e.target.value)}
                disabled={saving}
                aria-label="New metric format"
                style={{ ...inputStyle, fontFamily: 'monospace' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabel.trim() && newFormula.trim()) handleAdd();
                }}
              />
            </td>

            {/* Add button */}
            <td style={{ ...tdStyle, textAlign: 'center' }}>
              <button
                aria-label="Add metric"
                disabled={saving || !newLabel.trim() || !newFormula.trim()}
                onClick={handleAdd}
                style={addBtn(saving || !newLabel.trim() || !newFormula.trim())}
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
            color: 'var(--text-muted, rgba(255,255,255,0.4))',
            textAlign: 'right',
          }}
        >
          Saving…
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style constants (mirror SynonymsTab dark-theme table pattern)
// ---------------------------------------------------------------------------

const thStyle = {
  padding: '6px 8px',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--text-secondary, #b0b0b6)',
  fontSize: 11,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const tdStyle = {
  padding: '6px 8px',
  verticalAlign: 'middle',
};

const inputStyle = {
  width: '100%',
  background: 'var(--bg-elev-2, rgba(255,255,255,0.04))',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
  borderRadius: 4,
  color: 'var(--text-primary, #e7e7ea)',
  fontSize: 12,
  padding: '4px 6px',
  outline: 'none',
  boxSizing: 'border-box',
};

function deleteBtn(disabled) {
  return {
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: disabled ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary, #b0b0b6)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: 0,
    transition: 'background 0.12s, color 0.12s',
  };
}

function addBtn(disabled) {
  return {
    padding: '4px 8px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 4,
    border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    background: disabled
      ? 'var(--bg-elev-2, rgba(255,255,255,0.04))'
      : 'var(--accent, rgba(96,165,250,0.18))',
    color: disabled
      ? 'var(--text-muted, rgba(255,255,255,0.3))'
      : 'var(--accent-text, rgba(147,197,253,1))',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.12s, color 0.12s',
    whiteSpace: 'nowrap',
  };
}
