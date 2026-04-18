# Plan C — Operator Console Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plan A (`2026-04-18-dashboard-preset-infrastructure.md`) must be merged onto `askdb-global-comp`. Plan B (`2026-04-18-board-pack-preset.md`) does **not** block Plan C, but Plan B's `src/components/dashboard/presets/index.ts` barrel file is the shared registration surface — Plan C appends a line to it. If Plan B has not landed, Plan C creates the barrel instead (Task 5 handles both branches).

Verify Plan A before starting:

```bash
test -f "QueryCopilot V1/frontend/src/components/dashboard/presets/registry.ts" \
  && grep -q "_registerPreset" "QueryCopilot V1/frontend/src/components/dashboard/presets/registry.ts" \
  && echo "Plan A ready" || echo "STOP — Plan A not merged"
```

If it prints `STOP`, do not proceed. Exit and tell the user Plan A must merge first.

**Goal:** Land the second themed preset — **Operator Console**, a CRT-phosphor-on-black mission-control / trading-floor NOC / radar-scope aesthetic for live operational dashboards. Self-registers with Plan A's registry on app boot, ships with a six-channel starter ZoneTree, ships with a legally-sourced monospace font subset, ships with a hand-drawn SVG preview thumbnail, ships with a visual regression snapshot, and extends `setChartChromeFromPreset` so Vega-Lite charts rendered under this preset inherit phosphor green axes (only source file outside `presets/` Plan C is allowed to touch).

**Design language:**

- **Scheme:** `dark` (overrides user's global light/dark toggle).
- **Palette:**
  - Background: near-black with a faint green tint `#0a140e` (NOT pure black — phosphor bleeds).
  - Foreground text (primary): phosphor green `#b5d8a0` at default weight.
  - Foreground text (secondary / labels): dimmer phosphor `#547a4a`.
  - Anomaly / error accent: CRT red `#f05a4a`.
  - Warn accent: amber `#d9a84a`.
  - Hairline border: `#203520` (1px).
- **Optional chrome grain:** scanline / CRT grain overlay is allowed but strictly optional. If added, keep opacity < 4% and apply only to chrome elements (top strip, section headers, footer) — NEVER on data zones. Mark as a CSS custom property so it can be toggled off.
- **Borders:** thin 1px hairline at `#203520` separating sections. Each major section carries a `▶ CH.N — NAME` header bar.
- **Radius:** `0` on every zone.
- **Typography:** monospace everywhere. Choose one of the allowed monos below. **Do NOT use** `IBM Plex Mono`, `Space Mono`, or `Fira Code` — banned by the reflex list. Every displayed number is suffixed with a small-caps unit (`2.47M$`, `14.2mo`, `2.31%`). Where `Berkeley Mono` is available and licensed, use it; otherwise fall back to `JetBrains Mono` or `Commit Mono` (OFL).
- **Density:** `compact`.

**Starter layout (six semantic zones, matches the provided wireframe):**

1. **Top status strip** — horz container. Left cluster: `LAB · LIVE · SYSTEM · PROD-EU-1 · RUN · Q3-2026-042 · OPERATOR · M.CHEN`. Right cluster: `T+00:42:14 REV 2.8.1 · 0 ANOMALY · 3 WATCH`.
2. **CH.1 — REVENUE SIGNAL** — horz container of four sub-channels: `CH.1A MRR`, `CH.1B ARR`, `CH.1C CHURN`, `CH.1D PAYBACK`. Each sub-channel = value + delta + tiny caption.
3. **CH.2 — REVENUE TRACE** — one wide line chart with (a) red vertical anomaly rule, (b) anomaly callout box in upper-right, (c) red dot event marker with label `EVT ▲ Beta-Axion +$120K`.
4. **CH.3 — CHURN RISK DISTRIBUTION** (left half of the bottom row) — green-to-red gradient histogram, bins `0-15`, `16-30`, `31-45`, `46-60`, `61-75`, `76-90`, `91+`.
5. **CH.4 — EVENT LOG** (right half of the bottom row) — monospace timestamped rows with colored `OK` (green `#b5d8a0`) / `WARN` (amber `#d9a84a`) / `ERR` (red `#f05a4a`) tags.
6. **Footer status bar** — horz container. Left: `BIGQUERY://PROD.FINANCE_REPORTS`. Center: `SAMPLE 1/1D · BAND 30D · FILT NONE`. Right: `CPU 8.4% · MEM 412M · UPLINK OK · RENDER 128MS`.

Six semantic zones serialize as nine leaves: top strip (1 leaf split into two text zones in a horz container = 1 semantic zone, 2 leaves), CH.1 row (1 semantic zone, 4 leaves), CH.2 (1 leaf), CH.3 (1 leaf), CH.4 (1 leaf), footer (1 semantic zone, 3 leaves). Total 12 leaves under 4 row containers wrapped in a `container-vert` root. Both framings are consistent — the design brief says six semantic channels; the serialized tree has 12 leaves grouped by role.

**Tech Stack:** React 19, TypeScript, Vitest, existing Plan A preset infrastructure (`_registerPreset`, `DashboardPreset`, `Zone`, `FloatingZone`). No new runtime dependencies.

**Absolute paths anchor:** All source paths in this plan are relative to `QueryCopilot V1/frontend/` unless noted. All test paths same. Branch: `askdb-global-comp`. Work in a git worktree: `git worktree add ../operator-console-work askdb-global-comp` then `cd` into it.

---

## File Structure

### Files to create

- `public/fonts/operator-console/README.md` — license + source URL for the chosen monospace
- `public/fonts/operator-console/mono.woff2` — regular weight, Latin + digits + `$%▶▲−·` punctuation subset
- `public/fonts/operator-console/mono-bold.woff2` — bold weight (section headers only); skip if the chosen family ships only one weight and use CSS `font-weight: 700` synthetic
- `public/fonts/operator-console/LICENSE.txt` — verbatim copy of the license file if shipped alongside the font
- `public/preset-previews/operator-console.svg` — 320×180 hand-drawn thumbnail, phosphor-on-black mimicking the channel grid
- `src/components/dashboard/presets/operatorConsole.ts` — preset definition + `_registerPreset` call
- `src/components/dashboard/presets/operatorConsole.css` — `@font-face` declarations + `[data-active-preset='operator-console']` rules (phosphor colors, hairlines, channel header bar style, optional scanline overlay)
- `src/components/dashboard/presets/__tests__/operatorConsole.test.ts` — preset validates, registers, scheme/palette/starter shape checks
- `src/components/dashboard/presets/__tests__/__snapshots__/operator-console.png` — visual regression snapshot (written by Task 9)
- `src/__fixtures__/operatorConsole/channels.ts` — MRR / ARR / CHURN / PAYBACK sub-channel values + deltas
- `src/__fixtures__/operatorConsole/revenueTrace.ts` — 60 tick points for the trace chart + anomaly coordinates + event marker metadata
- `src/__fixtures__/operatorConsole/churnBins.ts` — 7 histogram bins with gradient stop hints
- `src/__fixtures__/operatorConsole/eventLog.ts` — ≥ 12 timestamped log rows covering OK / WARN / ERR tags

### Files to modify

- `src/components/dashboard/presets/index.ts` — append `import './operatorConsole';` (file exists if Plan B landed; Task 5 creates it if not)
- `src/main.jsx` (or whichever is the Vite entry) — only modified if Plan B has NOT registered the barrel yet (Task 5 Step 2 handles)
- `src/vizql/palettes.ts` — extend `setChartChromeFromPreset` with an `operator-console` branch. This is the **only** file outside `presets/` that Plan C is allowed to modify. See Task 10.

### Files NOT touched

Do not modify: `DashboardShell.jsx`, `DashboardPresetSwitcher.jsx`, `applyPreset.ts`, `usePresetTheme.ts`, `registry.ts`, the Analyst Pro preset, the Board Pack preset, any worksheet / chart-IR module except the single declared extension point in `palettes.ts`, nor any backend file. Change surface is exclusively under `presets/`, `public/fonts/operator-console/`, `public/preset-previews/`, `src/__fixtures__/operatorConsole/`, the single barrel import line, and the single `palettes.ts` branch.

---

## Phase 1 — Font acquisition

### Task 1: License + download the monospace

**Files:**
- Create: `public/fonts/operator-console/README.md`
- Create: `public/fonts/operator-console/mono.woff2`, `public/fonts/operator-console/mono-bold.woff2`
- Create: `public/fonts/operator-console/LICENSE.txt` (if license file distributed with the font)

**Allowed sources** (pick one — do NOT use a paid foundry without receipts, do NOT scrape):

- **Berkeley Mono** (`usgraphics.com`) — highest visual fit. PAID — only use if the user has a license key. Add `.key` / `.license` file to `public/fonts/operator-console/` (gitignored by default). If unsure, skip and use the next choice.
- **Commit Mono** (`commitmono.com`, OFL 1.1) — free, subsettable, neutral mono with the right mechanical feel.
- **Monaspace Argon / Neon / Krypton** (`monaspace.githubnext.com`, OFL 1.1) — free. Argon reads closest to the brief.
- **Google Fonts — `JetBrains Mono`** (OFL 1.1) — last-resort fallback. Acceptable.
- **Banned** (reflex list): `IBM Plex Mono`, `Space Mono`, `Fira Code`. Do NOT ship any of these even as a fallback name inside the CSS `font-family` stack.

- [ ] **Step 1: Choose the family + record the license**

Pick a family from the allowed list above. Record in a draft `README.md`:

```md
# Operator Console font subset

- Family:  <family name> <weight(s)>, from <source URL>
- License: <SIL OFL 1.1 | Berkeley Mono commercial — include quoted permission>
- Subset:  Latin Basic + digits + basic punctuation + `$%▶▲−·`
           (required glyphs: `▶` U+25B6, `▲` U+25B2, `−` U+2212, `·` U+00B7)
- Stripped: all non-Latin scripts, non-ASCII symbols outside the required set,
            kerning tables trimmed where Latin-only runs permit.

Updated <YYYY-MM-DD>.
```

- [ ] **Step 2: Download the woff2 files**

Name them predictably:

```
public/fonts/operator-console/mono.woff2
public/fonts/operator-console/mono-bold.woff2
```

If the family ships as a single variable font, name it `mono.woff2` and leave `mono-bold.woff2` unwritten — the CSS in Task 4 authored as variable-font compatible.

- [ ] **Step 3: Verify they subsetted correctly**

```bash
ls -lh "public/fonts/operator-console/"
```

Expected: each file < 25 KB for monospace Latin+digits+a-dozen-symbol subset. If any exceeds 60 KB, run `pyftsubset` (from `fonttools`) or `glyphhanger` to trim. Example:

```bash
pyftsubset mono.ttf --output-file=mono.woff2 --flavor=woff2 \
  --unicodes="U+0020-007E,U+00B7,U+2212,U+25B2,U+25B6"
```

- [ ] **Step 4: Verify license text is in the repo**

`README.md` must quote the license clause that grants commercial embedded-font web use. If the license file was distributed alongside the font, copy it verbatim to `public/fonts/operator-console/LICENSE.txt`.

- [ ] **Step 5: Commit**

```bash
git add public/fonts/operator-console/
git commit -m "feat(presets): license and subset Operator Console mono"
```

---

## Phase 2 — Preset definition

### Task 2: Demo fixtures

Keep these small and deterministic. They back the starter layout; real operator dashboards rebind them to live worksheets.

**Files:**
- Create: `src/__fixtures__/operatorConsole/channels.ts`, `revenueTrace.ts`, `churnBins.ts`, `eventLog.ts`

- [ ] **Step 1: `channels.ts`**

```ts
// src/__fixtures__/operatorConsole/channels.ts
export interface OperatorChannel {
  id: string;
  code: string;       // "CH.1A"
  label: string;      // "MRR"
  value: string;      // "2.47M$"  — unit suffix required, small-caps via CSS
  delta: string;      // "+18.9%"
  deltaDir: 'up' | 'down' | 'flat';
  caption: string;    // micro secondary text, e.g. "vs 30d avg"
}

export const OPERATOR_CHANNELS: readonly OperatorChannel[] = [
  { id: 'ch1a', code: 'CH.1A', label: 'MRR',     value: '2.47M$', delta: '+18.9%', deltaDir: 'up',   caption: 'vs 30D avg' },
  { id: 'ch1b', code: 'CH.1B', label: 'ARR',     value: '29.6M$', delta: '+22.4%', deltaDir: 'up',   caption: 'run rate' },
  { id: 'ch1c', code: 'CH.1C', label: 'CHURN',   value: '2.31%',  delta: '+0.4pp', deltaDir: 'down', caption: 'rolling 30D' },
  { id: 'ch1d', code: 'CH.1D', label: 'PAYBACK', value: '14.2mo', delta: '−0.7mo', deltaDir: 'up',   caption: 'cohort blend' },
];
```

- [ ] **Step 2: `revenueTrace.ts`** — 60 ticks + one red anomaly rule + one event marker

```ts
// src/__fixtures__/operatorConsole/revenueTrace.ts
export interface RevenueTick { t: number; mrr: number; }
export interface AnomalyRule { atTickIndex: number; label: string; }
export interface EventMarker { atTickIndex: number; label: string; delta: string; }

// 60 synthetic ticks — one per day over a 60-day operational band.
// Generator kept inline so the fixture is fully deterministic.
function makeTicks(): RevenueTick[] {
  const base = 2_180_000;
  const out: RevenueTick[] = [];
  for (let i = 0; i < 60; i++) {
    const trend = i * 5100;
    const wobble = Math.sin(i / 4.7) * 18_500;
    const spike  = i === 42 ? 120_000 : 0; // matches EVT marker below
    out.push({ t: i, mrr: base + trend + wobble + spike });
  }
  return out;
}

export const OPERATOR_REVENUE_TRACE: readonly RevenueTick[] = makeTicks();

export const OPERATOR_ANOMALY_RULE: AnomalyRule = {
  atTickIndex: 42,
  label: 'ANOMALY · +5.3σ',
};

export const OPERATOR_EVENT_MARKER: EventMarker = {
  atTickIndex: 42,
  label: 'EVT ▲ Beta-Axion',
  delta: '+$120K',
};
```

- [ ] **Step 3: `churnBins.ts`** — 7 bins, green→red gradient hints

```ts
// src/__fixtures__/operatorConsole/churnBins.ts
export interface ChurnBin { bin: string; count: number; gradientStop: number; }

// gradientStop ∈ [0, 1]: 0 = pure phosphor green, 1 = CRT red.
export const OPERATOR_CHURN_BINS: readonly ChurnBin[] = [
  { bin: '0-15',   count:  3, gradientStop: 0.00 },
  { bin: '16-30',  count:  7, gradientStop: 0.17 },
  { bin: '31-45',  count: 14, gradientStop: 0.34 },
  { bin: '46-60',  count: 22, gradientStop: 0.50 },
  { bin: '61-75',  count: 18, gradientStop: 0.67 },
  { bin: '76-90',  count:  9, gradientStop: 0.83 },
  { bin: '91+',    count:  4, gradientStop: 1.00 },
];
```

- [ ] **Step 4: `eventLog.ts`** — ≥ 12 rows, full tag coverage

```ts
// src/__fixtures__/operatorConsole/eventLog.ts
export type EventTag = 'OK' | 'WARN' | 'ERR';
export interface EventLogRow { ts: string; tag: EventTag; source: string; message: string; }

export const OPERATOR_EVENT_LOG: readonly EventLogRow[] = [
  { ts: '00:41:58', tag: 'OK',   source: 'waterfall.tier2',  message: 'turbo twin hit · 64ms'  },
  { ts: '00:41:47', tag: 'OK',   source: 'waterfall.tier0',  message: 'schema cache warm'      },
  { ts: '00:41:32', tag: 'WARN', source: 'agent.budget',     message: 'tool budget 18/20'      },
  { ts: '00:41:18', tag: 'OK',   source: 'sql.validator',    message: 'clean · 6 layers'       },
  { ts: '00:40:52', tag: 'ERR',  source: 'connector.bq',     message: 'transient 503 · retry 1'},
  { ts: '00:40:51', tag: 'OK',   source: 'connector.bq',     message: 'recovered on retry 1'   },
  { ts: '00:40:36', tag: 'WARN', source: 'ml.train',         message: 'sample size low · 42K'  },
  { ts: '00:40:14', tag: 'OK',   source: 'pii.mask',         message: 'masked 3 columns'       },
  { ts: '00:39:58', tag: 'OK',   source: 'audit.trail',      message: 'decision logged'        },
  { ts: '00:39:41', tag: 'WARN', source: 'chroma.memory',    message: 'stale entry evicted'    },
  { ts: '00:39:20', tag: 'OK',   source: 'agent.session',    message: 'compacted 6→1'          },
  { ts: '00:39:02', tag: 'OK',   source: 'dashboard.apply',  message: 'preset · operator-console' },
];
```

- [ ] **Step 5: Commit**

```bash
git add src/__fixtures__/operatorConsole/
git commit -m "feat(presets): add Operator Console demo fixtures"
```

---

### Task 3: Write the preset definition + self-register

**Files:**
- Create: `src/components/dashboard/presets/operatorConsole.ts`

- [ ] **Step 1: Read the registry contract**

Before writing the preset, read:

```bash
cat src/components/dashboard/presets/registry.ts
cat src/components/dashboard/presets/types.ts
cat src/components/dashboard/freeform/lib/types.ts | head -120
```

Confirm the committed `DashboardPreset` shape, the `PresetTokens` key names, and the `Zone` / `LeafZone` / `ContainerZone` / `FloatingZone` signatures. The skeleton below assumes Plan A + Plan B's committed types; if any field name differs (e.g. `accentWarn` vs `warn`, `fontMono` vs `fontCode`), follow the committed code, not this draft.

- [ ] **Step 2: Write `operatorConsole.ts` with tokens + starter ZoneTree**

```ts
// src/components/dashboard/presets/operatorConsole.ts
import type { DashboardPreset } from './types';
import type { Zone, ContainerZone, LeafZone } from '../freeform/lib/types';
import { _registerPreset } from './registry';
import './operatorConsole.css';

// ---- token palette ----
const BG           = '#0a140e';        // near-black, faint green tint (phosphor bleed)
const FG           = '#b5d8a0';        // phosphor green primary
const FG_DIM       = '#547a4a';        // phosphor green secondary / labels
const ACCENT       = FG;               // positive carries by phosphor green
const ACCENT_WARN  = '#d9a84a';        // amber
const ACCENT_ERROR = '#f05a4a';        // CRT red
const RULE         = '#203520';        // hairline

// ---- zone helpers ----
const leaf = (id: string, type: LeafZone['type'], extras: Partial<LeafZone> = {}): LeafZone => ({
  id,
  type,
  w: 1, h: 1,
  innerPadding: 8,
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

// ---- starter layout ----
// Root is a vertical stack of 4 rows (status strip / signal row / trace /
// split row with histogram + event log) + a footer. Six semantic zones, 12
// leaves.
const starterRoot: ContainerZone = col('oc-root', [
  // Row 1 — top status strip
  row('oc-status', [
    leaf('oc-status-left',  'text', {
      text: { markdown: 'LAB · LIVE · SYSTEM · PROD-EU-1 · RUN · Q3-2026-042 · OPERATOR · M.CHEN' },
      w: 0.62,
    }),
    leaf('oc-status-right', 'text', {
      text: { markdown: 'T+00:42:14  REV 2.8.1 · 0 ANOMALY · 3 WATCH' },
      w: 0.38,
    }),
  ], { h: 0.05 }),

  // Row 2 — CH.1 REVENUE SIGNAL: four equal sub-channels under a header bar
  col('oc-ch1', [
    leaf('oc-ch1-header', 'text', {
      text: { markdown: '▶ CH.1 — REVENUE SIGNAL' },
      h: 0.25,
    }),
    row('oc-ch1-channels', [
      leaf('oc-ch1a', 'text', {
        text: { markdown: '<!-- CH.1A MRR — binds to OPERATOR_CHANNELS[0] -->' },
        w: 0.25,
      }),
      leaf('oc-ch1b', 'text', {
        text: { markdown: '<!-- CH.1B ARR — binds to OPERATOR_CHANNELS[1] -->' },
        w: 0.25,
      }),
      leaf('oc-ch1c', 'text', {
        text: { markdown: '<!-- CH.1C CHURN — binds to OPERATOR_CHANNELS[2] -->' },
        w: 0.25,
      }),
      leaf('oc-ch1d', 'text', {
        text: { markdown: '<!-- CH.1D PAYBACK — binds to OPERATOR_CHANNELS[3] -->' },
        w: 0.25,
      }),
    ], { h: 0.75 }),
  ], { h: 0.18 }),

  // Row 3 — CH.2 REVENUE TRACE: full-width line chart with anomaly rule + event marker
  col('oc-ch2', [
    leaf('oc-ch2-header', 'text', {
      text: { markdown: '▶ CH.2 — REVENUE TRACE' },
      h: 0.10,
    }),
    leaf('oc-ch2-chart', 'worksheet', {
      worksheetRef: 'oc:revenueTrace',
      displayName: 'Revenue trace · 60D band',
      h: 0.90,
    }),
  ], { h: 0.38 }),

  // Row 4 — split: CH.3 CHURN RISK (left 50%) + CH.4 EVENT LOG (right 50%)
  row('oc-split', [
    col('oc-ch3', [
      leaf('oc-ch3-header', 'text', {
        text: { markdown: '▶ CH.3 — CHURN RISK DISTRIBUTION' },
        h: 0.12,
      }),
      leaf('oc-ch3-hist', 'worksheet', {
        worksheetRef: 'oc:churnBins',
        h: 0.88,
      }),
    ], { w: 0.5 }),
    col('oc-ch4', [
      leaf('oc-ch4-header', 'text', {
        text: { markdown: '▶ CH.4 — EVENT LOG' },
        h: 0.12,
      }),
      leaf('oc-ch4-log', 'text', {
        text: { markdown: '<!-- event log — binds to OPERATOR_EVENT_LOG -->' },
        h: 0.88,
      }),
    ], { w: 0.5 }),
  ], { h: 0.34 }),

  // Row 5 — footer status bar
  row('oc-footer', [
    leaf('oc-footer-left',   'text', { text: { markdown: 'BIGQUERY://PROD.FINANCE_REPORTS' }, w: 0.38 }),
    leaf('oc-footer-center', 'text', { text: { markdown: 'SAMPLE 1/1D · BAND 30D · FILT NONE' }, w: 0.28 }),
    leaf('oc-footer-right',  'text', { text: { markdown: 'CPU 8.4% · MEM 412M · UPLINK OK · RENDER 128MS' }, w: 0.34 }),
  ], { h: 0.05 }),
]);

// ---- preset record ----
export const operatorConsolePreset: DashboardPreset = {
  id: 'operator-console',
  name: 'Operator Console',
  tagline: 'CRT phosphor. Mission-control ops terminal.',
  scheme: 'dark',
  tokens: {
    bg: BG,
    fg: FG,
    fgDim: FG_DIM,
    accent: ACCENT,
    accentWarn: ACCENT_WARN,
    accentError: ACCENT_ERROR,
    border: RULE,
    // Family is the implementer's choice under the Task 1 allowlist. Replace
    // the literal below to match the file pair landed in Task 1. The stack
    // MUST NOT include any of: 'IBM Plex Mono', 'Space Mono', 'Fira Code'.
    fontDisplay: "'OperatorConsoleMono', ui-monospace, 'JetBrains Mono', monospace",
    fontBody:    "'OperatorConsoleMono', ui-monospace, 'JetBrains Mono', monospace",
    fontMono:    "'OperatorConsoleMono', ui-monospace, 'JetBrains Mono', monospace",
    density: 'compact',
    radius: 0,
  },
  starter: {
    tiledRoot: starterRoot,
    floatingLayer: [],
  },
};

_registerPreset(operatorConsolePreset);
```

- [ ] **Step 3: Reconcile token shape against the committed `PresetTokens`**

The token record above includes `fgDim` and `accentError` alongside Plan B's `bg / fg / accent / accentWarn / border / fontDisplay / fontBody / fontMono / density / radius`. If the committed `PresetTokens` type does NOT expose `fgDim` / `accentError`:

- Prefer adding them to the type (one-line change in `types.ts`) ONLY if Plan A / Plan B's committed type is explicitly extendable (has no `exactOptionalPropertyTypes` lock).
- Otherwise drop them from the preset object and move the secondary / error colors into CSS variables declared inside `operatorConsole.css` (the stylesheet owns them; the preset tokens just stay minimal). Commit the CSS-only path.

Do NOT use `as any` / `as never` / `as unknown as` casts in committed code.

- [ ] **Step 4: Resolve the `border` prop against the real `BorderAP` shape**

Same note as Plan B Task 3 Step 2. The `row(...)` helper does NOT attach a `border` prop. Before commit:

1. Read `src/components/dashboard/freeform/lib/types.ts` lines surrounding the `BorderAP` export.
2. If `BorderAP` accepts a bottom-only edge, add it to the row helpers explicitly (typed, no casts) to draw the `#203520` hairline.
3. If not, rely on the CSS fallback (Task 4) which draws the hairline by `data-zone-id`. Both paths are acceptable; no casts.

- [ ] **Step 5: Verify TypeScript is happy**

```bash
npx tsc --noEmit -p .
```

- [ ] **Step 6: Do not commit yet — `operatorConsole.css` is authored in Task 4**

---

### Task 4: `@font-face` + preset-scoped CSS

**Files:**
- Create: `src/components/dashboard/presets/operatorConsole.css`

- [ ] **Step 1: Author the stylesheet**

```css
/* src/components/dashboard/presets/operatorConsole.css
   Font files under /public/fonts/operator-console/. The leading `/` in the
   URL targets the Vite `public/` root at dev + build. */
@font-face {
  font-family: 'OperatorConsoleMono';
  src: url('/fonts/operator-console/mono.woff2') format('woff2');
  font-weight: 400 500;
  font-display: swap;
  font-style: normal;
}
@font-face {
  font-family: 'OperatorConsoleMono';
  src: url('/fonts/operator-console/mono-bold.woff2') format('woff2');
  font-weight: 700 800;
  font-display: swap;
  font-style: normal;
}

/* Preset-scoped rules — only apply when Operator Console is active.
   usePresetTheme sets data-active-preset on <html>. */
:root[data-active-preset='operator-console'] {
  color-scheme: dark;
  background: var(--preset-bg, #0a140e);
  color: var(--preset-fg, #b5d8a0);

  /* Extra palette slots — declared here if PresetTokens does not expose them
     as first-class fields (see Task 3 Step 3). */
  --oc-fg-dim:       #547a4a;
  --oc-accent-warn:  #d9a84a;
  --oc-accent-error: #f05a4a;
  --oc-rule:         #203520;

  /* Optional scanline overlay (kept subtle; applied only to chrome). */
  --oc-scanline-opacity: 0.03;
}

:root[data-active-preset='operator-console'] body {
  font-family: var(--preset-font-body);
  font-feature-settings: 'tnum', 'zero';
  font-variant-numeric: tabular-nums slashed-zero;
}

/* Kill all zone chrome — no card borders, no rounded containers, no shadow. */
:root[data-active-preset='operator-console'] [data-zone-role='leaf'],
:root[data-active-preset='operator-console'] [data-zone-role='container'] {
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

/* Section header bars — `▶ CH.N — NAME` style. Small caps, phosphor,
   hairline bottom rule. */
:root[data-active-preset='operator-console'] [data-zone-id$='-header'] {
  font-family: var(--preset-font-body);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--preset-fg);
  padding: 4px 8px;
  border-bottom: 1px solid var(--oc-rule);
}

/* Hairline separators between top-level rows. */
:root[data-active-preset='operator-console'] [data-zone-id='oc-status'],
:root[data-active-preset='operator-console'] [data-zone-id='oc-ch1'],
:root[data-active-preset='operator-console'] [data-zone-id='oc-ch2'],
:root[data-active-preset='operator-console'] [data-zone-id='oc-split'] {
  border-bottom: 1px solid var(--oc-rule);
}

/* Channel values — large mono, primary phosphor. */
:root[data-active-preset='operator-console'] [data-zone-id^='oc-ch1'] .oc-value {
  font-family: var(--preset-font-mono);
  font-size: clamp(28px, 3.6vw, 48px);
  font-weight: 700;
  line-height: 1;
  color: var(--preset-fg);
}

/* Channel label micro-caps, dim phosphor. */
:root[data-active-preset='operator-console'] [data-zone-id^='oc-ch1'] .oc-label,
:root[data-active-preset='operator-console'] [data-zone-id^='oc-ch1'] .oc-caption {
  font-family: var(--preset-font-body);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--oc-fg-dim);
}

/* Event log tag coloring. */
:root[data-active-preset='operator-console'] .oc-tag-ok   { color: var(--preset-fg); }
:root[data-active-preset='operator-console'] .oc-tag-warn { color: var(--oc-accent-warn); }
:root[data-active-preset='operator-console'] .oc-tag-err  { color: var(--oc-accent-error); }

/* Optional scanline grain on chrome (status strip + footer + section
   headers). Below 4% opacity per the design brief. Disabled by default via
   the --oc-scanline-opacity custom property; enable by toggling that value
   in a user preference if ever wired up. */
:root[data-active-preset='operator-console'] [data-zone-id='oc-status']::after,
:root[data-active-preset='operator-console'] [data-zone-id='oc-footer']::after,
:root[data-active-preset='operator-console'] [data-zone-id$='-header']::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0 2px,
    rgba(181,216,160,1) 2px 3px
  );
  opacity: var(--oc-scanline-opacity);
}
```

- [ ] **Step 2: Confirm Vite resolves the font URLs**

```bash
npm run build 2>&1 | tail -30
```

Expected: no "Asset not found" / 404 warnings for `mono.woff2` / `mono-bold.woff2`.

- [ ] **Step 3: Commit Tasks 3 + 4 together**

```bash
git add src/components/dashboard/presets/operatorConsole.ts \
        src/components/dashboard/presets/operatorConsole.css
git commit -m "feat(presets): Operator Console preset definition + stylesheet"
```

---

### Task 5: Side-effect registration

**Files:**
- Modify (or create if Plan B has not landed): `src/components/dashboard/presets/index.ts`
- Modify (only if the barrel didn't already exist): `src/main.jsx` (or whichever is the Vite entry)

- [ ] **Step 1: Append Operator Console to the barrel**

If `src/components/dashboard/presets/index.ts` exists (Plan B landed):

```ts
// existing file, add this line alongside the other imports
import './operatorConsole';
```

If it does NOT exist (Plan B not landed), create it with both imports:

```ts
// src/components/dashboard/presets/index.ts
// Side-effect module. Importing this file registers every preset beyond
// the Analyst Pro baseline into the registry. Plans D, E append below.
import './operatorConsole';
// import './boardPack';        // Plan B (landed separately if needed)
// import './signal';           // Plan D
// import './editorialBrief';   // Plan E

export {};
```

- [ ] **Step 2: Confirm the barrel is wired into the bootstrap**

```bash
grep -n "components/dashboard/presets" src/main.jsx src/main.tsx src/App.jsx 2>/dev/null | head
```

If the import `import './components/dashboard/presets';` already exists (Plan B wired it), skip. If not, add it to the Vite entry file AFTER `import './index.css';` and BEFORE the `createRoot(...).render(<App />)` call.

- [ ] **Step 3: Confirm registration at boot**

Start `npm run dev`, open devtools console, inspect:

```js
(await import('/src/components/dashboard/presets/registry.ts')).listPresets().map(p => p.id)
```

Expected includes `'operator-console'`. If Plan B also shipped, expect `['analyst-pro', 'board-pack', 'operator-console']` (order not guaranteed).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/presets/index.ts
# only add main.jsx if Step 2 modified it
git commit -m "feat(presets): register Operator Console at app boot"
```

---

## Phase 3 — Preview thumbnail

### Task 6: Hand-drawn 320×180 SVG preview

**Files:**
- Create: `public/preset-previews/operator-console.svg`

- [ ] **Step 1: Author the SVG**

```svg
<!-- public/preset-previews/operator-console.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
  <rect width="320" height="180" fill="#0a140e"/>

  <!-- top status strip -->
  <text x="8"  y="12" font-family="monospace" font-size="5" fill="#b5d8a0" letter-spacing="0.5">
    LAB · LIVE · SYSTEM · PROD-EU-1 · RUN · Q3-2026-042 · OPERATOR · M.CHEN
  </text>
  <text x="312" y="12" text-anchor="end" font-family="monospace" font-size="5" fill="#b5d8a0">
    T+00:42:14 · 0 ANOMALY · 3 WATCH
  </text>
  <line x1="0" y1="16" x2="320" y2="16" stroke="#203520" stroke-width="0.5"/>

  <!-- CH.1 header + four channels -->
  <text x="8" y="26" font-family="monospace" font-size="5" fill="#b5d8a0" letter-spacing="1">▶ CH.1 — REVENUE SIGNAL</text>
  <line x1="0" y1="30" x2="320" y2="30" stroke="#203520" stroke-width="0.4"/>
  <g font-family="monospace" fill="#b5d8a0">
    <text x="8"   y="46" font-size="13" font-weight="700">2.47M$</text>
    <text x="8"   y="54" font-size="5"  fill="#547a4a" letter-spacing="1">MRR · +18.9%</text>

    <text x="88"  y="46" font-size="13" font-weight="700">29.6M$</text>
    <text x="88"  y="54" font-size="5"  fill="#547a4a" letter-spacing="1">ARR · +22.4%</text>

    <text x="168" y="46" font-size="13" font-weight="700">2.31%</text>
    <text x="168" y="54" font-size="5"  fill="#547a4a" letter-spacing="1">CHURN · +0.4pp</text>

    <text x="248" y="46" font-size="13" font-weight="700">14.2mo</text>
    <text x="248" y="54" font-size="5"  fill="#547a4a" letter-spacing="1">PAYBACK · −0.7mo</text>
  </g>
  <line x1="0" y1="60" x2="320" y2="60" stroke="#203520" stroke-width="0.5"/>

  <!-- CH.2 REVENUE TRACE -->
  <text x="8" y="70" font-family="monospace" font-size="5" fill="#b5d8a0" letter-spacing="1">▶ CH.2 — REVENUE TRACE</text>
  <line x1="0" y1="74" x2="320" y2="74" stroke="#203520" stroke-width="0.4"/>
  <polyline
    points="6,110 18,108 30,106 42,107 54,104 66,102 78,103 90,100 102,98 114,96 126,97 138,94 150,92 162,90 174,88 186,90 198,86 210,82 216,78 222,74 228,72 234,80 246,84 258,83 270,81 282,78 294,76 306,74 314,72"
    fill="none" stroke="#b5d8a0" stroke-width="0.8"/>
  <!-- red anomaly rule -->
  <line x1="222" y1="78" x2="222" y2="112" stroke="#f05a4a" stroke-width="0.8" stroke-dasharray="1 1"/>
  <!-- event marker dot -->
  <circle cx="222" cy="74" r="1.6" fill="#f05a4a"/>
  <!-- callout box -->
  <rect x="236" y="80" width="76" height="18" fill="none" stroke="#f05a4a" stroke-width="0.5"/>
  <text x="240" y="88" font-family="monospace" font-size="4.5" fill="#f05a4a">EVT ▲ Beta-Axion</text>
  <text x="240" y="94" font-family="monospace" font-size="4.5" fill="#f05a4a">+$120K</text>
  <line x1="0" y1="114" x2="320" y2="114" stroke="#203520" stroke-width="0.5"/>

  <!-- CH.3 CHURN RISK (left half) -->
  <text x="8" y="124" font-family="monospace" font-size="5" fill="#b5d8a0" letter-spacing="1">▶ CH.3 — CHURN RISK</text>
  <g>
    <rect x="8"   y="148" width="14" height="14" fill="#b5d8a0"/>
    <rect x="24"  y="144" width="14" height="18" fill="#c5cc7a"/>
    <rect x="40"  y="138" width="14" height="24" fill="#d5bf66"/>
    <rect x="56"  y="132" width="14" height="30" fill="#dfa956"/>
    <rect x="72"  y="140" width="14" height="22" fill="#e38c4f"/>
    <rect x="88"  y="150" width="14" height="12" fill="#ea7450"/>
    <rect x="104" y="154" width="14" height="8"  fill="#f05a4a"/>
  </g>

  <!-- CH.4 EVENT LOG (right half) -->
  <text x="168" y="124" font-family="monospace" font-size="5" fill="#b5d8a0" letter-spacing="1">▶ CH.4 — EVENT LOG</text>
  <g font-family="monospace" font-size="4.5">
    <text x="168" y="134" fill="#547a4a">00:41:58</text><text x="200" y="134" fill="#b5d8a0">OK</text>  <text x="214" y="134" fill="#b5d8a0">turbo hit · 64ms</text>
    <text x="168" y="142" fill="#547a4a">00:41:32</text><text x="200" y="142" fill="#d9a84a">WARN</text><text x="214" y="142" fill="#b5d8a0">tool budget 18/20</text>
    <text x="168" y="150" fill="#547a4a">00:40:52</text><text x="200" y="150" fill="#f05a4a">ERR</text> <text x="214" y="150" fill="#b5d8a0">bq 503 · retry 1</text>
    <text x="168" y="158" fill="#547a4a">00:40:14</text><text x="200" y="158" fill="#b5d8a0">OK</text>  <text x="214" y="158" fill="#b5d8a0">pii masked · 3</text>
  </g>

  <!-- footer strip -->
  <line x1="0" y1="166" x2="320" y2="166" stroke="#203520" stroke-width="0.5"/>
  <text x="8"   y="174" font-family="monospace" font-size="4.5" fill="#547a4a">BIGQUERY://PROD.FINANCE_REPORTS</text>
  <text x="160" y="174" text-anchor="middle" font-family="monospace" font-size="4.5" fill="#547a4a">SAMPLE 1/1D · BAND 30D · FILT NONE</text>
  <text x="312" y="174" text-anchor="end" font-family="monospace" font-size="4.5" fill="#547a4a">CPU 8.4% · MEM 412M · RENDER 128MS</text>
</svg>
```

- [ ] **Step 2: Eyeball the rendered file**

Open in a browser. Expected: near-black with green-tint background, phosphor-green text, one red anomaly rule + red callout in the trace, green-to-red gradient histogram, colored log tags. If anything reads muddy (especially the gradient bars in the histogram), adjust the bar fills — do not skip this visual check.

- [ ] **Step 3: Commit**

```bash
git add public/preset-previews/operator-console.svg
git commit -m "feat(presets): Operator Console preview thumbnail"
```

---

## Phase 4 — Tests

### Task 7: Unit test — preset validates, registers, shape is correct

**Files:**
- Create: `src/components/dashboard/presets/__tests__/operatorConsole.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/components/dashboard/presets/__tests__/operatorConsole.test.ts
import { describe, it, expect } from 'vitest';
import { isDashboardPreset } from '../types';
import { getPreset, listPresets } from '../registry';
import { operatorConsolePreset } from '../operatorConsole';

describe('Operator Console preset', () => {
  it('passes the isDashboardPreset validator', () => {
    expect(isDashboardPreset(operatorConsolePreset)).toBe(true);
  });

  it('self-registers under id "operator-console"', () => {
    expect(getPreset('operator-console').id).toBe('operator-console');
    expect(listPresets().map(p => p.id)).toContain('operator-console');
  });

  it('uses the dark scheme (overrides the global toggle)', () => {
    expect(operatorConsolePreset.scheme).toBe('dark');
  });

  it('carries the phosphor palette — near-black bg, green fg, CRT red warn-set', () => {
    const { bg, fg, accent, accentWarn } = operatorConsolePreset.tokens as {
      bg: string; fg: string; accent: string; accentWarn?: string;
    };
    // Background must be near-black (each RGB component < 0x30).
    const hex = (h: string) => parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
    const rgb = hex(bg);
    const r = (rgb >> 16) & 0xff, g = (rgb >> 8) & 0xff, b = rgb & 0xff;
    expect(r).toBeLessThan(0x30);
    expect(g).toBeLessThan(0x30);
    expect(b).toBeLessThan(0x30);

    // Foreground primary must be phosphor green (green channel highest).
    const fgRgb = hex(fg);
    const fR = (fgRgb >> 16) & 0xff, fG = (fgRgb >> 8) & 0xff, fB = fgRgb & 0xff;
    expect(fG).toBeGreaterThan(fR);
    expect(fG).toBeGreaterThan(fB);

    // Accent === fg for positives (color-by-weight contract).
    expect(accent.toLowerCase()).toBe(fg.toLowerCase());
  });

  it('radius is 0 and density is compact', () => {
    expect(operatorConsolePreset.tokens.radius).toBe(0);
    expect(operatorConsolePreset.tokens.density).toBe('compact');
  });

  it('fontMono matches the preset family and does not use a banned mono', () => {
    const banned = /ibm plex mono|space mono|fira code/i;
    expect(operatorConsolePreset.tokens.fontMono).not.toMatch(banned);
    expect(operatorConsolePreset.tokens.fontBody).not.toMatch(banned);
    expect(operatorConsolePreset.tokens.fontDisplay).not.toMatch(banned);
    // The family landed under /public/fonts/operator-console/ must be named.
    expect(operatorConsolePreset.tokens.fontMono).toMatch(/OperatorConsoleMono/);
  });

  it('starter has the six semantic zones', () => {
    const root = operatorConsolePreset.starter.tiledRoot as {
      type: string; children: { id: string }[];
    };
    expect(root.type).toBe('container-vert');
    const topLevelIds = root.children.map(c => c.id);
    expect(topLevelIds).toEqual([
      'oc-status', 'oc-ch1', 'oc-ch2', 'oc-split', 'oc-footer',
    ]);
    // `oc-split` holds CH.3 + CH.4 side by side — so six semantic zones.
    const split = root.children.find(c => c.id === 'oc-split') as {
      children: { id: string }[];
    };
    expect(split.children.map(c => c.id)).toEqual(['oc-ch3', 'oc-ch4']);
  });

  it('floatingLayer is empty (pure tiled)', () => {
    expect(operatorConsolePreset.starter.floatingLayer).toEqual([]);
  });

  it('references fixture worksheet ids for the chart zones', () => {
    const refs: string[] = [];
    function walk(z: unknown) {
      const zone = z as { worksheetRef?: string; children?: unknown[] };
      if (zone.worksheetRef) refs.push(zone.worksheetRef);
      (zone.children ?? []).forEach(walk);
    }
    walk(operatorConsolePreset.starter.tiledRoot);
    expect(refs).toEqual(expect.arrayContaining(['oc:revenueTrace', 'oc:churnBins']));
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run src/components/dashboard/presets/__tests__/operatorConsole.test.ts --reporter=dot
```

Expected: PASS. Fix genuine shape mismatch by editing `operatorConsole.ts`, not by weakening the test.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/presets/__tests__/operatorConsole.test.ts
git commit -m "test(presets): Operator Console preset unit tests"
```

---

### Task 8: Smoke test — no regression to Analyst Pro / Board Pack

**Files:** none (verification only)

- [ ] **Step 1: Run the full preset surface**

```bash
npx vitest run \
  src/components/dashboard/presets/__tests__ \
  src/components/dashboard/__tests__/dashboardPresetSwitcher.test.tsx \
  src/chart-ir/__tests__/editor/dashboardShell.test.tsx \
  --reporter=dot
```

Expected: every preset test passes. Chart-IR tests documented in root `CLAUDE.md` as pre-existing debt (~22 failures in `router.test.ts` + `renderStrategyRouter.test.ts` + editor tests) are tolerated. Confirm Operator Console did not ADD new failures by diffing the failure count before vs after.

- [ ] **Step 2: Record the delta**

Write a one-line note in the commit message describing the pass count before vs after Plan C. If the preset switcher now shows three pills (Analyst Pro + Board Pack + Operator Console), confirm visually in Task 9.

---

### Task 9: Visual regression — screenshots

**Files:**
- Create: `src/components/dashboard/presets/__tests__/__snapshots__/operator-console.png`

Use the preview tooling (`preview_start`, `preview_click`, `preview_screenshot`). Playwright is acceptable as a fallback ONLY if the preview tooling is genuinely unavailable in the execution environment.

- [ ] **Step 1: Start the preview server**

Invoke `preview_start` with cwd `QueryCopilot V1/frontend`, command `npm run dev`, port 5173. Poll `preview_network` for `/analytics` → 200 — do not use `sleep`.

- [ ] **Step 2: Activate Operator Console**

```
preview_click → [data-testid="dashboard-preset-operator-console"]
```

Then verify the html tag carries the preset marker via `document.documentElement.getAttribute('data-active-preset')` — expect `'operator-console'`.

- [ ] **Step 3: Three screenshots — full dashboard, trace close-up, event-log close-up**

Invoke `preview_screenshot` three times:
- Full page → `/tmp/oc-full.png`
- Selector `[data-zone-id="oc-ch2"]` → `/tmp/oc-trace.png`
- Selector `[data-zone-id="oc-ch4"]` → `/tmp/oc-event-log.png`

The trace close-up must include the red anomaly rule + event marker label. The event-log close-up must show OK (green) / WARN (amber) / ERR (red) tags coloring correctly.

- [ ] **Step 4: Commit the full-page snapshot as the visual regression baseline**

```bash
mkdir -p src/components/dashboard/presets/__tests__/__snapshots__
cp /tmp/oc-full.png src/components/dashboard/presets/__tests__/__snapshots__/operator-console.png
git add src/components/dashboard/presets/__tests__/__snapshots__/operator-console.png
git commit -m "test(presets): Operator Console visual-regression baseline"
```

- [ ] **Step 5: Visual acceptance checklist (manual, not automated)**

Walk through each item and write PASS/FAIL in the PR description:

- [ ] Background reads near-black with a faint green cast — NOT pure `#000000`, NOT plain dark grey.
- [ ] All body and label text renders in the Operator Console monospace (not a system sans fallback — watch for FOUT). Digits align vertically because `font-variant-numeric: tabular-nums` is active.
- [ ] Numbers carry small-caps unit suffixes (`2.47M$`, `14.2mo`, `2.31%`).
- [ ] Section header bars show `▶ CH.N — NAME` form, uppercase small-caps, with a hairline `#203520` bottom rule.
- [ ] CH.1 row: four channel tiles side-by-side, each with large mono value / phosphor green, dim-phosphor label + delta caption below.
- [ ] CH.2 trace: single continuous phosphor line; exactly one vertical red anomaly rule; exactly one red dot event marker with `EVT ▲ Beta-Axion +$120K` callout box in the upper-right.
- [ ] CH.3 histogram: 7 bars with a green (left) → red (right) gradient.
- [ ] CH.4 event log: OK tag in phosphor green, WARN in amber, ERR in CRT red. Timestamps in dim phosphor.
- [ ] Footer shows three clusters as specified; `RENDER 128MS` aligned to the right.
- [ ] No rounded corners anywhere. No drop shadows anywhere. No card backgrounds around zones (zones transparent against the page bg).
- [ ] If the scanline overlay was enabled, it is below 4% opacity and only visible on chrome (status strip, footer, section headers) — never over chart data or log text.

---

## Phase 5 — Chart chrome extension

### Task 10: Extend `setChartChromeFromPreset` in `src/vizql/palettes.ts`

**Files:**
- Modify: `src/vizql/palettes.ts`

This is the ONLY file outside `presets/` that Plan C may modify. Without this branch, Vega-Lite charts rendered under Operator Console inherit the default grey axis chrome and read visually inconsistent against the phosphor palette.

- [ ] **Step 1: Read the existing function**

```bash
grep -n "setChartChromeFromPreset" src/vizql/palettes.ts
sed -n '1,120p' src/vizql/palettes.ts
```

Identify the existing pattern — which constants are overridden per preset (`AXIS_COLOR`, `LABEL_COLOR`, `TICK_COLOR`, `GRID_COLOR`), and where the per-preset branch lives (likely a `switch` on `presetId`).

- [ ] **Step 2: Add the Operator Console branch**

Insert a new branch that matches the existing style (do NOT refactor — purely additive). Expected values:

```ts
case 'operator-console': {
  AXIS_COLOR  = 'rgba(181, 216, 160, 0.72)';
  LABEL_COLOR = 'rgba(181, 216, 160, 0.85)';
  TICK_COLOR  = 'rgba(181, 216, 160, 0.55)';
  GRID_COLOR  = 'rgba(181, 216, 160, 0.08)';
  break;
}
```

If the existing function assigns to a struct / object rather than top-level `let`s, follow the existing shape. Do not introduce a new export, a new parameter, or a new file.

- [ ] **Step 3: Type-check + run existing palette tests**

```bash
npx tsc --noEmit -p .
npx vitest run src/vizql --reporter=dot
```

Expected: no new failures. If a test asserts the complete list of known preset IDs in the switch, extend that list to include `'operator-console'` — that is the one test-file exception to "don't weaken tests to pass".

- [ ] **Step 4: Visual verify in the browser**

With `preview_start` still running and Operator Console active, open any worksheet zone (CH.2 TRACE or CH.3 CHURN RISK HISTOGRAM if it renders via Vega-Lite). Confirm axis labels, tick marks, and gridlines read phosphor-green — NOT the default grey. Take one screenshot → `/tmp/oc-chart-chrome.png`.

- [ ] **Step 5: Commit**

```bash
git add src/vizql/palettes.ts
git commit -m "feat(presets): phosphor chart chrome for Operator Console"
```

---

## Phase 6 — Ship

### Task 11: Final commit + push

**Files:** none

- [ ] **Step 1: Confirm worktree + branch**

```bash
cd ../operator-console-work   # or wherever the worktree lives
git branch --show-current
# expected: askdb-global-comp
```

- [ ] **Step 2: Rebase-safety check**

```bash
git log --oneline origin/askdb-global-comp..HEAD | head -40
```

Review the Plan C commits. Each matches `feat(presets):` or `test(presets):` and touches only files declared in the File Structure section — the one exception being the single-branch extension to `src/vizql/palettes.ts` in Task 10, which is covered by the `feat(presets): phosphor chart chrome for Operator Console` commit.

- [ ] **Step 3: Squash-or-keep per repo convention**

Root `CLAUDE.md` keeps one commit per task. Leave history as-is; do NOT squash without explicit instruction.

- [ ] **Step 4: Push**

```bash
git push origin askdb-global-comp
```

Push is gated on the "Global Comp Branch" project memory — branch typically held until a plan series stabilizes. If the user has not authorized pushing, stop after committing locally and report.

- [ ] **Step 5: Clean the worktree (only after the user confirms push or merge)**

```bash
cd "QueryCopilot V1"
git worktree remove ../operator-console-work
```

- [ ] **Step 6: Report to the user**

Include:
- Files created (full list).
- Font family chosen + source URL + license.
- Vitest counts: pass/fail before Plan C, pass/fail after.
- Three screenshots (full, CH.2 trace close-up, CH.4 event-log close-up) + the chart-chrome screenshot from Task 10.
- Wall-clock duration end-to-end.

---

## Self-Review Results

1. **Spec coverage vs the user's deliverable list.**
   - Read Plan A + existing presets → Prerequisite + Task 3 Step 1.
   - Font subset at `public/fonts/operator-console/` → Task 1. Banned-font list enforced in tokens + unit test.
   - Preset file + `_registerPreset` → Task 3.
   - Six-zone starter referencing fixtures → Task 2 (fixtures) + Task 3 (ZoneTree).
   - Side-effect import → Task 5.
   - 320×180 SVG preview → Task 6.
   - Tests — preset validates, scheme dark, dark-bg check, green-fg check, fontMono family check, six-zone starter check, fixture-ref check → Task 7.
   - Visual regression snapshot → Task 9.
   - Visual verification including CH.4 tag coloring closeup → Task 9 Step 3 (event-log selector shot).
   - Chart chrome extension in `palettes.ts` (only permitted file outside `presets/`) → Task 10, exact rgba values from the spec.
   - Commit format `feat(presets): add Operator Console preset` is the sum of Plan C commits; the final summary PR may squash if the user explicitly asks.
   - Worktree scaffolding → Task 11.

2. **Placeholder scan.** No `TBD` / `later` / "add validation" strings. Font filenames are generic (`mono.woff2`, `mono-bold.woff2`) because the exact family is the engineer's choice under the Task 1 allowlist; the naming convention is stated explicitly.

3. **Type consistency.** `tokens` shape matches Plan A's committed `PresetTokens` for the base fields; `fgDim` and `accentError` flagged in Task 3 Step 3 with two documented resolutions (extend type or move to CSS vars), no casts. `starter.tiledRoot` uses the committed `Zone | null` pattern + `floatingLayer: FloatingZone[]`.

4. **Known soft spots, flagged for the implementer.**
   - The `row()` helper does NOT attach a `border` prop (same rationale as Plan B). Task 3 Step 4 requires reading `BorderAP` and deciding per shape.
   - Task 9 Step 3 relies on preview tooling. Playwright fallback acceptable; the PNG is the contract, not the tool.
   - Task 10's exact branch shape depends on whether `setChartChromeFromPreset` assigns top-level constants or a struct. Read first, match the existing pattern.
   - Scanline overlay is opt-in via `--oc-scanline-opacity` custom property. Default keeps visual noise minimal and lets operators toggle if the wire-up ever lands as a user pref.

---

## Follow-up (not this plan)

- Plan D — Signal preset (modern dark SaaS).
- Plan E — Editorial Brief preset (magazine cream, italic serif).

Each follows the same skeleton as Plans B + C: font subset → preset file → side-effect registration → preview SVG → tests → visual regression → optional chart-chrome branch if the palette materially differs from the default.
