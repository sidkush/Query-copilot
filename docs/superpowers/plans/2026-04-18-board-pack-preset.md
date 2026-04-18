# Plan B — Board Pack Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plan A (`2026-04-18-dashboard-preset-infrastructure.md`) must be merged onto `askdb-global-comp`. Verify before starting:

```bash
test -f "QueryCopilot V1/frontend/src/components/dashboard/presets/registry.ts" \
  && grep -q "_registerPreset" "QueryCopilot V1/frontend/src/components/dashboard/presets/registry.ts" \
  && echo "Plan A ready" || echo "STOP — Plan A not merged"
```

If it prints `STOP`, do not proceed. Exit and tell the user Plan A must merge first.

**Goal:** Land the first of the four themed presets that follow Plan A — **Board Pack**, a cream-paper-tearsheet editorial dashboard for executive / board-room reporting. Self-registers with Plan A's registry on app boot, ships with a full seven-zone starter ZoneTree, ships with a legally-sourced display-weight grotesk font subset, ships with a hand-drawn SVG preview thumbnail, ships with a visual regression snapshot.

**Design language:**

- **Scheme:** `light` (overrides user's global dark/light toggle).
- **Palette:** cream paper `#f5f1e8` background, near-black `#141414` foreground, muted red `#c83e3e` as the *only* colored accent (reserved for the risk phrase). Positive highlights carry themselves with weight + size, not hue.
- **Borders:** hairline horizontal rules only — no card borders, no rounded containers. Top-bar rule, per-KPI-row rule, chart baseline. Editorial whitespace.
- **Radius:** `0` on every zone.
- **Typography:** a bold grotesk display (NOT Inter / DM Sans / Outfit / Plus Jakarta / Instrument) paired with the same family at regular weight for body; optional small-caps micro label style.
- **Density:** `spacious`.

**Starter layout (seven zones, matches the provided wireframe):**

1. **Top bar** — horz container: logo + "Q3 REVENUE · BOARD PACK" kicker (left) + "LIVE · AUTO-REFRESH 2S" status (right), separated by hairline rule below.
2. **Hero** (left 50% of row 2) — "Q3 2026 · NET NEW MRR" label + gigantic "+$478K" display number + one paragraph narrative, risk clause wrapped in red accent.
3. **KPI list** (right 50% of row 2) — MRR / ARR / Churn / LTV:CAC / Payback, each on its own hairline-separated row with label left, value right, delta below value.
4. **Revenue chart** (left 70% of row 3) — "Growth compounded in late Q3" heading + subtitle + 12-month line with single accent dot + dashed forecast tail.
5. **Top-accounts list** (right 30% of row 3) — "Five accounts = 41% of MRR" + 5 ranked rows.
6. **Churn dist** (left 1/3 of row 4) — histogram micro-card.
7. **Cohort bars** (center 1/3 of row 4) — bar micro-card.
8. **Insight card** (right 1/3 of row 4) — "Watch:" callout with red accent.

(Yes, three micro-cards in row 4 means the starter serializes as eight leaf zones grouped under a top-level `container-vert` root with four row children. "Seven zones" in the design brief means seven *semantic* zones; the bottom strip is one strip. Both framings are consistent — implement as eight leaves under four rows.)

**Tech Stack:** React 19, TypeScript, Vitest, existing Plan A preset infrastructure (`_registerPreset`, `DashboardPreset`, `Zone`, `FloatingZone`). No new runtime dependencies.

**Absolute paths anchor:** All source paths in this plan are relative to `QueryCopilot V1/frontend/`. All test paths same. Branch: `askdb-global-comp`.

---

## File Structure

### Files to create

- `public/fonts/board-pack/README.md` — license + source URL for the font pair
- `public/fonts/board-pack/<display-font>.woff2` — bold grotesk display weight
- `public/fonts/board-pack/<body-font>.woff2` — regular weight of the same family
- `public/preset-previews/board-pack.svg` — 320×180 hand-drawn layout thumbnail
- `src/components/dashboard/presets/boardPack.ts` — preset definition + self-register call
- `src/components/dashboard/presets/index.ts` — side-effect imports of every non-default preset
- `src/components/dashboard/presets/boardPack.css` — `@font-face` declarations + `[data-active-preset='board-pack']` hairline-rule overrides
- `src/components/dashboard/presets/__tests__/boardPack.test.ts` — preset validates, registers, shape checks
- `src/components/dashboard/presets/__tests__/__snapshots__/board-pack.png` — visual regression snapshot (written by Task 9)
- `src/__fixtures__/boardPack/kpis.ts` — demo KPI rows (MRR, ARR, churn, LTV:CAC, payback)
- `src/__fixtures__/boardPack/revenueTrend.ts` — 12-month revenue series + forecast tail
- `src/__fixtures__/boardPack/topAccounts.ts` — 5 top-account rows
- `src/__fixtures__/boardPack/churnDist.ts` — churn histogram bins
- `src/__fixtures__/boardPack/cohortRetention.ts` — cohort retention bars

### Files to modify

- `src/main.jsx` (or `src/App.jsx` — whichever is the application entry) — add `import './components/dashboard/presets';` so the side-effect file loads at boot

### Files NOT touched

Do not modify: `DashboardShell.jsx`, `DashboardPresetSwitcher.jsx`, `applyPreset.ts`, `usePresetTheme.ts`, `registry.ts`, the Analyst Pro preset, any worksheet / chart-IR module. Change surface is exclusively under `presets/`, `public/fonts/board-pack/`, `public/preset-previews/`, `src/__fixtures__/boardPack/`, and the single side-effect import line.

---

## Phase 1 — Font acquisition

### Task 1: License + download the font pair

**Files:**
- Create: `public/fonts/board-pack/README.md`
- Create: `public/fonts/board-pack/<display>.woff2`, `public/fonts/board-pack/<body>.woff2`

**Allowed sources** (pick one — do NOT use a paid foundry, do NOT scrape):

- Pangram Pangram Foundry — the "PP" free tier (e.g. `PP Neue Montreal`, `PP Right Grotesk`, `PP Editorial New`). License permits commercial web use with attribution.
- Velvetyne (`velvetyne.fr`) — OFL-licensed experimental grotesks (e.g. `Cirruscumulus`, `Basteleur`). OFL allows subsetting + embedding.
- Google Fonts (`fonts.google.com`) — OFL/Apache family. Last-resort fallback. Acceptable choices: `Archivo Black` (display) + `Archivo` (body), or `Space Grotesk` (display+body), or `Syne` (display) + `Inter Tight` (body). Do **NOT** use: `Inter`, `DM Sans`, `Outfit`, `Plus Jakarta Sans`, `Instrument Sans`, or `Instrument Serif` — banned under `impeccable.reflex_fonts_to_reject`.

- [ ] **Step 1: Choose the pair and record the license**

Pick a display family + its regular counterpart from one of the allowed sources. Record in a draft `README.md`:

```md
# Board Pack font subset

- Display: <family name> <weight>, from <source URL>
- Body:    <family name> <weight>, from <source URL>
- License: <SIL OFL 1.1 | Apache 2.0 | PP free-commercial — include quoted permission>
- Subset:  Latin Basic + basic punctuation + $ (used in "+$478K" hero)
- Stripped: all non-Latin glyphs, kerning tables not needed for the small body copy

Updated <YYYY-MM-DD>.
```

- [ ] **Step 2: Download the woff2 files**

Name them predictably:

```
public/fonts/board-pack/display.woff2
public/fonts/board-pack/body.woff2
```

Keep the source filename as a comment at the top of the CSS `@font-face` rule (Task 4) so future maintainers can re-download.

- [ ] **Step 3: Verify they subsetted correctly**

```bash
ls -lh "public/fonts/board-pack/"
```

Expected: each file < 30 KB. If either exceeds 60 KB, run `pyftsubset` (from `fonttools`) or `glyphhanger` to trim to Latin Basic + punctuation + `$`.

- [ ] **Step 4: Verify license text is in the repo**

`README.md` must quote the license clause that grants commercial web use. If the license file was distributed alongside the font, copy it to `public/fonts/board-pack/LICENSE.txt` verbatim.

- [ ] **Step 5: Commit**

```bash
git add public/fonts/board-pack/
git commit -m "feat(presets): license and subset Board Pack font pair"
```

---

## Phase 2 — Preset definition

### Task 2: Demo fixtures

Keep these small and deterministic. They back the starter layout; real dashboards rebind them to live worksheets.

**Files:**
- Create: `src/__fixtures__/boardPack/kpis.ts`, `revenueTrend.ts`, `topAccounts.ts`, `churnDist.ts`, `cohortRetention.ts`

- [ ] **Step 1: `kpis.ts`**

```ts
// src/__fixtures__/boardPack/kpis.ts
export interface BoardPackKpi {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaDir: 'up' | 'down' | 'flat';
}

export const BOARD_PACK_KPIS: readonly BoardPackKpi[] = [
  { id: 'mrr',     label: 'MRR',        value: '$2.94M', delta: '+18.9%', deltaDir: 'up' },
  { id: 'arr',     label: 'ARR',        value: '$35.3M', delta: '+22.4%', deltaDir: 'up' },
  { id: 'churn',   label: 'Net Churn',  value: '2.1%',   delta: '+0.4pp', deltaDir: 'down' },
  { id: 'ltvcac',  label: 'LTV : CAC',  value: '4.8x',   delta: '+0.3x',  deltaDir: 'up' },
  { id: 'payback', label: 'Payback',    value: '11.2mo', delta: '−0.7mo', deltaDir: 'up' },
];
```

- [ ] **Step 2: `revenueTrend.ts`** — 12 monthly points ending in +$478K

```ts
export interface MonthlyRevenuePoint { month: string; mrr: number; forecast?: boolean; }

export const BOARD_PACK_REVENUE_TREND: readonly MonthlyRevenuePoint[] = [
  { month: '2025-10', mrr: 1_910_000 },
  { month: '2025-11', mrr: 1_988_000 },
  { month: '2025-12', mrr: 2_075_000 },
  { month: '2026-01', mrr: 2_120_000 },
  { month: '2026-02', mrr: 2_174_000 },
  { month: '2026-03', mrr: 2_240_000 },
  { month: '2026-04', mrr: 2_316_000 },
  { month: '2026-05', mrr: 2_402_000 },
  { month: '2026-06', mrr: 2_494_000 },
  { month: '2026-07', mrr: 2_602_000 },
  { month: '2026-08', mrr: 2_748_000 },
  { month: '2026-09', mrr: 2_938_000 },
  { month: '2026-10', mrr: 3_120_000, forecast: true },
  { month: '2026-11', mrr: 3_315_000, forecast: true },
];
```

Net-new for the last non-forecast month: `2_938_000 - 2_460_000 = 478_000` → matches the hero "+$478K".

- [ ] **Step 3: `topAccounts.ts`** — 5 rows, total MRR ratio 41%

```ts
export interface BoardPackAccount { rank: number; name: string; mrr: string; shareOfMrr: string; }

export const BOARD_PACK_TOP_ACCOUNTS: readonly BoardPackAccount[] = [
  { rank: 1, name: 'Meridian Global',      mrr: '$318K', shareOfMrr: '10.8%' },
  { rank: 2, name: 'Northwind Industries', mrr: '$276K', shareOfMrr: '9.4%'  },
  { rank: 3, name: 'Halcyon Capital',      mrr: '$241K', shareOfMrr: '8.2%'  },
  { rank: 4, name: 'Ferro & Pike',         mrr: '$214K', shareOfMrr: '7.3%'  },
  { rank: 5, name: 'Clearwater Labs',      mrr: '$156K', shareOfMrr: '5.3%'  },
];
// sum shares ≈ 41.0%
```

- [ ] **Step 4: `churnDist.ts`** + **Step 5: `cohortRetention.ts`**

```ts
// churnDist.ts — histogram bins (days-to-churn)
export const BOARD_PACK_CHURN_BINS: readonly { bin: string; count: number }[] = [
  { bin: '0-30',    count: 4 },
  { bin: '31-60',   count: 7 },
  { bin: '61-90',   count: 12 },
  { bin: '91-180',  count: 19 },
  { bin: '181-365', count: 9 },
  { bin: '365+',    count: 3 },
];

// cohortRetention.ts — 6-cohort bar set
export const BOARD_PACK_COHORTS: readonly { cohort: string; retention: number }[] = [
  { cohort: '25-Q2', retention: 0.92 },
  { cohort: '25-Q3', retention: 0.94 },
  { cohort: '25-Q4', retention: 0.96 },
  { cohort: '26-Q1', retention: 0.95 },
  { cohort: '26-Q2', retention: 0.97 },
  { cohort: '26-Q3', retention: 0.98 },
];
```

- [ ] **Step 6: Commit**

```bash
git add src/__fixtures__/boardPack/
git commit -m "feat(presets): add Board Pack demo fixtures"
```

---

### Task 3: Write the preset definition + self-register

**Files:**
- Create: `src/components/dashboard/presets/boardPack.ts`

- [ ] **Step 1: Write `boardPack.ts` with tokens + starter ZoneTree**

```ts
// src/components/dashboard/presets/boardPack.ts
import type { DashboardPreset } from './types';
import type { Zone, ContainerZone, LeafZone } from '../freeform/lib/types';
import { _registerPreset } from './registry';
import './boardPack.css';

// ---- token palette ----
const BG     = '#f5f1e8';        // cream paper
const FG     = '#141414';        // near-black
const ACCENT = '#141414';        // positive highlights carry by weight, not hue
const WARN   = '#c83e3e';        // reserved for risk phrase
const RULE   = 'rgba(20,20,20,0.12)'; // hairline

// ---- zone helpers ----
const leaf = (id: string, type: LeafZone['type'], extras: Partial<LeafZone> = {}): LeafZone => ({
  id,
  type,
  w: 1, h: 1,
  innerPadding: 16,
  outerPadding: 0,
  showTitle: false,
  ...extras,
});

const row = (id: string, children: Zone[], extras: Partial<ContainerZone> = {}): ContainerZone => ({
  id,
  type: 'container-horz',
  w: 1, h: 1,
  innerPadding: 0,
  outerPadding: 0,
  children,
  // hairline bottom rule only — BorderAP edge-union shape enforced by
  // freeform/lib/types.ts. Read that file before authoring; do NOT use
  // `as never` in the committed code. See Task 3 Step 2.
  ...extras,
});

const col = (id: string, children: Zone[], extras: Partial<ContainerZone> = {}): ContainerZone => ({
  id,
  type: 'container-vert',
  w: 1, h: 1,
  innerPadding: 0,
  outerPadding: 0,
  children,
  ...extras,
});

// ---- starter layout (eight leaves in a vertical root of four rows) ----
const starterRoot: ContainerZone = col('bp-root', [
  // Row 1 — top bar (fixed thin strip, logo + kicker + status)
  row('bp-top', [
    leaf('bp-logo',    'text', { text: { markdown: '**AskDB**' }, w: 0.15 }),
    leaf('bp-kicker',  'text', { text: { markdown: 'Q3 REVENUE · BOARD PACK' }, w: 0.55 }),
    leaf('bp-status',  'text', { text: { markdown: 'LIVE · AUTO-REFRESH 2S' }, w: 0.30 }),
  ], { h: 0.06 }),

  // Row 2 — hero + KPI list
  row('bp-headline', [
    col('bp-hero', [
      leaf('bp-hero-label',  'text', { text: { markdown: 'Q3 2026 · NET NEW MRR' } }),
      leaf('bp-hero-number', 'text', { text: { markdown: '+$478K' } }),
      leaf('bp-hero-copy',   'text', {
        text: {
          markdown:
            "Q3 MRR expansion carried the quarter. Revenue compounded month-over-month, with enterprise "
            + "renewals outperforming plan. <span class='bp-warn'>Watch: one late-stage pilot stalled on "
            + "procurement, representing ~$82K of at-risk upside if it slips to Q4.</span>",
        },
      }),
    ], { w: 0.5 }),
    col('bp-kpis', [
      leaf('bp-kpis-body', 'text', {
        text: { markdown: '<!-- KPI list — binds to BOARD_PACK_KPIS fixture -->' },
      }),
    ], { w: 0.5 }),
  ], { h: 0.38 }),

  // Row 3 — revenue line (70%) + top accounts (30%)
  row('bp-mid', [
    leaf('bp-chart-revenue', 'worksheet', {
      worksheetRef: 'bp:revenueTrend',
      displayName: 'Growth compounded in late Q3',
      w: 0.7,
    }),
    leaf('bp-top-accounts',  'text', {
      text: { markdown: '<!-- Five accounts = 41% of MRR — binds to BOARD_PACK_TOP_ACCOUNTS -->' },
      w: 0.3,
    }),
  ], { h: 0.36 }),

  // Row 4 — three micro-cards
  row('bp-strip', [
    leaf('bp-churn-hist',    'worksheet', { worksheetRef: 'bp:churnDist',       w: 1 / 3 }),
    leaf('bp-cohort-bars',   'worksheet', { worksheetRef: 'bp:cohortRetention', w: 1 / 3 }),
    leaf('bp-insight-watch', 'text', {
      text: {
        markdown:
          "<span class='bp-warn'>Watch:</span> churn concentrates in the 91–180 day band. "
          + "Retention playbook proposal lands with the board next cycle.",
      },
      w: 1 / 3,
    }),
  ], { h: 0.20 }),
]);

// ---- preset record ----
export const boardPackPreset: DashboardPreset = {
  id: 'board-pack',
  name: 'Board Pack',
  tagline: 'Cream tearsheet, editorial. One red for risk.',
  scheme: 'light',
  tokens: {
    bg: BG,
    fg: FG,
    accent: ACCENT,
    accentWarn: WARN,
    border: RULE,
    fontDisplay: "'BoardPackDisplay', ui-sans-serif, system-ui, sans-serif",
    fontBody:    "'BoardPackBody', ui-sans-serif, system-ui, sans-serif",
    fontMono:    "ui-monospace, 'JetBrains Mono', monospace",
    density: 'spacious',
    radius: 0,
  },
  starter: {
    tiledRoot: starterRoot,
    floatingLayer: [],
  },
};

_registerPreset(boardPackPreset);
```

- [ ] **Step 2: Resolve the `border` prop against the real `BorderAP` shape**

The `row(...)` helper above intentionally does NOT attach a `border` property — the committed `BorderAP` type in `freeform/lib/types.ts` has a specific edge-union shape that varies across Plan 5d revisions. Before commit:

1. Read `src/components/dashboard/freeform/lib/types.ts` lines surrounding the `BorderAP` export.
2. If `BorderAP` accepts a bottom-only edge, add it to the `row` helper explicitly (typed, no casts).
3. If not, rely on the CSS fallback (Task 4) which already draws the hairline rule by `data-zone-id`. Both paths are acceptable; do not use `as never` / `as any`.

- [ ] **Step 3: Verify TypeScript is happy**

```bash
npx tsc --noEmit -p .
```

- [ ] **Step 4: Do not commit yet — `boardPack.css` is authored in Task 4**

---

### Task 4: `@font-face` + preset-scoped CSS

**Files:**
- Create: `src/components/dashboard/presets/boardPack.css`

- [ ] **Step 1: Author the stylesheet**

```css
/* src/components/dashboard/presets/boardPack.css
   Font files under /public/fonts/board-pack/. The leading `/` in the URL
   targets the Vite `public/` root at dev + build. */
@font-face {
  font-family: 'BoardPackDisplay';
  src: url('/fonts/board-pack/display.woff2') format('woff2');
  font-weight: 700 900;
  font-display: swap;
  font-style: normal;
}
@font-face {
  font-family: 'BoardPackBody';
  src: url('/fonts/board-pack/body.woff2') format('woff2');
  font-weight: 400 500;
  font-display: swap;
  font-style: normal;
}

/* Preset-scoped rules — only apply when Board Pack is active. usePresetTheme
   sets data-active-preset on <html>, so this selector wins inside the preset
   without leaking to Analyst Pro. */
:root[data-active-preset='board-pack'] {
  color-scheme: light;
  background: var(--preset-bg);
  color: var(--preset-fg);
}

:root[data-active-preset='board-pack'] body {
  font-family: var(--preset-font-body);
  font-feature-settings: 'ss01', 'ss02'; /* tabular numerals for KPI alignment */
}

:root[data-active-preset='board-pack'] .bp-warn {
  color: var(--preset-accent-warn);
  font-weight: 600;
}

/* Hero display number — 96px bold minimum per the design brief. */
:root[data-active-preset='board-pack'] #bp-hero-number,
:root[data-active-preset='board-pack'] [data-zone-id='bp-hero-number'] {
  font-family: var(--preset-font-display);
  font-size: clamp(88px, 9vw, 140px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 0.95;
}

/* Kill zone chrome — no card borders, no rounded containers. */
:root[data-active-preset='board-pack'] [data-zone-role='leaf'],
:root[data-active-preset='board-pack'] [data-zone-role='container'] {
  border-radius: 0;
  box-shadow: none;
}

/* Hairline rules between rows. */
:root[data-active-preset='board-pack'] [data-zone-id='bp-top'],
:root[data-active-preset='board-pack'] [data-zone-id='bp-headline'],
:root[data-active-preset='board-pack'] [data-zone-id='bp-mid'] {
  border-bottom: 1px solid var(--preset-border);
}

/* Small-caps micro label style for kicker + KPI labels. */
:root[data-active-preset='board-pack'] [data-zone-id='bp-kicker'],
:root[data-active-preset='board-pack'] [data-zone-id='bp-status'],
:root[data-active-preset='board-pack'] [data-zone-id='bp-hero-label'] {
  font-family: var(--preset-font-body);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
```

- [ ] **Step 2: Confirm Vite resolves the font URLs**

```bash
npm run build 2>&1 | tail -30
```

Expected: no "Asset not found" / 404 warnings for `display.woff2` / `body.woff2`.

- [ ] **Step 3: Commit Tasks 3 + 4 together**

```bash
git add src/components/dashboard/presets/boardPack.ts \
        src/components/dashboard/presets/boardPack.css
git commit -m "feat(presets): Board Pack preset definition + stylesheet"
```

---

### Task 5: Side-effect index file

**Files:**
- Create: `src/components/dashboard/presets/index.ts`
- Modify: `src/main.jsx` (or whichever file is the Vite entry)

- [ ] **Step 1: Write the barrel**

```ts
// src/components/dashboard/presets/index.ts
//
// Side-effect module. Importing this file registers every preset beyond
// the Analyst Pro baseline into the registry. Plans C–E add themselves
// to the list below.
import './boardPack';
// import './operatorConsole'; // Plan C
// import './signal';          // Plan D
// import './editorialBrief';  // Plan E

export {};
```

- [ ] **Step 2: Wire it into the app bootstrap**

```bash
grep -n "createRoot\|ReactDOM.render" src/main.jsx src/main.tsx src/App.jsx 2>/dev/null | head
```

Find the file that calls `createRoot(...).render(<App />)` (or the root entry). Add at the top (AFTER `import './index.css';`, BEFORE the render call):

```js
import './components/dashboard/presets';
```

- [ ] **Step 3: Confirm registration at boot**

Start `npm run dev`, open the browser devtools console, and inspect:

```js
window.__askdb_presets = (await import('/src/components/dashboard/presets/registry.ts')).listPresets().map(p => p.id)
```

Expected: `['analyst-pro', 'board-pack']` (order not guaranteed).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/presets/index.ts src/main.jsx
git commit -m "feat(presets): register Board Pack at app boot via side-effect barrel"
```

---

## Phase 3 — Preview thumbnail

### Task 6: Hand-drawn 320×180 SVG preview

**Files:**
- Create: `public/preset-previews/board-pack.svg`

- [ ] **Step 1: Author the SVG**

```svg
<!-- public/preset-previews/board-pack.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
  <rect width="320" height="180" fill="#f5f1e8"/>
  <!-- top bar + rule -->
  <rect x="12" y="10" width="14" height="8" fill="#141414"/>
  <text x="32" y="18" font-family="sans-serif" font-size="7" fill="#141414" letter-spacing="1">Q3 REVENUE · BOARD PACK</text>
  <text x="272" y="18" font-family="sans-serif" font-size="6" fill="#141414" letter-spacing="1">LIVE</text>
  <line x1="12" y1="24" x2="308" y2="24" stroke="#141414" stroke-opacity="0.18" stroke-width="0.6"/>
  <!-- hero -->
  <text x="12"  y="40" font-family="sans-serif" font-size="5" fill="#141414" letter-spacing="1">NET NEW MRR</text>
  <text x="12"  y="74" font-family="sans-serif" font-size="28" font-weight="800" fill="#141414">+$478K</text>
  <text x="12"  y="88" font-family="serif"     font-size="5" fill="#141414">Q3 expansion carried the quarter.</text>
  <text x="12"  y="96" font-family="serif"     font-size="5" fill="#c83e3e">Watch: one pilot at risk.</text>
  <!-- KPI list -->
  <g font-family="sans-serif" font-size="5" fill="#141414">
    <line x1="168" y1="34" x2="308" y2="34" stroke="#141414" stroke-opacity="0.18" stroke-width="0.4"/>
    <text x="168" y="42">MRR</text>     <text x="292" y="42" text-anchor="end">$2.94M</text>
    <line x1="168" y1="46" x2="308" y2="46" stroke="#141414" stroke-opacity="0.18" stroke-width="0.4"/>
    <text x="168" y="54">ARR</text>     <text x="292" y="54" text-anchor="end">$35.3M</text>
    <line x1="168" y1="58" x2="308" y2="58" stroke="#141414" stroke-opacity="0.18" stroke-width="0.4"/>
    <text x="168" y="66">CHURN</text>   <text x="292" y="66" text-anchor="end">2.1%</text>
    <line x1="168" y1="70" x2="308" y2="70" stroke="#141414" stroke-opacity="0.18" stroke-width="0.4"/>
    <text x="168" y="78">LTV:CAC</text> <text x="292" y="78" text-anchor="end">4.8x</text>
    <line x1="168" y1="82" x2="308" y2="82" stroke="#141414" stroke-opacity="0.18" stroke-width="0.4"/>
    <text x="168" y="90">PAYBACK</text> <text x="292" y="90" text-anchor="end">11.2mo</text>
    <line x1="168" y1="94" x2="308" y2="94" stroke="#141414" stroke-opacity="0.18" stroke-width="0.4"/>
  </g>
  <!-- revenue line + dashed forecast -->
  <polyline points="12,130 30,126 48,122 66,118 84,114 102,108 120,102 138,94 156,84 174,78 192,72 210,66"
            fill="none" stroke="#141414" stroke-width="1.2"/>
  <polyline points="210,66 224,60 238,54" fill="none" stroke="#141414" stroke-width="1" stroke-dasharray="2 2"/>
  <circle cx="210" cy="66" r="1.6" fill="#141414"/>
  <!-- top accounts -->
  <g font-family="sans-serif" font-size="4.5" fill="#141414">
    <text x="230" y="108">1 Meridian</text>    <text x="306" y="108" text-anchor="end">$318K</text>
    <text x="230" y="116">2 Northwind</text>   <text x="306" y="116" text-anchor="end">$276K</text>
    <text x="230" y="124">3 Halcyon</text>     <text x="306" y="124" text-anchor="end">$241K</text>
    <text x="230" y="132">4 Ferro &amp; Pike</text><text x="306" y="132" text-anchor="end">$214K</text>
    <text x="230" y="140">5 Clearwater</text>  <text x="306" y="140" text-anchor="end">$156K</text>
  </g>
  <!-- bottom strip rule -->
  <line x1="12" y1="150" x2="308" y2="150" stroke="#141414" stroke-opacity="0.18" stroke-width="0.6"/>
  <!-- micro-cards: histogram | bars | watch -->
  <g fill="#141414">
    <rect x="18"  y="160" width="4" height="10"/>
    <rect x="26"  y="158" width="4" height="12"/>
    <rect x="34"  y="156" width="4" height="14"/>
    <rect x="42"  y="160" width="4" height="10"/>
    <rect x="50"  y="164" width="4" height="6"/>
  </g>
  <g fill="#141414">
    <rect x="118" y="160" width="4" height="10"/>
    <rect x="126" y="158" width="4" height="12"/>
    <rect x="134" y="156" width="4" height="14"/>
    <rect x="142" y="155" width="4" height="15"/>
    <rect x="150" y="154" width="4" height="16"/>
    <rect x="158" y="153" width="4" height="17"/>
  </g>
  <text x="220" y="162" font-family="sans-serif" font-size="5" fill="#c83e3e">Watch:</text>
  <text x="220" y="170" font-family="sans-serif" font-size="4.5" fill="#141414">churn in 91–180d band</text>
</svg>
```

- [ ] **Step 2: Eyeball the rendered file**

Open the SVG in a browser directly. Expected: cream background, giant "+$478K", hairline rules, small red "Watch". If anything looks broken, edit the XML — do not skip this visual check.

- [ ] **Step 3: Commit**

```bash
git add public/preset-previews/board-pack.svg
git commit -m "feat(presets): Board Pack preview thumbnail"
```

---

## Phase 4 — Tests

### Task 7: Unit test — preset validates, registers, shape is correct

**Files:**
- Create: `src/components/dashboard/presets/__tests__/boardPack.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/components/dashboard/presets/__tests__/boardPack.test.ts
import { describe, it, expect } from 'vitest';
import { isDashboardPreset } from '../types';
import { getPreset, listPresets } from '../registry';
import { boardPackPreset } from '../boardPack';

describe('Board Pack preset', () => {
  it('passes the isDashboardPreset validator', () => {
    expect(isDashboardPreset(boardPackPreset)).toBe(true);
  });

  it('self-registers under id "board-pack"', () => {
    expect(getPreset('board-pack').id).toBe('board-pack');
    expect(listPresets().map(p => p.id)).toContain('board-pack');
  });

  it('uses the light scheme (overrides the global toggle)', () => {
    expect(boardPackPreset.scheme).toBe('light');
  });

  it('carries the cream + red palette', () => {
    expect(boardPackPreset.tokens.bg.toLowerCase()).toBe('#f5f1e8');
    expect(boardPackPreset.tokens.accentWarn.toLowerCase()).toBe('#c83e3e');
    expect(boardPackPreset.tokens.radius).toBe(0);
    expect(boardPackPreset.tokens.density).toBe('spacious');
  });

  it('does not use a banned font family', () => {
    const banned = /inter|dm sans|outfit|plus jakarta|instrument/i;
    expect(boardPackPreset.tokens.fontDisplay).not.toMatch(banned);
    expect(boardPackPreset.tokens.fontBody).not.toMatch(banned);
  });

  it('starter layout has a tiled root with four rows and eight leaf zones', () => {
    const root = boardPackPreset.starter.tiledRoot;
    expect(root).toBeTruthy();
    expect(root?.type).toBe('container-vert');
    // 4 rows: top, headline, mid, strip
    expect((root as { children: unknown[] }).children.length).toBe(4);

    function countLeaves(z: unknown): number {
      const zone = z as { type: string; children?: unknown[] };
      if (zone.type.startsWith('container-')) {
        return (zone.children ?? []).reduce((n, c) => n + countLeaves(c), 0);
      }
      return 1;
    }
    expect(countLeaves(root)).toBe(8);
  });

  it('floatingLayer is empty (pure tiled)', () => {
    expect(boardPackPreset.starter.floatingLayer).toEqual([]);
  });

  it('references fixture worksheet ids for the three chart zones', () => {
    const refs: string[] = [];
    function walk(z: unknown) {
      const zone = z as { type: string; worksheetRef?: string; children?: unknown[] };
      if (zone.worksheetRef) refs.push(zone.worksheetRef);
      (zone.children ?? []).forEach(walk);
    }
    walk(boardPackPreset.starter.tiledRoot);
    expect(refs).toEqual(expect.arrayContaining([
      'bp:revenueTrend', 'bp:churnDist', 'bp:cohortRetention',
    ]));
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run src/components/dashboard/presets/__tests__/boardPack.test.ts --reporter=dot
```

Expected: PASS (8 assertions). Fix any genuine shape mismatch by editing `boardPack.ts`, not the test.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/presets/__tests__/boardPack.test.ts
git commit -m "test(presets): Board Pack preset unit tests"
```

---

### Task 8: Smoke test — no regression to Analyst Pro

**Files:** none (verification only)

- [ ] **Step 1: Run the full preset test surface**

```bash
npx vitest run \
  src/components/dashboard/presets/__tests__ \
  src/components/dashboard/__tests__/dashboardPresetSwitcher.test.tsx \
  src/chart-ir/__tests__/editor/dashboardShell.test.tsx \
  --reporter=dot
```

Expected: every test passes. In particular the Plan A assertion `listPresets().length === 1` — if it still exists, that test was written against the pre-Plan-B registry state and Plan A owns the fix. Flag to reviewer; do not edit Plan A's tests from Plan B.

- [ ] **Step 2: Record the delta**

Write a one-line note in the commit message describing the pass count before vs after Plan B. If the switcher now shows two pills (expected), confirm visually in the browser.

---

### Task 9: Visual regression — screenshot the hero

**Files:**
- Create: `src/components/dashboard/presets/__tests__/__snapshots__/board-pack.png`

Use the preview tooling surface (`preview_start`, `preview_click`, `preview_screenshot`). If those tools are genuinely unavailable in the execution environment, substitute a headless Playwright script — but only as a last resort. Do not invent a screenshotting stack to save a few minutes.

- [ ] **Step 1: Start the preview server**

Invoke `preview_start` with cwd `QueryCopilot V1/frontend`, command `npm run dev`, port 5173. Wait for `/analytics` to return 200 by polling `preview_network` or a simple `curl` loop — do not use `sleep`.

- [ ] **Step 2: Activate Board Pack**

Invoke `preview_click` against selector `[data-testid="dashboard-preset-board-pack"]`. Then verify the body tag carries the preset marker: inspect `document.documentElement.getAttribute('data-active-preset')` via the preview tool's DOM inspection action, expect `'board-pack'`.

- [ ] **Step 3: Two screenshots — full dashboard + hero close-up**

Invoke `preview_screenshot` twice:
- full page screenshot → save as `/tmp/bp-full.png`
- selector-scoped screenshot of `[data-zone-id="bp-headline"]` → save as `/tmp/bp-hero.png`

- [ ] **Step 4: Commit the hero snapshot as the visual regression baseline**

```bash
mkdir -p src/components/dashboard/presets/__tests__/__snapshots__
cp /tmp/bp-hero.png src/components/dashboard/presets/__tests__/__snapshots__/board-pack.png
git add src/components/dashboard/presets/__tests__/__snapshots__/board-pack.png
git commit -m "test(presets): Board Pack hero visual-regression baseline"
```

Future runs diff against this PNG via any standard image-diff harness (outside Plan B scope — Plan B only produces the baseline).

- [ ] **Step 5: Visual acceptance checklist (manual, not automated)**

Walk through each item and write PASS/FAIL in the PR description:

- [ ] Background is cream (`#f5f1e8`), not pure white.
- [ ] Hero "+$478K" renders at ≥ 88px, bold weight, in the Board Pack display font (not a system sans fallback — watch for FOUT).
- [ ] Red accent appears ONLY inside the `.bp-warn` span of the hero copy + the "Watch:" label of the bottom insight card. KPI numbers, top-account rows, and chart lines remain black on cream.
- [ ] Every row has a hairline bottom rule at 12% opacity. No rounded corners. No card shadows. No card borders around leaf zones.
- [ ] KPI row labels + the top-bar kicker render in uppercase small-caps letter-spaced micro style.
- [ ] Revenue chart shows the single accent dot at the last real data point + a dashed forecast tail for the final two months.
- [ ] Preset switcher pill shows "Board Pack" between "Analyst Pro" and the (not-yet-shipped) Operator Console slot.

---

## Phase 5 — Ship

### Task 10: Final commit + push

**Files:** none

- [ ] **Step 1: Confirm you're on `askdb-global-comp`**

```bash
cd "QueryCopilot V1"
git branch --show-current
# expected: askdb-global-comp
```

- [ ] **Step 2: Rebase-safety check**

```bash
git log --oneline origin/askdb-global-comp..HEAD | head -30
```

Review the Plan B commits. Each commit should match `feat(presets):` or `test(presets):` and touch only the files declared in the File Structure section.

- [ ] **Step 3: Squash-or-keep per repo convention**

This repo keeps one commit per task (per root `CLAUDE.md`). Leave the history as-is; do NOT squash without explicit instruction.

- [ ] **Step 4: Push**

```bash
git push origin askdb-global-comp
```

Push is gated on the "Global Comp Branch" project memory — the branch is typically held until a plan series stabilizes. If the user has not authorized pushing, stop after committing locally and report.

- [ ] **Step 5: Report to the user**

Include:
- Files created (full list).
- Font pair chosen + source URL + license.
- Vitest counts: pass/fail before Plan B, pass/fail after.
- The two screenshots (full + hero).
- Wall-clock duration end-to-end.

---

## Self-Review Results

1. **Spec coverage vs the user's deliverable list.**
   - Read Plan A → Prerequisite check + types + registry reads (Phase 0 + Task 3).
   - Font subset → Task 1, explicit banned-font list, size ceiling.
   - Preset file + `_registerPreset` → Task 3.
   - Seven/eight-zone starter referencing fixtures → Task 2 (fixtures) + Task 3 (ZoneTree).
   - Side-effect import → Task 5.
   - 320×180 SVG preview → Task 6.
   - Tests → Tasks 7, 8, 9 (unit + regression + visual).
   - Visual verification → Task 9 Step 5.
   - Commit format `feat(presets): add Board Pack preset` → every task uses the prefix (the spec's single message is the sum of Plan B commits).
   - Do-not-modify list → File Structure calls it out.

2. **Placeholder scan.** No `TBD` / `later` / `similar to Task N` / "add validation" strings. Font filenames are generic (`display.woff2` / `body.woff2`) because the exact family is the engineer's choice under the sources allowlist — the naming convention is stated explicitly.

3. **Type consistency.** Token shape matches Plan A's committed `PresetTokens`. `starter.tiledRoot` uses `Zone | null` + `starter.floatingLayer` uses `FloatingZone[]` — matches the committed `types.ts` (which differs from the draft `SerializedZoneTree` in the Plan A markdown). `isDashboardPreset` call in Task 7 matches its committed signature.

4. **Known soft spots, flagged for the implementer.**
   - The `row()` helper in Task 3 does not attach a `border` prop. Task 3 Step 2 requires reading the real `BorderAP` shape in `freeform/lib/types.ts` and deciding per shape whether to add a typed `border` or rely on the CSS hairline fallback. No `as any` / `as never` casts allowed in committed code.
   - Task 9 Step 3 relies on preview tooling that ships with Claude Code. If running in another environment, the Playwright fallback is acceptable; the snapshot file is the contract, not the tool used to produce it.

---

## Follow-up (not this plan)

- Plan C — Operator Console preset (CRT-green terminal).
- Plan D — Signal preset (modern dark SaaS).
- Plan E — Editorial Brief preset (magazine cream, italic serif).

Each follows the same skeleton as Plan B: font subset → preset file → side-effect registration → preview SVG → tests → visual regression.
