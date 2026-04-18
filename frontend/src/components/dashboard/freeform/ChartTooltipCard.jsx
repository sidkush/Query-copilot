import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_OFFSET = 12;

function formatValue(v) {
  if (v == null) return '∅';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

export default function ChartTooltipCard({
  open,
  x,
  y,
  datum,
  onKeepOnly,
  onExclude,
  onViewData,
  onClose,
}) {
  const rootRef = useRef(null);
  const keepRef = useRef(null);
  const excludeRef = useRef(null);
  const viewRef = useRef(null);

  const focusAction = useCallback((idx) => {
    const refs = [keepRef, excludeRef, viewRef];
    const target = refs[(idx + refs.length) % refs.length];
    target.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      const refs = [keepRef, excludeRef, viewRef];
      const focusedIdx = refs.findIndex((r) => r.current === document.activeElement);
      if (focusedIdx < 0) return;
      if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        focusAction(focusedIdx + 1);
      } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        focusAction(focusedIdx - 1);
      }
    },
    [onClose, focusAction],
  );

  useEffect(() => {
    if (!open) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const rect = root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x + TOOLTIP_OFFSET;
    let ny = y + TOOLTIP_OFFSET;
    if (nx + rect.width > vw) nx = Math.max(8, x - TOOLTIP_OFFSET - rect.width);
    if (ny + rect.height > vh) ny = Math.max(8, y - TOOLTIP_OFFSET - rect.height);
    root.style.transform = `translate(${nx}px, ${ny}px)`;
    return undefined;
  }, [open, x, y, datum]);

  if (!open || !datum) return null;
  const entries = Object.entries(datum);

  const card = (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Mark tooltip"
      data-testid="chart-tooltip-card"
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9000,
        minWidth: 200,
        maxWidth: 320,
        padding: 10,
        borderRadius: 8,
        background: 'var(--surface-elevated, rgba(20,20,28,0.96))',
        color: 'var(--text-primary, #e6e6ea)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        fontSize: 12,
        fontFamily: 'Inter, system-ui, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginBottom: 8 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <div style={{ color: 'var(--text-secondary, #b0b0b6)' }}>{k}</div>
            <div style={{ fontWeight: 600 }}>{formatValue(v)}</div>
          </div>
        ))}
      </div>
      <div
        role="group"
        aria-label="Mark actions"
        style={{
          display: 'flex',
          gap: 6,
          paddingTop: 8,
          borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        }}
      >
        <button
          ref={keepRef}
          type="button"
          onClick={() => onKeepOnly?.(datum)}
          style={tooltipButtonStyle}
        >
          Keep Only
        </button>
        <button
          ref={excludeRef}
          type="button"
          onClick={() => onExclude?.(datum)}
          style={tooltipButtonStyle}
        >
          Exclude
        </button>
        <button
          ref={viewRef}
          type="button"
          onClick={() => onViewData?.(datum)}
          style={tooltipButtonStyle}
        >
          View Data
        </button>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(card, document.body) : card;
}

const tooltipButtonStyle = {
  flex: 1,
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: 'var(--text-primary, #e6e6ea)',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  cursor: 'pointer',
};
