import { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BreathingDot, SPRINGS } from "../dashboard/motion";

/**
 * DataRail — left rail accordion.
 *
 * Sections:
 *   - Dimensions:  ColumnProfile.role === 'dimension'
 *   - Measures:    ColumnProfile.role === 'measure'
 *   - Calculated:  Phase 2 (formula-input sourced fields)
 *   - Parameters:  Phase 2 (workbook-level parameters)
 *
 * Drag behaviour is a Phase 1 stub — each pill renders draggable=true so the
 * native HTMLDragEvent plumbing exists, but no drop target processes the
 * payload yet. Phase 2 hooks MarksCard ChannelSlot components into the drop
 * flow via HTML5 drag-drop.
 *
 * Premium pass: magnetic hover/tap on field pills via framer-motion,
 * translucent ghost while native drag is active, breathing dot prefix on
 * section headers indicating live counts.
 */
export default function DataRail({ columnProfile = [] }) {
  const { dimensions, measures } = useMemo(() => {
    const dims = [];
    const meas = [];
    for (const col of columnProfile) {
      if (col.role === "measure") meas.push(col);
      else dims.push(col);
    }
    return { dimensions: dims, measures: meas };
  }, [columnProfile]);

  return (
    <div
      data-testid="data-rail"
      style={{
        height: "100%",
        borderRight: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <Section title="Dimensions" count={dimensions.length} accent="#4a8fe7" defaultOpen>
        {dimensions.map((col) => (
          <Pill key={col.name} column={col} kind="dimension" />
        ))}
        {dimensions.length === 0 && <EmptyHint text="No dimensions" />}
      </Section>
      <Section title="Measures" count={measures.length} accent="#2dbf71" defaultOpen>
        {measures.map((col) => (
          <Pill key={col.name} column={col} kind="measure" />
        ))}
        {measures.length === 0 && <EmptyHint text="No measures" />}
      </Section>
      <Section title="Calculated" count={0} accent="var(--accent, #2563EB)">
        <EmptyHint text="Phase 2 — formula editor" />
      </Section>
      <Section title="Parameters" count={0} accent="var(--accent, #2563EB)">
        <EmptyHint text="Phase 2 — workbook parameters" />
      </Section>
    </div>
  );
}

function Section({ title, count, children, defaultOpen = false, accent = "var(--accent)" }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      data-testid={`data-rail-section-${title.toLowerCase()}`}
      style={{
        borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-secondary, #b0b0b6)",
          fontWeight: 600,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <BreathingDot color={accent} size={5} />
          {title}
        </span>
        <span style={{ opacity: 0.6 }}>{count}</span>
      </button>
      {open && (
        <div style={{ padding: "2px 8px 8px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {children}
        </div>
      )}
    </div>
  );
}

const Pill = memo(function Pill({ column, kind }) {
  const color = kind === "measure" ? "#2dbf71" : "#4a8fe7";
  const [dragging, setDragging] = useState(false);
  return (
    <motion.div
      data-testid={`data-pill-${column.name}`}
      data-kind={kind}
      draggable
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={SPRINGS.snappy}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/x-askdb-field",
          JSON.stringify({ field: column.name, semanticType: column.semanticType, role: column.role })
        );
        e.dataTransfer.effectAllowed = "copyMove";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        fontSize: 12,
        borderRadius: 5,
        background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
        cursor: "grab",
        userSelect: "none",
        // Translucent ghost while native drag is active — returns to full
        // opacity on dragend. The drag image itself is a browser screenshot
        // of this element at dragstart, so this affects only the leftover.
        opacity: dragging ? 0.35 : 1,
      }}
    >
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }}
      />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {column.name}
      </span>
    </motion.div>
  );
});

function EmptyHint({ text }) {
  return (
    <div
      style={{
        padding: "4px 6px",
        fontSize: 11,
        color: "var(--text-muted, rgba(255,255,255,0.35))",
        fontStyle: "italic",
      }}
    >
      {text}
    </div>
  );
}
