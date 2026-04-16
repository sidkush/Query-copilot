import { useState, useCallback } from 'react';
import { api } from '../../../api';

/**
 * SampleQuestionsTab — Sub-project D Task 2.
 *
 * Editable table of sample questions for a connection's linguistic model.
 * Each question has: id, table, question, status.
 *
 * Props:
 *   connId    {string}        — active connection ID
 *   linguistic {object|null}  — LinguisticModel from semantic layer
 *   onUpdate  {function}      — called with the updated LinguisticModel after save
 */
export default function SampleQuestionsTab({ connId, linguistic, onUpdate }) {
  const [newTable, setNewTable] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const sampleQuestions = linguistic?.sampleQuestions ?? [];

  // -------------------------------------------------------------------------
  // Persist
  // -------------------------------------------------------------------------

  const persist = useCallback(async (nextQuestions) => {
    if (!connId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(linguistic ?? {}),
        sampleQuestions: nextQuestions,
        updated_at: new Date().toISOString(),
      };
      const saved = await api.saveLinguisticModel(connId, payload);
      if (onUpdate) onUpdate(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [connId, linguistic, onUpdate]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleDelete = useCallback(async (id) => {
    const next = sampleQuestions.filter((q) => q.id !== id);
    await persist(next);
  }, [sampleQuestions, persist]);

  const handleAdd = useCallback(async () => {
    const question = newQuestion.trim();
    if (!question) return;
    const newEntry = {
      id: `q-${Date.now()}`,
      table: newTable.trim(),
      question,
      status: 'user_created',
    };
    const next = [...sampleQuestions, newEntry];
    await persist(next);
    if (!error) {
      setNewTable('');
      setNewQuestion('');
    }
  }, [newTable, newQuestion, sampleQuestions, persist, error]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      data-testid="sample-questions-tab"
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
          <col style={{ width: '46%' }} />
          <col style={{ width: '80px' }} />
          <col style={{ width: '44px' }} />
        </colgroup>

        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
            {['Table', 'Question', 'Status', ''].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Existing question rows */}
          {sampleQuestions.map((q) => (
            <tr
              key={q.id}
              style={{ borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.05))' }}
            >
              {/* Table */}
              <td style={tdStyle}>
                <span
                  title={q.table}
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-secondary, #b0b0b6)',
                    fontSize: 11,
                  }}
                >
                  {q.table || '—'}
                </span>
              </td>

              {/* Question */}
              <td style={tdStyle}>
                <span
                  title={q.question}
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-primary, #e7e7ea)',
                  }}
                >
                  {q.question}
                </span>
              </td>

              {/* Status badge */}
              <td style={tdStyle}>
                <span style={statusBadgeStyle(q.status)}>{q.status}</span>
              </td>

              {/* Delete */}
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <button
                  aria-label={`Delete question ${q.id}`}
                  disabled={saving}
                  onClick={() => handleDelete(q.id)}
                  style={deleteBtn(saving)}
                >
                  &times;
                </button>
              </td>
            </tr>
          ))}

          {/* Empty state */}
          {sampleQuestions.length === 0 && (
            <tr>
              <td
                colSpan={4}
                style={{
                  padding: '12px 8px',
                  textAlign: 'center',
                  color: 'var(--text-muted, rgba(255,255,255,0.4))',
                  fontStyle: 'italic',
                }}
              >
                No sample questions yet
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
            {/* Table input */}
            <td style={tdStyle}>
              <input
                type="text"
                placeholder="table name"
                value={newTable}
                onChange={(e) => setNewTable(e.target.value)}
                disabled={saving}
                aria-label="New question table"
                style={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newQuestion.trim()) handleAdd();
                }}
              />
            </td>

            {/* Question input */}
            <td style={tdStyle}>
              <input
                type="text"
                placeholder="e.g. What is the total revenue by region?"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                disabled={saving}
                aria-label="New sample question"
                style={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newQuestion.trim()) handleAdd();
                }}
              />
            </td>

            {/* Status preview */}
            <td style={tdStyle}>
              <span style={statusBadgeStyle('user_created')}>user_created</span>
            </td>

            {/* Add button */}
            <td style={{ ...tdStyle, textAlign: 'center' }}>
              <button
                aria-label="Add sample question"
                disabled={saving || !newQuestion.trim()}
                onClick={handleAdd}
                style={addBtn(saving || !newQuestion.trim())}
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

function statusBadgeStyle(status) {
  const palettes = {
    suggested:    { bg: 'rgba(245,158,11,0.15)', color: '#fcd34d' },
    accepted:     { bg: 'rgba(16,185,129,0.15)', color: '#6ee7b7' },
    user_created: { bg: 'rgba(59,130,246,0.15)', color: '#93c5fd' },
  };
  const { bg, color } = palettes[status] ?? { bg: 'rgba(255,255,255,0.08)', color: '#e7e7ea' };
  return {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: 4,
    background: bg,
    color,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.03em',
    whiteSpace: 'nowrap',
  };
}
