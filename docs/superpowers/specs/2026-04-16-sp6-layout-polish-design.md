# SP-6: Layout Mode Polish — Wireframe Fidelity (Final Pass)

**Date:** 2026-04-16
**Author:** Claude (autonomous via scheduled task)
**Status:** In progress
**Target:** Match wireframe 4 high-fidelity mockups per-archetype
**Branch:** `askdb-global-comp`

## Context

All 6 layout shells exist. Mode switching works. Per-mode refresh, cross-tile filtering, PresentationEngine, design tokens — all built. Gap: shells use inline defaults (hardcoded paddings, `#06060e`, raw gaps). They ignore `ARCHETYPE_THEMES` in `tokens.js`, so each archetype looks similar. Polish = thread archetype tokens into each layout + targeted per-archetype affordances.

## Goals

1. Each archetype has distinct ambience/palette/typography/density — driven by `ARCHETYPE_THEMES[mode]`.
2. Wireframe 4 panels 1–5 + Tableau-classic target look achieved.
3. No regression to shell, filter bar, agent panel, voice.
4. Zero new dependencies.

## Non-goals

- Rewriting `PresentationEngine` internals.
- New chart types, new tile types, new SSE endpoints.
- Agent panel dock changes (SP-2 scope).
- New layout component for Tableau (already exists as `TableauClassicLayout.jsx`).

## Per-archetype polish

### 1. Briefing (`ExecBriefingLayout.jsx`)
- Use `ARCHETYPE_THEMES.briefing` for bg, gap, radius, KPI sizing.
- Generous 32px padding + 20px gap per archetype spec.
- Bump KPI-row row-hint cells to use `archetype.kpi.valueFontSize = 48`.
- Optional insight narrative card slot — render when a tile has `tile.kind === 'insight'` or `tile.narrative`.
- `@media print` override — remove glass/shadow, force white bg, page breaks between sections.

### 2. Workbench (`AnalystWorkbenchLayout.jsx`)
- Use `ARCHETYPE_THEMES.workbench` for bg (`#08080d`), 10px gap, 10px radius.
- Narrow container padding (8px) to max density.
- Filter chip row at top — reuse `GlobalFilterBar` via parent, but add local chip visual when active filters provided.
- Smaller row-height (50px) per dense archetype.
- Data font JetBrains Mono via theme.

### 3. LiveOps (`LiveOpsLayout.jsx`)
- Use `ARCHETYPE_THEMES.ops` — monospace everywhere, `#050508` bg, 8px gap.
- Traffic-light status helper: `getOpsStatus(value, thresholds)` → `{ color, label }` → colored dot per KPI tile.
- Force dark-only (ignore resolved light theme if user toggled).
- Event stream tile compatible: when `tile.kind === 'event-stream'`, render full-width row.

### 4. Story (`StoryLayout.jsx`)
- Force cream bg (`#FDFBF7`) + dark text via archetype theme (override dark theme).
- Serif body (`Source Serif 4` fallback Georgia) per archetype.
- Chapter nav rail left: 140px sticky index listing chapters; click scrolls to chapter.
- Muted palette — opacity 0.55 non-active stays, but active gets `accent` color.
- Print-friendly via @media print.

### 5. Pitch (`PitchLayout.jsx`)
- Pass `ARCHETYPE_THEMES.pitch` as `themeConfig` into `PresentationEngine`.
- Slide counter chip overlay ("Slide N of M") + fullscreen toggle button — layout-level chrome.
- Wrapper background forced `#000000`.

### 6. Tableau-classic (`TableauClassicLayout.jsx`)
- Already wired to `ARCHETYPE_THEMES.tableau`. Minor: ensure filter bar uses `dropdownStyle` only (remove dual `select`+`input` for field — drop the text `input`, keep `select`).

## Shared helpers

Add `frontend/src/components/dashboard/lib/archetypeStyling.js`:
- `getArchetypeStyles(mode)` — returns merged style object for container.
- `getOpsStatus(value, thresholds)` — traffic-light resolver (ops archetype).

Both tree-shakeable, no deps.

## Test plan

- Manual: render each archetype via `/dev/dashboard-shell` smoke test; verify visual distinctness.
- `npm run lint` must pass.
- No existing vitest tests to break — layouts have `data-testid` hooks; preserve all.

## Rollback

All changes scoped to `components/dashboard/modes/*.jsx` + new `lib/archetypeStyling.js`. Revert = delete new file + `git checkout` modes dir.

## Sub-phases

- SP-6a: Workbench (hero archetype)
- SP-6b: Briefing + Pitch
- SP-6c: LiveOps + Story
- SP-6d: Tableau polish (minor)

Executed in single pass this run for density; commit per sub-phase.
