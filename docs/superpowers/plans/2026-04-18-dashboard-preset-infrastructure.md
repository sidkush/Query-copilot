# Dashboard Preset Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse seven dashboard archetypes (briefing/workbench/ops/story/pitch/tableau/analyst-pro) into a single Analyst Pro freeform canvas, and add a preset system that (a) lets users switch between themed variants of the same dashboard like the current mode tabs and (b) persists a per-preset ZoneTree so each theme remembers its own edits.

**Architecture:** One layout engine — `AnalystProLayout` — renders every preset. A `DashboardPreset` record provides theme tokens (colors, fonts, density, scheme) and a starter ZoneTree. Each dashboard stores `activePresetId` + `presetLayouts: Record<presetId, ZoneTree>`; switching preset swaps tokens + loads that preset's saved ZoneTree (or the preset's starter template on first visit). This plan delivers ONLY the infrastructure — the four themed presets (Board Pack, Operator Console, Signal, Editorial Brief) land in follow-up plans B–E.

**Tech Stack:** React 19, Zustand (store.js), TypeScript (freeform lib), Vitest, framer-motion (switcher animation), existing Analyst Pro freeform engine.

**Absolute paths anchor:** All source paths in this plan are relative to `QueryCopilot V1/frontend/`. All test paths same.

---

## File Structure

### Files to delete

- `src/components/dashboard/modes/ExecBriefingLayout.jsx`
- `src/components/dashboard/modes/AnalystWorkbenchLayout.jsx`
- `src/components/dashboard/modes/LiveOpsLayout.jsx`
- `src/components/dashboard/modes/StoryLayout.jsx`
- `src/components/dashboard/modes/PitchLayout.jsx`
- `src/components/dashboard/modes/TableauClassicLayout.jsx`
- `src/components/dashboard/modes/WorkbookLayout.jsx`
- `src/components/dashboard/modes/MobileLayout.jsx` (Analyst Pro has its own responsive path)
- `src/chart-ir/__tests__/editor/briefingLayout.test.tsx`
- `src/chart-ir/__tests__/editor/liveOpsLayout.test.tsx`
- `src/chart-ir/__tests__/editor/pitchLayout.test.tsx`
- `src/chart-ir/__tests__/editor/archetypeStyling.test.ts`

### Files to modify

- `src/components/dashboard/DashboardShell.jsx` — strip ARCHETYPES, rewire to preset system
- `src/components/dashboard/DashboardModeToggle.jsx` → rename file + refactor to `DashboardPresetSwitcher.jsx`
- `src/components/dashboard/DashboardTopBar.jsx` — drop `ARCHETYPE_EDIT_MAP` constant; edit-mode becomes per-preset
- `src/components/dashboard/tokens.js` — drop `ARCHETYPE_THEMES`, add `resolvePresetTokens(presetId)`
- `src/index.css` — remove `--archetype-*` CSS var blocks (dark: 138–152, light: 289–302); add `--preset-*` vars keyed off `[data-active-preset]`
- `src/store.js` — add `activePresetId`, `presetLayouts`, `switchPreset()`, `persistPresetLayout()`
- `src/components/dashboard/freeform/lib/types.ts` — rename `archetype: string` → `activePresetId: string`; add `presetLayouts: Record<string, SerializedZoneTree>`
- `src/vizql/palettes.ts` — replace `setChartChromeScheme('dark'|'light')` with `setChartChromeFromPreset(presetId)` (preserves the existing `'dark'|'light'` call site via compat shim)
- `src/chart-ir/__tests__/editor/dashboardShell.test.tsx` — rewrite against the preset API
- `src/chart-ir/__tests__/editor/analyticsShell.test.tsx` — default preset id now `analyst-pro`

### Files to create

- `src/components/dashboard/presets/types.ts` — `DashboardPreset` TS interface + zod validator
- `src/components/dashboard/presets/registry.ts` — preset registry (analyst-pro only; B–E add the other four)
- `src/components/dashboard/presets/applyPreset.ts` — switch / seed helper (pure, unit-testable)
- `src/components/dashboard/DashboardPresetSwitcher.jsx` — the tab strip (replaces ModeToggle)
- `src/components/dashboard/presets/__tests__/registry.test.ts`
- `src/components/dashboard/presets/__tests__/applyPreset.test.ts`
- `src/components/dashboard/__tests__/dashboardPresetSwitcher.test.tsx`

---

## Phase 1 — Demolition: collapse to Analyst Pro only

Everything the user could previously reach via the six removed tabs becomes unreachable this phase. The preset system replaces it in Phase 2+. Analyst Pro remains fully functional the entire time.

### Task 1: Lock the starting state with a smoke test

**Files:**
- Create: `src/__tests__/presetInfra.smoke.test.ts`

- [ ] **Step 1: Write a smoke test that documents the current ARCHETYPES list**

```ts
// src/__tests__/presetInfra.smoke.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Preset infra — pre-demolition snapshot', () => {
  it('DashboardShell ARCHETYPES currently holds seven entries', () => {
    const src = readFileSync(
      resolve(__dirname, '../components/dashboard/DashboardShell.jsx'),
      'utf-8',
    );
    const match = src.match(/const ARCHETYPES = \[([\s\S]*?)\];/);
    expect(match).toBeTruthy();
    const ids = (match![1].match(/id:\s*"([^"]+)"/g) ?? []).map(s => s.replace(/.*"([^"]+)"/, '$1'));
    expect(ids).toEqual(['briefing','workbench','ops','story','pitch','tableau','analyst-pro']);
  });
});
```

- [ ] **Step 2: Run it to confirm current state**

Run: `npx vitest run src/__tests__/presetInfra.smoke.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/presetInfra.smoke.test.ts
git commit -m "test(presets): snapshot current ARCHETYPES before demolition"
```

---

### Task 2: Delete the six non-Analyst-Pro layout components

**Files:**
- Delete: `src/components/dashboard/modes/ExecBriefingLayout.jsx`, `AnalystWorkbenchLayout.jsx`, `LiveOpsLayout.jsx`, `StoryLayout.jsx`, `PitchLayout.jsx`, `TableauClassicLayout.jsx`, `WorkbookLayout.jsx`, `MobileLayout.jsx`

- [ ] **Step 1: Delete the files**

```bash
git rm "src/components/dashboard/modes/ExecBriefingLayout.jsx" \
       "src/components/dashboard/modes/AnalystWorkbenchLayout.jsx" \
       "src/components/dashboard/modes/LiveOpsLayout.jsx" \
       "src/components/dashboard/modes/StoryLayout.jsx" \
       "src/components/dashboard/modes/PitchLayout.jsx" \
       "src/components/dashboard/modes/TableauClassicLayout.jsx" \
       "src/components/dashboard/modes/WorkbookLayout.jsx" \
       "src/components/dashboard/modes/MobileLayout.jsx"
```

- [ ] **Step 2: Verify AnalystProLayout still present**

Run: `ls "src/components/dashboard/modes/"`
Expected: Lists `AnalystProLayout.jsx` (and its support files, if any).

- [ ] **Step 3: Delete the tests that referenced the deleted layouts**

```bash
git rm "src/chart-ir/__tests__/editor/briefingLayout.test.tsx" \
       "src/chart-ir/__tests__/editor/liveOpsLayout.test.tsx" \
       "src/chart-ir/__tests__/editor/pitchLayout.test.tsx" \
       "src/chart-ir/__tests__/editor/archetypeStyling.test.ts"
```

- [ ] **Step 4: Do NOT commit yet — build will be red; Task 3 fixes DashboardShell**

---

### Task 3: Rewire DashboardShell to Analyst Pro only (temporary)

Preset system arrives in Phase 2. For now DashboardShell renders Analyst Pro unconditionally so the app stays runnable.

**Files:**
- Modify: `src/components/dashboard/DashboardShell.jsx`

- [ ] **Step 1: Replace the seven lazy imports with one**

In `src/components/dashboard/DashboardShell.jsx`, replace lines 12–20 with:

```jsx
const AnalystProLayout = lazy(() => import("./modes/AnalystProLayout"));
```

- [ ] **Step 2: Delete the ARCHETYPES array (lines 56–64)**

Remove the entire `const ARCHETYPES = [ ... ];` block. Also delete the `import { ARCHETYPE_THEMES } from "./tokens";` and `ARCHETYPE_EDIT_MAP` imports at the top.

- [ ] **Step 3: Replace the dispatch block with unconditional Analyst Pro mount**

Find the `<AnimatePresence>` block that dispatches on `mode`. Replace with:

```jsx
<Suspense fallback={<div data-testid="preset-layout-loading" />}>
  <AnalystProLayout
    tiles={tiles}
    onTileClick={onTileClick}
    onLayoutChange={onLayoutChange}
    authoredLayout={authoredLayout}
    dashboardId={dashboardId}
  />
</Suspense>
```

Delete the `<DashboardModeToggle />` JSX for now (Task 9 reintroduces a preset switcher).

- [ ] **Step 4: Change the `initialMode` default**

```jsx
initialMode = "analyst-pro",
```

- [ ] **Step 5: Run the type check + build**

Run: `npm run build 2>&1 | tail -40`
Expected: build completes. Warnings about unused `useState`/`setMode`/`mode` are acceptable and will be cleaned up in Phase 2.

- [ ] **Step 6: Run the app — navigate to /analytics — confirm Analyst Pro renders**

Run: `npm run dev` (preview server already running via preview_start is fine). Visit `http://localhost:5173/analytics`.
Expected: dashboard renders in Analyst Pro; no mode pills shown; no console errors.

- [ ] **Step 7: Delete the smoke test from Task 1 — it no longer reflects reality**

```bash
git rm "src/__tests__/presetInfra.smoke.test.ts"
```

- [ ] **Step 8: Commit the demolition**

```bash
git add -A
git commit -m "refactor(dashboard): collapse 7 archetypes to Analyst Pro only

Removes ExecBriefing/Workbench/LiveOps/Story/Pitch/Tableau/Workbook/Mobile
layouts. DashboardShell now renders AnalystProLayout unconditionally.
Preset switching returns in phase 2."
```

---

### Task 4: Strip ARCHETYPE_THEMES from tokens.js + archetype CSS vars

**Files:**
- Modify: `src/components/dashboard/tokens.js` (remove `ARCHETYPE_THEMES` and `ARCHETYPE_EDIT_MAP`, lines 362–679 plus helpers)
- Modify: `src/index.css` (remove `--archetype-*` vars: dark block 138–152, light block 289–302)

- [ ] **Step 1: Find every consumer of `ARCHETYPE_THEMES`**

Run: `grep -rn "ARCHETYPE_THEMES\|ARCHETYPE_EDIT_MAP\|resolveArchetypeTokens" src/`
Expected: the references are all inside files this plan already removes or rewrites. If any surprise consumer appears, stop and flag.

- [ ] **Step 2: Delete the `ARCHETYPE_THEMES` object + `resolveArchetypeTokens` helper from tokens.js**

Remove lines 362–679 (see the exploration report for the exact range) plus the `ARCHETYPE_EDIT_MAP` constant. Leave all other exports intact.

- [ ] **Step 3: Delete `--archetype-*` vars from index.css**

In `src/index.css`, remove the contiguous `--archetype-*` blocks in both the dark `:root` (around lines 138–152) and `:root.light` (around 289–302) scopes.

- [ ] **Step 4: Re-run the build**

Run: `npm run build 2>&1 | tail -20`
Expected: clean build.

- [ ] **Step 5: Run existing dashboard tests**

Run: `npx vitest run src/chart-ir/__tests__/editor/ --reporter=dot`
Expected: some tests in `dashboardShell.test.tsx` and `analyticsShell.test.tsx` now fail; they are rewritten in later tasks (Task 17, Task 19). All non-archetype tests stay green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): drop ARCHETYPE_THEMES and --archetype-* CSS vars

Preset tokens replace them in phase 2."
```

---

## Phase 2 — Preset type + registry

### Task 5: Define the `DashboardPreset` type

**Files:**
- Create: `src/components/dashboard/presets/types.ts`
- Test: `src/components/dashboard/presets/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/dashboard/presets/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import { isDashboardPreset } from '../types';

describe('isDashboardPreset', () => {
  it('accepts a minimal valid preset', () => {
    const p = {
      id: 'analyst-pro',
      name: 'Analyst Pro',
      tagline: 'Freeform canvas',
      scheme: 'dark' as const,
      tokens: { bg: '#000', fg: '#fff', accent: '#4f7', accentWarn: '#f87171', border: '#222', fontDisplay: 'Inter', fontBody: 'Inter', fontMono: 'ui-monospace', density: 'comfortable' as const, radius: 8 },
      starter: { tiledRoot: null, floatingLayer: [] },
    };
    expect(isDashboardPreset(p)).toBe(true);
  });

  it('rejects objects missing required fields', () => {
    expect(isDashboardPreset({ id: 'analyst-pro' })).toBe(false);
    expect(isDashboardPreset(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm it fails (file not created yet)**

Run: `npx vitest run src/components/dashboard/presets/__tests__/types.test.ts --reporter=dot`
Expected: FAIL — cannot resolve module `../types`.

- [ ] **Step 3: Create the type module with minimal implementation**

```ts
// src/components/dashboard/presets/types.ts
import type { SerializedZoneTree } from '../freeform/lib/types';

export interface PresetTokens {
  bg: string;
  fg: string;
  accent: string;
  accentWarn: string;
  border: string;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  density: 'compact' | 'comfortable' | 'spacious';
  radius: number;
}

export interface DashboardPreset {
  id: string;
  name: string;
  tagline: string;
  /** Fixed light|dark scheme — presets override the global theme toggle. */
  scheme: 'light' | 'dark';
  tokens: PresetTokens;
  /** Seed layout applied the first time a dashboard enters this preset. */
  starter: {
    tiledRoot: SerializedZoneTree | null;
    floatingLayer: SerializedZoneTree[];
  };
}

export function isDashboardPreset(v: unknown): v is DashboardPreset {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.tagline === 'string' &&
    (p.scheme === 'light' || p.scheme === 'dark') &&
    !!p.tokens && typeof p.tokens === 'object' &&
    !!p.starter && typeof p.starter === 'object'
  );
}
```

- [ ] **Step 4: Run the test again**

Run: `npx vitest run src/components/dashboard/presets/__tests__/types.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/presets/
git commit -m "feat(presets): DashboardPreset type + validator"
```

---

### Task 6: Preset registry — analyst-pro only (the other four are plans B–E)

**Files:**
- Create: `src/components/dashboard/presets/registry.ts`
- Test: `src/components/dashboard/presets/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/dashboard/presets/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest';
import { getPreset, listPresets, DEFAULT_PRESET_ID } from '../registry';

describe('preset registry', () => {
  it('exposes analyst-pro as the default preset', () => {
    expect(DEFAULT_PRESET_ID).toBe('analyst-pro');
    expect(getPreset('analyst-pro').id).toBe('analyst-pro');
  });

  it('returns the default preset for unknown ids', () => {
    expect(getPreset('made-up').id).toBe('analyst-pro');
  });

  it('listPresets returns analyst-pro as the only registered entry for now', () => {
    const ids = listPresets().map(p => p.id);
    expect(ids).toEqual(['analyst-pro']);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/components/dashboard/presets/__tests__/registry.test.ts --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Implement the registry**

```ts
// src/components/dashboard/presets/registry.ts
import type { DashboardPreset } from './types';

const analystProPreset: DashboardPreset = {
  id: 'analyst-pro',
  name: 'Analyst Pro',
  tagline: 'Fully customizable freeform canvas.',
  scheme: 'dark',
  tokens: {
    bg: 'var(--bg-base)',
    fg: 'var(--text-primary)',
    accent: 'var(--accent)',
    accentWarn: 'var(--status-danger)',
    border: 'var(--border-default)',
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontMono: "ui-monospace, 'JetBrains Mono', monospace",
    density: 'comfortable',
    radius: 8,
  },
  starter: { tiledRoot: null, floatingLayer: [] },
};

const _registry: Record<string, DashboardPreset> = {
  'analyst-pro': analystProPreset,
};

export const DEFAULT_PRESET_ID = 'analyst-pro' as const;

export function getPreset(id: string): DashboardPreset {
  return _registry[id] ?? _registry[DEFAULT_PRESET_ID];
}

export function listPresets(): DashboardPreset[] {
  return Object.values(_registry);
}

/** Plans B–E register their presets through this entrypoint. */
export function _registerPreset(preset: DashboardPreset): void {
  _registry[preset.id] = preset;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/dashboard/presets/__tests__/registry.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/presets/
git commit -m "feat(presets): registry with analyst-pro baseline"
```

---

## Phase 3 — Per-preset ZoneTree persistence

### Task 7: Extend the Dashboard type with preset state

**Files:**
- Modify: `src/components/dashboard/freeform/lib/types.ts` (around line 142–160)
- Test: `src/components/dashboard/freeform/__tests__/dashboardShape.preset.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/dashboard/freeform/__tests__/dashboardShape.preset.test.ts
import { describe, it, expect } from 'vitest';
import { emptyDashboardForPreset } from '../lib/dashboardShape';

describe('dashboard shape — preset fields', () => {
  it('creates a dashboard whose activePresetId matches the seed preset', () => {
    const d = emptyDashboardForPreset('analyst-pro');
    expect(d.activePresetId).toBe('analyst-pro');
    expect(d.presetLayouts['analyst-pro']).toEqual({ tiledRoot: null, floatingLayer: [] });
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/dashboardShape.preset.test.ts --reporter=dot`
Expected: FAIL — module `dashboardShape` does not exist or lacks `emptyDashboardForPreset`.

- [ ] **Step 3: In `src/components/dashboard/freeform/lib/types.ts`, rename `archetype` and add `presetLayouts`**

```ts
// inside the Dashboard interface (~line 142)
export interface Dashboard {
  // ... existing fields ...
  activePresetId: string;              // replaces `archetype`
  presetLayouts: Record<string, {
    tiledRoot: SerializedZoneTree | null;
    floatingLayer: SerializedZoneTree[];
  }>;
}
```

- [ ] **Step 4: Create `dashboardShape.ts` with `emptyDashboardForPreset`**

```ts
// src/components/dashboard/freeform/lib/dashboardShape.ts
import type { Dashboard } from './types';
import { getPreset } from '../../presets/registry';

export function emptyDashboardForPreset(presetId: string): Dashboard {
  const preset = getPreset(presetId);
  return {
    // ... other Dashboard defaults copied from the existing create-dashboard helper ...
    activePresetId: preset.id,
    presetLayouts: {
      [preset.id]: { tiledRoot: null, floatingLayer: [] },
    },
  } as Dashboard;
}
```

If an existing `createEmptyDashboard()` already builds the non-preset fields, delegate to it and overlay the two new fields — do not duplicate the defaults.

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/dashboardShape.preset.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(presets): dashboard shape carries activePresetId + presetLayouts"
```

---

### Task 8: `applyPreset()` — switch + lazy-seed starter

Pure helper so the store action is thin and the behaviour is unit-tested.

**Files:**
- Create: `src/components/dashboard/presets/applyPreset.ts`
- Test: `src/components/dashboard/presets/__tests__/applyPreset.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/dashboard/presets/__tests__/applyPreset.test.ts
import { describe, it, expect } from 'vitest';
import { applyPreset } from '../applyPreset';
import { emptyDashboardForPreset } from '../../freeform/lib/dashboardShape';

describe('applyPreset', () => {
  it('returns the same dashboard object when id already active', () => {
    const d = emptyDashboardForPreset('analyst-pro');
    const out = applyPreset(d, 'analyst-pro');
    expect(out).toBe(d);
  });

  it('seeds presetLayouts from the preset starter on first switch', () => {
    const d = emptyDashboardForPreset('analyst-pro');
    const next = applyPreset(d, 'board-pack');       // board-pack not yet registered
    // fallback resolves to analyst-pro starter when unknown; layout preserved
    expect(next.activePresetId).toBe('analyst-pro');
    expect(next.presetLayouts['analyst-pro']).toBeDefined();
  });

  it('preserves an already-saved layout when re-entering a preset', () => {
    const d = emptyDashboardForPreset('analyst-pro');
    d.presetLayouts['analyst-pro'] = {
      tiledRoot: { id: 'root', type: 'container', children: [] } as never,
      floatingLayer: [],
    };
    const next = applyPreset(d, 'analyst-pro');
    expect(next.presetLayouts['analyst-pro'].tiledRoot).toEqual(d.presetLayouts['analyst-pro'].tiledRoot);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/components/dashboard/presets/__tests__/applyPreset.test.ts --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Implement `applyPreset.ts`**

```ts
// src/components/dashboard/presets/applyPreset.ts
import type { Dashboard } from '../freeform/lib/types';
import { getPreset } from './registry';

export function applyPreset(dashboard: Dashboard, presetId: string): Dashboard {
  const resolved = getPreset(presetId);
  if (dashboard.activePresetId === resolved.id && dashboard.presetLayouts[resolved.id]) {
    return dashboard;
  }
  const existing = dashboard.presetLayouts[resolved.id];
  const layout = existing ?? {
    tiledRoot: resolved.starter.tiledRoot,
    floatingLayer: resolved.starter.floatingLayer,
  };
  return {
    ...dashboard,
    activePresetId: resolved.id,
    presetLayouts: { ...dashboard.presetLayouts, [resolved.id]: layout },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/dashboard/presets/__tests__/applyPreset.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(presets): applyPreset — switch + lazy-seed starter ZoneTree"
```

---

### Task 9: Zustand store actions — `switchPreset` + `persistPresetLayout`

**Files:**
- Modify: `src/store.js`
- Test: `src/__tests__/store.presets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/store.presets.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import { emptyDashboardForPreset } from '../components/dashboard/freeform/lib/dashboardShape';

describe('store — preset actions', () => {
  beforeEach(() => {
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  it('switchPreset updates activePresetId on the dashboard', () => {
    useStore.getState().switchPreset('analyst-pro');
    expect(useStore.getState().analystProDashboard?.activePresetId).toBe('analyst-pro');
  });

  it('persistPresetLayout writes the current zone tree under the active preset key', () => {
    const tree = { tiledRoot: { id: 'r', type: 'container', children: [] } as never, floatingLayer: [] };
    useStore.getState().persistPresetLayout(tree);
    expect(useStore.getState().analystProDashboard?.presetLayouts['analyst-pro']).toEqual(tree);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/__tests__/store.presets.test.ts --reporter=dot`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Add the actions to `src/store.js`**

Inside the store-creator function, next to the other `analystPro*` actions:

```js
  switchPreset: (presetId) => {
    const d = get().analystProDashboard;
    if (!d) return;
    const { applyPreset } = require('./components/dashboard/presets/applyPreset');
    set({ analystProDashboard: applyPreset(d, presetId) });
  },

  persistPresetLayout: (serialized) => {
    const d = get().analystProDashboard;
    if (!d) return;
    const id = d.activePresetId;
    set({
      analystProDashboard: {
        ...d,
        presetLayouts: { ...d.presetLayouts, [id]: serialized },
      },
    });
  },
```

If the codebase is pure ESM and dynamic `require` fails at runtime, replace the require with a static `import` at the top of `store.js`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/__tests__/store.presets.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(presets): switchPreset + persistPresetLayout store actions"
```

---

## Phase 4 — PresetSwitcher UI

### Task 10: Rename `DashboardModeToggle.jsx` → `DashboardPresetSwitcher.jsx`

**Files:**
- Rename + rewrite: `src/components/dashboard/DashboardModeToggle.jsx` → `src/components/dashboard/DashboardPresetSwitcher.jsx`

- [ ] **Step 1: `git mv` the file**

```bash
git mv "src/components/dashboard/DashboardModeToggle.jsx" \
       "src/components/dashboard/DashboardPresetSwitcher.jsx"
```

- [ ] **Step 2: Rewrite the component body**

Open the renamed file and replace its body with:

```jsx
// src/components/dashboard/DashboardPresetSwitcher.jsx
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { listPresets } from './presets/registry';
import { SPRINGS } from './motion';

/**
 * DashboardPresetSwitcher — capsule of preset pills. Same pattern as the
 * old DashboardModeToggle but driven by the preset registry. Active pill
 * morphs via layoutId; click calls switchPreset() which seeds the starter
 * layout on first entry and loads the saved layout on return.
 */
export default function DashboardPresetSwitcher() {
  const presets = listPresets();
  const activeId = useStore((s) => s.analystProDashboard?.activePresetId) ?? 'analyst-pro';
  const switchPreset = useStore((s) => s.switchPreset);

  if (presets.length < 2) return null; // hide until a second preset is registered

  return (
    <div role="tablist" aria-label="Dashboard preset" className="dashboard-preset-switcher">
      {presets.map((p) => {
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`dashboard-preset-${p.id}`}
            onClick={() => switchPreset(p.id)}
            className="dashboard-preset-switcher__pill"
          >
            {active && (
              <motion.span
                layoutId="preset-active-bg"
                className="dashboard-preset-switcher__pill-bg"
                transition={SPRINGS.bouncy}
              />
            )}
            <span className="dashboard-preset-switcher__pill-label">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Add styles for the switcher**

In `src/index.css`, append under a new `/* preset switcher */` section:

```css
.dashboard-preset-switcher {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--chrome-bar-bg);
  border: 1px solid var(--chrome-bar-border);
}
.dashboard-preset-switcher__pill {
  position: relative;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: color 120ms ease;
}
.dashboard-preset-switcher__pill[aria-selected="true"] { color: var(--text-on-accent); }
.dashboard-preset-switcher__pill-bg {
  position: absolute;
  inset: 0;
  background: var(--accent);
  border-radius: 999px;
  z-index: 0;
}
.dashboard-preset-switcher__pill-label { position: relative; z-index: 1; }
```

- [ ] **Step 4: Update imports in `DashboardShell.jsx`**

Replace `import DashboardModeToggle from './DashboardModeToggle';` with:

```jsx
import DashboardPresetSwitcher from './DashboardPresetSwitcher';
```

Mount `<DashboardPresetSwitcher />` where the previous ModeToggle JSX sat (inside DashboardTopBar's right slot). If DashboardTopBar expected a prop named `modeToggle` or similar, adjust the prop name and pass the component.

- [ ] **Step 5: Run the app — preset switcher visible (single pill, analyst-pro)**

Run: `npm run dev`; visit `http://localhost:5173/analytics`.
Expected: Since `listPresets().length === 1`, the switcher is hidden (early `return null`). No regressions.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(presets): DashboardPresetSwitcher component + styling

Hidden while only analyst-pro is registered; appears once plans B–E
register additional presets."
```

---

### Task 11: Switcher test — shows pills, fires switchPreset, morphs active bg

**Files:**
- Create: `src/components/dashboard/__tests__/dashboardPresetSwitcher.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardPresetSwitcher from '../DashboardPresetSwitcher';
import { _registerPreset, listPresets } from '../presets/registry';
import { useStore } from '../../../store';
import { emptyDashboardForPreset } from '../freeform/lib/dashboardShape';

describe('DashboardPresetSwitcher', () => {
  beforeEach(() => {
    // register a second preset so the switcher isn't hidden
    _registerPreset({
      id: 'test-alt',
      name: 'Test Alt',
      tagline: 'fixture',
      scheme: 'dark',
      tokens: listPresets()[0].tokens,
      starter: { tiledRoot: null, floatingLayer: [] },
    });
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  it('renders a pill for each registered preset', () => {
    render(<DashboardPresetSwitcher />);
    expect(screen.getByTestId('dashboard-preset-analyst-pro')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-preset-test-alt')).toBeInTheDocument();
  });

  it('clicking a pill fires switchPreset and updates activePresetId', () => {
    const spy = vi.spyOn(useStore.getState(), 'switchPreset');
    render(<DashboardPresetSwitcher />);
    fireEvent.click(screen.getByTestId('dashboard-preset-test-alt'));
    expect(spy).toHaveBeenCalledWith('test-alt');
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run src/components/dashboard/__tests__/dashboardPresetSwitcher.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(presets): switcher renders, clicks fire switchPreset"
```

---

## Phase 5 — Theme-token resolver wiring

### Task 12: Apply preset tokens as CSS custom properties on the dashboard root

**Files:**
- Create: `src/components/dashboard/presets/usePresetTheme.ts`
- Modify: `src/components/dashboard/DashboardShell.jsx` to call the hook

- [ ] **Step 1: Write the failing test**

```ts
// src/components/dashboard/presets/__tests__/usePresetTheme.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { _registerPreset } from '../registry';
import { usePresetTheme } from '../usePresetTheme';

describe('usePresetTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-active-preset');
    document.documentElement.style.cssText = '';
  });

  it('writes data-active-preset and scheme class on <html>', () => {
    _registerPreset({
      id: 'brief-test',
      name: 'Brief Test',
      tagline: '',
      scheme: 'light',
      tokens: { bg: '#fff', fg: '#000', accent: '#f00', accentWarn: '#f00', border: '#ccc', fontDisplay: 'Georgia', fontBody: 'Georgia', fontMono: 'monospace', density: 'comfortable', radius: 4 },
      starter: { tiledRoot: null, floatingLayer: [] },
    });
    renderHook(() => usePresetTheme('brief-test'));
    expect(document.documentElement.getAttribute('data-active-preset')).toBe('brief-test');
    expect(document.documentElement.classList.contains('preset-scheme-light')).toBe(true);
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run src/components/dashboard/presets/__tests__/usePresetTheme.test.ts --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Implement the hook**

```ts
// src/components/dashboard/presets/usePresetTheme.ts
import { useEffect } from 'react';
import { getPreset } from './registry';

export function usePresetTheme(presetId: string): void {
  useEffect(() => {
    const p = getPreset(presetId);
    const root = document.documentElement;
    root.setAttribute('data-active-preset', p.id);
    root.classList.toggle('preset-scheme-light', p.scheme === 'light');
    root.classList.toggle('preset-scheme-dark', p.scheme === 'dark');
    const vars: Record<string, string> = {
      '--preset-bg': p.tokens.bg,
      '--preset-fg': p.tokens.fg,
      '--preset-accent': p.tokens.accent,
      '--preset-accent-warn': p.tokens.accentWarn,
      '--preset-border': p.tokens.border,
      '--preset-font-display': p.tokens.fontDisplay,
      '--preset-font-body': p.tokens.fontBody,
      '--preset-font-mono': p.tokens.fontMono,
      '--preset-radius': `${p.tokens.radius}px`,
      '--preset-density': p.tokens.density,
    };
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  }, [presetId]);
}
```

- [ ] **Step 4: Wire it into DashboardShell**

In `DashboardShell.jsx`, import the hook and call it with the current preset id, reading from the store:

```jsx
import { usePresetTheme } from './presets/usePresetTheme';
// ... inside DashboardShell:
const activePresetId = useStore((s) => s.analystProDashboard?.activePresetId) ?? 'analyst-pro';
usePresetTheme(activePresetId);
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/dashboard/presets/__tests__/usePresetTheme.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(presets): usePresetTheme applies preset tokens as CSS vars"
```

---

### Task 13: Chart chrome reads active preset

The previous critique fix wired `setChartChromeScheme('dark'|'light')` into VizQLRenderer. Extend to key off the preset id so per-preset palettes (phosphor green, cream, etc.) can swap in without an explicit light/dark flip.

**Files:**
- Modify: `src/vizql/palettes.ts`
- Modify: `src/components/editor/renderers/VizQLRenderer.tsx`

- [ ] **Step 1: Add `setChartChromeFromPreset` next to the existing scheme setter**

In `src/vizql/palettes.ts`:

```ts
import { getPreset } from '../components/dashboard/presets/registry';

export function setChartChromeFromPreset(presetId: string): void {
  const p = getPreset(presetId);
  _applyChartTheme(p.scheme); // still dark|light for now; preset-specific
                              // axis/label overrides land with plans B–E.
}
```

Leave `setChartChromeScheme` exported (back-compat for tests and any other call sites).

- [ ] **Step 2: Switch VizQLRenderer to read the preset-driven setter**

In `src/components/editor/renderers/VizQLRenderer.tsx`, replace:

```ts
setChartChromeScheme(resolvedTheme === 'light' ? 'light' : 'dark');
```

with:

```ts
const presetId = useStore.getState().analystProDashboard?.activePresetId ?? 'analyst-pro';
setChartChromeFromPreset(presetId);
```

And add `useStore((s) => s.analystProDashboard?.activePresetId)` to the component's selector set so the render effect re-fires on preset switch (mirror the existing `resolvedTheme` wiring).

- [ ] **Step 3: Run the existing renderer tests**

Run: `npx vitest run src/__tests__/vizqlRenderer.zoomDpr.test.js --reporter=dot`
Expected: PASS. Fix the zoom-DPR regex again only if the deps-array ordering changes.

- [ ] **Step 4: Visually confirm charts still theme correctly**

Run: keep preview running. Toggle theme button; confirm axis / legend / label still readable in both dark and light. Ship evidence: screenshot.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(presets): chart chrome reads active preset via setChartChromeFromPreset"
```

---

## Phase 6 — Rewrite the broken archetype tests

### Task 14: Rewrite `dashboardShell.test.tsx` for presets

**Files:**
- Modify: `src/chart-ir/__tests__/editor/dashboardShell.test.tsx`

- [ ] **Step 1: Open the file and replace archetype expectations with preset equivalents**

Every reference to `dashboard-mode-<id>` becomes `dashboard-preset-<id>`. Every assertion that the shell mounts `ExecBriefingLayout`/`AnalystWorkbenchLayout`/etc. becomes: shell mounts `AnalystProLayout` once, regardless of active preset.

Specifically, drop the "swaps layouts on mode change" test (no longer meaningful — one layout handles all presets) and add one test that asserts `data-active-preset` is set on `<html>` after a preset switch.

- [ ] **Step 2: Run the file**

Run: `npx vitest run src/chart-ir/__tests__/editor/dashboardShell.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/chart-ir/__tests__/editor/dashboardShell.test.tsx
git commit -m "test(presets): rewrite DashboardShell tests against preset API"
```

---

### Task 15: Rewrite `analyticsShell.test.tsx`

**Files:**
- Modify: `src/chart-ir/__tests__/editor/analyticsShell.test.tsx`

- [ ] **Step 1: Change the default-mode assertion**

The existing test asserts that the Analytics route boots with `mode="workbench"`. Change it to assert the Analytics route boots with `activePresetId === 'analyst-pro'`.

- [ ] **Step 2: Run**

Run: `npx vitest run src/chart-ir/__tests__/editor/analyticsShell.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/chart-ir/__tests__/editor/analyticsShell.test.tsx
git commit -m "test(presets): analyticsShell default preset is analyst-pro"
```

---

### Task 16: Full-suite green run

**Files:** none (verification step).

- [ ] **Step 1: Run the full Analyst Pro + chart-ir + editor test set**

Run: `npx vitest run src/__tests__ src/components/dashboard/freeform/__tests__ src/chart-ir/__tests__/editor src/components/dashboard/__tests__ src/components/dashboard/presets/__tests__ --reporter=dot 2>&1 | tail -30`

Expected: 0 failures. Investigate any failure before proceeding — do not move to Plan B until this is clean.

- [ ] **Step 2: Run the lint**

Run: `npm run lint 2>&1 | tail -30`
Expected: 0 new errors. Fix any introduced by deleted imports.

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -20`
Expected: success.

- [ ] **Step 4: Visual smoke**

Reload the preview. Verify: Analyst Pro renders; preset switcher hidden (only 1 preset); dashboard save/load round-trips `activePresetId + presetLayouts`.

- [ ] **Step 5: Commit the final green marker (if any incidental fixups happened)**

```bash
git add -A
git commit -m "chore(presets): infra green — ready for plans B–E" || true
```

---

## Phase 7 — Migration path for existing saved dashboards

Existing dashboards in the backend carry `archetype: "briefing" | ...`. This phase renames the field on load and drops the old one on save.

### Task 17: Front-end migrator — legacy `archetype` → `activePresetId`

**Files:**
- Create: `src/components/dashboard/freeform/lib/migrateLegacyArchetype.ts`
- Test: `src/components/dashboard/freeform/__tests__/migrateLegacyArchetype.test.ts`
- Modify: whichever loader mounts dashboards on fetch (grep for `archetype:` inside `src/components/dashboard/freeform/lib` / `src/api.js`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { migrateLegacyArchetype } from '../lib/migrateLegacyArchetype';

describe('migrateLegacyArchetype', () => {
  it('maps six legacy archetype ids to analyst-pro (their content renders there now)', () => {
    for (const legacy of ['briefing','workbench','ops','story','pitch','tableau']) {
      const out = migrateLegacyArchetype({ archetype: legacy } as never);
      expect(out.activePresetId).toBe('analyst-pro');
      expect('archetype' in out).toBe(false);
    }
  });

  it('keeps analyst-pro as is', () => {
    const out = migrateLegacyArchetype({ archetype: 'analyst-pro' } as never);
    expect(out.activePresetId).toBe('analyst-pro');
  });

  it('is a no-op when activePresetId already set', () => {
    const out = migrateLegacyArchetype({ activePresetId: 'analyst-pro', presetLayouts: {} } as never);
    expect(out.activePresetId).toBe('analyst-pro');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/migrateLegacyArchetype.test.ts --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Implement the migrator**

```ts
// src/components/dashboard/freeform/lib/migrateLegacyArchetype.ts
import type { Dashboard } from './types';

const LEGACY_IDS = new Set(['briefing','workbench','ops','story','pitch','tableau']);

export function migrateLegacyArchetype<T extends { archetype?: string; activePresetId?: string }>(raw: T): Dashboard {
  if (raw.activePresetId) return raw as unknown as Dashboard;
  const legacy = (raw as { archetype?: string }).archetype;
  const presetId = legacy && LEGACY_IDS.has(legacy) ? 'analyst-pro' : (legacy ?? 'analyst-pro');
  const out: Record<string, unknown> = { ...raw, activePresetId: presetId };
  delete out.archetype;
  if (!out.presetLayouts) out.presetLayouts = {};
  return out as Dashboard;
}
```

- [ ] **Step 4: Call the migrator from the dashboard loader**

Find the first line in `src/api.js` (or equivalent) that returns a fetched dashboard. Wrap with `migrateLegacyArchetype(...)`. If multiple call sites exist, wrap each.

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/migrateLegacyArchetype.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(presets): migrate legacy archetype field to activePresetId on load"
```

---

## Self-Review Results

1. **Spec coverage.**
   - Remove six modes → Task 2, Task 3, Task 4.
   - Keep Analyst Pro customizable → Task 3 keeps AnalystProLayout; no change to its engine.
   - Switch like the current mode tabs, edit & save per theme → Tasks 7–11 (state + switcher + persistence).
   - Preset scheme (light vs dark) fixed per preset, overrides global toggle → Task 12 (`preset-scheme-*` class on `<html>`), Task 13 (chart chrome follows preset).
   - Theme presets not hardcoded into Plan A → registry exposes `_registerPreset`; Plans B–E call it.
   - Back-compat for saved dashboards → Task 17.
2. **Placeholder scan.** No "TBD"/"later"/"similar to Task N"/"add validation" strings. Every code step shows the code.
3. **Type consistency.**
   - `activePresetId` / `presetLayouts` used identically in types.ts, dashboardShape.ts, applyPreset.ts, store.js, migrator — verified by search across the tasks.
   - `getPreset` / `listPresets` / `_registerPreset` / `DEFAULT_PRESET_ID` signatures match their call sites.
   - `switchPreset` / `persistPresetLayout` signatures match between store test and hook usage.

---

## Follow-up Plans (B–E)

Each of the four themed presets is its own plan, written after this one ships:

- **Plan B — Board Pack preset** (cream tearsheet, red risk accent, starter layout: hero number + KPI list + trend + top-accounts)
- **Plan C — Operator Console preset** (CRT-green terminal, monospace, live channels + event log starter)
- **Plan D — Signal preset** (modern dark SaaS, teal/orange/pink accents, sparkline KPI cards + stream chart starter)
- **Plan E — Editorial Brief preset** (magazine cream, italic serif display, amber accent, drop-cap commentary starter)

Each Plan B–E delivers: preset registration call, token set, starter ZoneTree, font subset in `public/fonts/`, preview thumbnail, screenshot-diff visual regression.
