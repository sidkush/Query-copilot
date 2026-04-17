import React from 'react';
import { useStore } from '../../../../store';

/**
 * ParameterControl — per-parameter widget that commits value edits through
 * setParameterValueAnalystPro. Widget is chosen by param.domain.kind then
 * param.type. The store slice handles coercion + domain validation, so we
 * pass the raw DOM value up without intermediate coercion here.
 */
export default function ParameterControl({ param }) {
  const setValue = useStore((s) => s.setParameterValueAnalystPro);
  if (!param) return null;
  const label = param.name;
  const base = {
    padding: '4px 6px',
    fontSize: 12,
    background: 'var(--bg-input, #0b0b10)',
    color: 'inherit',
    border: '1px solid var(--border-default, #333)',
    borderRadius: 3,
    width: '100%',
  };

  if (param.domain.kind === 'list') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
        <span style={{ opacity: 0.7 }}>{label}</span>
        <select
          aria-label={label}
          value={String(param.value)}
          onChange={(e) => setValue(param.id, e.target.value)}
          style={base}
        >
          {param.domain.values.map((v) => (
            <option key={String(v)} value={String(v)}>{String(v)}</option>
          ))}
        </select>
      </label>
    );
  }

  if (param.domain.kind === 'range' && param.type === 'number') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
        <span style={{ opacity: 0.7 }}>
          {label} <span style={{ opacity: 0.7 }}>({String(param.value)})</span>
        </span>
        <input
          type="range"
          aria-label={label}
          min={param.domain.min}
          max={param.domain.max}
          step={param.domain.step}
          value={typeof param.value === 'number' ? param.value : Number(param.value) || 0}
          onChange={(e) => setValue(param.id, e.target.value)}
        />
      </label>
    );
  }

  if (param.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
        <input
          type="checkbox"
          aria-label={label}
          checked={!!param.value}
          onChange={(e) => setValue(param.id, e.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }

  if (param.type === 'date') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
        <span style={{ opacity: 0.7 }}>{label}</span>
        <input
          type="date"
          aria-label={label}
          value={typeof param.value === 'string' ? param.value.slice(0, 10) : ''}
          onChange={(e) => setValue(param.id, e.target.value)}
          style={base}
        />
      </label>
    );
  }

  // Fallback: free text for string / number free domains.
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <input
        type={param.type === 'number' ? 'number' : 'text'}
        aria-label={label}
        value={String(param.value ?? '')}
        onChange={(e) => setValue(param.id, e.target.value)}
        style={base}
      />
    </label>
  );
}
