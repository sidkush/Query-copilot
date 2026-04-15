/**
 * themeRegistry — maps theme ids to their token objects and exposes
 * getThemeTokens() / listThemes() helpers for the ThemeProvider.
 *
 * Phase 5 ships all six Stage themes + the two base editorial themes
 * (light / dark). Callers read the active id from the chartEditor
 * Zustand slice (added in Phase 5) and look up tokens here.
 *
 * Registry is a plain object so tests can inspect which ids exist
 * without instantiating anything.
 */
import light from "./tokens/light";
import dark from "./tokens/dark";
import stageQuietExecutive from "./tokens/stage-quiet-executive";
import stageIronMan from "./tokens/stage-iron-man";
import stageBloomberg from "./tokens/stage-bloomberg";
import stageMissionControl from "./tokens/stage-mission-control";
import stageCyberpunk from "./tokens/stage-cyberpunk";
import stageVisionPro from "./tokens/stage-vision-pro";

const REGISTRY = Object.freeze({
  [light.id]: light,
  [dark.id]: dark,
  [stageQuietExecutive.id]: stageQuietExecutive,
  [stageIronMan.id]: stageIronMan,
  [stageBloomberg.id]: stageBloomberg,
  [stageMissionControl.id]: stageMissionControl,
  [stageCyberpunk.id]: stageCyberpunk,
  [stageVisionPro.id]: stageVisionPro,
});

export function getThemeTokens(themeId) {
  return REGISTRY[themeId] || REGISTRY.dark;
}

export function listThemes() {
  return Object.values(REGISTRY);
}

export function listStageThemes() {
  return Object.values(REGISTRY).filter((t) => t.kind === "stage");
}

export function listBaseThemes() {
  return Object.values(REGISTRY).filter((t) => t.kind === "base");
}

/**
 * Generate a CSS custom property map for the given theme tokens. The
 * ThemeProvider applies this map to a container element (or the root
 * <html>) via inline style so components that reference
 * var(--bg-page), var(--text-primary), etc. pick up the new values
 * without re-rendering.
 */
export function themeToCssVars(tokens) {
  if (!tokens) return {};
  return {
    "--bg-page": tokens.bgPage,
    "--bg-elev-1": tokens.bgElev1,
    "--bg-elev-2": tokens.bgElev2,
    "--bg-elev-3": tokens.bgElev3,
    "--text-primary": tokens.textPrimary,
    "--text-secondary": tokens.textSecondary,
    "--text-muted": tokens.textMuted,
    "--border-subtle": tokens.borderSubtle,
    "--accent": tokens.accent,
    "--accent-bg": tokens.accentBg,
    "--font-body": tokens.fontBody,
    "--font-display": tokens.fontDisplay,
  };
}
