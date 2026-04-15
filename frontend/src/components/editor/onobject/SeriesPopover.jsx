import { useCallback, useState } from "react";
import { applySpecPatch } from "../../../chart-ir";
import PopoverShell from "./popoverShell";

/**
 * SeriesPopover — Phase 2b per-series editor. For color-encoded series
 * this edits the color scheme; for size/shape it's a placeholder that
 * explains what Phase 2b.2 will bring (individual series recoloring via
 * a range array override).
 *
 * Phase 2b landing scope:
 *   - Color scheme picker that writes spec.encoding.color.scheme
 *   - Description of click target (series name if the overlay passed it)
 */

const SCHEMES = [
  "tableau10",
  "category10",
  "set2",
  "pastel1",
  "dark2",
  "blues",
  "oranges",
  "viridis",
  "plasma",
];

export default function SeriesPopover({ x, y, spec, meta, onSpecChange, onClose }) {
  const colorField = spec?.encoding?.color;
  const [scheme, setScheme] = useState(
    (colorField && typeof colorField === "object" && colorField.scheme) || "tableau10",
  );

  const commit = useCallback(
    (nextScheme) => {
      if (!spec || !colorField) return;
      const next = applySpecPatch(spec, [
        {
          op: "replace",
          path: "/encoding/color",
          value: { ...colorField, scheme: nextScheme },
        },
      ]);
      onSpecChange && onSpecChange(next);
    },
    [spec, colorField, onSpecChange],
  );

  const title = meta?.name ? `Series · ${meta.name}` : "Series";

  if (!colorField) {
    return (
      <PopoverShell x={x} y={y} onClose={onClose} title={title}>
        <div style={{ color: "var(--text-muted, rgba(255,255,255,0.5))", fontSize: 11 }}>
          Drop a field onto the Color channel to unlock series styling.
        </div>
      </PopoverShell>
    );
  }

  return (
    <PopoverShell x={x} y={y} onClose={onClose} title={title}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-muted, rgba(255,255,255,0.45))",
          marginBottom: 6,
        }}
      >
        Color scheme
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {SCHEMES.map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`series-popover-scheme-${s}`}
            onClick={() => {
              setScheme(s);
              commit(s);
            }}
            style={{
              padding: "3px 8px",
              fontSize: 10,
              borderRadius: 3,
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
              background:
                scheme === s
                  ? "var(--accent, rgba(96,165,250,0.22))"
                  : "var(--bg-elev-2, rgba(255,255,255,0.04))",
              color: "var(--text-primary, #e7e7ea)",
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </PopoverShell>
  );
}
