import React from 'react';
import {
  TITLE_SHOWN_BY_DEFAULT,
  CAPTION_SHOWN_BY_DEFAULT,
} from '../../lib/zoneDefaults';

const EDGES = [
  { key: 'left',   label: 'Border Left',   idx: 0 },
  { key: 'right',  label: 'Border Right',  idx: 1 },
  { key: 'top',    label: 'Border Top',    idx: 2 },
  { key: 'bottom', label: 'Border Bottom', idx: 3 },
];

const DEFAULT_BORDER = { weight: [0, 0, 0, 0], color: '#000000', style: 'solid' };

function currentBackground(zone) {
  return zone.background || { color: '#000000', opacity: 1 };
}
function currentBorder(zone) {
  return zone.border || DEFAULT_BORDER;
}

export default function StyleTab({ zone, onPatch }) {
  const bg = currentBackground(zone);
  const border = currentBorder(zone);
  const titleDefault = TITLE_SHOWN_BY_DEFAULT.has(zone.type);
  const captionDefault = CAPTION_SHOWN_BY_DEFAULT.has(zone.type);
  const showTitle = typeof zone.showTitle === 'boolean' ? zone.showTitle : titleDefault;
  const showCaption = typeof zone.showCaption === 'boolean' ? zone.showCaption : captionDefault;

  return (
    <div data-testid="zone-properties-style-tab" className="analyst-pro-zone-inspector__body">
      <label style={lblStyle}>
        Background color
        <input
          aria-label="Background color"
          type="color"
          value={bg.color}
          onInput={(e) => onPatch({ background: { color: e.target.value, opacity: bg.opacity ?? 1 } })}
          style={inputStyle}
        />
      </label>
      <label style={lblStyle}>
        Background opacity
        <input
          aria-label="Background opacity"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={bg.opacity ?? 1}
          onChange={(e) => onPatch({ background: { color: bg.color ?? '#000000', opacity: Number(e.target.value) } })}
          style={inputStyle}
        />
      </label>

      {EDGES.map((edge) => (
        <label key={edge.key} style={lblStyle}>
          {edge.label}
          <input
            aria-label={edge.label}
            type="number"
            min={0}
            max={20}
            value={border.weight[edge.idx] ?? 0}
            onChange={(e) => {
              const w = [...border.weight];
              w[edge.idx] = Math.max(0, Math.min(20, Number(e.target.value) || 0));
              onPatch({ border: { weight: w, color: border.color, style: border.style } });
            }}
            style={inputStyle}
          />
        </label>
      ))}

      <label style={lblStyle}>
        Border color
        <input
          aria-label="Border color"
          type="color"
          value={border.color}
          onInput={(e) => onPatch({ border: { weight: border.weight, color: e.target.value, style: border.style } })}
          style={inputStyle}
        />
      </label>
      <label style={lblStyle}>
        Border style
        <select
          aria-label="Border style"
          value={border.style}
          onChange={(e) => onPatch({ border: { weight: border.weight, color: border.color, style: e.target.value } })}
          style={inputStyle}
        >
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
        </select>
      </label>

      <label style={toggleStyle}>
        <input
          aria-label="Show title"
          type="checkbox"
          checked={showTitle}
          onChange={() => onPatch({ showTitle: !showTitle })}
        />
        Show title
      </label>

      {zone.type === 'worksheet' && (
        <label style={toggleStyle}>
          <input
            aria-label="Show caption"
            type="checkbox"
            checked={showCaption}
            onChange={() => onPatch({ showCaption: !showCaption })}
          />
          Show caption
        </label>
      )}
    </div>
  );
}

const lblStyle = { fontSize: 11, opacity: 0.7, display: 'flex', flexDirection: 'column', gap: 2 };
const toggleStyle = { fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 };
const inputStyle = {
  padding: 4,
  fontSize: 12,
  background: 'var(--bg-input, #0b0b10)',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
  borderRadius: 3,
};
