import { useCallback } from "react";
import { applySpecPatch, resolveSemanticRef } from "../../chart-ir";
import ChannelSlot from "./ChannelSlot";
import CustomTypePicker from "./CustomTypePicker";

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

export default function MarksCard({
  spec,
  onSpecChange,
  columnProfile = [],
  activeSemanticModel = null,
}) {
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

  const handleSpecReplace = useCallback(
    (nextSpec) => {
      if (onSpecChange && nextSpec) onSpecChange(nextSpec);
    },
    [onSpecChange],
  );

  /**
   * Semantic drop handler (Sub-project D Phase 4c):
   *   1. Resolve the semantic ref against the active model → FieldRef + transforms
   *   2. Build a patch that sets the encoding channel + appends any
   *      calculate transforms (deduped by `calculate.as`).
   *   3. Dispatch via applySpecPatch → onSpecChange.
   *
   * If there is no active model, the drop is a no-op (caller should be
   * gating the semantic field rail behind an active model anyway).
   */
  const handleSemanticDrop = useCallback(
    (semanticRef, channel) => {
      if (!activeSemanticModel || !spec) return;
      let resolved;
      try {
        resolved = resolveSemanticRef(activeSemanticModel, semanticRef);
      } catch {
        return;
      }
      const ops = [];
      if (!spec.encoding) {
        ops.push({ op: "add", path: "/encoding", value: { [channel]: resolved.fieldRef } });
      } else if (encoding[channel] !== undefined) {
        ops.push({ op: "replace", path: `/encoding/${channel}`, value: resolved.fieldRef });
      } else {
        ops.push({ op: "add", path: `/encoding/${channel}`, value: resolved.fieldRef });
      }
      if (resolved.extraTransforms && resolved.extraTransforms.length > 0) {
        const existingSet = new Set(
          (spec.transform || [])
            .map((t) => t?.calculate?.as)
            .filter(Boolean),
        );
        const toAppend = resolved.extraTransforms.filter(
          (t) => t?.calculate?.as && !existingSet.has(t.calculate.as),
        );
        if (toAppend.length > 0) {
          if (Array.isArray(spec.transform)) {
            toAppend.forEach((t) => ops.push({ op: "add", path: "/transform/-", value: t }));
          } else {
            ops.push({ op: "add", path: "/transform", value: toAppend });
          }
        }
      }
      dispatchPatch(ops);
    },
    [activeSemanticModel, spec, encoding, dispatchPatch],
  );

  if (!isCartesian) {
    return (
      <div
        data-testid="marks-card-disabled"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
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
        <CustomTypePicker
          onSpecChange={handleSpecReplace}
          columnProfile={columnProfile}
        />
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
            onSemanticDrop={handleSemanticDrop}
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
            onSemanticDrop={handleSemanticDrop}
          />
        ))}
      </Section>
      <CustomTypePicker
        onSpecChange={handleSpecReplace}
        columnProfile={columnProfile}
      />
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
