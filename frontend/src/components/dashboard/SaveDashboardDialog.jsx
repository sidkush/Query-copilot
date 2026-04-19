/**
 * SaveDashboardDialog — TSS W3-A.
 *
 * Modal shown when the user clicks "+ New Dashboard" in DashboardTopBar.
 * Collects name + connection + smart-build toggle, then dispatches the
 * `saveDashboardAndAutogen` store action which creates the dashboard
 * server-side and (optionally) opens the SemanticTagWizard.
 *
 * Accessibility:
 *   - `role="dialog" aria-modal="true"` on backdrop.
 *   - Name input autofocus on open; focus restored to the previously
 *     focused element on close.
 *   - Escape key closes the dialog.
 *   - Backdrop click closes (panel click is stopPropagation).
 *   - Tab-trap keeps focus inside the panel.
 *
 * Style rules:
 *   - No gradient text, no glassmorphism, no pure black/white.
 *   - Borders kept at 1px (no side stripe > 1px).
 *   - Colors route through CSS tokens (`--bg-elevated`, `--border-*`,
 *     `--text-*`, `--accent`).
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import './SaveDashboardDialog.css';

const NAME_MAX = 40;

export default function SaveDashboardDialog({ open, onClose, initialConnId }) {
  const { connections, activeConnId, saveDashboardAndAutogen } = useStore(
    useShallow((s) => ({
      connections: s.connections || [],
      activeConnId: s.activeConnId,
      saveDashboardAndAutogen: s.saveDashboardAndAutogen,
    })),
  );

  const defaultConnId = initialConnId || activeConnId || connections[0]?.conn_id || '';

  const [name, setName] = useState('');
  const [connId, setConnId] = useState(defaultConnId);
  const [runSmartBuild, setRunSmartBuild] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const nameInputRef = useRef(null);
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Reset state when dialog opens. We capture the element that had focus
  // before the dialog opened so we can restore it on close (a11y).
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      setName('');
      setConnId(defaultConnId);
      setRunSmartBuild(true);
      setSubmitting(false);
      // Defer focus until the next tick so the input has mounted.
      const id = window.setTimeout(() => nameInputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    // Restore focus on close.
    const prev = previousFocusRef.current;
    if (prev && typeof prev.focus === 'function') {
      try { prev.focus(); } catch { /* ignore */ }
    }
    return undefined;
  }, [open, defaultConnId]);

  // Escape-to-close + rudimentary Tab trap inside the panel.
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const trimmedName = name.trim();
  const canSubmit = useMemo(
    () => Boolean(trimmedName && connId && !submitting),
    [trimmedName, connId, submitting],
  );

  if (!open) return null;

  const handleBackdropClick = (e) => {
    // Only close when the click lands on the backdrop itself, not bubbled
    // from descendants.
    if (e.target === e.currentTarget) onClose?.();
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setSubmitting(true);
    // Close the dialog immediately so the wizard (if smart-build is ON)
    // can take over. `saveDashboardAndAutogen` runs async afterwards.
    try {
      onClose?.();
      await saveDashboardAndAutogen?.({
        name: trimmedName,
        connId,
        runSmartBuild,
        tags: {},
      });
    } catch {
      // Errors are surfaced via `analystProDashboard.bindingAutogenError`
      // in the store; dialog stays closed regardless.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="tss-save-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tss-save-dialog-title"
      data-testid="save-dashboard-dialog"
      onClick={handleBackdropClick}
    >
      <form
        ref={panelRef}
        className="tss-save-dialog-panel"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="tss-save-dialog-title" className="tss-save-dialog-title">
          New dashboard
        </h2>
        <p className="tss-save-dialog-subtitle">
          Name it, pick a connection, and we&apos;ll scaffold a smart starter layout.
        </p>

        <div className="tss-save-dialog-field">
          <label htmlFor="tss-save-dialog-name" className="tss-save-dialog-label">
            Dashboard name
          </label>
          <input
            id="tss-save-dialog-name"
            ref={nameInputRef}
            className="tss-save-dialog-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            maxLength={NAME_MAX}
            placeholder="Marketing Dashboard"
            autoComplete="off"
            spellCheck={false}
            data-testid="save-dashboard-name-input"
          />
        </div>

        <div className="tss-save-dialog-field">
          <label htmlFor="tss-save-dialog-conn" className="tss-save-dialog-label">
            Connection
          </label>
          <select
            id="tss-save-dialog-conn"
            className="tss-save-dialog-select"
            value={connId}
            onChange={(e) => setConnId(e.target.value)}
            data-testid="save-dashboard-conn-select"
          >
            {connections.length === 0 && (
              <option value="" disabled>
                No connections available
              </option>
            )}
            {connections.map((c) => (
              <option key={c.conn_id} value={c.conn_id}>
                {c.name || c.conn_id}
                {c.db_type ? ` — ${String(c.db_type).toUpperCase()}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="tss-save-dialog-switch-row">
          <div className="tss-save-dialog-switch-copy">
            <span className="tss-save-dialog-switch-title">Run smart build on save</span>
            <span className="tss-save-dialog-switch-hint">
              We&apos;ll auto-generate starter tiles using your schema + recent queries.
            </span>
          </div>
          <button
            type="button"
            className="tss-save-dialog-switch"
            role="switch"
            aria-checked={runSmartBuild}
            aria-label="Run smart build on save"
            onClick={() => setRunSmartBuild((v) => !v)}
            data-testid="save-dashboard-smart-build-switch"
          >
            <span className="tss-save-dialog-switch-thumb" />
          </button>
        </div>

        <div className="tss-save-dialog-footer">
          <button
            type="button"
            className="tss-save-dialog-btn tss-save-dialog-btn-ghost"
            onClick={onClose}
            data-testid="save-dashboard-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="tss-save-dialog-btn tss-save-dialog-btn-primary"
            disabled={!canSubmit}
            data-testid="save-dashboard-submit"
          >
            Save &amp; Build
          </button>
        </div>
      </form>
    </div>
  );
}
