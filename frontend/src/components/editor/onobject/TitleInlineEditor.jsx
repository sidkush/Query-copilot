import { useState, useEffect, useRef, useCallback } from "react";
import { applySpecPatch } from "../../../chart-ir";

/**
 * TitleInlineEditor — click-to-edit chart title.
 *
 * Phase 2b: a simple contentEditable span that renders the current
 * spec title, enters edit mode on click, and dispatches a JSON Patch
 * replacing spec.title on blur / Enter. Escape reverts.
 *
 * This is independent of the Vega view — it lives on the topbar /
 * chart canvas wrapper and doesn't need scenegraph hooks.
 */
export default function TitleInlineEditor({ spec, onSpecChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(spec?.title || "");
  const spanRef = useRef(null);

  useEffect(() => {
    // state must mirror prop on prop change — derived-state guard
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(spec?.title || "");
  }, [spec?.title]);

  useEffect(() => {
    if (editing && spanRef.current) {
      spanRef.current.focus();
      // Select all text inside the contentEditable.
      const range = document.createRange();
      range.selectNodeContents(spanRef.current);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [editing]);

  const commit = useCallback(
    (nextTitle) => {
      if (!spec) return;
      const trimmed = (nextTitle || "").trim();
      if (trimmed === (spec.title || "")) {
        setEditing(false);
        return;
      }
      const patch = trimmed
        ? [{ op: spec.title !== undefined ? "replace" : "add", path: "/title", value: trimmed }]
        : spec.title !== undefined
          ? [{ op: "remove", path: "/title" }]
          : [];
      if (patch.length > 0) {
        const next = applySpecPatch(spec, patch);
        onSpecChange && onSpecChange(next);
      }
      setEditing(false);
    },
    [spec, onSpecChange],
  );

  const handleBlur = () => {
    commit(spanRef.current?.textContent || "");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      spanRef.current?.blur();
    } else if (e.key === "Escape") {
      setDraft(spec?.title || "");
      if (spanRef.current) {
        spanRef.current.textContent = spec?.title || "";
      }
      setEditing(false);
    }
  };

  return (
    <span
      data-testid="title-inline-editor"
      data-editing={editing || undefined}
      ref={spanRef}
      contentEditable={editing}
      suppressContentEditableWarning
      onClick={() => !editing && setEditing(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: 3,
        background: editing ? "var(--bg-elev-2, rgba(255,255,255,0.04))" : "transparent",
        outline: editing ? "1px solid var(--accent, rgba(96,165,250,0.6))" : "none",
        cursor: editing ? "text" : "pointer",
        color: "var(--text-primary, #e7e7ea)",
        fontSize: 13,
        fontWeight: 600,
        minWidth: 60,
      }}
    >
      {draft || "Untitled chart"}
    </span>
  );
}
