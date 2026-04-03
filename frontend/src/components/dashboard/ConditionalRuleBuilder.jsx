import { useCallback } from 'react';
import { TOKENS } from './tokens';
import ColorPickerButton from './ColorPickerButton';

const CONDITIONS = [
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: '===', label: '===' },
  { value: '!==', label: '!==' },
  { value: 'range', label: 'Range' },
];

const inputStyle = {
  padding: '6px 10px',
  background: TOKENS.bg.surface,
  border: `1px solid ${TOKENS.border.default}`,
  borderRadius: TOKENS.radius.sm,
  color: TOKENS.text.primary,
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function ConditionalRuleBuilder({ rules = [], measures = [], onChange }) {
  const updateRule = useCallback((index, patch) => {
    const next = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  }, [rules, onChange]);

  const removeRule = useCallback((index) => {
    onChange(rules.filter((_, i) => i !== index));
  }, [rules, onChange]);

  const addRule = useCallback(() => {
    onChange([
      ...rules,
      { measure: measures[0] || '', condition: '>', value: 0, color: '#22C55E' },
    ]);
  }, [rules, measures, onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rules.map((rule, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 10px',
            background: TOKENS.bg.surface,
            borderRadius: TOKENS.radius.sm,
            border: `1px solid ${TOKENS.border.default}`,
          }}
        >
          {/* Measure select */}
          <select
            value={rule.measure || ''}
            onChange={(e) => updateRule(i, { measure: e.target.value })}
            style={{ ...inputStyle, width: 100, cursor: 'pointer', flexShrink: 0 }}
          >
            <option value="">--</option>
            {measures.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* Condition select */}
          <select
            value={rule.condition || '>'}
            onChange={(e) => updateRule(i, { condition: e.target.value })}
            style={{ ...inputStyle, width: 72, cursor: 'pointer', flexShrink: 0 }}
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          {/* Value */}
          <input
            type="number"
            value={rule.value ?? 0}
            onChange={(e) => updateRule(i, { value: parseFloat(e.target.value) || 0 })}
            placeholder="Value"
            style={{ ...inputStyle, width: 70, flexShrink: 0 }}
          />

          {/* Value2 (range only) */}
          {rule.condition === 'range' && (
            <input
              type="number"
              value={rule.value2 ?? 0}
              onChange={(e) => updateRule(i, { value2: parseFloat(e.target.value) || 0 })}
              placeholder="Max"
              style={{ ...inputStyle, width: 70, flexShrink: 0 }}
            />
          )}

          {/* Color */}
          <ColorPickerButton
            color={rule.color || '#22C55E'}
            onChange={(c) => updateRule(i, { color: c })}
            size={26}
          />

          {/* Delete */}
          <button
            type="button"
            onClick={() => removeRule(i)}
            style={{
              background: 'none',
              border: 'none',
              color: TOKENS.text.muted,
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              padding: '2px 4px',
              flexShrink: 0,
              transition: `color ${TOKENS.transition}`,
            }}
            title="Remove rule"
          >
            &times;
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRule}
        disabled={measures.length === 0}
        style={{
          padding: '6px 12px',
          background: 'transparent',
          border: `1px dashed ${TOKENS.border.hover}`,
          borderRadius: TOKENS.radius.sm,
          color: measures.length === 0 ? TOKENS.text.muted : TOKENS.text.secondary,
          fontSize: '12px',
          cursor: measures.length === 0 ? 'not-allowed' : 'pointer',
          opacity: measures.length === 0 ? 0.5 : 1,
          transition: `color ${TOKENS.transition}, border-color ${TOKENS.transition}`,
        }}
      >
        + Add Rule
      </button>
    </div>
  );
}
