import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../../../store';

const RULE_KINDS = [
  { value: 'always', label: 'Always show' },
  { value: 'setMembership', label: 'When a set has / lacks members' },
  { value: 'parameterEquals', label: 'When a parameter equals' },
  { value: 'hasActiveFilter', label: 'When a sheet has an active filter' },
];

function collectSheetIds(dashboard) {
  const ids = new Set();
  const walk = (z) => {
    if (!z) return;
    if (z.type === 'worksheet' && z.worksheetRef) ids.add(z.worksheetRef);
    if (z.children) z.children.forEach(walk);
  };
  walk(dashboard?.tiledRoot);
  (dashboard?.floatingLayer || []).forEach((z) => {
    if (z.type === 'worksheet' && z.worksheetRef) ids.add(z.worksheetRef);
  });
  return Array.from(ids);
}

/**
 * VisibilityTab — Plan 5d extraction of the original ZonePropertiesPanel
 * rule editor. Logic is unchanged; the wrapping <aside> is gone (the tab
 * shell owns the frame).
 */
export default function VisibilityTab({ zone, onPatch }) {
  const dashboard = useStore((s) => s.analystProDashboard);

  const [kind, setKind] = useState('always');
  const [setId, setSetId] = useState('');
  const [setMode, setSetMode] = useState('hasAny');
  const [paramId, setParamId] = useState('');
  const [paramValue, setParamValue] = useState('');
  const [sheetId, setSheetId] = useState('');

  useEffect(() => {
    const rule = zone?.visibilityRule;
    if (!rule || rule.kind === 'always') {
      // state must mirror prop on prop change — derived-state guard
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setKind('always');
      return;
    }
    setKind(rule.kind);
    if (rule.kind === 'setMembership') {
      setSetId(rule.setId);
      setSetMode(rule.mode);
    } else if (rule.kind === 'parameterEquals') {
      setParamId(rule.parameterId);
      setParamValue(String(rule.value));
    } else if (rule.kind === 'hasActiveFilter') {
      setSheetId(rule.sheetId);
    }
  }, [zone?.id, zone?.visibilityRule]);

  const sets = dashboard?.sets || [];
  const parameters = useMemo(() => dashboard?.parameters || [], [dashboard?.parameters]);
  const sheetIds = collectSheetIds(dashboard);

  const onSave = () => {
    let rule;
    if (kind === 'always') {
      rule = undefined;
    } else if (kind === 'setMembership') {
      if (!setId) return;
      rule = { kind: 'setMembership', setId, mode: setMode };
    } else if (kind === 'parameterEquals') {
      const param = parameters.find((p) => p.id === paramId);
      if (!param) return;
      let coerced = paramValue;
      if (param.type === 'number') {
        const n = Number(paramValue);
        if (!Number.isFinite(n)) return;
        coerced = n;
      } else if (param.type === 'boolean') {
        coerced = paramValue === 'true';
      }
      rule = { kind: 'parameterEquals', parameterId: paramId, value: coerced };
    } else if (kind === 'hasActiveFilter') {
      if (!sheetId) return;
      rule = { kind: 'hasActiveFilter', sheetId };
    }
    onPatch({ visibilityRule: rule });
  };

  return (
    <div data-testid="zone-properties-visibility-tab" className="analyst-pro-zone-inspector__body">
      <label style={lblStyle}>
        Visibility rule
        <select
          aria-label="Visibility rule"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          style={inputStyle}
        >
          {RULE_KINDS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>

      {kind === 'setMembership' && (
        <>
          <label style={lblStyle}>
            Set
            <select aria-label="Set" value={setId} onChange={(e) => setSetId(e.target.value)} style={inputStyle}>
              <option value="">— pick a set —</option>
              {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={lblStyle}>
            Mode
            <select aria-label="Mode" value={setMode} onChange={(e) => setSetMode(e.target.value)} style={inputStyle}>
              <option value="hasAny">has any members</option>
              <option value="isEmpty">is empty</option>
            </select>
          </label>
        </>
      )}

      {kind === 'parameterEquals' && (
        <>
          <label style={lblStyle}>
            Parameter
            <select aria-label="Parameter" value={paramId} onChange={(e) => setParamId(e.target.value)} style={inputStyle}>
              <option value="">— pick a parameter —</option>
              {parameters.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={lblStyle}>
            Value
            <input
              aria-label="Value"
              type="text"
              value={paramValue}
              onChange={(e) => setParamValue(e.target.value)}
              style={inputStyle}
            />
          </label>
        </>
      )}

      {kind === 'hasActiveFilter' && (
        <label style={lblStyle}>
          Sheet
          <select aria-label="Sheet" value={sheetId} onChange={(e) => setSheetId(e.target.value)} style={inputStyle}>
            <option value="">— pick a sheet —</option>
            {sheetIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      )}

      <button type="button" onClick={onSave} style={btnPrimary}>
        Save
      </button>
    </div>
  );
}

const lblStyle = { fontSize: 11, opacity: 0.7, display: 'flex', flexDirection: 'column', gap: 2 };
const inputStyle = {
  padding: 4,
  fontSize: 12,
  background: 'var(--bg-input, #0b0b10)',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
  borderRadius: 3,
};
const btnPrimary = {
  padding: '4px 10px',
  fontSize: 11,
  background: 'var(--accent, #4f7)',
  color: 'var(--text-on-accent)',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  fontWeight: 600,
  alignSelf: 'flex-end',
};
