import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { columnsRowsToChartSpec } from "./columnsRowsToChartSpec";

const ChartEditor = lazy(() => import("../../editor/ChartEditor"));

/**
 * ChartEditModal — 80vw × 80vh portal overlay wrapping the full ChartEditor
 * (pro mode). Lets users re-encode chat-result charts before saving. Save
 * currently just closes with the current spec via `onSave(spec, resultSet)`;
 * persistence path (push to dashboard tile) is up to the caller.
 *
 * Closes on: Esc, backdrop click, X button.
 */
export default function ChartEditModal({
  open,
  onClose,
  onSave,
  columns = [],
  rows = [],
  title = "Untitled chart",
  initialSpec,
}) {
  const initial = useMemo(() => {
    if (initialSpec) {
      const cp = columnsRowsToChartSpec(columns, rows);
      return { spec: initialSpec, columnProfile: cp.columnProfile || [] };
    }
    return columnsRowsToChartSpec(columns, rows);
  }, [initialSpec, columns, rows]);

  const [spec, setSpec] = useState(initial.spec);
  const [mode, setMode] = useState("pro");
  const resultSet = useMemo(
    () => ({ columns, rows, columnProfile: initial.columnProfile }),
    [columns, rows, initial.columnProfile],
  );

  // Sync spec/mode when the modal (re-)opens. React render-phase state update
  // is the approved alternative to useEffect+setState for prop-derived resets.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setSpec(initial.spec);
      setMode("pro");
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const handleSave = useCallback(() => {
    onSave?.(spec, resultSet);
    onClose?.();
  }, [onSave, onClose, spec, resultSet]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="chart-edit-modal__backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            className="chart-edit-modal__panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Edit chart"
          >
            <header className="chart-edit-modal__header">
              <div className="chart-edit-modal__title-group">
                <span className="chart-edit-modal__eyebrow">Edit chart</span>
                <h2 className="chart-edit-modal__title">{title}</h2>
              </div>
              <div className="chart-edit-modal__actions">
                <button
                  type="button"
                  className="chat-chart-action"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="chat-chart-action chat-chart-action--primary"
                  onClick={handleSave}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="chart-edit-modal__close"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
              </div>
            </header>

            <div className="chart-edit-modal__body">
              <Suspense fallback={<div className="chart-edit-modal__loading">Loading editor…</div>}>
                <ChartEditor
                  spec={spec}
                  resultSet={resultSet}
                  mode={mode}
                  surface="chat-result"
                  onSpecChange={setSpec}
                  onModeChange={setMode}
                />
              </Suspense>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
