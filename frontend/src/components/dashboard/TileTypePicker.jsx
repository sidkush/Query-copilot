import { useState, useCallback } from 'react';
import { TOKENS } from './tokens';

/**
 * TileTypePicker — tile type selection modal/dropdown.
 *
 * SP-3a: When adding a new tile (via "+ Add tile" or agent), shows
 * a picker with all available tile types grouped by category.
 *
 * Props:
 *   - onSelect   (tileType: string) => void
 *   - onClose    () => void
 *   - open       boolean
 */

const TILE_TYPES = [
  {
    category: 'Charts',
    items: [
      { type: 'bar',     icon: '▮', label: 'Bar',     desc: 'Compare categories' },
      { type: 'line',    icon: '╱', label: 'Line',    desc: 'Trends over time' },
      { type: 'area',    icon: '▓', label: 'Area',    desc: 'Volume over time' },
      { type: 'pie',     icon: '◔', label: 'Pie',     desc: 'Part-to-whole' },
      { type: 'scatter', icon: '⠿', label: 'Scatter', desc: 'Correlation' },
      { type: 'heatmap', icon: '▦', label: 'Heatmap', desc: 'Density matrix' },
    ],
  },
  {
    category: 'Metrics',
    items: [
      { type: 'kpi',     icon: '#',  label: 'KPI Card',  desc: 'Big number + sparkline' },
      { type: 'table',   icon: '⊞',  label: 'Table',     desc: 'Data grid' },
    ],
  },
  {
    category: 'Content',
    items: [
      { type: 'text',    icon: 'T',  label: 'Text / Markdown', desc: 'Freeform rich content' },
      { type: 'insight', icon: '✦',  label: 'AI Insight',      desc: 'Auto-generated summary' },
      { type: 'activity',icon: '◉',  label: 'Activity Feed',   desc: 'Event log timeline' },
    ],
  },
];

function TypeCard({ item, onSelect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.type)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid={`tile-type-${item.type}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: hovered ? TOKENS.bg.hover : 'transparent',
        border: `1px solid ${hovered ? TOKENS.border.hover : 'transparent'}`,
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: `background ${TOKENS.transition}, border-color ${TOKENS.transition}`,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: TOKENS.bg.surface,
          border: `1px solid ${TOKENS.border.default}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 700,
          color: TOKENS.accent,
          flexShrink: 0,
          fontFamily: TOKENS.fontDisplay,
        }}
      >
        {item.icon}
      </div>

      {/* Label + desc */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 650,
            color: TOKENS.text.primary,
            fontFamily: TOKENS.fontDisplay,
            letterSpacing: '-0.01em',
          }}
        >
          {item.label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: TOKENS.text.muted,
            marginTop: 1,
            fontFamily: TOKENS.fontBody,
          }}
        >
          {item.desc}
        </div>
      </div>
    </button>
  );
}

export default function TileTypePicker({ open, onSelect, onClose }) {
  const handleSelect = useCallback((type) => {
    onSelect?.(type);
    onClose?.();
  }, [onSelect, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="tile-type-picker"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          background: TOKENS.bg.elevated,
          border: `1px solid ${TOKENS.border.default}`,
          borderRadius: 16,
          padding: '24px 20px',
          width: 420,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 24px 48px -12px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            padding: '0 4px',
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: TOKENS.text.primary,
              fontFamily: TOKENS.fontDisplay,
              letterSpacing: '-0.02em',
            }}
          >
            Add Tile
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: TOKENS.text.muted,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: '2px 6px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Categories */}
        {TILE_TYPES.map((group) => (
          <div key={group.category} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: TOKENS.text.muted,
                fontFamily: TOKENS.fontDisplay,
                padding: '0 4px 6px',
              }}
            >
              {group.category}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items.map((item) => (
                <TypeCard key={item.type} item={item} onSelect={handleSelect} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Export tile type metadata for external use (agent, command palette)
export { TILE_TYPES };
