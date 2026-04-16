/**
 * archetypeStyling — SP-6 shared helpers.
 *
 * Threads ARCHETYPE_THEMES into layout containers so each archetype has
 * distinct ambience (bg, typography, density, palette) without each layout
 * reimplementing merge logic.
 *
 * Exports:
 *   getArchetypeStyles(mode)        → container style object
 *   getOpsStatus(value, thresholds) → traffic-light resolver for LiveOps
 *   getChapterAccent(index)         → muted story-per-chapter color
 */
import { ARCHETYPE_THEMES } from "../tokens";

/**
 * Resolve a container-level style object for a given archetype.
 * Caller spreads this onto the layout root `<div style>`.
 */
export function getArchetypeStyles(mode) {
  const t = ARCHETYPE_THEMES[mode] || ARCHETYPE_THEMES.briefing;
  return {
    background: t.background.dashboard,
    color: t.colorScheme === "light" ? "#0f172a" : "var(--text-primary, #e7e7ea)",
    fontFamily: t.typography.bodyFont,
    padding: t.spacing.tilePadding,
    gap: t.spacing.tileGap,
    minHeight: "100%",
  };
}

/**
 * Resolve a tile container style (bg + radius + border) for the archetype.
 * Used when a layout wraps tiles in archetype-styled cards.
 */
export function getTileStyles(mode) {
  const t = ARCHETYPE_THEMES[mode] || ARCHETYPE_THEMES.briefing;
  return {
    background: t.background.tile,
    borderRadius: t.spacing.tileRadius,
    border: t.tile.borderWidth
      ? `${t.tile.borderWidth}px solid ${
          t.colorScheme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"
        }`
      : "none",
    boxShadow: t.tile.shadow
      ? "0 10px 30px -18px rgba(0,0,0,0.4), 0 2px 6px -3px rgba(0,0,0,0.25)"
      : "none",
    overflow: "hidden",
  };
}

/**
 * LiveOps traffic-light resolver.
 * Thresholds shape: { critical, warning } — values above critical/warning
 * map to red/yellow. Below warning → green.
 *
 * For "lower is better" metrics (e.g. latency), pass thresholds as
 * { critical: 500, warning: 200 } — value >= critical = red.
 * For "higher is better" (e.g. uptime), pass inverse via `invert: true`.
 */
export function getOpsStatus(value, thresholds = {}, invert = false) {
  const { critical, warning } = thresholds;
  const theme = ARCHETYPE_THEMES.ops;
  const colors = theme.statusColors;

  if (value == null || Number.isNaN(Number(value))) {
    return { color: colors.unknown, label: "UNKNOWN", tone: "unknown" };
  }

  const num = Number(value);
  let tone = "healthy";
  if (invert) {
    // higher = better; smaller than warning = warn, smaller than critical = crit
    if (critical != null && num < critical) tone = "critical";
    else if (warning != null && num < warning) tone = "warning";
  } else {
    if (critical != null && num >= critical) tone = "critical";
    else if (warning != null && num >= warning) tone = "warning";
  }

  const map = {
    healthy: { color: colors.healthy, label: "NOMINAL" },
    warning: { color: colors.warning, label: "WATCH" },
    critical: { color: colors.critical, label: "CRITICAL" },
  };
  return { ...map[tone], tone };
}

/**
 * One muted accent color per story chapter — cycles through a small
 * editorial-safe palette. Active chapter uses full saturation; inactive
 * chapters fade to the same hue at lower opacity.
 */
const STORY_ACCENTS = [
  "#1d4ed8", // deep blue
  "#047857", // forest green
  "#b45309", // burnt amber
  "#7c2d12", // rust
  "#4c1d95", // deep violet
];
export function getChapterAccent(index) {
  return STORY_ACCENTS[index % STORY_ACCENTS.length];
}
