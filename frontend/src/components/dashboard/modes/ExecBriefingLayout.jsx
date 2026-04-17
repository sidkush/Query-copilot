import { useMemo } from "react";
import { briefingGridPlacement } from "../lib/importanceScoring";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import { ARCHETYPE_THEMES, TOKENS } from "../tokens";
import { getArchetypeStyles } from "../lib/archetypeStyling";
import { BreathingDot, TileReveal } from "../motion";

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

  // Asymmetric bento: first KPI gets 6 cols, second 3, third 3 — importance rank.
  // Only applied when we have ≥3 leading KPI tiles; otherwise keep the stock 3-col
  // rhythm so briefings with few KPIs still look balanced. We pre-compute each
  // entry's kpi-rank up front (pure), so no mutation during render.
  // Must run before the early return to keep hook order stable.
  const { asymmetric, kpiRanks } = useMemo(() => {
    const ranks = new Map();
    let seen = 0;
    placement.forEach((entry, i) => {
      if (entry.rowHint === "kpi") {
        ranks.set(i, seen);
        seen += 1;
      }
    });
    return { asymmetric: seen >= 3, kpiRanks: ranks };
  }, [placement]);

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
    <TileReveal
      as="div"
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
        // Asymmetric bento — boost the first KPI to span 6 cols (importance rank).
        const kpiRank = kpiRanks.get(idx);
        let colSpan = isInsight ? 12 : entry.colSpan;
        if (!isInsight && asymmetric && entry.rowHint === "kpi") {
          colSpan = kpiRank === 0 ? 6 : 3;
        }
        // Enrich the tile with hero-importance so DashboardTileCanvas
        // turns on the premium-sheen sweep on flagship charts + lead KPI.
        const importance =
          entry.rowHint === "hero" || (asymmetric && entry.rowHint === "kpi" && kpiRank === 0)
            ? "high"
            : tile.importance;
        const enrichedTile = importance && !tile.importance ? { ...tile, importance } : tile;
        return (
          <TileReveal.Child
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
              // Hero + lead-KPI tiles lift off the page with a diffusion shadow
              filter:
                entry.rowHint === "hero"
                  ? "drop-shadow(0 24px 60px rgba(0,0,0,0.35))"
                  : undefined,
              // Premium heading typography: tabular figures on KPI values
              fontFamily: TOKENS.fontDisplay,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
              fontFeatureSettings: "'ss01', 'tnum'",
            }}
          >
            {isInsight ? (
              <InsightNarrativeCard tile={enrichedTile} />
            ) : (
              <DashboardTileCanvas tile={enrichedTile} onTileClick={onTileClick} />
            )}
          </TileReveal.Child>
        );
      })}

      {/* Print-friendly overrides: strip glass, theme-aware bg, page-break hints.
          Uses light-dark() with color-scheme fallback so print styles respect
          the active theme instead of forcing hardcoded light values. */}
      <style>{`
        @media print {
          .briefing-layout-print {
            color-scheme: light dark;
            background: light-dark(#ffffff, var(--bg-primary, #0b0b12)) !important;
            color: light-dark(#0f172a, var(--text-primary, #e7e7ea)) !important;
            padding: 16mm !important;
          }
          .briefing-layout-print [data-row-hint="hero"] {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .briefing-layout-print [data-kind="insight"] {
            break-before: auto;
            page-break-before: auto;
            background: light-dark(#f8fafc, var(--glass-bg-card, rgba(255,255,255,0.03))) !important;
            border: 1px solid light-dark(rgba(15,23,42,0.1), rgba(255,255,255,0.12)) !important;
          }
          .briefing-layout-print .dashboard-tile-canvas {
            box-shadow: none !important;
            backdrop-filter: none !important;
            background: light-dark(#ffffff, var(--bg-tile, #141420)) !important;
            border: 1px solid light-dark(rgba(15,23,42,0.1), rgba(255,255,255,0.12)) !important;
          }
        }
      `}</style>
    </TileReveal>
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
      className="premium-liquid-glass"
      style={{
        background: "var(--glass-bg-card, rgba(255,255,255,0.03))",
        border: "1px solid var(--glass-border, rgba(37,99,235,0.18))",
        borderRadius: THEME.spacing.tileRadius,
        padding: "22px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: THEME.typography.bodyFont,
        // Refined diffusion shadow — replaces flat border for material lift
        boxShadow: TOKENS.shadow.diffusion,
      }}
    >
      {/* Eyebrow chip — narrative label + breathing freshness dot */}
      <span
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 10px",
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: accent,
          fontWeight: 700,
          background: "color-mix(in oklab, var(--accent, #2563EB) 12%, transparent)",
          border: "1px solid color-mix(in oklab, var(--accent, #2563EB) 30%, transparent)",
          borderRadius: 3,
          fontFamily: THEME.typography.bodyFont,
        }}
      >
        <BreathingDot color={accent} size={5} glow={false} />
        Narrative
      </span>
      {tile.title && (
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: TOKENS.fontDisplay,
            letterSpacing: "-0.028em",
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
