import React, { useMemo, useState } from 'react';
import { useStore } from '../../../../store';
import { dedupMembers } from '../lib/setOps';

/**
 * SetMemberDialog — modal editor for a single DashboardSet's members.
 *
 * Props:
 *   - setId: string | null   (null → render nothing)
 *   - onClose: () => void
 *
 * Local draft state holds the member array until Save, which flushes through
 * applySetChangeAnalystPro(setId, 'replace', nextMembers). Cancel discards.
 */
export default function SetMemberDialog({ setId, onClose }) {
  const dashboard = useStore((s) => s.analystProDashboard);
  const applyChange = useStore((s) => s.applySetChangeAnalystPro);

  const targetSet = useMemo(() => {
    if (!dashboard || !setId) return null;
    return (dashboard.sets || []).find((s) => s.id === setId) || null;
  }, [dashboard, setId]);

  const [draft, setDraft] = useState(() => (targetSet ? [...targetSet.members] : []));
  const [input, setInput] = useState('');

  // Re-seed draft when targetSet id changes.
  React.useEffect(() => {
    setDraft(targetSet ? [...targetSet.members] : []);
    setInput('');
  }, [targetSet?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!setId || !targetSet) return null;

  const handleAdd = () => {
    const v = input.trim();
    if (v === '') return;
    // Try numeric coercion so '42' and 42 dedup correctly when the column is numeric.
    const asNum = Number(v);
    const candidate = Number.isFinite(asNum) && String(asNum) === v ? asNum : v;
    setDraft((prev) => dedupMembers([...prev, candidate]));
    setInput('');
  };

  const handleRemove = (idx) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    applyChange(setId, 'replace', draft);
    onClose?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit set members"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal-overlay, rgba(0,0,0,0.55))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--bg-elevated, #1a1a22)',
          color: 'var(--text-primary, #fff)',
          border: '1px solid var(--border-default, #333)',
          borderRadius: 10,
          padding: 20,
          width: 420,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {targetSet.name}
          <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 8, fontSize: 12 }}>
            ({targetSet.dimension})
          </span>
        </h2>

        <ul
          aria-label="Set members"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            overflowY: 'auto',
            flex: '1 1 auto',
            border: '1px solid var(--border-default, #333)',
            borderRadius: 6,
          }}
        >
          {draft.length === 0 && (
            <li style={{ padding: 8, opacity: 0.6, fontSize: 12 }}>No members</li>
          )}
          {draft.map((m, idx) => (
            <li
              key={`${String(m)}__${idx}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 10px',
                borderBottom: '1px solid var(--border-subtle, #222)',
              }}
            >
              <span>{String(m)}</span>
              <button
                type="button"
                aria-label={`Remove ${String(m)}`}
                onClick={() => handleRemove(idx)}
                style={{
                  background: 'transparent',
                  color: 'var(--danger, #f87171)',
                  border: '1px solid var(--danger, #f87171)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Add member…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            style={{
              flex: '1 1 auto',
              padding: '6px 8px',
              background: 'var(--bg-input, #0b0b10)',
              color: 'inherit',
              border: '1px solid var(--border-default, #333)',
              borderRadius: 4,
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            style={{
              padding: '6px 14px',
              background: 'var(--accent, #4f7)',
              color: 'var(--text-on-accent)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Add
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button
            type="button"
            onClick={() => onClose?.()}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid var(--border-default, #333)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '6px 14px',
              background: 'var(--accent, #4f7)',
              color: 'var(--text-on-accent)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
