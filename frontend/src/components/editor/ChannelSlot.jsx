import { useState } from "react";
import { motion } from "framer-motion";
import Pill from "./Pill";
import { TOKENS } from "../dashboard/tokens";
import { SPRINGS } from "../dashboard/motion";

/**
 * ChannelSlot — a single encoding channel drop target (Color, Size, Label,
 * Detail, Tooltip, Shape, Path, Angle, or the positional X / Y slots).
 *
 * Phase 2 contract:
 *   - accepts drops with media type `application/x-askdb-field`
 *   - validates the dropped field's role/semanticType against an allowlist
 *     scoped per channel (e.g. X accepts any field, Color accepts any field,
 *     Size accepts quantitative measures only)
 *   - on a valid drop, calls `onDrop(fieldRef, channel)` with the
 *     constructed FieldRef so the caller can dispatch a spec patch
 *   - renders the currently-bound pill (if any) and a remove button
 */

// Default: any field. Overrides below make specific channels stricter.
const CHANNEL_ALLOW = {
  x: { any: true },
  y: { any: true },
  color: { any: true },
  size: { semanticTypes: ["quantitative"] },
  shape: { semanticTypes: ["nominal", "ordinal"] },
  opacity: { semanticTypes: ["quantitative"] },
  detail: { any: true },
  tooltip: { any: true },
  text: { any: true },
  row: { semanticTypes: ["nominal", "ordinal"] },
  column: { semanticTypes: ["nominal", "ordinal"] },
};

function isDropAllowed(channel, payload) {
  const rule = CHANNEL_ALLOW[channel];
  if (!rule) return true;
  if (rule.any) return true;
  if (rule.semanticTypes && rule.semanticTypes.includes(payload.semanticType)) {
    return true;
  }
  return false;
}

/**
 * Semantic-aware drop validation — measure/metric → quantitative,
 * dimension → whatever semanticType the dimension declares. Falls back
 * to default-allow for the "any" channels.
 */
function isSemanticDropAllowed(channel, semanticPayload) {
  const rule = CHANNEL_ALLOW[channel];
  if (!rule) return true;
  if (rule.any) return true;
  const semantic = semanticPayload?.semantic || {};
  // Measures + metrics are always quantitative.
  if (semantic.measure || semantic.metric) {
    return rule.semanticTypes?.includes("quantitative") ?? false;
  }
  // Dimensions carry their semanticType inline on the payload.
  if (semantic.dimension) {
    const st = semanticPayload?.semanticType || "nominal";
    return rule.semanticTypes?.includes(st) ?? false;
  }
  return false;
}

export default function ChannelSlot({
  channel,           // 'x' | 'y' | 'color' | …
  label,             // display label, e.g. 'X', 'Color'
  fieldRef,          // current binding (FieldRef | null)
  onDrop,            // (fieldRef: FieldRef, channel: string) => void
  onRemove,          // (channel: string) => void
  onChange,          // (fieldRef: FieldRef, channel: string) => void (aggregation edits)
  onSemanticDrop,    // (semanticRef: { dimension|measure|metric }, channel: string) => void
}) {
  const [over, setOver] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const handleDragOver = (e) => {
    const types = Array.from(e.dataTransfer.types || []);
    if (!types.includes("application/x-askdb-field")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setOver(true);
    setInvalid(false);
  };

  const handleDragLeave = () => {
    setOver(false);
    setInvalid(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setOver(false);
    const raw = e.dataTransfer.getData("application/x-askdb-field");
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    // Phase 4c: semantic envelope — delegate resolution to the caller
    // (MarksCard uses the activeSemanticModel to compile).
    if (payload.semantic) {
      if (!isSemanticDropAllowed(channel, payload)) {
        setInvalid(true);
        setTimeout(() => setInvalid(false), 800);
        return;
      }
      onSemanticDrop && onSemanticDrop(payload.semantic, channel);
      return;
    }

    if (!isDropAllowed(channel, payload)) {
      setInvalid(true);
      setTimeout(() => setInvalid(false), 800);
      return;
    }
    const next = {
      field: payload.field,
      type: payload.semanticType,
    };
    // Auto-aggregate measures on X/Y/Size/Opacity. Phase 2b adds per-channel
    // heuristics — for now keep it simple.
    if (payload.role === "measure" && ["x", "y", "size", "opacity"].includes(channel)) {
      next.aggregate = "sum";
    }
    onDrop && onDrop(next, channel);
  };

  const borderColor = invalid
    ? "var(--error, rgba(229,62,62,0.55))"
    : over
      ? "var(--accent, rgba(96,165,250,0.6))"
      : "var(--border-subtle, rgba(255,255,255,0.08))";

  const isEmpty = !fieldRef;

  return (
    <motion.div
      data-testid={`channel-slot-${channel}`}
      data-over={over || undefined}
      data-invalid={invalid || undefined}
      data-filled={fieldRef ? "true" : "false"}
      className={isEmpty ? "premium-shimmer-surface" : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      animate={{
        scale: over ? 1.02 : 1,
        boxShadow: over ? TOKENS.shadow.accentGlow : "0 0 0 0 transparent",
      }}
      transition={SPRINGS.snappy}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        minHeight: 26,
        borderRadius: 5,
        background: over
          ? "var(--accent-bg, rgba(96,165,250,0.08))"
          : "var(--bg-elev-1, rgba(255,255,255,0.02))",
        border: `1px dashed ${borderColor}`,
        transition: "background-color 140ms cubic-bezier(0.16,1,0.3,1), border-color 140ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <span
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted, rgba(255,255,255,0.4))",
          minWidth: 44,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      {fieldRef ? (
        <Pill
          fieldRef={fieldRef}
          role={fieldRef.aggregate && fieldRef.aggregate !== "none" ? "measure" : "dimension"}
          channel={channel}
          onChange={(next) => onChange && onChange(next, channel)}
          onRemove={() => onRemove && onRemove(channel)}
        />
      ) : (
        <span
          style={{
            fontSize: 10,
            color: "var(--text-muted, rgba(255,255,255,0.3))",
            fontStyle: "italic",
          }}
        >
          drop field
        </span>
      )}
    </motion.div>
  );
}
