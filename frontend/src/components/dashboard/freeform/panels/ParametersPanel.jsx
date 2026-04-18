import React, { useState } from 'react';
import { useStore } from '../../../../store';
import ParameterControl from './ParameterControl';
import { validateParamName, coerceValue } from '../lib/parameterOps';
import { generateZoneId } from '../lib/zoneTree';

const TYPE_OPTIONS = ['string', 'number', 'boolean', 'date'];
// Plan 7 T15 — stable empty-array ref prevents Zustand "getSnapshot should
// be cached" infinite loop under React 19.
const EMPTY_ARR = Object.freeze([]);

/**
 * ParametersPanel — left-rail panel for DashboardParameters. Create with
 * name / type / initial value (free domain). Delete with confirm. Each
 * row renders a ParameterControl for live value editing. List / range
 * domain authoring is Plan 5 — this panel creates free-domain params only.
 */
export default function ParametersPanel() {
  const parameters = useStore((s) => s.analystProDashboard?.parameters || EMPTY_ARR);
  const addParam = useStore((s) => s.addParameterAnalystPro);
  const deleteParam = useStore((s) => s.deleteParameterAnalystPro);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('string');
  const [newInitial, setNewInitial] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setCreating(false);
    setNewName('');
    setNewType('string');
    setNewInitial('');
    setError('');
  };

  const submit = () => {
    const check = validateParamName(newName, parameters);
    if (!check.ok) {
      if (check.reason === 'duplicate') setError('A parameter with that name already exists');
      else if (check.reason === 'empty') setError('Name is required');
      else setError('Invalid name — use letters, digits, underscores');
      return;
    }
    let initial;
    try {
      initial = coerceValue(newType, newInitial === '' ? defaultForType(newType) : newInitial);
    } catch {
      setError(`Invalid initial value for type ${newType}`);
      return;
    }
    addParam({
      id: generateZoneId(),
      name: newName.trim(),
      type: newType,
      value: initial,
      domain: { kind: 'free' },
      createdAt: new Date().toISOString(),
    });
    reset();
  };

  const handleDelete = (paramId) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this parameter?')) return;
    deleteParam(paramId);
  };

  return (
    <aside
      aria-label="Parameters"
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
          Parameters
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
            + New Parameter
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
            placeholder="Parameter name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={inputStyle}
          />
          <label style={{ fontSize: 11, opacity: 0.7 }}>
            Type
            <select
              aria-label="Type"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              style={{ ...inputStyle, marginTop: 2 }}
            >
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <input
            type="text"
            placeholder="Initial value"
            value={newInitial}
            onChange={(e) => setNewInitial(e.target.value)}
            style={inputStyle}
          />
          {error && <div style={{ color: 'var(--danger, #f87171)', fontSize: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button type="button" onClick={reset} style={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} style={btnPrimary}>Create</button>
          </div>
        </div>
      )}

      {parameters.length === 0 && !creating && (
        <div style={{ fontSize: 11, opacity: 0.55, padding: '4px 2px' }}>No parameters yet</div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {parameters.map((p) => (
          <li
            key={p.id}
            data-testid={`parameter-row-${p.id}`}
            style={{
              padding: 6,
              borderRadius: 4,
              border: '1px solid var(--border-subtle, #222)',
              background: 'var(--bg-subtle, transparent)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <ParameterControl param={p} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                aria-label={`Delete ${p.name}`}
                style={{ ...btnGhost, color: 'var(--danger, #f87171)', borderColor: 'var(--danger, #f87171)' }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function defaultForType(t) {
  switch (t) {
    case 'number': return '0';
    case 'boolean': return 'false';
    case 'date': return new Date().toISOString().slice(0, 10);
    case 'string':
    default: return '';
  }
}

const inputStyle = {
  padding: 4,
  fontSize: 12,
  background: 'var(--bg-input, #0b0b10)',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
};

const btnGhost = {
  padding: '2px 8px',
  fontSize: 11,
  background: 'transparent',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
  borderRadius: 3,
  cursor: 'pointer',
};

const btnPrimary = {
  padding: '2px 10px',
  fontSize: 11,
  background: 'var(--accent, #4f7)',
  color: '#000',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  fontWeight: 600,
};
