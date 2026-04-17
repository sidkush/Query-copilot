import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api";
import { SPRINGS } from "../dashboard/motion";

// ── Type badge palette (top-of-file for discoverability) ───────────────────
// TODO: migrate to TOKENS.typeColors once defined in tokens.js
const TYPE_COLORS = {
  table:       { bg: "rgba(94,234,212,0.12)",  color: "#5eead4" },
  column:      { bg: "rgba(167,139,250,0.12)", color: "#a78bfa" },
  verb:        { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  attribute:   { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  name:        { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  adjective:   { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  preposition: { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  question:    { bg: "rgba(52,211,153,0.12)",  color: "#34d399" },
};

/* ─────────────────────────────────────────────────────────────────────────
 * BootstrapReview — D1 Task 4
 *
 * Full-screen overlay modal for reviewing AI-bootstrapped semantic
 * suggestions (synonyms, relationship phrasings, sample questions).
 * Users check/uncheck items, then bulk-accept or dismiss all.
 *
 * Props
 *   connId     string          — active connection id
 *   linguistic LinguisticModel — bootstrapped model from the API
 *   onClose    () => void
 *   onAccepted (model) => void — called after saving; receives saved model
 * ──────────────────────────────────────────────────────────────────────── */

// ── Style helpers ──────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--modal-overlay, rgba(0,0,0,0.72))",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    padding: "20px 16px",
  },
  card: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    borderRadius: 16,
    boxShadow:
      "0 24px 64px var(--shadow-deep), 0 0 40px var(--accent-glow), inset 0 1px 0 var(--glass-highlight)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 22px 14px",
    borderBottom: "1px solid var(--border-default, rgba(255,255,255,0.06))",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: "var(--text-primary, #ededef)",
    margin: 0,
  },
  closeBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "1px solid var(--border-default, rgba(255,255,255,0.06))",
    background: "transparent",
    color: "var(--text-muted, #5c5f66)",
    cursor: "pointer",
    transition: "all 0.15s",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  description: {
    fontSize: 12.5,
    lineHeight: 1.6,
    color: "var(--text-secondary, #8a8f98)",
    margin: 0,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  toolbarBtn: {
    padding: "4px 12px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 6,
    border: "1px solid var(--border-hover, rgba(255,255,255,0.12))",
    background: "transparent",
    color: "var(--text-secondary, #8a8f98)",
    cursor: "pointer",
    transition: "all 0.15s",
    letterSpacing: "0.01em",
  },
  badge: {
    marginLeft: "auto",
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 999,
    background: "rgba(37,99,235,0.18)",
    color: "var(--accent-light, #3b82f6)",
    letterSpacing: "0.02em",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text-muted, #5c5f66)",
    marginBottom: 2,
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid transparent",
    cursor: "pointer",
    transition: "all 0.12s",
    userSelect: "none",
  },
  rowChecked: {
    background: "rgba(37,99,235,0.07)",
    borderColor: "rgba(37,99,235,0.15)",
  },
  rowUnchecked: {
    background: "var(--overlay-faint)",
    borderColor: "transparent",
  },
  checkbox: {
    flexShrink: 0,
    marginTop: 1,
    width: 15,
    height: 15,
    borderRadius: 4,
    border: "1.5px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.12s",
  },
  checkboxChecked: {
    background: "var(--accent, #2563eb)",
    borderColor: "var(--accent, #2563eb)",
  },
  checkboxUnchecked: {
    background: "transparent",
    borderColor: "var(--border-hover, rgba(255,255,255,0.18))",
  },
  rowMain: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--text-primary, #ededef)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowSub: {
    fontSize: 11,
    color: "var(--text-muted, #5c5f66)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  typeBadge: {
    flexShrink: 0,
    marginLeft: "auto",
    padding: "2px 7px",
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    borderRadius: 5,
    alignSelf: "flex-start",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "14px 22px",
    borderTop: "1px solid var(--border-default, rgba(255,255,255,0.06))",
    flexShrink: 0,
  },
  dismissBtn: {
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid var(--border-hover, rgba(255,255,255,0.10))",
    background: "transparent",
    color: "var(--text-secondary, #8a8f98)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  acceptBtn: (disabled) => ({
    padding: "8px 20px",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 8,
    border: "none",
    background: disabled
      ? "rgba(37,99,235,0.25)"
      : "var(--accent, #2563eb)",
    color: disabled ? "var(--text-muted)" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: disabled ? "none" : "0 4px 16px rgba(37,99,235,0.35)",
  }),
};

// ── Item flattening helpers ────────────────────────────────────────────────

/**
 * Flatten the LinguisticModel into a list of selectable item descriptors.
 * Returns { id, kind, label, sub, typeTag } per item.
 */
function flattenItems(linguistic) {
  const items = [];

  // 1. Table synonyms
  const tables = linguistic?.synonyms?.tables ?? {};
  for (const [table, synonyms] of Object.entries(tables)) {
    if (!synonyms || synonyms.length === 0) continue;
    items.push({
      id: `table::${table}`,
      kind: "table_synonym",
      label: table,
      sub: synonyms.join(", "),
      typeTag: "table",
    });
  }

  // 2. Column synonyms
  const columns = linguistic?.synonyms?.columns ?? {};
  for (const [col, synonyms] of Object.entries(columns)) {
    if (!synonyms || synonyms.length === 0) continue;
    items.push({
      id: `col::${col}`,
      kind: "col_synonym",
      label: col,
      sub: synonyms.join(", "),
      typeTag: "column",
    });
  }

  // 3. Relationship phrasings
  const phrasings = linguistic?.phrasings ?? [];
  for (const p of phrasings) {
    items.push({
      id: `phr::${p.id}`,
      kind: "phrasing",
      label: p.template,
      sub: p.entities?.join(" \u00B7 ") || "",
      typeTag: p.type ?? "verb",
      _phrasId: p.id,
    });
  }

  // 4. Sample questions
  const questions = linguistic?.sampleQuestions ?? [];
  for (const q of questions) {
    items.push({
      id: `sq::${q.id}`,
      kind: "sample_question",
      label: q.question,
      sub: q.table || "",
      typeTag: "question",
      _sqId: q.id,
    });
  }

  return items;
}

/**
 * Build an initial checked-set (all items checked by default).
 */
function initialChecked(items) {
  const s = new Set();
  for (const it of items) s.add(it.id);
  return s;
}

/**
 * Filter the linguistic model down to only the checked items.
 */
function filterModel(linguistic, checked) {
  const tables = {};
  const columns = {};

  for (const [table, synonyms] of Object.entries(linguistic?.synonyms?.tables ?? {})) {
    if (checked.has(`table::${table}`)) tables[table] = synonyms;
  }
  for (const [col, synonyms] of Object.entries(linguistic?.synonyms?.columns ?? {})) {
    if (checked.has(`col::${col}`)) columns[col] = synonyms;
  }

  const phrasings = (linguistic?.phrasings ?? []).filter((p) =>
    checked.has(`phr::${p.id}`)
  );

  const sampleQuestions = (linguistic?.sampleQuestions ?? []).filter((q) =>
    checked.has(`sq::${q.id}`)
  );

  return {
    ...linguistic,
    synonyms: {
      ...(linguistic?.synonyms ?? {}),
      tables,
      columns,
    },
    phrasings,
    sampleQuestions,
    status: "accepted",
  };
}

// ── Sub-components ────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
      <path d="M1 3.5L3.2 6L8 1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.25)",
        borderTopColor: "#fff",
        animation: "spin 0.75s linear infinite",
      }}
    />
  );
}

function SuggestionRow({ item, checked, onToggle, index = 0 }) {
  const isChecked = checked.has(item.id);
  const [hovered, setHovered] = useState(false);
  const typeColor = TYPE_COLORS[item.typeTag] ?? { bg: "rgba(255,255,255,0.06)", color: "var(--text-muted)" };

  const borderColor = hovered
    ? (isChecked ? "rgba(37,99,235,0.25)" : "var(--border-hover, rgba(255,255,255,0.10))")
    : (isChecked ? "rgba(37,99,235,0.15)" : "transparent");

  return (
    <div
      role="checkbox"
      aria-checked={isChecked}
      tabIndex={0}
      onClick={() => onToggle(item.id)}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onToggle(item.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        ...S.row,
        ...(isChecked ? S.rowChecked : S.rowUnchecked),
        borderColor,
        '--mount-index': index,
      }}
    >
      {/* Checkbox */}
      <div
        style={{
          ...S.checkbox,
          ...(isChecked ? S.checkboxChecked : S.checkboxUnchecked),
        }}
      >
        {isChecked && <CheckIcon />}
      </div>

      {/* Label + sub */}
      <div style={S.rowMain}>
        <span style={S.rowLabel}>{item.label}</span>
        {item.sub && <span style={S.rowSub}>{item.sub}</span>}
      </div>

      {/* Type badge — liquid-glass edge via inset + outer ring */}
      <span
        style={{
          ...S.typeBadge,
          background: typeColor.bg,
          color: typeColor.color,
          boxShadow: `inset 0 0 0 1px ${typeColor.color}22, 0 0 0 1px ${typeColor.color}44`,
        }}
      >
        {item.typeTag}
      </span>
    </div>
  );
}

function Section({ title, items, checked, onToggle, indexOffset = 0 }) {
  if (items.length === 0) return null;
  return (
    <div style={S.section}>
      <div style={S.sectionHeader}>{title}</div>
      <div className="premium-mount-stagger" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item, i) => (
          <SuggestionRow
            key={item.id}
            item={item}
            checked={checked}
            onToggle={onToggle}
            index={indexOffset + i}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function BootstrapReview({ connId, linguistic, onClose, onAccepted }) {
  const allItems = useMemo(() => flattenItems(linguistic), [linguistic]);
  const [checked, setChecked] = useState(() => initialChecked(allItems));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Accessibility refs: modal container (focus trap scope) + close button (initial focus)
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);

  // ESC to close + focus trap (Tab/Shift+Tab wrap)
  useEffect(() => {
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const nodes = modalRef.current.querySelectorAll(focusableSelector);
        const visible = Array.from(nodes).filter(
          (n) => !n.hasAttribute("disabled") && n.offsetParent !== null,
        );
        if (visible.length === 0) return;
        const first = visible[0];
        const last = visible[visible.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Initial focus on close button when modal opens
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  const checkedCount = checked.size;
  const totalCount = allItems.length;

  const tableSynItems = useMemo(
    () => allItems.filter((i) => i.kind === "table_synonym"),
    [allItems]
  );
  const colSynItems = useMemo(
    () => allItems.filter((i) => i.kind === "col_synonym"),
    [allItems]
  );
  const phrasItems = useMemo(
    () => allItems.filter((i) => i.kind === "phrasing"),
    [allItems]
  );
  const sqItems = useMemo(
    () => allItems.filter((i) => i.kind === "sample_question"),
    [allItems]
  );

  const handleToggle = useCallback((id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setChecked(new Set(allItems.map((i) => i.id)));
  }, [allItems]);

  const handleDeselectAll = useCallback(() => {
    setChecked(new Set());
  }, []);

  const handleAccept = useCallback(async () => {
    if (saving || checkedCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      const filtered = filterModel(linguistic, checked);
      const saved = await api.saveLinguisticModel(connId, filtered);
      onAccepted(saved);
    } catch (err) {
      setError(err?.message || "Failed to save. Please try again.");
      setSaving(false);
    }
  }, [saving, checkedCount, linguistic, checked, connId, onAccepted]);

  const acceptDisabled = saving || checkedCount === 0;

  // Trap overlay close on backdrop click
  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  return (
    <>
      {/* Inject keyframes + declarative hover + scroll-fade styles */}
      <style>{`
        @keyframes br-spin { to { transform: rotate(360deg); } }
        [data-br-spin] { animation: br-spin 0.75s linear infinite; }

        .br-close-btn:hover,
        .br-close-btn:focus-visible {
          background: var(--bg-hover, rgba(255,255,255,0.05));
          color: var(--text-primary, #ededef);
        }
        .br-dismiss-btn:hover,
        .br-dismiss-btn:focus-visible {
          background: var(--bg-hover, rgba(255,255,255,0.05));
          color: var(--text-primary, #ededef);
        }
        .br-accept-btn:not(:disabled):hover,
        .br-accept-btn:not(:disabled):focus-visible {
          background: var(--accent-light, #3b82f6);
          box-shadow: 0 6px 20px rgba(37,99,235,0.45);
        }

        /* Subtle bottom fade when scrollable content overflows */
        .br-body { position: relative; }
        .br-body::after {
          content: '';
          position: sticky;
          display: block;
          bottom: 0;
          left: 0;
          right: 0;
          height: 24px;
          margin-top: -24px;
          background: linear-gradient(to top, var(--bg-surface, #1a1a2e), transparent);
          pointer-events: none;
        }
      `}</style>

      <AnimatePresence>
        <motion.div
          key="br-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={S.overlay}
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-label="Review Semantic Suggestions"
        >
          <motion.div
            ref={modalRef}
            className="premium-liquid-glass"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={SPRINGS.fluid}
            style={S.card}
          >

          {/* ── Header ─────────────────────────────────────────── */}
          <div style={S.header}>
            <h2 style={S.headerTitle}>Review Semantic Suggestions</h2>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="br-close-btn"
              style={S.closeBtn}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* ── Body ───────────────────────────────────────────── */}
          <div className="br-body" style={S.body}>
            {/* Description */}
            <p style={S.description}>
              AskDB analysed your database schema and generated synonyms, relationship
              phrasings, and sample questions. Review and select the suggestions that
              accurately describe your data — accepted items will be used to improve
              query understanding for this connection.
            </p>

            {/* Toolbar: select all / deselect all + count badge */}
            <div style={S.toolbar}>
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={checkedCount === totalCount}
                style={{
                  ...S.toolbarBtn,
                  opacity: checkedCount === totalCount ? 0.45 : 1,
                  cursor: checkedCount === totalCount ? "default" : "pointer",
                }}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={checkedCount === 0}
                style={{
                  ...S.toolbarBtn,
                  opacity: checkedCount === 0 ? 0.45 : 1,
                  cursor: checkedCount === 0 ? "default" : "pointer",
                }}
              >
                Deselect all
              </button>
              <span style={S.badge}>
                {checkedCount} / {totalCount} selected
              </span>
            </div>

            {/* Error banner */}
            {error && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 7,
                  background: "rgba(239,68,68,0.10)",
                  border: "1px solid rgba(239,68,68,0.22)",
                  fontSize: 12,
                  color: "#f87171",
                }}
              >
                {error}
              </div>
            )}

            {/* Empty state */}
            {totalCount === 0 && (
              <div
                style={{
                  padding: "24px 0",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--text-muted, #5c5f66)",
                  fontStyle: "italic",
                }}
              >
                No suggestions were generated for this connection.
              </div>
            )}

            {/* Sections — cascade indexOffset so global mount-in forms a single waterfall */}
            <Section
              title="Table Synonyms"
              items={tableSynItems}
              checked={checked}
              onToggle={handleToggle}
              indexOffset={0}
            />
            <Section
              title="Column Synonyms"
              items={colSynItems}
              checked={checked}
              onToggle={handleToggle}
              indexOffset={tableSynItems.length}
            />
            <Section
              title="Relationship Phrasings"
              items={phrasItems}
              checked={checked}
              onToggle={handleToggle}
              indexOffset={tableSynItems.length + colSynItems.length}
            />
            <Section
              title="Sample Questions"
              items={sqItems}
              checked={checked}
              onToggle={handleToggle}
              indexOffset={tableSynItems.length + colSynItems.length + phrasItems.length}
            />
          </div>

          {/* ── Footer ─────────────────────────────────────────── */}
          <div style={S.footer}>
            <button
              type="button"
              onClick={onClose}
              className="br-dismiss-btn"
              style={S.dismissBtn}
            >
              Dismiss All
            </button>

            <button
              type="button"
              onClick={handleAccept}
              disabled={acceptDisabled}
              className={`br-accept-btn premium-btn${acceptDisabled ? "" : " premium-sheen"}`}
              style={S.acceptBtn(acceptDisabled)}
            >
              {saving && (
                <div
                  data-br-spin
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.25)",
                    borderTopColor: "#fff",
                  }}
                />
              )}
              {saving ? "Saving…" : `Accept ${checkedCount} suggestion${checkedCount !== 1 ? "s" : ""}`}
            </button>
          </div>

          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
