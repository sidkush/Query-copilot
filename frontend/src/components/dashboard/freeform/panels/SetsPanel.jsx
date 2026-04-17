import React, { useState } from 'react';
import { useStore } from '../../../../store';
import SetMemberDialog from './SetMemberDialog';
import { validateDimension, validateSetName } from '../lib/setOps';
import { generateZoneId } from '../lib/zoneTree';

/**
 * SetsPanel — left-rail panel listing all DashboardSets on the current
 * Analyst Pro dashboard. Supports create / rename / delete and opens
 * SetMemberDialog for member edits.
 */
export default function SetsPanel() {
  const sets = useStore((s) => s.analystProDashboard?.sets || []);
  const addSet = useStore((s) => s.addSetAnalystPro);
  const renameSet = useStore((s) => s.renameSetAnalystPro);
  const deleteSet = useStore((s) => s.deleteSetAnalystPro);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDim, setNewDim] = useState('');
  const [error, setError] = useState('');

  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');

  const [editMembersId, setEditMembersId] = useState(null);

  const resetCreate = () => {
    setCreating(false);
    setNewName('');
    setNewDim('');
    setError('');
  };

  const submitCreate = () => {
    const nameCheck = validateSetName(newName, sets);
    if (!nameCheck.ok) {
      setError(nameCheck.reason === 'empty' ? 'Name is required' : 'A set with that name already exists');
      return;
    }
    if (!validateDimension(newDim.trim())) {
      setError('Invalid dimension — use a plain column name (letters, digits, underscores)');
      return;
    }
    addSet({
      id: generateZoneId(),
      name: newName.trim(),
      dimension: newDim.trim(),
      members: [],
      createdAt: new Date().toISOString(),
    });
    resetCreate();
  };

  const commitRename = (setId) => {
    const trimmed = renameDraft.trim();
    if (trimmed.length > 0) {
      const check = validateSetName(trimmed, sets, setId);
      if (check.ok) {
        renameSet(setId, trimmed);
      }
    }
    setRenamingId(null);
    setRenameDraft('');
  };

  const handleDelete = (setId) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this set?')) return;
    deleteSet(setId);
  };

  return (
    <aside
      aria-label="Sets"
      style={{
        borderTop: '1px solid var(--border-default, #333)',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
          Sets
        </h3>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              background: 'transparent',
              color: 'var(--accent, #4f7)',
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            + New Set
          </button>
        )}
      </div>

      {creating && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 6,
            border: '1px solid var(--border-default, #333)',
            borderRadius: 4,
          }}
        >
          <input
            type="text"
            placeholder="Set name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ padding: 4, fontSize: 12, background: 'var(--bg-input, #0b0b10)', color: 'inherit', border: '1px solid var(--border-default, #333)' }}
          />
          <input
            type="text"
            placeholder="Dimension (e.g. region)"
            value={newDim}
            onChange={(e) => setNewDim(e.target.value)}
            style={{ padding: 4, fontSize: 12, background: 'var(--bg-input, #0b0b10)', color: 'inherit', border: '1px solid var(--border-default, #333)' }}
          />
          {error && <div style={{ color: 'var(--danger, #f87171)', fontSize: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button type="button" onClick={resetCreate} style={{ padding: '2px 8px', fontSize: 11, background: 'transparent', color: 'inherit', border: '1px solid var(--border-default, #333)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={submitCreate} style={{ padding: '2px 10px', fontSize: 11, background: 'var(--accent, #4f7)', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Create
            </button>
          </div>
        </div>
      )}

      {sets.length === 0 && !creating && (
        <div style={{ fontSize: 11, opacity: 0.55, padding: '4px 2px' }}>No sets yet</div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sets.map((s) => (
          <li
            key={s.id}
            data-testid={`set-row-${s.id}`}
            style={{ padding: '4px 6px', borderRadius: 4, fontSize: 12, background: 'var(--bg-subtle, transparent)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {renamingId === s.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(s.id);
                    else if (e.key === 'Escape') {
                      setRenamingId(null);
                      setRenameDraft('');
                    }
                  }}
                  aria-label={`Rename ${s.name}`}
                  style={{ flex: 1, fontSize: 12, padding: 2, background: 'var(--bg-input, #0b0b10)', color: 'inherit', border: '1px solid var(--border-default, #333)' }}
                />
              ) : (
                <span
                  onDoubleClick={() => {
                    setRenamingId(s.id);
                    setRenameDraft(s.name);
                  }}
                  title="Double-click to rename"
                  style={{ flex: 1, cursor: 'text' }}
                >
                  {s.name}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
              {s.dimension} · {s.members.length}
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setEditMembersId(s.id)}
                aria-label={`Edit members of ${s.name}`}
                style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', color: 'var(--accent, #4f7)', border: '1px solid var(--accent, #4f7)', borderRadius: 3, cursor: 'pointer' }}
              >
                Edit Members
              </button>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                aria-label={`Delete ${s.name}`}
                style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', color: 'var(--danger, #f87171)', border: '1px solid var(--danger, #f87171)', borderRadius: 3, cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <SetMemberDialog setId={editMembersId} onClose={() => setEditMembersId(null)} />
    </aside>
  );
}
