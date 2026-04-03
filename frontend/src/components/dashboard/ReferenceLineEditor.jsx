import { useCallback } from 'react';
import { TOKENS } from './tokens';
import ColorPickerButton from './ColorPickerButton';

const VALUE_TYPES = [
  { value: 'custom', label: 'Custom' },
  { value: 'avg', label: 'Avg' },
  { value: 'median', label: 'Median' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
];

const LINE_STYLES = [
  { value: '0', label: 'Solid' },
  { value: '5 5', label: 'Dashed' },
  { value: '2 2', label: 'Dotted' },
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

export default function ReferenceLineEditor({ lines = [], onChange }) {
  const updateLine = useCallback((index, patch) => {
    const next = lines.map((l, i) => (i === index ? { ...l, ...patch } : l));
    onChange(next);
  }, [lines, onChange]);

  const removeLine = useCallback((index) => {
    onChange(lines.filter((_, i) => i !== index));
  }, [lines, onChange]);

  const addLine = useCallback(() => {
    onChange([...lines, { value: 100, label: '', stroke: '#F59E0B', strokeDasharray: '5 5' }]);
  }, [lines, onChange]);

  const isCustom = (val) => typeof val === 'number' || (typeof val === 'string' && !['avg', 'median', 'min', 'max'].includes(val));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lines.map((line, i) => {
        const custom = isCustom(line.value);
        return (
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
            {/* Value type select */}
            <select
              value={custom ? 'custom' : line.value}
              onChange={(e) => {
                const v = e.target.value;
                updateLine(i, { value: v === 'custom' ? 0 : v });
              }}
              style={{ ...inputStyle, width: 80, cursor: 'pointer', flexShrink: 0 }}
            >
              {VALUE_TYPES.map((vt) => (
                <option key={vt.value} value={vt.value}>{vt.label}</option>
              ))}
            </select>

            {/* Number input (only for custom) */}
            {custom && (
              <input
                type="number"
                value={typeof line.value === 'number' ? line.value : 0}
                onChange={(e) => updateLine(i, { value: parseFloat(e.target.value) || 0 })}
                style={{ ...inputStyle, width: 70, flexShrink: 0 }}
              />
            )}

            {/* Label */}
            <input
              type="text"
              value={line.label || ''}
              onChange={(e) => updateLine(i, { label: e.target.value })}
              placeholder="Label"
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />

            {/* Stroke color */}
            <ColorPickerButton
              color={line.stroke || '#F59E0B'}
              onChange={(c) => updateLine(i, { stroke: c })}
              size={26}
            />

            {/* Line style */}
            <select
              value={line.strokeDasharray || '0'}
              onChange={(e) => updateLine(i, { strokeDasharray: e.target.value })}
              style={{ ...inputStyle, width: 78, cursor: 'pointer', flexShrink: 0 }}
            >
              {LINE_STYLES.map((ls) => (
                <option key={ls.value} value={ls.value}>{ls.label}</option>
              ))}
            </select>

            {/* Delete */}
            <button
              type="button"
              onClick={() => removeLine(i)}
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
              title="Remove line"
            >
              &times;
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addLine}
        style={{
          padding: '6px 12px',
          background: 'transparent',
          border: `1px dashed ${TOKENS.border.hover}`,
          borderRadius: TOKENS.radius.sm,
          color: TOKENS.text.secondary,
          fontSize: '12px',
          cursor: 'pointer',
          transition: `color ${TOKENS.transition}, border-color ${TOKENS.transition}`,
        }}
      >
        + Add Reference Line
      </button>
    </div>
  );
}
