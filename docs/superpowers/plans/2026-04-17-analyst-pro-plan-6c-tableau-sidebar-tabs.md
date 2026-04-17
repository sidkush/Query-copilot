# Analyst Pro — Plan 6c: Tableau-Style Sidebar Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Analyst Pro left-rail panel stack with a two-tab shell (Dashboard | Layout) whose sections match Tableau's sidebar taxonomy. Add a Sheets insert panel (drag a workbook worksheet onto the canvas) and a Selected-Item mini Layout echo that mirrors the Plan 5d inspector.

**Architecture.** Introduce a tabbed sidebar component (`AnalystProSidebar.jsx`) that owns tab state + section-collapse state from the Zustand store. Under the **Dashboard** tab, mount the existing `ObjectLibraryPanel`, the new `SheetsInsertPanel`, `SetsPanel`, `ParametersPanel`. Under the **Layout** tab, mount the existing `LayoutTreePanel` and a new `SelectedItemMini` read-only echo. Each section wraps in a shared `SidebarSection` primitive (chevron + collapsible). Sheet drag payload is a new MIME type; the `FreeformCanvas` drop handler adds a second `getData` branch that routes to `insertObjectAnalystPro({ type: 'worksheet', worksheetRef, x, y })`. No existing panel behaviour changes — only the mounting surface does.

**Tech Stack.** React 19 + Vitest 2.x + Zustand + vanilla CSS vars (chrome-bar tokens). No new deps. Types stay JSX except tests (`.test.tsx`).

**Source references.**
- `docs/Build_Tableau.md` §X Dashboard Objects Catalogue (p. 635) — `DashboardObjectType` includes `worksheet`, `text`, `image`, `web-page`, `blank`, etc. Sheets panel materialises the `worksheet` object type.
- §II.1 workbook hierarchy (p. 81) — Workbook owns sheets (Worksheet / Dashboard / Story). `SheetsInsertPanel` lists **workbook-level worksheets**, not dashboard-local; we read them from `dashboard.worksheets` which is the V1 shape (see `freeform/lib/types.ts:151`).
- §IX.1 Zone on-wire shape (p. 581) — `zoneType: "viz"` pairs with the product zone representation; in AskDB we model a worksheet reference as a floating/tiled leaf zone with `type: 'worksheet'` + `worksheetRef: string`.
- §IX.4 Dashboard size modes (p. 608) — Tableau's Layout tab also hosts the size toggle. **Out of scope for Plan 6c**: size controls stay in the top toolbar's `SizeToggleDropdown` for now (tracked for later plan).
- Appendix A.6 ZoneType enum (p. 1507) — `viz`, `filter`, `dashboard-object`, `legend`, `set-membership`, `layout`.
- Appendix A.7 DashboardObjectType enum (p. 1511) — exhaustive list including `worksheet`.
- Appendix C (p. 1569) — `tabdocdashobjects` maps to our `ObjectLibraryPanel`; `tabdocdashboard` maps to `zoneTree.ts` / `FreeformCanvas.jsx`.
- `docs/analyst_pro_tableau_parity_roadmap.md` §"Plan 6c — Tableau-Style Sidebar Tabs" (line 415) — authoritative deliverables.

**Current left rail (from `AnalystProLayout.jsx` line 202–218)** stacks:
```
<ObjectLibraryPanel />
<LayoutTreePanel />    (in flex:1 scroll pane)
<SetsPanel />
<ParametersPanel />
```
Right rail stacks `<HistoryInspectorPanel />` + `<ZonePropertiesPanel />` (unchanged — Plan 6c only rewrites the left rail).

---

## File Structure

**Created:**
- `frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx` — tabbed rail shell, tab a11y (role=tablist/tab/tabpanel, aria-selected), section-collapse wiring
- `frontend/src/components/dashboard/freeform/panels/SidebarSection.jsx` — chevron-collapsible section primitive reused by every section
- `frontend/src/components/dashboard/freeform/panels/SheetsInsertPanel.jsx` — workbook-worksheet list; draggable with `application/askdb-analyst-pro-sheet+json`
- `frontend/src/components/dashboard/freeform/panels/SelectedItemMini.jsx` — read-only Position/Size/Padding/Background/Border echo synced to single selection
- `frontend/src/components/dashboard/freeform/__tests__/AnalystProSidebar.test.tsx` — tab switch + a11y attributes
- `frontend/src/components/dashboard/freeform/__tests__/SidebarSection.test.tsx` — collapse/expand + persisted state
- `frontend/src/components/dashboard/freeform/__tests__/SheetsInsertPanel.test.tsx` — render + drag MIME payload + insert action
- `frontend/src/components/dashboard/freeform/__tests__/SelectedItemMini.test.tsx` — selection sync + zero/multi selection hides
- `frontend/src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts` — store slice reducers

**Modified:**
- `frontend/src/store.js` — add `analystProSidebarTab`, `analystProSidebarCollapsed`, setters; extend `insertObjectAnalystPro` to accept `worksheetRef` + produce a worksheet-type floating zone
- `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` — drop handler reads the new sheet MIME and calls `insertObjectAnalystPro` with `worksheetRef`
- `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — left rail replaced by `<AnalystProSidebar />`; all four panel imports that move inside the new shell are deleted from this file (they are imported by `AnalystProSidebar` instead)
- `docs/analyst_pro_tableau_parity_roadmap.md` — mark Plan 6c shipped at the end, per prior-plan convention

**Unchanged (verify backward-compat only):** `ObjectLibraryPanel.jsx`, `LayoutTreePanel.jsx`, `SetsPanel.jsx`, `ParametersPanel.jsx`, `ZonePropertiesPanel.jsx`, `HistoryInspectorPanel.jsx`. Existing unit tests mount these directly (not via `AnalystProLayout`) so they remain green without edits.

---

## Task List

### Task 1: Add sidebar-tab + section-collapse slices to the store

**Why.** Tab state (`'dashboard' | 'layout'`) and section-collapse state need to persist across dashboard swaps and survive re-renders; putting them in the Zustand store also lets us unit-test the reducers in isolation and lets any panel toggle from anywhere.

**Files:**
- Modify: `frontend/src/store.js` — add two slices + setters
- Test: `frontend/src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

describe('Plan 6c — sidebar tab + collapse slices', () => {
  beforeEach(() => {
    useStore.setState({
      analystProSidebarTab: 'dashboard',
      analystProSidebarCollapsed: new Set<string>(),
    });
  });

  it('default tab is "dashboard"', () => {
    expect(useStore.getState().analystProSidebarTab).toBe('dashboard');
  });

  it('setSidebarTabAnalystPro switches to "layout"', () => {
    useStore.getState().setSidebarTabAnalystPro('layout');
    expect(useStore.getState().analystProSidebarTab).toBe('layout');
  });

  it('setSidebarTabAnalystPro ignores invalid tab ids', () => {
    useStore.getState().setSidebarTabAnalystPro('garbage' as any);
    expect(useStore.getState().analystProSidebarTab).toBe('dashboard');
  });

  it('toggleSidebarSectionAnalystPro flips collapsed membership', () => {
    useStore.getState().toggleSidebarSectionAnalystPro('objects');
    expect(useStore.getState().analystProSidebarCollapsed.has('objects')).toBe(true);
    useStore.getState().toggleSidebarSectionAnalystPro('objects');
    expect(useStore.getState().analystProSidebarCollapsed.has('objects')).toBe(false);
  });

  it('toggleSidebarSectionAnalystPro produces a new Set reference each call (so React re-renders)', () => {
    const a = useStore.getState().analystProSidebarCollapsed;
    useStore.getState().toggleSidebarSectionAnalystPro('objects');
    const b = useStore.getState().analystProSidebarCollapsed;
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts`
Expected: FAIL with "setSidebarTabAnalystPro is not a function" or undefined property.

- [ ] **Step 3: Add slice + setters to `store.js`**

In `frontend/src/store.js`, inside the top-level `create((set, get) => ({ ... }))` object body, locate the block of analyst-pro state (near `analystProDashboard`, `analystProSelection`, etc.) and add the new state + two setters. Paste the following three blocks together — the `analystProSidebarTab` / `analystProSidebarCollapsed` defaults go with the other `analystPro*` defaults; the two setters go near the other `set*AnalystPro` / `toggle*AnalystPro` action methods:

```js
// Plan 6c — tabbed sidebar state
analystProSidebarTab: 'dashboard',                 // 'dashboard' | 'layout'
analystProSidebarCollapsed: new Set(),             // Set<string> of collapsed section ids
```

```js
// Plan 6c — sidebar tab setter (rejects unknown ids)
setSidebarTabAnalystPro: (tab) => {
  if (tab !== 'dashboard' && tab !== 'layout') return;
  if (get().analystProSidebarTab === tab) return;
  set({ analystProSidebarTab: tab });
},
```

```js
// Plan 6c — section collapse toggler (new Set identity on every call)
toggleSidebarSectionAnalystPro: (sectionId) => {
  if (typeof sectionId !== 'string' || sectionId.length === 0) return;
  const current = get().analystProSidebarCollapsed;
  const next = new Set(current);
  if (next.has(sectionId)) next.delete(sectionId);
  else next.add(sectionId);
  set({ analystProSidebarCollapsed: next });
},
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js frontend/src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts
git commit -m "feat(analyst-pro): sidebar tab + section-collapse slices (Plan 6c T1)"
```

---

### Task 2: `SidebarSection.jsx` collapsible primitive

**Why.** Every Dashboard-tab and Layout-tab block needs a chevron + heading + click-to-collapse, driven by the same Zustand set. Extracting one component keeps the sidebar shell small and lets us test the primitive once rather than repeating a11y checks per section.

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/SidebarSection.jsx`
- Test: `frontend/src/components/dashboard/freeform/__tests__/SidebarSection.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/SidebarSection.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SidebarSection from '../panels/SidebarSection';
import { useStore } from '../../../../store';

describe('Plan 6c — SidebarSection', () => {
  beforeEach(() => {
    useStore.setState({ analystProSidebarCollapsed: new Set<string>() });
  });

  it('renders heading and children when expanded', () => {
    render(
      <SidebarSection id="objects" heading="Objects">
        <div data-testid="child">content</div>
      </SidebarSection>,
    );
    expect(screen.getByText('Objects')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('hides children when collapsed state contains id', () => {
    useStore.setState({ analystProSidebarCollapsed: new Set(['objects']) });
    render(
      <SidebarSection id="objects" heading="Objects">
        <div data-testid="child">content</div>
      </SidebarSection>,
    );
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('header click toggles collapse via store', () => {
    render(
      <SidebarSection id="objects" heading="Objects">
        <div data-testid="child">content</div>
      </SidebarSection>,
    );
    fireEvent.click(screen.getByRole('button', { name: /objects/i }));
    expect(useStore.getState().analystProSidebarCollapsed.has('objects')).toBe(true);
  });

  it('header has aria-expanded reflecting current state', () => {
    const { rerender } = render(
      <SidebarSection id="objects" heading="Objects">
        <div />
      </SidebarSection>,
    );
    const header = screen.getByRole('button', { name: /objects/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    useStore.setState({ analystProSidebarCollapsed: new Set(['objects']) });
    rerender(
      <SidebarSection id="objects" heading="Objects">
        <div />
      </SidebarSection>,
    );
    expect(screen.getByRole('button', { name: /objects/i })).toHaveAttribute('aria-expanded', 'false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/SidebarSection.test.tsx`
Expected: FAIL with "Cannot find module './panels/SidebarSection'".

- [ ] **Step 3: Create `SidebarSection.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/SidebarSection.jsx`:

```jsx
import React from 'react';
import { useStore } from '../../../../store';

/**
 * Plan 6c — collapsible section primitive used by the Tableau-style sidebar.
 * Collapse state lives in the Zustand store (`analystProSidebarCollapsed`)
 * so it survives re-mounts and can be toggled from anywhere.
 */
export default function SidebarSection({ id, heading, children, 'data-testid': dtid }) {
  const collapsed = useStore((s) => s.analystProSidebarCollapsed.has(id));
  const toggle = useStore((s) => s.toggleSidebarSectionAnalystPro);
  const panelId = `sidebar-section-${id}`;
  return (
    <section
      data-testid={dtid || `sidebar-section-${id}`}
      style={{ borderTop: '1px solid var(--chrome-bar-border, var(--border-default))' }}
    >
      <button
        type="button"
        onClick={() => toggle(id)}
        aria-expanded={!collapsed}
        aria-controls={panelId}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: 'transparent',
          border: 'none',
          color: 'var(--fg)',
          textAlign: 'left',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.75,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true" style={{ width: 10, display: 'inline-block' }}>
          {collapsed ? '▸' : '▾'}
        </span>
        <span>{heading}</span>
      </button>
      {!collapsed && (
        <div id={panelId} role="region" aria-label={heading}>
          {children}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/SidebarSection.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/SidebarSection.jsx frontend/src/components/dashboard/freeform/__tests__/SidebarSection.test.tsx
git commit -m "feat(analyst-pro): SidebarSection collapsible primitive (Plan 6c T2)"
```

---

### Task 3: Extend `insertObjectAnalystPro` to accept a worksheet reference

**Why.** The canvas already handles `insertObjectAnalystPro({ type, x, y })` for blank/text/image/webpage/containers. To drag a workbook worksheet onto the canvas we need the same action to accept an optional `worksheetRef` so the resulting floating zone has `{ type: 'worksheet', worksheetRef }`. That makes the Sheets drop path symmetric with the existing object drop path and preserves history label "Insert object".

**Files:**
- Modify: `frontend/src/store.js:1154-1202` (`insertObjectAnalystPro`)
- Modify: `frontend/src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts` — add a test case (keeps Plan 6c store tests in one file)

- [ ] **Step 1: Write failing test (append to existing store test file)**

Append to `frontend/src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts`:

```ts
describe('Plan 6c — insertObjectAnalystPro worksheetRef', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'Test',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [{ id: 'w1', chartSpec: {} }],
        parameters: [],
        sets: [],
        actions: [],
      } as any,
      analystProSelection: new Set<string>(),
    });
  });

  it('inserts a floating worksheet zone when worksheetRef is passed', () => {
    useStore.getState().insertObjectAnalystPro({ type: 'worksheet', worksheetRef: 'w1', x: 50, y: 60 });
    const dash = useStore.getState().analystProDashboard!;
    const inserted = dash.floatingLayer[dash.floatingLayer.length - 1];
    expect(inserted.type).toBe('worksheet');
    expect((inserted as any).worksheetRef).toBe('w1');
    expect(inserted.x).toBe(50);
    expect(inserted.y).toBe(60);
    expect(inserted.floating).toBe(true);
  });

  it('falls back to object insertion when worksheetRef is absent', () => {
    useStore.getState().insertObjectAnalystPro({ type: 'blank', x: 0, y: 0 });
    const dash = useStore.getState().analystProDashboard!;
    const inserted = dash.floatingLayer[dash.floatingLayer.length - 1];
    expect(inserted.type).toBe('blank');
    expect((inserted as any).worksheetRef).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts`
Expected: FAIL — worksheetRef undefined on inserted zone.

- [ ] **Step 3: Patch `insertObjectAnalystPro`**

In `frontend/src/store.js`, replace the body of `insertObjectAnalystPro` (currently at line 1154 — the function already exists). Update the signature to accept `worksheetRef`, and branch on it when building the new zone:

```js
insertObjectAnalystPro: ({ type, x, y, worksheetRef }) => {
  const { analystProDashboard: dash } = get();
  if (!dash) return;
  const isContainer = type === 'container-horz' || type === 'container-vert';
  const isWorksheet = type === 'worksheet';
  const defaultSize = isWorksheet
    ? { pxW: 480, pxH: 320 }
    : type === 'webpage' || isContainer
      ? { pxW: 480, pxH: 320 }
      : { pxW: 320, pxH: 200 };
  const maxZ = dash.floatingLayer.reduce((m, z) => Math.max(m, z.zIndex || 0), 0);
  const id = generateZoneId();
  let newZone;
  if (isContainer) {
    newZone = {
      id, type,
      w: 0, h: 0,
      floating: true, x, y,
      pxW: defaultSize.pxW, pxH: defaultSize.pxH,
      zIndex: maxZ + 1,
      children: [
        { id: generateZoneId(), type: 'blank', w: 100000, h: 100000 },
      ],
    };
  } else if (isWorksheet) {
    newZone = {
      id, type: 'worksheet',
      worksheetRef: String(worksheetRef || ''),
      w: 0, h: 0,
      floating: true, x, y,
      pxW: defaultSize.pxW, pxH: defaultSize.pxH,
      zIndex: maxZ + 1,
    };
  } else {
    newZone = {
      id, type,
      w: 0, h: 0,
      floating: true, x, y,
      pxW: defaultSize.pxW, pxH: defaultSize.pxH,
      zIndex: maxZ + 1,
    };
  }
  const nextDash = {
    ...dash,
    floatingLayer: [...dash.floatingLayer, newZone],
  };
  set({
    analystProDashboard: nextDash,
    analystProSelection: new Set([id]),
  });
  get().pushAnalystProHistory(nextDash, 'Insert object');
},
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts`
Expected: PASS (all 7 in the file now).

Also run the existing Plan 2b regression file that exercises `insertObjectAnalystPro`:
Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.operationLabels.test.ts src/components/dashboard/freeform/__tests__/ObjectLibraryPanel.test.tsx`
Expected: PASS — signature is backward-compatible, existing callers pass no `worksheetRef`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js frontend/src/components/dashboard/freeform/__tests__/store.sidebarTabs.test.ts
git commit -m "feat(analyst-pro): insertObjectAnalystPro accepts worksheetRef (Plan 6c T3)"
```

---

### Task 4: `SheetsInsertPanel.jsx` — drag workbook worksheets onto the canvas

**Why.** Tableau's Dashboard tab lists the workbook's worksheets with a drag-to-insert affordance. In AskDB, `dashboard.worksheets` (see `freeform/lib/types.ts:151`) is the equivalent collection. Each row is a drag source that publishes the new MIME `application/askdb-analyst-pro-sheet+json` so the existing `FreeformCanvas` drop handler can branch on it (Task 5).

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/SheetsInsertPanel.jsx`
- Test: `frontend/src/components/dashboard/freeform/__tests__/SheetsInsertPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/SheetsInsertPanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SheetsInsertPanel from '../panels/SheetsInsertPanel';
import { useStore } from '../../../../store';

describe('Plan 6c — SheetsInsertPanel', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1', name: 'X', archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [
          { id: 'sales_by_region', chartSpec: {} },
          { id: 'top_products',    chartSpec: {} },
        ],
        parameters: [], sets: [], actions: [],
      } as any,
    });
  });

  it('lists every workbook worksheet by id', () => {
    render(<SheetsInsertPanel />);
    expect(screen.getByText('sales_by_region')).toBeInTheDocument();
    expect(screen.getByText('top_products')).toBeInTheDocument();
  });

  it('renders an empty-state row when worksheets array is empty', () => {
    useStore.setState((s) => ({
      analystProDashboard: { ...s.analystProDashboard!, worksheets: [] } as any,
    }));
    render(<SheetsInsertPanel />);
    expect(screen.getByTestId('sheets-insert-empty')).toBeInTheDocument();
  });

  it('drag-starts emit MIME application/askdb-analyst-pro-sheet+json with sheetId payload', () => {
    render(<SheetsInsertPanel />);
    const row = screen.getByTestId('sheet-row-sales_by_region');
    const setData = vi.fn();
    fireEvent.dragStart(row, {
      dataTransfer: { setData, types: [], effectAllowed: 'copy' },
    });
    const call = setData.mock.calls.find((c) => c[0] === 'application/askdb-analyst-pro-sheet+json');
    expect(call).toBeTruthy();
    expect(JSON.parse(call![1])).toEqual({ sheetId: 'sales_by_region' });
  });

  it('Enter key inserts a worksheet zone at default offset via insertObjectAnalystPro', () => {
    const calls: any[] = [];
    useStore.setState({
      insertObjectAnalystPro: (arg: any) => calls.push(arg),
    } as any);
    render(<SheetsInsertPanel />);
    const row = screen.getByTestId('sheet-row-top_products');
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(calls).toEqual([{ type: 'worksheet', worksheetRef: 'top_products', x: 40, y: 40 }]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/SheetsInsertPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `SheetsInsertPanel.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/SheetsInsertPanel.jsx`:

```jsx
import React from 'react';
import { useStore } from '../../../../store';

const SHEET_MIME = 'application/askdb-analyst-pro-sheet+json';

/**
 * Plan 6c — lists workbook worksheets; drag one onto the canvas to insert
 * a floating worksheet zone. Keyboard-accessible via Enter/Space (inserts
 * at default offset, matching ObjectLibraryPanel convention).
 */
export default function SheetsInsertPanel() {
  const worksheets = useStore((s) => s.analystProDashboard?.worksheets || []);
  const insertObject = useStore((s) => s.insertObjectAnalystPro);

  const handleKeyInsert = (sheetId) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      insertObject({ type: 'worksheet', worksheetRef: sheetId, x: 40, y: 40 });
    }
  };

  if (worksheets.length === 0) {
    return (
      <div
        data-testid="sheets-insert-empty"
        style={{ padding: '6px 12px', fontSize: 11, opacity: 0.6 }}
      >
        No worksheets in this workbook.
      </div>
    );
  }

  return (
    <ul
      aria-label="Workbook sheets"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: '4px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {worksheets.map((w) => (
        <li
          key={w.id}
          data-testid={`sheet-row-${w.id}`}
          draggable
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyInsert(w.id)}
          onDragStart={(e) => {
            e.dataTransfer.setData(SHEET_MIME, JSON.stringify({ sheetId: w.id }));
            e.dataTransfer.effectAllowed = 'copy';
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 3,
            fontSize: 12,
            cursor: 'grab',
            color: 'var(--fg)',
          }}
        >
          <span aria-hidden="true" style={{ opacity: 0.7, flexShrink: 0 }}>📊</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {w.id}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/SheetsInsertPanel.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/SheetsInsertPanel.jsx frontend/src/components/dashboard/freeform/__tests__/SheetsInsertPanel.test.tsx
git commit -m "feat(analyst-pro): SheetsInsertPanel drag-to-insert workbook sheets (Plan 6c T4)"
```

---

### Task 5: `FreeformCanvas` drop handler accepts sheet MIME

**Why.** Dropping a sheet row onto the canvas must insert a worksheet zone at the cursor position (screen-to-sheet transformed, matching the Object drop path so the zone lands where the user released). Add a second branch to the existing drop handler so nothing about the Object drop path changes.

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx:210-245` — `handleDragOver` + `handleDrop`
- Test: `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx` — append a case

- [ ] **Step 1: Add failing test**

Append a new `describe` to `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx` (below the existing last `describe` block):

```tsx
describe('Plan 6c — sheet MIME drop inserts worksheet zone', () => {
  it('routes application/askdb-analyst-pro-sheet+json to insertObjectAnalystPro with worksheetRef', async () => {
    const calls: any[] = [];
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1', name: 'X', archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [{ id: 'wA', chartSpec: {} }],
        parameters: [], sets: [], actions: [],
      } as any,
      insertObjectAnalystPro: (arg: any) => calls.push(arg),
    } as any);

    const { container } = render(
      <FreeformCanvas dashboard={useStore.getState().analystProDashboard as any} renderLeaf={() => null} />,
    );
    const canvas = container.querySelector('[data-testid="freeform-canvas"]')!;
    const mkDT = () => {
      const map: Record<string, string> = {
        'application/askdb-analyst-pro-sheet+json': JSON.stringify({ sheetId: 'wA' }),
      };
      return {
        getData: (k: string) => map[k] || '',
        setData: () => {},
        types: Object.keys(map),
        dropEffect: 'copy',
        effectAllowed: 'copy',
      };
    };
    fireEvent.dragOver(canvas, { dataTransfer: mkDT(), clientX: 100, clientY: 120 });
    fireEvent.drop(canvas,     { dataTransfer: mkDT(), clientX: 100, clientY: 120 });
    expect(calls[0]).toMatchObject({ type: 'worksheet', worksheetRef: 'wA' });
    expect(typeof calls[0].x).toBe('number');
    expect(typeof calls[0].y).toBe('number');
  });
});
```

(If `FreeformCanvas` or `fireEvent`/`render`/`useStore` are not imported at the top of the test file, add them the same way the existing describes do.)

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx -t "sheet MIME"`
Expected: FAIL — `calls` is empty because no handler accepts the sheet MIME.

- [ ] **Step 3: Extend `handleDragOver` + `handleDrop`**

In `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx`, around line 210–245, replace the existing `handleDragOver` and `handleDrop` with versions that accept both MIMEs:

```jsx
const OBJ_MIME   = 'application/askdb-analyst-pro-object+json';
const SHEET_MIME = 'application/askdb-analyst-pro-sheet+json';

const handleDragOver = (e) => {
  if (!e.dataTransfer) return;
  const types = Array.from(e.dataTransfer.types || []);
  if (types.includes(OBJ_MIME) || types.includes(SHEET_MIME)) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
};

const handleDrop = (e) => {
  if (!e.dataTransfer) return;
  const sheet = sheetRef.current;
  if (!sheet) return;
  const rect = sheet.getBoundingClientRect();
  const zoom = useStore.getState().analystProCanvasZoom;
  const pan  = useStore.getState().analystProCanvasPan;
  const pt   = screenToSheet({ clientX: e.clientX, clientY: e.clientY }, rect, zoom, pan);
  const x = Math.max(0, Math.round(pt.x));
  const y = Math.max(0, Math.round(pt.y));

  // Plan 6c — Sheet drop: insert a worksheet-type zone.
  const sheetRaw = e.dataTransfer.getData(SHEET_MIME);
  if (sheetRaw) {
    let payload;
    try { payload = JSON.parse(sheetRaw); } catch { return; }
    if (!payload || typeof payload.sheetId !== 'string') return;
    e.preventDefault();
    insertObjectAnalystPro({ type: 'worksheet', worksheetRef: payload.sheetId, x, y });
    return;
  }

  // Existing Plan 2b path — Object library drop.
  const raw = e.dataTransfer.getData(OBJ_MIME);
  if (!raw) return;
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  if (!payload || typeof payload.type !== 'string') return;
  e.preventDefault();
  insertObjectAnalystPro({ type: payload.type, x, y });
};
```

(Keep the two constants at the module top so `handleDragOver` / `handleDrop` stay pure reads.)

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`
Expected: PASS — all pre-existing FreeformCanvas cases + the new sheet MIME case.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/FreeformCanvas.jsx frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx
git commit -m "feat(analyst-pro): canvas drop accepts sheet MIME -> worksheet zone (Plan 6c T5)"
```

---

### Task 6: `SelectedItemMini.jsx` — Layout-tab echo bound to single selection

**Why.** Tableau's Layout tab shows the Position / Size / Padding / Background / Border of the currently selected zone. Plan 5d already ships a full `ZonePropertiesPanel` in the right rail; the Layout tab only needs a read-only summary with a link to the full inspector. Hide the mini panel unless the selection size is exactly 1 (no sensible rollup otherwise).

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/SelectedItemMini.jsx`
- Test: `frontend/src/components/dashboard/freeform/__tests__/SelectedItemMini.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/SelectedItemMini.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SelectedItemMini from '../panels/SelectedItemMini';
import { useStore } from '../../../../store';

const baseDash = (floating: any[]) => ({
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1', name: 'X', archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
  floatingLayer: floating,
  worksheets: [], parameters: [], sets: [], actions: [],
});

describe('Plan 6c — SelectedItemMini', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: baseDash([
        { id: 'z1', type: 'blank', floating: true, x: 10, y: 20, pxW: 300, pxH: 200, w: 0, h: 0, innerPadding: 8, outerPadding: 4 },
      ]) as any,
      analystProSelection: new Set<string>(),
    });
  });

  it('renders nothing when selection is empty', () => {
    const { container } = render(<SelectedItemMini />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when selection size > 1', () => {
    useStore.setState({ analystProSelection: new Set(['z1', 'z2']) });
    const { container } = render(<SelectedItemMini />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Position / Size / Padding rows for the selected zone', () => {
    useStore.setState({ analystProSelection: new Set(['z1']) });
    render(<SelectedItemMini />);
    expect(screen.getByText(/Position/i)).toBeInTheDocument();
    expect(screen.getByText(/10.*20/)).toBeInTheDocument();         // x, y
    expect(screen.getByText(/300.*200/)).toBeInTheDocument();       // pxW, pxH
    expect(screen.getByText(/Padding/i)).toBeInTheDocument();
    expect(screen.getByText(/8.*\/.*4/)).toBeInTheDocument();       // inner / outer
  });

  it('renders Background + Border rows with fallback labels when unset', () => {
    useStore.setState({ analystProSelection: new Set(['z1']) });
    render(<SelectedItemMini />);
    expect(screen.getByText(/Background/i)).toBeInTheDocument();
    expect(screen.getByText(/Border/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/SelectedItemMini.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `SelectedItemMini.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/SelectedItemMini.jsx`:

```jsx
import React, { useMemo } from 'react';
import { useStore } from '../../../../store';

function findZone(dashboard, zoneId) {
  if (!dashboard || !zoneId) return null;
  const float = dashboard.floatingLayer?.find((z) => z.id === zoneId);
  if (float) return float;
  const walk = (z) => {
    if (!z) return null;
    if (z.id === zoneId) return z;
    if (!z.children) return null;
    for (const c of z.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(dashboard.tiledRoot);
}

function fmtColor(c) {
  if (!c) return '—';
  if (typeof c === 'string') return c;
  if (c.color) return c.color;
  return '—';
}

function fmtBorder(b) {
  if (!b) return '—';
  const w = b.width ?? 0;
  const s = b.style || 'solid';
  const c = b.color || 'var(--border-default)';
  return `${w}px ${s} ${c}`;
}

/**
 * Plan 6c — compact Layout echo shown in the Layout sidebar tab.
 * Read-only; users edit in the right-rail `ZonePropertiesPanel`.
 * Hidden unless exactly one zone is selected.
 */
export default function SelectedItemMini() {
  const dashboard = useStore((s) => s.analystProDashboard);
  const selection = useStore((s) => s.analystProSelection);

  const id = selection?.size === 1 ? Array.from(selection)[0] : null;
  const zone = useMemo(() => findZone(dashboard, id), [dashboard, id]);
  if (!id || !zone) return null;

  const floating = zone.floating === true;
  const inner = typeof zone.innerPadding === 'number' ? zone.innerPadding : 4;
  const outer = typeof zone.outerPadding === 'number' ? zone.outerPadding : 0;

  return (
    <dl
      data-testid="selected-item-mini"
      style={{
        margin: 0,
        padding: '6px 12px',
        display: 'grid',
        gridTemplateColumns: '90px 1fr',
        rowGap: 4,
        columnGap: 6,
        fontSize: 11,
        color: 'var(--fg)',
      }}
    >
      <dt style={dtStyle}>Position</dt>
      <dd style={ddStyle}>{floating ? `${zone.x ?? 0}, ${zone.y ?? 0}` : 'tiled'}</dd>

      <dt style={dtStyle}>Size</dt>
      <dd style={ddStyle}>{floating ? `${zone.pxW ?? 0} × ${zone.pxH ?? 0}` : '—'}</dd>

      <dt style={dtStyle}>Padding</dt>
      <dd style={ddStyle}>{`${inner} / ${outer}`}</dd>

      <dt style={dtStyle}>Background</dt>
      <dd style={ddStyle}>{fmtColor(zone.background)}</dd>

      <dt style={dtStyle}>Border</dt>
      <dd style={ddStyle}>{fmtBorder(zone.border)}</dd>
    </dl>
  );
}

const dtStyle = { opacity: 0.65, margin: 0 };
const ddStyle = { margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/SelectedItemMini.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/SelectedItemMini.jsx frontend/src/components/dashboard/freeform/__tests__/SelectedItemMini.test.tsx
git commit -m "feat(analyst-pro): SelectedItemMini Layout echo (Plan 6c T6)"
```

---

### Task 7: `AnalystProSidebar.jsx` — Dashboard | Layout tabbed shell

**Why.** One component owns the tabbed left rail: reads `analystProSidebarTab`, renders tablist with keyboard a11y, mounts the right stack of `SidebarSection`-wrapped panels per tab. Keeping it separate from `AnalystProLayout.jsx` keeps the layout file small and makes the sidebar easy to snapshot-test.

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx`
- Test: `frontend/src/components/dashboard/freeform/__tests__/AnalystProSidebar.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/AnalystProSidebar.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import AnalystProSidebar from '../panels/AnalystProSidebar';
import { useStore } from '../../../../store';

describe('Plan 6c — AnalystProSidebar', () => {
  beforeEach(() => {
    useStore.setState({
      analystProSidebarTab: 'dashboard',
      analystProSidebarCollapsed: new Set<string>(),
      analystProSelection: new Set<string>(),
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1', name: 'X', archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [{ id: 'sheetA', chartSpec: {} }],
        parameters: [], sets: [], actions: [],
      } as any,
    });
  });

  it('tablist has exactly two tabs with role=tab', () => {
    render(<AnalystProSidebar />);
    const list = screen.getByRole('tablist');
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.textContent)).toEqual(['Dashboard', 'Layout']);
  });

  it('Dashboard tab aria-selected=true by default, Layout aria-selected=false', () => {
    render(<AnalystProSidebar />);
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Layout'    })).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking Layout tab updates the store AND aria-selected flips', () => {
    render(<AnalystProSidebar />);
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    expect(useStore.getState().analystProSidebarTab).toBe('layout');
    expect(screen.getByRole('tab', { name: 'Layout'    })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'false');
  });

  it('Dashboard tab mounts Objects, Sheets, Sets, Parameters sections', () => {
    render(<AnalystProSidebar />);
    expect(screen.getByTestId('sidebar-section-objects')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-sheets')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-sets')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-parameters')).toBeInTheDocument();
  });

  it('Layout tab mounts Item Hierarchy + Selected Item sections', () => {
    useStore.setState({ analystProSidebarTab: 'layout' });
    render(<AnalystProSidebar />);
    expect(screen.getByTestId('sidebar-section-hierarchy')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-selected')).toBeInTheDocument();
  });

  it('inactive tab panel is not in the DOM', () => {
    render(<AnalystProSidebar />);
    expect(screen.queryByTestId('sidebar-section-hierarchy')).not.toBeInTheDocument();
  });

  it('tabpanel element has role=tabpanel and references the active tab via aria-labelledby', () => {
    render(<AnalystProSidebar />);
    const panel = screen.getByRole('tabpanel');
    const labelId = panel.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const tab = screen.getByRole('tab', { name: 'Dashboard' });
    expect(tab.id).toBe(labelId);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/AnalystProSidebar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `AnalystProSidebar.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx`:

```jsx
import React from 'react';
import { useStore } from '../../../../store';
import SidebarSection from './SidebarSection';
import ObjectLibraryPanel from './ObjectLibraryPanel';
import SheetsInsertPanel from './SheetsInsertPanel';
import SetsPanel from './SetsPanel';
import ParametersPanel from './ParametersPanel';
import LayoutTreePanel from './LayoutTreePanel';
import SelectedItemMini from './SelectedItemMini';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'layout',    label: 'Layout' },
];

/**
 * Plan 6c — Tableau-style two-tab sidebar.
 *
 *   Dashboard tab  → Objects | Sheets | Sets | Parameters
 *   Layout tab     → Item Hierarchy | Selected Item
 *
 * Right rail (`HistoryInspectorPanel` + `ZonePropertiesPanel`) is unchanged;
 * this component only replaces the left rail.
 */
export default function AnalystProSidebar() {
  const active = useStore((s) => s.analystProSidebarTab) || 'dashboard';
  const setTab = useStore((s) => s.setSidebarTabAnalystPro);

  const tabId = (id) => `analyst-pro-sidebar-tab-${id}`;
  const panelId = (id) => `analyst-pro-sidebar-panel-${id}`;

  return (
    <div
      data-testid="analyst-pro-sidebar"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      <div
        role="tablist"
        aria-label="Analyst Pro sidebar"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--chrome-bar-border, var(--border-default))',
        }}
      >
        {TABS.map((t) => {
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              id={tabId(t.id)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId(t.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '8px 10px',
                background: selected ? 'var(--bg-elevated)' : 'transparent',
                color: 'var(--fg)',
                border: 'none',
                borderBottom: selected
                  ? '2px solid var(--accent, #6c63ff)'
                  : '2px solid transparent',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId(active)}
        aria-labelledby={tabId(active)}
        style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
      >
        {active === 'dashboard' ? (
          <>
            <SidebarSection id="objects"    heading="Objects">    <ObjectLibraryPanel /> </SidebarSection>
            <SidebarSection id="sheets"     heading="Sheets">     <SheetsInsertPanel />  </SidebarSection>
            <SidebarSection id="sets"       heading="Sets">       <SetsPanel />          </SidebarSection>
            <SidebarSection id="parameters" heading="Parameters"> <ParametersPanel />    </SidebarSection>
          </>
        ) : (
          <>
            <SidebarSection id="hierarchy" heading="Item Hierarchy"> <LayoutTreePanel />   </SidebarSection>
            <SidebarSection id="selected"  heading="Selected Item">  <SelectedItemMini />  </SidebarSection>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/AnalystProSidebar.test.tsx`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx frontend/src/components/dashboard/freeform/__tests__/AnalystProSidebar.test.tsx
git commit -m "feat(analyst-pro): AnalystProSidebar two-tab shell (Plan 6c T7)"
```

---

### Task 8: Mount `AnalystProSidebar` in `AnalystProLayout`, delete the old panel stack

**Why.** The new shell replaces the flat panel list currently mounted at lines 202–218 of `AnalystProLayout.jsx`. Remove the now-redundant imports from that file so no dead reference lingers. The right rail is unchanged.

**Files:**
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

- [ ] **Step 1: Update `AnalystProLayout.jsx`**

In `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`:

1. Remove these imports at the top of the file (they now live inside `AnalystProSidebar`):

```jsx
import ObjectLibraryPanel from '../freeform/panels/ObjectLibraryPanel';
import LayoutTreePanel from '../freeform/panels/LayoutTreePanel';
import SetsPanel from '../freeform/panels/SetsPanel';
import ParametersPanel from '../freeform/panels/ParametersPanel';
```

2. Add one import:

```jsx
import AnalystProSidebar from '../freeform/panels/AnalystProSidebar';
```

3. Replace the left rail block (currently lines 202–218, `<div data-testid="analyst-pro-left-rail" ...> ... </div>`) with:

```jsx
<div
  data-testid="analyst-pro-left-rail"
  style={{
    width: 240,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--chrome-bar-border, var(--border-default))',
    overflow: 'hidden',
  }}
>
  <AnalystProSidebar />
</div>
```

The top-toolbar block, the FreeformCanvas center block, the right rail, `<ActionsDialog />`, and `<ContextMenu />` stay unchanged.

- [ ] **Step 2: Run lint + the relevant existing tests**

Run: `cd frontend && npm run lint -- --max-warnings=0 src/components/dashboard/modes/AnalystProLayout.jsx`
Expected: lint clean (no unused-imports).

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ObjectLibraryPanel.test.tsx src/components/dashboard/freeform/__tests__/LayoutTreePanel.test.tsx src/components/dashboard/freeform/__tests__/SetsPanel.test.tsx src/components/dashboard/freeform/__tests__/ParametersPanel.test.tsx src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx src/components/dashboard/freeform/__tests__/HistoryInspectorPanel.test.tsx`
Expected: PASS — each pre-existing test mounts its panel directly (not via `AnalystProLayout`), so they remain green.

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): mount AnalystProSidebar, drop flat panel stack (Plan 6c T8)"
```

---

### Task 9: Smoke verification + roadmap status

**Why.** Run the full chart-ir + freeform vitest suite to confirm nothing regressed, confirm the failure count still matches the known test-debt baseline in root `CLAUDE.md`, and mark Plan 6c shipped in the roadmap so the index stays truthful.

**Files:**
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` — append shipped note under Plan 6c

- [ ] **Step 1: Run freeform suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/`
Expected: all new tests pass; pre-existing freeform tests unchanged pass/fail shape.

- [ ] **Step 2: Run chart-ir suite (to bound the known pre-existing failures)**

Run: `cd frontend && npm run test:chart-ir`
Expected: the ~22 stale chart-ir failures noted in root `CLAUDE.md` (Known Test Debt) are unchanged in count. New failures = 0. If count grew, open a diff on the run and fix before committing status.

- [ ] **Step 3: Mark Plan 6c shipped in the roadmap**

In `docs/analyst_pro_tableau_parity_roadmap.md`, locate the Plan 6c block (line 415). Append after the existing `**Task count target:** 8–10.` line:

```markdown
**Status:** ✅ Shipped 2026-04-17. 9 tasks. Left rail becomes a two-tab shell (Dashboard | Layout) with collapsible sections for Objects / Sheets / Sets / Parameters / Item Hierarchy / Selected Item. Sheet drag uses MIME `application/askdb-analyst-pro-sheet+json`; canvas drop inserts a worksheet zone. `insertObjectAnalystPro` now accepts `worksheetRef`. New tests: `store.sidebarTabs` (7), `SidebarSection` (4), `SheetsInsertPanel` (4), `FreeformCanvas.integration` sheet-drop case (1), `SelectedItemMini` (4), `AnalystProSidebar` (7) — 27 new assertions. §IX.4 size controls deferred — they remain on the top toolbar (`SizeToggleDropdown`) for now.
```

- [ ] **Step 4: Commit**

```bash
git add docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "chore(analyst-pro): Plan 6c smoke verification + roadmap status (Plan 6c T9)"
```

---

## Self-Review Notes

- **Deliverables 1 (tabbed rail), 2 (Dashboard tab sections), 3 (Layout tab sections), 4 (SheetsInsertPanel), 5 (drop handler), 6 (collapsible section primitive)** all mapped to at least one task.
- **Types are consistent:** the store method is `setSidebarTabAnalystPro` / `toggleSidebarSectionAnalystPro` everywhere it's used; the sheet MIME constant is `application/askdb-analyst-pro-sheet+json` in every reference.
- **Backward-compat:** existing panel-location unit tests mount their panel component directly, so none rely on `AnalystProLayout`'s left-rail shape. Verified by grep — `ObjectLibraryPanel.test.tsx`, `SetsPanel.test.tsx`, `ParametersPanel.test.tsx`, `LayoutTreePanel.test.tsx` all use `render(<PanelX />)`.
- **Out of scope (noted in roadmap status):** §IX.4 size mode controls stay on the top toolbar. Right rail (`HistoryInspectorPanel` + `ZonePropertiesPanel`) untouched. Context-menu builder for sheet rows is not required — Plan 6c spec says "if created", and no right-click UX is introduced here.
- **A11y:** tablist + tab (aria-selected, tabIndex=0/-1 for roving focus), tabpanel with aria-labelledby; every SidebarSection header is a `<button>` with aria-expanded + aria-controls.
