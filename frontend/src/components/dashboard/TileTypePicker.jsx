import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { TOKENS } from './tokens';
import { SPRINGS } from './motion';

/**
 * TileTypePicker — tile type selection modal/dropdown.
 *
 * SP-3a: When adding a new tile (via "+ Add tile" or agent), shows
 * a picker with all available tile types grouped by category.
 *
 * Premium pass:
 *   - Modal wrapper: .premium-liquid-glass, motion entrance
 *   - Picker list: .premium-mount-stagger so rows cascade in
 *   - Tile options: motion whileHover/tap, .premium-sheen hover sweep
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

function TypeCard({ item, onSelect, index }) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(item.type)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={SPRINGS.snappy}
      data-testid={`tile-type-${item.type}`}
      className="premium-sheen"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        '--mount-index': index,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = TOKENS.bg.hover;
        e.currentTarget.style.borderColor = TOKENS.border.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
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
          boxShadow: TOKENS.shadow.innerGlass,
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
    </motion.button>
  );
}

export default function TileTypePicker({ open, onSelect, onClose }) {
  const handleSelect = useCallback((type) => {
    onSelect?.(type);
    onClose?.();
  }, [onSelect, onClose]);

  if (!open) return null;

  // Global stagger index across categories so items cascade in as one list
  let idx = 0;

  return (
    <div
      data-testid="tile-type-picker"
      style={{
        position: 'fixed',
        inset: 0,
        // zIndex 100 — "modals" band per DashboardShell.jsx z-index scale.
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <motion.div
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16 }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--modal-overlay, rgba(0,0,0,0.55))',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRINGS.fluid}
        className="premium-liquid-glass"
        style={{
          position: 'relative',
          borderRadius: 16,
          padding: '24px 20px',
          width: 420,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 24px 48px -12px var(--shadow-deep)',
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
            className="premium-btn"
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
            <div className="premium-mount-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items.map((item) => {
                const thisIdx = idx++;
                return <TypeCard key={item.type} item={item} onSelect={handleSelect} index={thisIdx} />;
              })}
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// Export tile type metadata for external use (agent, command palette)
export { TILE_TYPES };
