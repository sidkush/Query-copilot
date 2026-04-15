import { useCallback, useMemo } from "react";
import { applySpecPatch } from "../../../chart-ir";
import PopoverShell from "./popoverShell";

/**
 * LegendPopover — Phase 2b legend editor. Toggles legend visibility,
 * changes legend orient (top/bottom/left/right/none), and edits the
 * legend title on the color / size channel (whichever has a binding).
 *
 * The legend lives on whichever encoding channel is non-positional —
 * typically `color`, but size/shape/opacity can also produce a legend.
 * We pick the first bound non-positional channel for Phase 2b.
 */
const ORIENTS = ["top", "right", "bottom", "left"];

const LEGEND_CHANNELS = ["color", "size", "shape", "opacity"];

export default function LegendPopover({ x, y, spec, onSpecChange, onClose }) {
  const channel = useMemo(() => {
    if (!spec?.encoding) return null;
    for (const c of LEGEND_CHANNELS) {
      if (spec.encoding[c]) return c;
    }
    return null;
  }, [spec]);

  const currentField = channel ? spec?.encoding?.[channel] : null;
  const currentOrient =
    (currentField && typeof currentField === "object" && currentField.legend?.orient) ||
    "right";
  const isHidden = currentField?.legend === null;

  const commit = useCallback(
    (nextField) => {
      if (!spec || !channel) return;
      const next = applySpecPatch(spec, [
        { op: "replace", path: `/encoding/${channel}`, value: nextField },
      ]);
      onSpecChange && onSpecChange(next);
    },
    [spec, channel, onSpecChange],
  );

  const handleOrient = (orient) => {
    if (!currentField) return;
    commit({ ...currentField, legend: { ...(currentField.legend || {}), orient } });
  };

  const handleToggleHidden = () => {
    if (!currentField) return;
    if (isHidden) {
      // Unhide — remove the `legend: null` override.
      const { legend, ...rest } = currentField;
      void legend;
      commit(rest);
    } else {
      commit({ ...currentField, legend: null });
    }
  };

  if (!channel || !currentField) {
    return (
      <PopoverShell x={x} y={y} onClose={onClose} title="Legend">
        <div style={{ color: "var(--text-muted, rgba(255,255,255,0.5))", fontSize: 11 }}>
          No legend-bearing channel. Drag a field onto Color / Size / Shape / Opacity first.
        </div>
      </PopoverShell>
    );
  }

  return (
    <PopoverShell x={x} y={y} onClose={onClose} title={`Legend · ${channel.toUpperCase()}`}>
      <Field label="Field">
        <span style={{ fontFamily: "monospace" }}>{currentField.field}</span>
      </Field>
      <Field label="Show">
        <button
          type="button"
          data-testid="legend-popover-toggle"
          onClick={handleToggleHidden}
          style={{
            padding: "3px 8px",
            fontSize: 11,
            borderRadius: 3,
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
            background: isHidden
              ? "var(--bg-elev-2, rgba(255,255,255,0.04))"
              : "var(--accent, rgba(96,165,250,0.22))",
            color: "var(--text-primary, #e7e7ea)",
            cursor: "pointer",
          }}
        >
          {isHidden ? "Hidden" : "Visible"}
        </button>
      </Field>
      {!isHidden && (
        <Field label="Orient">
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {ORIENTS.map((o) => (
              <button
                key={o}
                type="button"
                data-testid={`legend-popover-orient-${o}`}
                onClick={() => handleOrient(o)}
                style={{
                  padding: "3px 8px",
                  fontSize: 10,
                  borderRadius: 3,
                  border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
                  background:
                    currentOrient === o
                      ? "var(--accent, rgba(96,165,250,0.22))"
                      : "var(--bg-elev-2, rgba(255,255,255,0.04))",
                  color: "var(--text-primary, #e7e7ea)",
                  cursor: "pointer",
                }}
              >
                {o}
              </button>
            ))}
          </div>
        </Field>
      )}
    </PopoverShell>
  );
}

function Field({ label, children }) {
  return (
    <div
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
    </div>
  );
}
