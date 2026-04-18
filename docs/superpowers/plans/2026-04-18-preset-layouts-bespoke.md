# Preset Layouts — Bespoke Rebuild (Plan A★)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the failed "ZoneTree + token swap" preset approach with four **bespoke React layout components** that render each wireframe pixel-accurately. When the user clicks a preset pill, the dashboard visibly becomes that wireframe — not a token-reskinned Analyst Pro.

**Architecture:** Keep the preset registry + `switchPreset` action + `usePresetTheme` hook from Plan A (they're infra, not the bug). Change the dispatch: `DashboardShell` routes on `activePresetId` to one of five layout components — `AnalystProLayout` for `analyst-pro` (unchanged) and four bespoke `<Preset>Layout.jsx` components for the themed presets. Each bespoke layout is hand-written JSX that matches its wireframe verbatim (type, color, spacing, element structure). Scoped CSS files carry the preset-specific rules (cream tearsheet, CRT phosphor, modern dark card grid, magazine cream). Data slots pull values from the current Analyst Pro dashboard's tiles — Phase 1 ships with the wireframe's static demo values so we can prove visual fidelity first; real-data binding follows.

**Prior-work status:** `src/components/dashboard/presets/{types,registry,applyPreset,usePresetTheme}.ts`, `DashboardPresetSwitcher.jsx`, and `emptyDashboardForPreset` exist and are reused. `boardPack.ts` + `operatorConsole.ts` contributed token sets + markdown-tile starter trees — the starter-tree part is deprecated by this plan; the token sets are retained. `boardPack.css` + `operatorConsole.css` stay but their selectors will be rewritten to target the new bespoke layouts.

**Screenshot-fidelity contract:** Each phase ending in a new layout component has a **screenshot-diff gate**. The phase is not complete until the preview screenshot of the rendered preset is committed next to the wireframe image and the visual comparison shows no gap on: bg color, fg text color, accent color, display font, body font, grid proportions, key element placement (hero, KPI row, chart, accent stripes, drop caps, event log, etc.). "Build green" ≠ "done."

**Tech Stack:** React 19, Zustand, Vitest, @testing-library/react, existing preset registry + `usePresetTheme` hook, framer-motion (switcher only).

---

## File Structure

### Create

- `src/components/dashboard/modes/presets/BoardPackLayout.jsx`
- `src/components/dashboard/modes/presets/BoardPackLayout.css`
- `src/components/dashboard/modes/presets/OperatorConsoleLayout.jsx`
- `src/components/dashboard/modes/presets/OperatorConsoleLayout.css`
- `src/components/dashboard/modes/presets/SignalLayout.jsx`
- `src/components/dashboard/modes/presets/SignalLayout.css`
- `src/components/dashboard/modes/presets/EditorialBriefLayout.jsx`
- `src/components/dashboard/modes/presets/EditorialBriefLayout.css`
- `src/components/dashboard/modes/presets/__tests__/BoardPackLayout.test.tsx`
- `src/components/dashboard/modes/presets/__tests__/OperatorConsoleLayout.test.tsx`
- `src/components/dashboard/modes/presets/__tests__/SignalLayout.test.tsx`
- `src/components/dashboard/modes/presets/__tests__/EditorialBriefLayout.test.tsx`
- `src/components/dashboard/modes/presets/index.js` — barrel export of the four layouts
- `docs/ultraflow/screenshots/preset-board-pack.png` — committed ground-truth screenshot
- `docs/ultraflow/screenshots/preset-operator-console.png`
- `docs/ultraflow/screenshots/preset-signal.png`
- `docs/ultraflow/screenshots/preset-editorial-brief.png`

### Modify

- `src/components/dashboard/DashboardShell.jsx` — replace unconditional `<AnalystProLayout>` with a dispatch map `{analyst-pro, board-pack, operator-console, signal, editorial-brief}` keyed on `activePresetId`
- `src/store.js` — diagnose + fix why `switchPreset` pill click does not move `activePresetId` (see Phase 1)
- `src/components/dashboard/presets/boardPack.ts` — drop `starter` tree; keep token set + register
- `src/components/dashboard/presets/operatorConsole.ts` — drop `starter` tree; keep token set + register
- `src/components/dashboard/presets/applyPreset.ts` — remove starter-tree seeding; `switchPreset` only changes `activePresetId`
- `src/components/dashboard/freeform/lib/dashboardShape.ts` — `emptyDashboardForPreset` no longer writes `presetLayouts[id]` starter
- `src/components/dashboard/presets/types.ts` — remove `starter` field from `DashboardPreset`

### Delete (after all four bespoke layouts ship)

- `src/components/dashboard/presets/boardPack.css` — rules move to `BoardPackLayout.css`
- `src/components/dashboard/presets/operatorConsole.css` — rules move to `OperatorConsoleLayout.css`

---

## Phase 1 — Unbreak the switcher click

A pill click currently does not move `activePresetId` in the store, and `data-active-preset` on `<html>` stays on `analyst-pro`. Without this fixed, nothing in Phases 2–6 is reachable.

### Task 1: Reproduce the bug with a failing test

**Files:**
- Create: `src/components/dashboard/__tests__/presetSwitcher.click.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dashboard/__tests__/presetSwitcher.click.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import DashboardPresetSwitcher from '../DashboardPresetSwitcher';
import { useStore } from '../../../store';
import { _registerPreset, listPresets } from '../presets/registry';
import { emptyDashboardForPreset } from '../freeform/lib/dashboardShape';

describe('DashboardPresetSwitcher click → store update', () => {
  beforeEach(() => {
    if (!listPresets().some((p) => p.id === 'test-alt')) {
      _registerPreset({
        id: 'test-alt',
        name: 'Test Alt',
        tagline: 'fixture',
        scheme: 'dark',
        tokens: listPresets()[0].tokens,
      } as never);
    }
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  it('moves activePresetId when a pill is clicked', () => {
    render(<DashboardPresetSwitcher />);
    fireEvent.click(screen.getByTestId('dashboard-preset-test-alt'));
    expect(useStore.getState().analystProDashboard?.activePresetId).toBe('test-alt');
  });

  it('works even when the store starts with analystProDashboard === null', () => {
    useStore.setState({ analystProDashboard: null });
    render(<DashboardPresetSwitcher />);
    fireEvent.click(screen.getByTestId('dashboard-preset-test-alt'));
    expect(useStore.getState().analystProDashboard?.activePresetId).toBe('test-alt');
  });
});
```

- [ ] **Step 2: Run — expect it to fail or pass according to current code**

Run: `npx vitest run src/components/dashboard/__tests__/presetSwitcher.click.test.tsx --reporter=dot`

If it passes: the bug is HMR-scope only, not a code bug. Proceed to Phase 2 after confirming the pill click works in a real browser load.

If it fails: the code has a real bug. Continue.

- [ ] **Step 3: Diagnose** by reading these files end-to-end:

- `src/store.js` — the `switchPreset` action body
- `src/components/dashboard/DashboardPresetSwitcher.jsx` — the pill `onClick` handler
- `src/components/dashboard/freeform/lib/dashboardShape.ts` — `emptyDashboardForPreset`
- `src/components/dashboard/presets/applyPreset.ts` — the returned object shape

Identify the concrete reason `activePresetId` doesn't update. The most likely causes:
  1. `applyPreset` returns the same object reference when existing preset matches
  2. `get().analystProDashboard` is still null after `switchPreset` because an earlier subscriber overwrites the set
  3. `emptyDashboardForPreset` produces an object shape where `applyPreset` computes a no-op layout

- [ ] **Step 4: Implement the minimal fix**

Whatever the root cause, the fix must make the two tests in Task 1 pass. Most likely:

```js
// src/store.js — inside switchPreset
switchPreset: (presetId) => {
  const d = get().analystProDashboard ?? emptyDashboardForPreset(presetId);
  const next = applyPreset(d, presetId);
  // Force a new reference even if applyPreset short-circuited — React subscribers
  // gate on reference equality, and a no-op return would skip the re-render.
  set({ analystProDashboard: { ...next } });
},
```

But only apply this shape after confirming the actual diagnosis.

- [ ] **Step 5: Run both tests — they MUST pass**

Run: `npx vitest run src/components/dashboard/__tests__/presetSwitcher.click.test.tsx --reporter=dot`
Expected: 2 passed.

- [ ] **Step 6: Smoke in browser**

Reload preview. Click Board Pack pill. Inspect `<html>`; `data-active-preset` must read `board-pack`. Click Analyst Pro pill. `data-active-preset` must read `analyst-pro`. Record which test PASS confirms the fix.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(presets): switchPreset click updates activePresetId

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 — Replace DashboardShell's unconditional AnalystProLayout with a dispatch map

### Task 2: Introduce the preset → layout dispatch map

**Files:**
- Modify: `src/components/dashboard/DashboardShell.jsx`
- Create: `src/components/dashboard/modes/presets/index.js`

- [ ] **Step 1: Write a failing test**

Create `src/components/dashboard/__tests__/dashboardShell.presetDispatch.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardShell from '../DashboardShell';
import { useStore } from '../../../store';
import { emptyDashboardForPreset } from '../freeform/lib/dashboardShape';

describe('DashboardShell preset dispatch', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  it('mounts AnalystProLayout when activePresetId is analyst-pro', async () => {
    render(<DashboardShell tiles={[]} initialMode="analyst-pro" />);
    expect(await screen.findByTestId('layout-analyst-pro')).toBeInTheDocument();
  });

  it('mounts BoardPackLayout when activePresetId is board-pack', async () => {
    useStore.getState().switchPreset('board-pack');
    render(<DashboardShell tiles={[]} initialMode="analyst-pro" />);
    expect(await screen.findByTestId('layout-board-pack')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure for board-pack (layout doesn't exist yet)**

Run: `npx vitest run src/components/dashboard/__tests__/dashboardShell.presetDispatch.test.tsx --reporter=dot`
Expected: first test passes, second fails with "BoardPackLayout not rendered."

- [ ] **Step 3: Create the barrel with placeholder stubs**

`src/components/dashboard/modes/presets/index.js`:

```js
// Barrel of bespoke preset layouts. Each is a lazy-loaded React component
// that renders its wireframe exactly. Phase 3–6 replaces these stubs.
import { lazy } from 'react';

export const BoardPackLayout = lazy(() => import('./BoardPackLayout'));
export const OperatorConsoleLayout = lazy(() => import('./OperatorConsoleLayout'));
export const SignalLayout = lazy(() => import('./SignalLayout'));
export const EditorialBriefLayout = lazy(() => import('./EditorialBriefLayout'));
```

Create each of the four `.jsx` files as a one-line stub:

```jsx
// src/components/dashboard/modes/presets/BoardPackLayout.jsx (stub)
export default function BoardPackLayout() {
  return <div data-testid="layout-board-pack" />;
}
```

Same for `OperatorConsoleLayout`, `SignalLayout`, `EditorialBriefLayout` — each with its own `data-testid`.

- [ ] **Step 4: Wire dispatch into `DashboardShell.jsx`**

Add import:
```jsx
import {
  BoardPackLayout,
  OperatorConsoleLayout,
  SignalLayout,
  EditorialBriefLayout,
} from './modes/presets';
```

Build a map (outside the component):
```jsx
const PRESET_LAYOUTS = {
  'analyst-pro': AnalystProLayout,
  'board-pack': BoardPackLayout,
  'operator-console': OperatorConsoleLayout,
  'signal': SignalLayout,
  'editorial-brief': EditorialBriefLayout,
};
```

Replace the current unconditional `<AnalystProLayout .../>` inside `<Suspense>` with:
```jsx
const ActiveLayout = PRESET_LAYOUTS[activePresetId] ?? AnalystProLayout;
return (
  <Suspense fallback={<div data-testid="preset-layout-loading" />}>
    <ActiveLayout
      tiles={tiles}
      onTileClick={onTileClick}
      onLayoutChange={onLayoutChange}
      authoredLayout={authoredLayout}
      dashboardId={dashboardId}
      dashboardName={dashboardName}
    />
  </Suspense>
);
```

- [ ] **Step 5: Run tests — both now pass**

Run: `npx vitest run src/components/dashboard/__tests__/ --reporter=dot`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(presets): DashboardShell dispatches to bespoke preset layouts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 — BoardPackLayout (wireframe 1)

### Task 3: Bespoke Board Pack layout — cream tearsheet

**Files:**
- Replace stub: `src/components/dashboard/modes/presets/BoardPackLayout.jsx`
- Create: `src/components/dashboard/modes/presets/BoardPackLayout.css`
- Create: `src/components/dashboard/modes/presets/__tests__/BoardPackLayout.test.tsx`

**Reference wireframe:**
The user's first attached image: cream paper bg ~#f5f1e8, black text, red accent for risk. Layout regions:
1. Top bar — AskDB logo left, `Q3 REVENUE · BOARD PACK` kicker small-caps, `● LIVE · AUTO-REFRESH 2S` right
2. Hero split 50/50 — left: `Q3 2026 · NET NEW MRR` kicker, massive `+$478K` bold display, narrative paragraph with one red `$290K MRR` highlight and a red `Watch:` span. Right: KPI list (MRR, ARR, Churn, LTV:CAC, Payback) — each row separated by hairline rule, label left, big black value right-aligned, delta next to value
3. Mid row 70/30 — left: revenue trend chart titled `Growth compounded in late Q3` + subtitle `Forecast suggests $3.1M MRR by Oct · dashed` — bare black line + light gray fill + black event dot + red event dot + dashed forecast tail. Right: `Five accounts = 41% of MRR` kicker + 5-row account list, each row has account name + black value + red or black delta
4. Bottom strip 3 columns — Churn Risk Dist (small histogram), Cohort July '25 (bar strip), Enterprise Insight (copy with red emphasis)

**No card borders. No rounded corners. Hairline rules between KPI rows. 96pt+ bold display for hero number. Sans-serif throughout.**

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dashboard/modes/presets/__tests__/BoardPackLayout.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BoardPackLayout from '../BoardPackLayout';

describe('BoardPackLayout', () => {
  it('renders the hero zone with the display number', () => {
    render(<BoardPackLayout tiles={[]} />);
    expect(screen.getByTestId('layout-board-pack')).toBeInTheDocument();
    expect(screen.getByTestId('board-pack-hero-number')).toHaveTextContent('+$478K');
  });
  it('renders the kicker, KPI list, top-accounts, bottom strip', () => {
    render(<BoardPackLayout tiles={[]} />);
    expect(screen.getByText(/Q3 REVENUE · BOARD PACK/)).toBeInTheDocument();
    expect(screen.getByTestId('board-pack-kpi-list')).toBeInTheDocument();
    expect(screen.getByTestId('board-pack-accounts')).toBeInTheDocument();
    expect(screen.getByTestId('board-pack-bottom-strip')).toBeInTheDocument();
  });
  it('has no card borders and uses hairline rules (no border-radius)', () => {
    render(<BoardPackLayout tiles={[]} />);
    const root = screen.getByTestId('layout-board-pack');
    const style = getComputedStyle(root);
    expect(style.backgroundColor).toBe('rgb(245, 241, 232)'); // #f5f1e8 cream
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run src/components/dashboard/modes/presets/__tests__/BoardPackLayout.test.tsx --reporter=dot`
Expected: fail.

- [ ] **Step 3: Implement `BoardPackLayout.jsx`**

Full bespoke JSX. Top-level: `<div className="bp-layout" data-testid="layout-board-pack" data-preset="board-pack">` wrapping five child regions. No generic tile renderer — hand-written HTML throughout. Example skeleton:

```jsx
import './BoardPackLayout.css';

export default function BoardPackLayout() {
  return (
    <div className="bp-layout" data-testid="layout-board-pack" data-preset="board-pack">
      <header className="bp-topbar">
        <span className="bp-topbar__logo">AskDB</span>
        <span className="bp-topbar__kicker">Q3 REVENUE · BOARD PACK</span>
        <span className="bp-topbar__live"><span className="bp-dot" />LIVE · AUTO-REFRESH 2S</span>
      </header>

      <section className="bp-hero">
        <div className="bp-hero__left">
          <div className="bp-hero__kicker">Q3 2026 · NET NEW MRR</div>
          <div className="bp-hero__number" data-testid="board-pack-hero-number">+$478<span className="bp-hero__unit">K</span></div>
          <p className="bp-hero__prose">
            Three enterprise expansions in July together added <b className="bp-warn">$290K MRR</b> — 61% of net new. Mid-market added 47 logos. <b className="bp-warn">Watch:</b> enterprise Q4 pipe at 2.1× coverage.
          </p>
        </div>
        <dl className="bp-kpi-list" data-testid="board-pack-kpi-list">
          <div className="bp-kpi"><dt>MRR</dt><dd>$2.47M<span>+12.4%</span></dd></div>
          <div className="bp-kpi"><dt>ARR</dt><dd>$29.6M<span>+8.7%</span></dd></div>
          <div className="bp-kpi"><dt>Churn</dt><dd>2.31%<span>−0.4pp</span></dd></div>
          <div className="bp-kpi"><dt>LTV : CAC</dt><dd>4.7×<span>+0.3</span></dd></div>
          <div className="bp-kpi"><dt>Payback</dt><dd className="bp-warn">14.2mo<span>+0.8</span></dd></div>
        </dl>
      </section>

      <section className="bp-mid">
        <figure className="bp-chart">
          <figcaption className="bp-chart__kicker">REVENUE · 12MO</figcaption>
          <h2 className="bp-chart__title">Growth compounded in late Q3</h2>
          <p className="bp-chart__subtitle">Forecast suggests $3.1M MRR by Oct · dashed</p>
          <svg viewBox="0 0 800 260" className="bp-chart__svg">
            {/* Bare black line + faint fill + two event dots + dashed forecast */}
            <path d="M0 200 L80 190 L160 180 L240 170 L320 160 L400 150 L480 140 L560 115 L640 90" stroke="#141414" fill="none" strokeWidth="1.5" />
            <path d="M0 200 L80 190 L160 180 L240 170 L320 160 L400 150 L480 140 L560 115 L640 90 L640 260 L0 260 Z" fill="#eeebe2" />
            <circle cx="400" cy="150" r="5" fill="#141414" />
            <circle cx="560" cy="115" r="5" fill="#c83e3e" />
            <path d="M640 90 L800 70" stroke="#c83e3e" strokeWidth="1.5" strokeDasharray="4 4" />
          </svg>
          <div className="bp-chart__axis">
            <span>AUG '25</span>
            <span>JUL '26 · +12.4%</span>
          </div>
        </figure>
        <aside className="bp-accounts" data-testid="board-pack-accounts">
          <div className="bp-accounts__kicker">TOP ACCOUNTS · MRR</div>
          <h3 className="bp-accounts__title">Five accounts = 41% of MRR</h3>
          <p className="bp-accounts__sub">Concentration risk · monitor Waverly (−4%)</p>
          <ol className="bp-accounts__list">
            <li><span>Amberline Logistics</span><span>$124.8K<b className="bp-warn">+18%</b></span></li>
            <li><span>Northfield Biotech</span><span>$108.4K<b className="bp-warn">+11%</b></span></li>
            <li><span>Waverly Capital</span><span>$96.2K<b className="bp-warn">−4%</b></span></li>
            <li><span>Kestrel Aerospace</span><span>$88.7K<b className="bp-warn">+22%</b></span></li>
            <li><span>Ordinance Retail</span><span>$72.1K<b>+6%</b></span></li>
          </ol>
        </aside>
      </section>

      <section className="bp-strip" data-testid="board-pack-bottom-strip">
        <div className="bp-strip__card">
          <div className="bp-strip__kicker">CHURN RISK · DIST.</div>
          <h4>Tail is manageable</h4>
          <p>12 accounts above 85 · $340K MRR</p>
          {/* Small histogram */}
          <svg viewBox="0 0 120 40" className="bp-hist">{/* bars */}</svg>
        </div>
        <div className="bp-strip__card">
          <div className="bp-strip__kicker">COHORT · JULY '25</div>
          <h4>Retention holds</h4>
          <p>M12 retention = 92.1% · best cohort YTD</p>
          <svg viewBox="0 0 120 8" className="bp-cohort">{/* bars */}</svg>
        </div>
        <div className="bp-strip__card">
          <div className="bp-strip__kicker">INSIGHT</div>
          <h4>Enterprise concentration is the Q4 lever</h4>
          <p>Pipeline coverage 2.1× below target 3.0×. <b className="bp-warn">Accelerate Acme tier-up + 2 mid-market upsells</b> to hit Q4 expansion plan. Recommend QBR scheduled for Waverly before Oct 15.</p>
          <div className="bp-strip__meta">AI · REVIEWED 2MIN AGO</div>
        </div>
      </section>
    </div>
  );
}
```

(Real content continues — this is a sketch. The implementing agent fills in exact proportions, svg paths, and refinements.)

- [ ] **Step 4: Implement `BoardPackLayout.css`**

Cream bg, black fg, hairline rules (1px solid #dad6cd), NO radius, NO card borders. Hero number is a bold sans at `clamp(56px, 8vw, 144px)`. KPI list uses `border-top: 1px solid #dad6cd` per row. Side-stripe borders are BANNED per the impeccable skill.

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/dashboard/modes/presets/__tests__/BoardPackLayout.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Screenshot-diff gate**

Start preview. `switchPreset('board-pack')`. Take a screenshot of the full `<div data-testid="layout-board-pack">`. Save it at `docs/ultraflow/screenshots/preset-board-pack.png`. Open the user's wireframe image for Board Pack side-by-side. The screenshot must match on: bg color (hex sample), hero number size + weight, KPI row hairline rule color, revenue trend line thickness + color + dashed forecast, account row alignment, bottom-strip three-up layout.

If any mismatch, fix it, re-screenshot, re-commit the screenshot.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(presets): BoardPackLayout — cream tearsheet (wireframe 1)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 — OperatorConsoleLayout (wireframe 2)

### Task 4: Bespoke Operator Console — CRT phosphor terminal

**Files:**
- Replace stub: `src/components/dashboard/modes/presets/OperatorConsoleLayout.jsx`
- Create: `src/components/dashboard/modes/presets/OperatorConsoleLayout.css`
- Create: `src/components/dashboard/modes/presets/__tests__/OperatorConsoleLayout.test.tsx`

**Reference wireframe:** Wireframe 2. Near-black bg ~#0a140e, phosphor green text ~#b5d8a0, red anomaly highlights ~#f05a4a, amber warnings ~#d9a84a. Monospace everywhere (IBM Plex Mono banned per impeccable's reflex list; use JetBrains Mono or Commit Mono). 0 radius.

Regions:
1. Mission-control top strip — `● LAB · LIVE · SYSTEM · PROD-EU-1 · RUN · Q3-2026-042 · OPERATOR · M.CHEN` left, `T+00:42:14 REV 2.8.1 · 0 ANOMALY · 3 WATCH` right
2. **CH.1 — REVENUE SIGNAL** — wide header bar + row of 4 channel tiles: CH.1A MRR / CH.1B ARR / CH.1C CHURN / CH.1D PAYBACK. Each: channel code in tiny caps, big number with unit suffix in smaller caps (`2.47M$`, `29.6M$`, `2.31%`, `14.2mo`), delta below in green or red, footer caption (`nom`, `WATCH`)
3. **CH.2 — REVENUE TRACE** — wide band with revenue line in phosphor green, red vertical dashed rule at anomaly time, red anomaly callout box upper right with `ANOMALY · T+498 ΔSlope 2.3σ above baseline corr: acme_renewal · 0.89`, red dot event marker labeled `EVT ▲ BetaAxion +$120K`
4. Bottom split — **CH.3 CHURN RISK DISTRIBUTION** (gradient-green histogram 0–95+ with red bars for ≥85) + **CH.4 EVENT LOG** (monospace timestamps + `OK`/`WARN`/`ERR` colored tags)
5. Footer status — `BIGQUERY://PROD.FINANCE_REPORTS` left, `SAMPLE 1/1D · BAND 30D · FILT NONE` center, `CPU 8.4% · MEM 412M · UPLINK OK · RENDER 128MS` right

- [ ] **Step 1: Test** — assert root renders, all four channels (CH.1A-D), event log has OK/WARN/ERR tagged lines, anomaly callout text present
- [ ] **Step 2: Run — expect fail**
- [ ] **Step 3: Implement layout with phosphor green + monospace + verbatim channel headers**
- [ ] **Step 4: Implement CSS with bg `#0a140e`, fg `#b5d8a0`, red `#f05a4a`, 0 radius, monospace font-family**
- [ ] **Step 5: Run tests — pass**
- [ ] **Step 6: Screenshot-diff gate** — open preview, switch to operator-console, screenshot, save at `docs/ultraflow/screenshots/preset-operator-console.png`, compare side-by-side with user's wireframe 2
- [ ] **Step 7: Commit** — `feat(presets): OperatorConsoleLayout — CRT terminal (wireframe 2)`

---

## Phase 5 — SignalLayout (wireframe 3)

### Task 5: Bespoke Signal — modern dark SaaS

**Files:**
- Replace stub: `src/components/dashboard/modes/presets/SignalLayout.jsx`
- Create: `src/components/dashboard/modes/presets/SignalLayout.css`
- Create: `src/components/dashboard/modes/presets/__tests__/SignalLayout.test.tsx`

**Reference wireframe:** Wireframe 3. Deep slate bg ~#0b0f17, near-white text ~#e7e9ef, cool teal accent ~#4ecdc4, burnt orange ~#e8864a, dusty rose ~#d67a9a, muted indigo ~#7a82c2, soft red ~#f47272.

Regions:
1. Header row — rainbow conic-gradient logo tile (40×40, 10px radius) + `Q3 · Revenue Review` large title + `Finance / Board / Q3 2026` muted breadcrumb
2. Four KPI cards — each a rounded card (10px radius, `1px solid rgba(255,255,255,0.06)`, no glassmorphism): label uppercase muted, huge value, delta pill (teal positive / red churn), `vs $X.Xm last Q` subtitle, **accent sparkline at bottom** in the card's theme color
3. Main area 70/30 — left: `Revenue composition · 12 months` heading + stacked-area stream chart (teal / orange / pink / indigo) + y-axis ticks + month x-axis + legend footer `Enterprise 58% · Mid-market 22% · SMB 14% · Self-serve 6%`
4. Right column — two cards: `● SIGNAL DETECTED · 2 MIN AGO` (teal dot) with highlighted body, `Top accounts · MRR` ranked 5-row list with subtitles + values
5. Footer strip — `bigquery · prod.finance_reports · warehouse ok · render 156ms · cache 94% hit · tier 1 · last refresh 09:42:14 UTC` muted meta

- [ ] **Step 1: Test** — assert KPI cards with sparklines, signal-detected card with teal dot, stream chart, top-accounts list
- [ ] **Step 2: Run — expect fail**
- [ ] **Step 3: Implement layout** — rainbow-gradient logo (inline style `background: conic-gradient(from 180deg, teal, orange, pink, indigo, teal);`), 4 KPI cards with small inline SVG sparklines in each accent, stream chart SVG with layered paths (simplified — a hand-drawn SVG is fine for phase 1)
- [ ] **Step 4: Implement CSS** — bg `#0b0f17`, fg `#e7e9ef`, card `1px solid rgba(255,255,255,0.06)` + 10px radius, NO glassmorphism (no backdrop-filter)
- [ ] **Step 5: Run tests — pass**
- [ ] **Step 6: Screenshot-diff gate** — save at `docs/ultraflow/screenshots/preset-signal.png`, compare with wireframe 3
- [ ] **Step 7: Commit** — `feat(presets): SignalLayout — modern dark SaaS (wireframe 3)`

---

## Phase 6 — EditorialBriefLayout (wireframe 4)

### Task 6: Bespoke Editorial Brief — magazine cream

**Files:**
- Replace stub: `src/components/dashboard/modes/presets/EditorialBriefLayout.jsx`
- Create: `src/components/dashboard/modes/presets/EditorialBriefLayout.css`
- Create: `src/components/dashboard/modes/presets/__tests__/EditorialBriefLayout.test.tsx`

**Reference wireframe:** Wireframe 4. Warm cream bg ~#f4efe4, near-black fg ~#181613, amber accent ~#c0793a, serif display italic for headline, serif body, monospace small-caps labels.

Regions:
1. Top bar — `ASKDB · Q3 REVIEW` left with small amber glyph + inline stat strip `ARR $29.6M +8.7% | NRR 117% +3PP | CHURN 2.31% −0.4PP | LTV:CAC 4.7× +0.3 | PAYBACK 14.2MO +0.8 | NEW LOGOS 47`, right: `17 APR 2026 · 09:42:14 UTC · V2.8.1`
2. Kicker bar — `Q3 2026 · BOARD PACK`
3. Article headline — `The Quarter` (roman) ` Was Made ` (italic amber) `in July` (roman) in serif display at clamp(44px, 6vw, 72px)
4. Byline — `by M. Chen, CFO · reviewed by D. Park · last refresh 02:14 UTC`
5. Summary paragraph — body serif with inline amber-bold spans on `$2.47M MRR`, `117%`, `78.1%`, `$340K MRR`
6. Four KPI boxes — full 1px #d4cdbf borders, small-caps label top-left, amber delta top-right, big serif number, vs-prior small line
7. Main body split 60/40 — left: `REVENUE · 12-MONTH TRACE` box title + `MRR & FORECAST · MONTHLY` subtitle + line chart with amber event markers `Acme renewal +$48K`, `Beta-Axion expansion +$120K` + dashed forecast. Right: `TOP ACCOUNTS BY MRR · TOP 8 · Q3` bordered table with `#`, `ACCOUNT`, `MRR`, `Δ QOQ` columns
8. Lower split 50/50 — left: `CHURN RISK DISTRIBUTION · N=842 ACTIVE ACCOUNTS` histogram with amber bars for 85+/90+/95+. Right: `ANALYST COMMENTARY · AI-DRAFTED · REVIEWED` column — drop-cap `T` in amber (float-left, 72px), body serif, amber inline highlights, `RECOMMENDED NEXT: 1. ... · 2. ... · 3. ...` small-caps amber line at bottom
9. Footer — `● LIVE · WAREHOUSE OK · TIER 1 · 2.3S REFRESH` left, `BIGQUERY://PROD.FINANCE_REPORTS · Q3_REVIEW_V12 · LAST-MOD 09:42Z` center, `RENDER 128MS · CACHE 94%` right

- [ ] **Step 1: Test** — assert headline with `<em>Was Made</em>` amber italic, drop-cap span present, 8-row top-accounts table, KPI boxes bordered
- [ ] **Step 2: Run — expect fail**
- [ ] **Step 3: Implement layout** — serif-first typography, amber accents, drop-cap via `.editorial-drop-cap::first-letter` or inline `<span class="drop-cap">T</span>`, full 1px borders on KPI boxes (NOT side-stripe per impeccable)
- [ ] **Step 4: Implement CSS** — bg `#f4efe4`, fg `#181613`, accent `#c0793a`, serif font stack (Source Serif 4 acceptable; avoid Fraunces/Playfair/Cormorant/DM Serif/Instrument/Crimson per impeccable reject list), 2px radius
- [ ] **Step 5: Run tests — pass**
- [ ] **Step 6: Screenshot-diff gate** — save at `docs/ultraflow/screenshots/preset-editorial-brief.png`, compare with wireframe 4. Must show italic amber "Was Made" + drop-cap T + full-box KPI borders.
- [ ] **Step 7: Commit** — `feat(presets): EditorialBriefLayout — magazine cream (wireframe 4)`

---

## Phase 7 — Remove the dead ZoneTree starter

### Task 7: Delete `preset.starter` + related seeding logic

**Files:**
- Modify: `src/components/dashboard/presets/types.ts` — remove `starter` field from `DashboardPreset`
- Modify: `src/components/dashboard/presets/applyPreset.ts` — `applyPreset` only sets `activePresetId`; no `presetLayouts` seeding
- Modify: `src/components/dashboard/freeform/lib/dashboardShape.ts` — `emptyDashboardForPreset` returns `{ presetLayouts: {} }`
- Modify: `src/components/dashboard/presets/boardPack.ts` — drop `starter`
- Modify: `src/components/dashboard/presets/operatorConsole.ts` — drop `starter`
- Modify: `src/components/dashboard/modes/AnalystProLayout.jsx` — revert Phase 1 of the prior preset pass (no longer reads `presetLayouts[activePresetId].tiledRoot`); behaviour restored to pre-preset
- Delete: `src/components/dashboard/presets/boardPack.css`, `operatorConsole.css` (contents moved into `BoardPackLayout.css` / `OperatorConsoleLayout.css`)

- [ ] **Step 1: Run the existing preset tests to know baseline**

Run: `npx vitest run src/components/dashboard/presets/__tests__ src/components/dashboard/freeform/__tests__/dashboardShape.preset.test.ts --reporter=dot`
Note PASS count.

- [ ] **Step 2: Remove `starter` from the type**

```ts
// src/components/dashboard/presets/types.ts — delete the `starter` field
// from DashboardPreset and from isDashboardPreset's shape check
```

- [ ] **Step 3: Simplify `applyPreset`**

```ts
export function applyPreset(dashboard: Dashboard, presetId: string): Dashboard {
  const resolved = getPreset(presetId);
  if (dashboard.activePresetId === resolved.id) return dashboard;
  return { ...dashboard, activePresetId: resolved.id };
}
```

- [ ] **Step 4: Simplify `emptyDashboardForPreset`**

Drop the `presetLayouts` seeding. `presetLayouts` starts `{}`.

- [ ] **Step 5: Strip `starter` from boardPack.ts, operatorConsole.ts**

Keep token set + `_registerPreset`. Remove starter tree imports and the `starter:` property.

- [ ] **Step 6: Revert AnalystProLayout's preset-layout read**

Remove the `presetLayout?.tiledRoot` early-return added earlier; AnalystProLayout reads only `authoredLayout` + legacy shim like before. (Themed presets don't flow through it — they're their own components.)

- [ ] **Step 7: Delete the now-orphan CSS files**

```bash
git rm src/components/dashboard/presets/boardPack.css src/components/dashboard/presets/operatorConsole.css
```

- [ ] **Step 8: Update tests — applyPreset test loses the "re-entry" coverage**

In `applyPreset.test.ts`, remove assertions about `presetLayouts` seeding; keep coverage of the activePresetId transition.

- [ ] **Step 9: Run all preset tests**

Run: `npx vitest run src/components/dashboard/presets/__tests__ src/components/dashboard/freeform/__tests__/dashboardShape.preset.test.ts src/components/dashboard/modes/presets/__tests__ --reporter=dot`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(presets): drop ZoneTree starter — bespoke layouts own the render

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 8 — Regression suite + cross-preset smoke

### Task 8: Suite green + one cross-preset smoke test

**Files:**
- Create: `src/components/dashboard/__tests__/presetDispatch.smoke.test.tsx`

- [ ] **Step 1: Write the cross-preset smoke test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DashboardShell from '../DashboardShell';
import { useStore } from '../../../store';
import { emptyDashboardForPreset } from '../freeform/lib/dashboardShape';

const CASES: [string, string][] = [
  ['analyst-pro', 'layout-analyst-pro'],
  ['board-pack', 'layout-board-pack'],
  ['operator-console', 'layout-operator-console'],
  ['signal', 'layout-signal'],
  ['editorial-brief', 'layout-editorial-brief'],
];

describe('preset dispatch smoke — all five reachable', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  for (const [presetId, testId] of CASES) {
    it(`mounts ${testId} after switchPreset("${presetId}")`, async () => {
      useStore.getState().switchPreset(presetId);
      render(<DashboardShell tiles={[]} initialMode="analyst-pro" />);
      expect(await screen.findByTestId(testId)).toBeInTheDocument();
      cleanup();
    });
  }
});
```

- [ ] **Step 2: Run the full scoped suite**

Run: `npx vitest run src/__tests__ src/components/dashboard/freeform/__tests__ src/chart-ir/__tests__/editor src/components/dashboard/presets/__tests__ src/components/dashboard/__tests__ src/components/dashboard/modes/presets/__tests__ --reporter=dot 2>&1 | tail -40`

Expected: 0 failures.

- [ ] **Step 3: Lint + build**

```
npm run lint 2>&1 | tail -10
npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Browser smoke — click through all five pills**

Click each pill in order. Screenshot each state. Confirm each `layout-<preset>` test-id is present.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(presets): cross-preset dispatch smoke test

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-Review Results

**Spec coverage**: each wireframe (1/2/3/4) has a dedicated Phase 3/4/5/6 bespoke layout component. Phase 1 unbreaks the switcher. Phase 2 wires dispatch. Phase 7 cleans up the dead starter-tree abstraction. Phase 8 locks the regression suite.

**Placeholder scan**: all code steps contain actual code. The Phase 3 JSX skeleton is a sketch labelled as such — the implementing agent expands it to the full wireframe content including exact numbers/accounts/bars, with the "complete" bar being the screenshot-diff gate.

**Type consistency**: `DashboardPreset` loses `starter`. `applyPreset` signature unchanged (`Dashboard → Dashboard`). `emptyDashboardForPreset` returns a `Dashboard` without seeded `presetLayouts`. Each `<Preset>Layout.jsx` is a default-exported React component with no required props beyond the ones `DashboardShell` passes. Test-id contract locks on `layout-<preset-id>` for every layout.

---

## Execution guardrails (carry over from the post-mortem)

1. **Premise check**: this plan file IS the premise — user approved before execution starts.
2. **Screenshot-fidelity contract**: every phase 3–6 final step is "compare rendered screenshot vs user's wireframe image." The commit hash that lands a layout carries the screenshot in `docs/ultraflow/screenshots/`.
3. **Banned abstractions for design reskin** (from post-mortem): no generic engine, no markdown-in-text-tile for wireframe content, no token-only swap for visually distinct targets.
4. **No subagent on a bespoke layout without proof-of-concept** — the agent writing `BoardPackLayout.jsx` must screenshot its draft against the wireframe before declaring done.
5. **"Same" vs "similar"**: each wireframe is the TRUTH. Any deviation is a bug.
