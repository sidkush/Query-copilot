import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from './tokens';

/**
 * CommandPalette — ⌘K floating fuzzy search for the dashboard builder.
 *
 * This component is what separates AskDB from Tableau/Looker/PowerBI: power
 * users can jump to any dashboard, tab, section, or action from a single
 * keyboard shortcut without ever reaching for a mouse. Arrow keys navigate,
 * Enter executes, Esc closes.
 *
 * The command list is flat — categorized only by a small leading eyebrow — so
 * arrow navigation is predictable. Searching uses a simple token-AND scoring
 * that feels fast even for thousands of items.
 *
 * Open/close is driven by the parent (DashboardBuilder) via `open` + `onClose`.
 * The parent passes a pre-built list of commands so this component stays pure.
 */
export default function CommandPalette({ open, onClose, commands = [] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // Small delay so the modal mounts before we focus (avoids iOS autofocus bugs)
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Simple token-AND fuzzy scoring — each query word must appear in the label or kind
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const tokens = q.split(/\s+/);
    return commands
      .map((cmd) => {
        const haystack = `${cmd.label} ${cmd.kind || ''} ${cmd.hint || ''}`.toLowerCase();
        const allMatch = tokens.every((t) => haystack.includes(t));
        if (!allMatch) return null;
        // Score: earlier matches + shorter labels rank higher
        let score = 0;
        for (const t of tokens) {
          const idx = haystack.indexOf(t);
          score += 100 - Math.min(idx, 100);
        }
        score -= cmd.label.length * 0.3;
        return { ...cmd, _score: score };
      })
      .filter(Boolean)
      .sort((a, b) => b._score - a._score);
  }, [commands, query]);

  // Clamp selected when filtered list changes
  useEffect(() => {
    if (selected >= filtered.length) setSelected(0);
  }, [filtered.length, selected]);

  // Scroll active row into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selected}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  const execute = useCallback((cmd) => {
    try {
      cmd?.action?.();
    } finally {
      onClose?.();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => (filtered.length === 0 ? 0 : (s + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => (filtered.length === 0 ? 0 : (s - 1 + filtered.length) % filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selected]) execute(filtered[selected]);
    }
  }, [filtered, selected, execute, onClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="cmd-k"
        className="cmd-k-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <motion.div
          className="cmd-k-panel"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          {/* Input row */}
          <div style={{ position: 'relative', borderBottom: `1px solid ${TOKENS.border.default}` }}>
            <svg
              className="w-4 h-4"
              style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: TOKENS.text.muted }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="cmd-k-input"
              placeholder="Search dashboards, tabs, sections, or actions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search commands"
            />
            <span
              className="cmd-k-kbd"
              style={{
                position: 'absolute',
                right: 18,
                top: '50%',
                transform: 'translateY(-50%)',
                margin: 0,
              }}
            >
              Esc
            </span>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            style={{ maxHeight: '55vh', overflowY: 'auto', padding: '0.4rem 0' }}
            role="listbox"
            aria-label="Command results"
          >
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: '2.5rem 1.25rem',
                  textAlign: 'center',
                  color: TOKENS.text.muted,
                  fontSize: 13,
                }}
              >
                <p className="eyebrow" style={{ justifyContent: 'center', marginBottom: 8 }}>No matches</p>
                <p>Try a different search — or press Esc to close.</p>
              </div>
            ) : (
              filtered.map((cmd, i) => (
                <div
                  key={cmd.id}
                  data-index={i}
                  className="cmd-k-item"
                  data-selected={i === selected || undefined}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => execute(cmd)}
                  role="option"
                  aria-selected={i === selected}
                  tabIndex={-1}
                >
                  {/* Icon slot */}
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: TOKENS.overlay || TOKENS.bg.hover,
                      border: `1px solid ${TOKENS.border.default}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: TOKENS.text.secondary,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {cmd.icon || (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 5l7 7-7 7" />
                      </svg>
                    )}
                  </span>
                  {/* Label + hint */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span style={{ color: TOKENS.text.primary, fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {cmd.label}
                    </span>
                    {cmd.hint && (
                      <span style={{ fontSize: 11, color: TOKENS.text.muted, letterSpacing: '0.02em' }}>
                        {cmd.hint}
                      </span>
                    )}
                  </div>
                  {/* Kind badge */}
                  {cmd.kind && (
                    <span
                      className="eyebrow"
                      style={{
                        padding: '2px 8px',
                        borderRadius: 9999,
                        background: TOKENS.bg.hover,
                        border: `1px solid ${TOKENS.border.default}`,
                        color: TOKENS.text.muted,
                        fontSize: 9,
                        flexShrink: 0,
                      }}
                    >
                      {cmd.kind}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer hints */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.65rem 1rem',
              borderTop: `1px solid ${TOKENS.border.default}`,
              background: TOKENS.bg.base,
              fontSize: 11,
              color: TOKENS.text.muted,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="cmd-k-kbd" style={{ margin: 0 }}>↑</span>
                <span className="cmd-k-kbd" style={{ margin: 0 }}>↓</span>
                Navigate
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="cmd-k-kbd" style={{ margin: 0 }}>↵</span>
                Select
              </span>
            </div>
            <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 9, fontWeight: 600 }}>
              AskDB · Command palette
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
