/**
 * Theme token shape — shared contract used by all theme files so the
 * ThemeProvider can swap any entry without special-casing.
 *
 * Phase 5 keeps the shape small + obvious: base colors for background
 * + elevations + text + accent + border, plus a chart palette hint
 * that the Vega theme applies on next render.
 *
 * Every theme token file exports a default object of this shape.
 *
 * @typedef {Object} ThemeTokens
 * @property {string} id              — unique theme id ('light', 'dark', 'stage-iron-man', ...)
 * @property {string} label           — human-readable name for the theme picker
 * @property {'base'|'stage'} kind    — 'base' for light/dark editorial, 'stage' for cinematic
 * @property {string} bgPage          — outermost background
 * @property {string} bgElev1         — first-level elevation (rails, cards)
 * @property {string} bgElev2         — second-level elevation (buttons, pills)
 * @property {string} bgElev3         — third-level elevation (popovers, menus)
 * @property {string} textPrimary     — body + headline text
 * @property {string} textSecondary   — secondary labels
 * @property {string} textMuted       — captions, hints, placeholders
 * @property {string} borderSubtle    — 1px hairlines
 * @property {string} accent          — primary action color (buttons, focus)
 * @property {string} accentBg        — accent surface (active pill background)
 * @property {string[]} chartPalette  — categorical palette for cartesian charts
 * @property {string} fontBody        — body font stack
 * @property {string} fontDisplay     — display / heading font stack
 */

export {};
