import { useCallback } from "react";
import { applySpecPatch } from "../../chart-ir";
import ChannelSlot from "./ChannelSlot";

/**
 * MarksCard — the encoding tray. Hosts positional (X/Y) + channel slots
 * (Color/Size/Shape/Opacity/Detail/Tooltip/Row/Column).
 *
 * Phase 2 contract:
 *   - Stateless: reads the ChartSpec from props, dispatches spec patches
 *     via onSpecChange(nextSpec) to the caller (ChartEditor → store).
 *   - Uses applySpecPatch() from @/chart-ir so every mutation is
 *     immutable + testable + history-compatible.
 *   - The Marks card is only meaningful for `spec.type === 'cartesian'`.
 *     Non-cartesian specs render a placeholder explaining the channel
 *     tray doesn't apply (map/geo-overlay/creative have their own
 *     editing surfaces in Phase 4/5).
 */
const POSITIONAL = [
  { channel: "x", label: "X" },
  { channel: "y", label: "Y" },
];

const CHANNELS = [
  { channel: "color", label: "Color" },
  { channel: "size", label: "Size" },
  { channel: "shape", label: "Shape" },
  { channel: "opacity", label: "Opacity" },
  { channel: "detail", label: "Detail" },
  { channel: "tooltip", label: "Tooltip" },
  { channel: "row", label: "Row" },
  { channel: "column", label: "Column" },
];

export default function MarksCard({ spec, onSpecChange }) {
  const encoding = spec?.encoding || {};
  const isCartesian = spec?.type === "cartesian";

  const dispatchPatch = useCallback(
    (patch) => {
      if (!onSpecChange || !spec) return;
      const next = applySpecPatch(spec, patch);
      onSpecChange(next);
    },
    [spec, onSpecChange],
  );

  const handleDrop = useCallback(
    (fieldRef, channel) => {
      const path = `/encoding/${channel}`;
      const hasExisting = encoding[channel] !== undefined;
      const hasEncodingRoot = spec?.encoding !== undefined;
      if (!hasEncodingRoot) {
        // Spec has no encoding object at all — add the encoding root + child.
        dispatchPatch([
          { op: "add", path: "/encoding", value: { [channel]: fieldRef } },
        ]);
        return;
      }
      dispatchPatch([
        { op: hasExisting ? "replace" : "add", path, value: fieldRef },
      ]);
    },
    [dispatchPatch, encoding, spec],
  );

  const handleRemove = useCallback(
    (channel) => {
      if (encoding[channel] === undefined) return;
      dispatchPatch([{ op: "remove", path: `/encoding/${channel}` }]);
    },
    [dispatchPatch, encoding],
  );

  const handleChange = useCallback(
    (fieldRef, channel) => {
      dispatchPatch([{ op: "replace", path: `/encoding/${channel}`, value: fieldRef }]);
    },
    [dispatchPatch],
  );

  if (!isCartesian) {
    return (
      <div
        data-testid="marks-card-disabled"
        style={{
          padding: 12,
          fontSize: 11,
          color: "var(--text-muted, rgba(255,255,255,0.4))",
          fontStyle: "italic",
          borderRadius: 4,
          border: "1px dashed var(--border-subtle, rgba(255,255,255,0.08))",
        }}
      >
        Marks card only applies to cartesian specs. Current type: {spec?.type || "unknown"}
      </div>
    );
  }

  return (
    <div
      data-testid="marks-card"
      style={{
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
        borderRadius: 4,
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted, rgba(255,255,255,0.45))",
          fontWeight: 700,
          padding: "0 2px 6px 2px",
          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
          marginBottom: 4,
        }}
      >
        Marks
      </div>
      <Section title="Positions">
        {POSITIONAL.map((p) => (
          <ChannelSlot
            key={p.channel}
            channel={p.channel}
            label={p.label}
            fieldRef={encoding[p.channel] || null}
            onDrop={handleDrop}
            onRemove={handleRemove}
            onChange={handleChange}
          />
        ))}
      </Section>
      <Section title="Channels">
        {CHANNELS.map((c) => (
          <ChannelSlot
            key={c.channel}
            channel={c.channel}
            label={c.label}
            fieldRef={encoding[c.channel] || null}
            onDrop={handleDrop}
            onRemove={handleRemove}
            onChange={handleChange}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div
      data-testid={`marks-card-section-${title.toLowerCase()}`}
      style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-muted, rgba(255,255,255,0.35))",
          padding: "2px 4px",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
