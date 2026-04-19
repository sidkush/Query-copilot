---
name: accessibility-wcag
description: WCAG 2.2 AA accessibility rules for AI-generated charts — contrast, alt-text, screen reader labels, keyboard nav, reduced-motion
priority: 3
tokens_budget: 1300
applies_to: chart-selection, dashboard-build
---

# Accessibility — WCAG 2.2 AA — AskDB AgentEngine

## Why accessibility is a hard requirement

AskDB serves enterprise customers (some with government + finance clients) where WCAG 2.2 AA is contractually required. Generated charts must pass automated audits (axe, WAVE) at least at AA; AAA where cheap.

## Contrast thresholds

| Element | Minimum contrast ratio (WCAG 2.2 AA) |
|---|---|
| Regular text (< 18 pt or < 14 pt bold) vs background | **4.5 : 1** |
| Large text (≥ 18 pt or ≥ 14 pt bold) vs background | **3 : 1** |
| Non-text UI (chart bars, lines, markers, focus ring) vs background | **3 : 1** |
| Non-text UI vs adjacent fill (bar against neighbor bar) | **3 : 1** |
| Focus indicators | **3 : 1** against both background and the element it surrounds |

Use a contrast checker at generation time. Reject palettes that fail.

## Alt-text pattern for generated charts

Every Vega-Lite spec emitted by the agent includes `"description"` at the top level:

```json
{
  "description": "Bar chart of revenue by region, Q1 2026. North America leads at $8.2M; APAC trails at $1.1M. Data table available below.",
  "title": "Revenue Growing 12% — Driven by NA Expansion",
  ...
}
```

Pattern: `[chart type] of [metric] by [dimension], [timeframe]. [1–2 sentence insight]. Data table available below.` Max 300 chars.

## Tabular equivalent (WCAG 1.1.1)

Every chart tile renders a tabular equivalent (HTML `<table>` with `<caption>`) below the chart OR a "Show as table" toggle. Frontend already has this plumbing (see `ChartEditor`); agent-emitted specs must set `include_data_table: true` in tile metadata (to be wired in retrieval-infra plan).

## Color is never the only encoding

For categorical series:
- Pair color with a secondary encoding: shape (scatter), pattern (bars for print), or direct label.
- For line charts with ≥ 2 series, always label lines at their endpoint (Vega-Lite `layer` with `mark: "text"`).

For diverging / sequential scales:
- Always show the legend with labeled stops.
- Provide tooltip with exact value (not just a color chip).

## Colorblind-safe palettes

Default categorical palettes pass all three CVD types (deuteranopia, protanopia, tritanopia):
- **Okabe-Ito 8** (`#E69F00`, `#56B4E9`, `#009E73`, `#F0E442`, `#0072B2`, `#D55E00`, `#CC79A7`, `#000000`).
- **Tableau 10 Colorblind** (for Tableau-parity).
- **ColorBrewer Set2** (pastel, 8 hues).

Sequential: **Viridis** or **Cividis** (Cividis passes blue-yellow deuteranopia best). Never rainbow.

## Keyboard navigation (interactive dashboards)

Every chart mark is reachable by keyboard:
- `Tab` / `Shift+Tab` between tiles.
- Inside a tile, arrow keys move between marks.
- `Enter` activates drill-through.
- `Esc` exits chart focus.
- Focus ring: 2 px solid, contrast ≥ 3 : 1.

Vega-Lite spec sets `"usermeta": {"keyboardNav": true}` — our renderer (`VegaRenderer.tsx`) wires the handlers.

## Prefers-reduced-motion

Respect `prefers-reduced-motion: reduce`:
- Disable entry animations (`"config": {"view": {"transform": {"duration": 0}}}` via userMeta flag).
- Tooltip transitions become instant.

The renderer handles this globally; agent ensures specs do not hardcode animation durations.

## Font sizes

- Chart title: 14–18 pt (satisfies "large text" threshold at 14 pt bold).
- Axis labels: 11 pt minimum (regular text threshold — must hit 4.5 : 1 contrast).
- Legend text: 11 pt minimum.
- Tooltip body: 12 pt.

## Screen reader announcements

Tooltip content (on focus-triggered, not hover) lives in `aria-live="polite"`. Format: `"<category>: <formatted value>, <delta if any>, <unit>"`.

## What to refuse

- Red/green only to encode pass/fail (add a shape or icon).
- Low-contrast gray text (common "#9CA3AF on white" fails at 4.5 : 1 for < 18 pt).
- Pie chart with > 5 slices (fails comprehensibility + accessibility).
- Interactive-only content without a static equivalent (drill-down must be possible via keyboard, not just hover).

## Cross-skill references

- `visualization/color-system.md` — CVD-safe palettes.
- `visualization/chart-formatting.md` — label sizes + tooltip patterns.
- `visualization/dashboard-aesthetics.md` — typography scale.

---

## Examples

**Input:** Agent emits a bar chart spec with `color: "#90EE90"` for bars against white background.
**Output:** Contrast check: `#90EE90` vs white = 1.66 : 1. Fails 3 : 1 for non-text UI. Replace with Okabe-Ito `#009E73` (contrast 2.74 : 1 — still fails, but darker). Use `#006644` instead (4.12 : 1, passes).

**Input:** Agent generates alt-text: `"This chart shows the data."`.
**Output:** Reject. Regenerate: `"Bar chart of revenue by region, Q1 2026. North America leads at $8.2M; APAC trails at $1.1M. Data table available below."` Length 134 chars, passes pattern.

**Input:** Dashboard with 4 red/green KPI deltas (no shape, no label).
**Output:** Inject up/down triangle icons (▲ / ▼) and numeric delta next to color. Now color is decorative; meaning carries through shape + text.

**Input:** User on Windows high-contrast mode.
**Output:** Renderer switches to system colors (handled at CSS level). Spec sets `"background": null` so system background shines through. Contrast automatically satisfied.
