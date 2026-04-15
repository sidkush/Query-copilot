import { useCallback, useState } from "react";
import { applySpecPatch } from "../../../chart-ir";
import PopoverShell from "./popoverShell";

/**
 * AxisPopover — Phase 2b axis editor. Edits the axis title and the
 * numeric format string for the currently clicked axis.
 *
 * Which axis? The overlay's hit-test result carries `meta.orient`
 * (top/bottom/left/right) from Vega's scenegraph. Phase 2b maps:
 *   - bottom / top -> spec.encoding.x
 *   - left / right -> spec.encoding.y
 * For the simple case where only one of x/y is defined, we default to
 * whichever exists.
 *
 * Spec mutations flow through applySpecPatch so they replay through the
 * undo stack like drag-drop edits.
 */
export default function AxisPopover({ x, y, spec, onSpecChange, onClose, meta }) {
  const channel = pickAxisChannel(spec, meta);
  const currentField = channel ? spec?.encoding?.[channel] : null;
  const [title, setTitle] = useState(currentField?.title || "");
  const [format, setFormat] = useState(currentField?.format || "");

  const commit = useCallback(
    (patchFragment) => {
      if (!spec || !channel || !currentField) return;
      const next = applySpecPatch(spec, [
        {
          op: "replace",
          path: `/encoding/${channel}`,
          value: { ...currentField, ...patchFragment },
        },
      ]);
      onSpecChange && onSpecChange(next);
    },
    [spec, channel, currentField, onSpecChange],
  );

  const handleTitleChange = (e) => {
    setTitle(e.target.value);
  };
  const handleTitleBlur = () => {
    commit({ title: title || undefined });
  };
  const handleFormatChange = (e) => {
    setFormat(e.target.value);
  };
  const handleFormatBlur = () => {
    commit({ format: format || undefined });
  };

  if (!channel || !currentField) {
    return (
      <PopoverShell x={x} y={y} onClose={onClose} title="Axis">
        <div style={{ color: "var(--text-muted, rgba(255,255,255,0.5))", fontSize: 11 }}>
          No encoding bound for this axis.
        </div>
      </PopoverShell>
    );
  }

  return (
    <PopoverShell x={x} y={y} onClose={onClose} title={`Axis · ${channel.toUpperCase()}`}>
      <Field label="Field">
        <span data-testid="axis-popover-field" style={{ fontFamily: "monospace" }}>
          {currentField.field}
        </span>
      </Field>
      <Field label="Title">
        <input
          data-testid="axis-popover-title-input"
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={handleTitleBlur}
          placeholder={currentField.field}
          style={inputStyle}
        />
      </Field>
      <Field label="Format">
        <input
          data-testid="axis-popover-format-input"
          type="text"
          value={format}
          onChange={handleFormatChange}
          onBlur={handleFormatBlur}
          placeholder="d3-format, e.g. .2f"
          style={inputStyle}
        />
      </Field>
    </PopoverShell>
  );
}

function pickAxisChannel(spec, meta) {
  const orient = meta?.orient;
  if (orient === "bottom" || orient === "top") return "x";
  if (orient === "left" || orient === "right") return "y";
  // Fallback: pick whichever axis exists.
  if (spec?.encoding?.x) return "x";
  if (spec?.encoding?.y) return "y";
  return null;
}

function Field({ label, children }) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "56px 1fr",
        gap: 6,
        alignItems: "center",
        marginBottom: 6,
      }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-muted, rgba(255,255,255,0.45))",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  padding: "4px 6px",
  fontSize: 11,
  background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
  borderRadius: 3,
  color: "var(--text-primary, #e7e7ea)",
  outline: "none",
  width: "100%",
};
