import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from './tokens';

/**
 * TabBar — floating pill tabs with a spring-driven selector indicator.
 *
 * Replaces the underline-style tabs with Linear/Arc-style pills. The active
 * tab's background is a shared-layout element (layoutId="tab-pill-bg") so the
 * selector glides between tabs on click. Double-click any tab to rename; the
 * trailing × only appears on the active tab (and only if more than one tab
 * exists) to avoid accidental dismissals.
 */
export default function TabBar({ tabs = [], activeTabId, onSelect, onAdd, onRename, onDelete }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  const startRename = (tab) => { setRenamingId(tab.id); setRenameVal(tab.name); };
  const commitRename = () => {
    if (renameVal.trim() && renamingId) onRename?.(renamingId, renameVal.trim());
    setRenamingId(null);
  };

  return (
    <div className="flex items-center gap-1.5 mb-4 px-6 pt-1 flex-wrap">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className="tab-pill group"
            data-active={active || undefined}
            onClick={() => onSelect?.(tab.id)}
            onDoubleClick={() => startRename(tab)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(tab.id); }
              if (e.key === 'F2') { e.preventDefault(); startRename(tab); }
            }}
            role="tab"
            tabIndex={active ? 0 : -1}
            aria-selected={active}
          >
            {active && (
              <motion.span
                layoutId="tab-pill-bg"
                className="tab-pill-bg"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            {renamingId === tab.id ? (
              <input
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                autoFocus
                className="bg-transparent outline-none text-sm"
                style={{ color: TOKENS.text.primary, width: Math.max(60, renameVal.length * 8 + 12) }}
              />
            ) : (
              <span style={{ position: 'relative', zIndex: 1 }}>{tab.name}</span>
            )}
            {tabs.length > 1 && active && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete?.(tab.id); }}
                className="ml-0.5 opacity-0 group-hover:opacity-100 ease-spring cursor-pointer flex items-center justify-center"
                style={{
                  color: TOKENS.text.muted,
                  position: 'relative',
                  zIndex: 1,
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  transition: 'opacity 300ms cubic-bezier(0.32,0.72,0,1), color 200ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = TOKENS.text.primary; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = TOKENS.text.muted; }}
                aria-label={`Close ${tab.name} tab`}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" width="10" height="10" aria-hidden="true">
                  <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                </svg>
              </button>
            )}
          </div>
        );
      })}

      {/* Add tab — dashed ghost pill */}
      <button
        onClick={onAdd}
        className="ease-spring cursor-pointer flex items-center gap-1.5"
        style={{
          padding: '0.4rem 0.85rem',
          fontSize: 12,
          color: TOKENS.text.muted,
          background: 'transparent',
          border: `1px dashed ${TOKENS.border.default}`,
          borderRadius: 9999,
          transition: 'color 300ms cubic-bezier(0.32,0.72,0,1), border-color 300ms cubic-bezier(0.32,0.72,0,1), background 300ms cubic-bezier(0.32,0.72,0,1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = TOKENS.text.primary;
          e.currentTarget.style.borderColor = TOKENS.accent;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = TOKENS.text.muted;
          e.currentTarget.style.borderColor = TOKENS.border.default;
        }}
        aria-label="Add tab"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>New tab</span>
      </button>
    </div>
  );
}
