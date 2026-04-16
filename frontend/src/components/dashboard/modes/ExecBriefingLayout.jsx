import { useMemo } from "react";
import { briefingGridPlacement } from "../lib/importanceScoring";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import { ARCHETYPE_THEMES } from "../tokens";
import { getArchetypeStyles } from "../lib/archetypeStyling";

/**
 * ExecBriefingLayout — SP-6 polish pass.
 *
 * Premium boardroom aesthetic driven by ARCHETYPE_THEMES.briefing:
 *   - Generous 32px padding + 20px gap (theme spacing)
 *   - Oversized KPI sizing (48px values, 10px eyebrow labels)
 *   - Optional AI narrative card slot (tiles with `kind === 'insight'`
 *     or a non-empty `narrative` field span full width under the hero)
 *   - @media print override — no glass, white bg, page breaks between
 *     sections so the briefing exports cleanly to PDF / board packet
 *
 * Placement stays importance-scored (bin-packing on a 12-col grid) via
 * briefingGridPlacement(). Tile shape:
 *   { id, title, chart_spec, rows?, columns?, kind?, narrative? }
 */
const THEME = ARCHETYPE_THEMES.briefing;

export default function ExecBriefingLayout({ tiles = [], onTileClick }) {
  const placement = useMemo(() => briefingGridPlacement(tiles), [tiles]);
  const containerStyle = useMemo(() => getArchetypeStyles("briefing"), []);

  if (placement.length === 0) {
    return (
      <div
        data-testid="layout-briefing"
        style={{
          ...containerStyle,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: THEME.spacing.tileGap,
        }}
      >
        <EmptyBriefing />
      </div>
    );
  }

  return (
    <div
      data-testid="layout-briefing"
      data-tile-count={placement.length}
      className="briefing-layout-print"
      style={{
        ...containerStyle,
        padding: 32,
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gridAutoRows: "minmax(200px, auto)",
        gap: THEME.spacing.tileGap,
        fontFamily: THEME.typography.bodyFont,
      }}
    >
      {placement.map((entry, idx) => {
        const tile = entry.tile;
        // Detect insight via rowHint (set by briefingGridPlacement when
        // chartType === 'insight' | 'ai_summary'), legacy `kind` field,
        // or the presence of a narrative string.
        const isInsight =
          entry.rowHint === "insight" ||
          tile.chartType === "insight" ||
          tile.kind === "insight" ||
          Boolean(tile.narrative && tile.narrative.length > 0);
        const colSpan = isInsight ? 12 : entry.colSpan;
        return (
          <div
            key={tile.id || idx}
            data-testid={`layout-briefing-tile-${tile.id || idx}`}
            data-row-hint={entry.rowHint}
            data-col-span={colSpan}
            data-kind={isInsight ? "insight" : "chart"}
            style={{
              gridColumn: `span ${colSpan}`,
              minHeight: entry.rowHint === "hero" ? 320 : isInsight ? 160 : 200,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {isInsight ? (
              <InsightNarrativeCard tile={tile} />
            ) : (
              <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
            )}
          </div>
        );
      })}

      {/* Print-friendly overrides: strip glass, whitish bg, page-break hints */}
      <style>{`
        @media print {
          .briefing-layout-print {
            background: #ffffff !important;
            color: #0f172a !important;
            padding: 16mm !important;
          }
          .briefing-layout-print [data-row-hint="hero"] {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .briefing-layout-print [data-kind="insight"] {
            break-before: auto;
            page-break-before: auto;
            background: #f8fafc !important;
            border: 1px solid rgba(15,23,42,0.1) !important;
          }
          .briefing-layout-print .dashboard-tile-canvas {
            box-shadow: none !important;
            backdrop-filter: none !important;
            background: #ffffff !important;
            border: 1px solid rgba(15,23,42,0.1) !important;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * AI narrative summary card — boardroom-style insight block.
 *
 * Accepts the agent-authored insight tile shape (`insightText`/`content`,
 * populated by `_tool_create_dashboard_tile` with `chart_type='insight'`)
 * AND a SP-6 `narrative` alias. Falls back through all three so the same
 * component handles tiles created by the dashboard agent tool,
 * legacy text tiles, and hand-authored briefing decks.
 */
function InsightNarrativeCard({ tile }) {
  const accent = "var(--accent, #2563EB)";
  const body =
    tile.narrative ||
    tile.insightText ||
    tile.content ||
    "Insight pending — agent will populate.";
  return (
    <div
      data-testid={`briefing-insight-${tile.id}`}
      style={{
        background:
          "linear-gradient(135deg, var(--glass-bg-card, rgba(255,255,255,0.03)), rgba(37,99,235,0.04))",
        border: "1px solid var(--glass-border, rgba(37,99,235,0.18))",
        borderLeft: `3px solid ${accent}`,
        borderRadius: THEME.spacing.tileRadius,
        padding: "22px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: THEME.typography.bodyFont,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: accent,
          fontWeight: 700,
        }}
      >
        AI Insight
      </div>
      {tile.title && (
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            fontFamily: THEME.typography.headingFont,
            letterSpacing: "-0.02em",
            color: "var(--text-primary, #e7e7ea)",
          }}
        >
          {tile.title}
        </div>
      )}
      <div
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--text-secondary, #b0b0b6)",
          maxWidth: "68ch",
        }}
      >
        {body}
      </div>
    </div>
  );
}

function EmptyBriefing() {
  return (
    <div
      data-testid="layout-empty"
      style={{
        gridColumn: "1 / -1",
        padding: 40,
        fontSize: 13,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontStyle: "italic",
        textAlign: "center",
      }}
    >
      Executive briefing empty. Add KPI cards + hero chart to start.
    </div>
  );
}
