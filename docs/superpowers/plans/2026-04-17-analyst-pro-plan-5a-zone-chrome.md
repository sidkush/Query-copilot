# Plan 5a — Zone Chrome + Hover Affordances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap every Analyst Pro leaf zone in a `ZoneFrame` component that renders optional title bar (drag grip + editable display name + hover-reveal ⋯/⛶/× quick-action buttons), hover outline, edge-hotzone resize cursors, and keyboard navigation (Tab/Enter/F2) so users discover drag/resize/rename affordances without clicking blindly.

**Architecture:** `ZoneFrame.jsx` is a purely presentational wrapper inside `AnalystProLayout.renderLeaf`. It does NOT own pointerdown — the outer wrapper in `FreeformCanvas.jsx:198-209` already binds `onZonePointerDown`, `handleZoneClick`, etc. ZoneFrame adds chrome (title bar, border, outline, cursor pseudo-elements) + keyboard affordances + three quick-action buttons dispatched through a parent-supplied `onQuickAction` prop (stubbed in 5a; real menu lands in Plan 5c). Hover state is CSS-only (`:hover` + edge pseudo-elements); no JS pointer tracking. Tab cycles because every frame has `tabIndex={0}`. `analystProHoveredZoneId` slice is added for downstream consumers (drop indicators in 5b) but ZoneFrame itself updates it via `onMouseEnter` / `onMouseLeave`.

**Tech Stack:** React 19, Zustand `store.js`, existing `updateZoneAnalystPro(zoneId, patch)` for displayName writes, Vitest 2.x + `@testing-library/react` for component tests, plain CSS (inline styles + `index.css` class rules — no CSS-in-JS).

**References (authoritative):**
- Parent roadmap: `docs/analyst_pro_tableau_parity_roadmap.md` § "Plan 5a — Zone Chrome + Hover Affordances".
- Tableau source of truth: `docs/Build_Tableau.md` §IX.1 (BaseZone wire shape), §IX.6 (StyledBox padding / background / border), Appendix A.7 (`DashboardObjectType` — drives title-bar visibility default), Appendix E.15 (device-layout visibility rule — ZoneFrame must respect `visibilityRule` from Plan 4d; already enforced upstream by `ZoneRenderer.jsx:31`, so no extra work here).
- Precedent plans: `docs/superpowers/plans/2026-04-16-analyst-pro-plan-2b-canvas-polish.md` (task/test structure), `docs/superpowers/plans/2026-04-16-analyst-pro-plan-3-actions-runtime.md`.

**Non-goals (defer to later plans):**
- Right-click context menu body — Plan 5c mounts `<ContextMenu />` onto the `onContextMenu` hook exposed here.
- Real "fit-to-content" behavior — Plan 5d's Zone Properties rewrite owns sizing ops. In 5a, `⛶` calls `onQuickAction('fit', zone)` which parent stubs with `console.debug`.
- Close (`×`) removing zones — no `removeZoneAnalystPro` action exists yet. In 5a, `×` calls `onQuickAction('close', zone)` which parent stubs. Plan 5c / 5d wire the real remove.
- Zone background / border / padding application — Plan 5d (properties panel) writes those properties; ZoneFrame in 5a reads `zone.border` / `zone.background` only if present (defensive) but does not require them.

**Shared conventions (HARD — from roadmap):**
- TDD for lib code (none in this plan — this plan is component-heavy; component tests use `@testing-library/react`).
- Store actions end `…AnalystPro`; state fields prefix `analystPro…`.
- Commit per task. Format: `feat(analyst-pro): <verb> <object> (Plan 5a TN)` / `test(analyst-pro): … (Plan 5a TN)` / `fix(analyst-pro): … (Plan 5a TN fixup)`.
- Vega-Lite only. No ECharts. No emoji in code (the `⋮⋮`, `⋯`, `⛶`, `×` glyphs are Unicode box-drawing/punctuation characters used as visual icons — treat as text; do not substitute emoji codepoints).
- Preserve existing `renderLeaf` → outer-wrapper pointer wiring in `FreeformCanvas.jsx`. ZoneFrame wraps INSIDE `renderLeaf`'s returned JSX.

---

## File Structure

| File | Role | Action |
|---|---|---|
| `frontend/src/components/dashboard/freeform/ZoneFrame.jsx` | New presentational wrapper component | Create |
| `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx` | Component tests (Vitest + testing-library) | Create |
| `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` | Wire ZoneFrame into `renderLeaf`; supply `onQuickAction` + `onContextMenu` stubs | Modify |
| `frontend/src/store.js` | Add `analystProHoveredZoneId` state + `setAnalystProHoveredZoneId` action | Modify |
| `frontend/src/index.css` | `.analyst-pro-zone-frame` class + edge-hotzone pseudo-elements + title-bar styles | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx` | Extend: zone hover → outline renders; edge hotzone cursor | Extend |

Test config already resolves `.tsx` under `__tests__` via existing Vitest setup (see `2026-04-16-analyst-pro-plan-2b-canvas-polish.md` precedent). Run with `npm run test:chart-ir` (scope includes freeform tests).

---

## Task Checklist

- [ ] T1. Store — add `analystProHoveredZoneId` + `setAnalystProHoveredZoneId`.
- [ ] T2. CSS — `.analyst-pro-zone-frame` base + hover outline + edge-hotzone pseudo-elements + title-bar styles.
- [ ] T3. `ZoneFrame.jsx` — skeleton with title bar + content slot + hover/keyboard wiring.
- [ ] T4. Inline rename editor — dbl-click on title activates `<input>`, Enter commits via `updateZoneAnalystPro`, Esc cancels.
- [ ] T5. Quick-action buttons — ⋯ / ⛶ / × trio with hover-reveal + `onQuickAction` dispatch.
- [ ] T6. Keyboard — Tab order (tabIndex=0), F2 enters rename, Enter fires `onContextMenu`.
- [ ] T7. Wire ZoneFrame into `AnalystProLayout.renderLeaf`.
- [ ] T8. Extend `FreeformCanvas.integration.test.tsx` — hover outline renders; edge hotzone CSS class present.
- [ ] T9. Smoke — `npm run test:chart-ir`, `npm run lint`, `npm run build` all green; commit fixups as needed.

---

## Task Specifications

### Task 1: Store — `analystProHoveredZoneId` slice

**Files:**
- Modify: `frontend/src/store.js` (add state field + setter alongside other `analystPro…` entries, near line 704 after `analystProMarquee`)

- [ ] **Step 1: Open the store and locate the anchor line**

Run: `grep -n "analystProMarquee:" frontend/src/store.js`
Expected output: one line reading `analystProMarquee: null,` (around line 703).

- [ ] **Step 2: Add hovered-zone state + setter immediately below the marquee setter**

Insert this block after the line `setAnalystProMarquee: (rect) => set({ analystProMarquee: rect }),` (use Edit with surrounding context for uniqueness):

```js
  // Plan 5a: hovered zone id (set by ZoneFrame onMouseEnter, cleared on leave)
  analystProHoveredZoneId: null,
  setAnalystProHoveredZoneId: (id) =>
    set({ analystProHoveredZoneId: id == null ? null : String(id) }),
```

The setter coerces ids to `string | null` so the downstream CSS-data-attribute / selector work stays string-safe. Accept `null`, `undefined`, or a string id.

- [ ] **Step 3: Sanity-check no other `analystProHoveredZoneId` reference exists**

Run: `grep -n "analystProHoveredZoneId" frontend/src/store.js`
Expected: exactly the two lines you just inserted (state field + setter action body). No other hits.

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js
git commit -m "feat(analyst-pro): analystProHoveredZoneId slice (Plan 5a T1)"
```

---

### Task 2: CSS — zone-frame chrome + edge hotzones

**Files:**
- Modify: `frontend/src/index.css` (append new block after the existing `.analyst-pro-zone-pulse` definition, around line 4259 — i.e. end of file is fine)

- [ ] **Step 1: Locate end of existing analyst-pro CSS block**

Run: `tail -20 frontend/src/index.css`
Expected: last non-blank rule is the `.analyst-pro-zone-pulse` keyframes / class from Plan 4e.

- [ ] **Step 2: Append the zone-frame styles**

Append this block to the end of `frontend/src/index.css`:

```css
/* Plan 5a — Zone chrome + hover affordances.
   Rendered by ZoneFrame.jsx. Hover state and edge-hotzone cursors are CSS-only;
   no JS pointer tracking per roadmap §5a deliverable 2. */
.analyst-pro-zone-frame {
  position: relative;
  width: 100%;
  height: 100%;
  outline: 1px solid transparent;
  outline-offset: -1px;
  transition: outline-color 80ms linear;
  cursor: default;
}
.analyst-pro-zone-frame:hover,
.analyst-pro-zone-frame:focus-visible {
  outline-color: var(--accent, #3b82f6);
}
.analyst-pro-zone-frame:focus-visible {
  outline-width: 2px;
}
.analyst-pro-zone-frame__body {
  position: absolute;
  inset: 0;
  cursor: move;
}
.analyst-pro-zone-frame--with-title .analyst-pro-zone-frame__body {
  top: 24px;
}

/* Edge hotzones — 4px strips at each edge set resize cursors without JS. */
.analyst-pro-zone-frame__edge {
  position: absolute;
  pointer-events: none; /* visual layer; real pointerdown lives on SelectionOverlay handles */
}
.analyst-pro-zone-frame:hover .analyst-pro-zone-frame__edge {
  pointer-events: auto;
}
.analyst-pro-zone-frame__edge--n { top: 0; left: 4px; right: 4px; height: 4px; cursor: ns-resize; }
.analyst-pro-zone-frame__edge--s { bottom: 0; left: 4px; right: 4px; height: 4px; cursor: ns-resize; }
.analyst-pro-zone-frame__edge--e { top: 4px; right: 0; bottom: 4px; width: 4px; cursor: ew-resize; }
.analyst-pro-zone-frame__edge--w { top: 4px; left: 0; bottom: 4px; width: 4px; cursor: ew-resize; }
.analyst-pro-zone-frame__edge--ne { top: 0; right: 0; width: 4px; height: 4px; cursor: nesw-resize; }
.analyst-pro-zone-frame__edge--nw { top: 0; left: 0; width: 4px; height: 4px; cursor: nwse-resize; }
.analyst-pro-zone-frame__edge--se { bottom: 0; right: 0; width: 4px; height: 4px; cursor: nwse-resize; }
.analyst-pro-zone-frame__edge--sw { bottom: 0; left: 0; width: 4px; height: 4px; cursor: nesw-resize; }

/* Title bar — 24px strip with grip + display name + quick actions. */
.analyst-pro-zone-frame__title {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 4px 0 0;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.04));
  border-bottom: 1px solid var(--border-default, rgba(255, 255, 255, 0.08));
  font-size: 11px;
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--text-primary, #e5e7eb);
  user-select: none;
  gap: 4px;
}
.analyst-pro-zone-frame__grip {
  width: 16px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: move;
  color: var(--text-muted, #6b7280);
  font-size: 12px;
  line-height: 1;
  flex-shrink: 0;
}
.analyst-pro-zone-frame__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 2px;
  cursor: text;
}
.analyst-pro-zone-frame__name-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 18px;
  padding: 0 2px;
  margin: 0;
  font: inherit;
  color: inherit;
  background: var(--bg-page, #0a0a0c);
  border: 1px solid var(--accent, #3b82f6);
  border-radius: 2px;
  outline: none;
}

/* Quick-action buttons — hover-reveal via opacity. */
.analyst-pro-zone-frame__actions {
  display: inline-flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 80ms linear;
  flex-shrink: 0;
}
.analyst-pro-zone-frame:hover .analyst-pro-zone-frame__actions,
.analyst-pro-zone-frame:focus-within .analyst-pro-zone-frame__actions {
  opacity: 1;
}
.analyst-pro-zone-frame__action {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted, #9ca3af);
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0;
}
.analyst-pro-zone-frame__action:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #e5e7eb);
}
.analyst-pro-zone-frame__action:focus-visible {
  outline: 2px solid var(--accent, #3b82f6);
  outline-offset: -2px;
}
```

- [ ] **Step 3: Verify the append compiled into the file**

Run: `grep -c "analyst-pro-zone-frame" frontend/src/index.css`
Expected: at least 25 (one per selector / modifier added above).

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/index.css
git commit -m "feat(analyst-pro): zone-frame chrome + edge-hotzone CSS (Plan 5a T2)"
```

---

### Task 3: ZoneFrame.jsx skeleton — title bar + content slot + hover wiring

**Files:**
- Create: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`

**Title-bar visibility rule (Build_Tableau.md §IX.6 + Appendix A.7 mapping):**
Title bar is shown by default for zone types `worksheet`, `text`, `webpage`. It is hidden by default for `blank` and `image`. Leaf type comes from `zone.type` (see `types.ts:13-23`). `filter`, `legend`, `parameter`, `navigation`, `extension` follow worksheet default (shown) — they benefit from the rename + quick-actions affordance. Encode as a pure helper constant so T5 tests can assert per-type.

- [ ] **Step 1: Write the failing component test (TDD)**

Create `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ZoneFrame from '../ZoneFrame';
import { useStore } from '../../../../store';

const baseZone = {
  id: 'z1',
  type: 'worksheet' as const,
  w: 100000,
  h: 100000,
  worksheetRef: 'ws1',
};

describe('ZoneFrame — base chrome', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'd',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [baseZone] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [],
        actions: [],
      },
      analystProHoveredZoneId: null,
    });
  });

  it('renders the zone-frame wrapper with the zone data attribute', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div data-testid="inner">hi</div>
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1');
    expect(frame).toHaveAttribute('data-zone-id', 'z1');
    expect(frame.classList.contains('analyst-pro-zone-frame')).toBe(true);
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  it('renders the title bar for worksheet / text / webpage', () => {
    for (const type of ['worksheet', 'text', 'webpage'] as const) {
      const { unmount } = render(
        <ZoneFrame
          zone={{ ...baseZone, type }}
          resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        >
          <div />
        </ZoneFrame>,
      );
      expect(screen.getByTestId('zone-frame-z1-title')).toBeInTheDocument();
      unmount();
    }
  });

  it('hides the title bar for blank / image by default', () => {
    for (const type of ['blank', 'image'] as const) {
      const { unmount } = render(
        <ZoneFrame
          zone={{ ...baseZone, type }}
          resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        >
          <div />
        </ZoneFrame>,
      );
      expect(screen.queryByTestId('zone-frame-z1-title')).toBeNull();
      unmount();
    }
  });

  it('writes hovered zone id into store on mouseenter / clears on mouseleave', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1');
    fireEvent.mouseEnter(frame);
    expect(useStore.getState().analystProHoveredZoneId).toBe('z1');
    fireEvent.mouseLeave(frame);
    expect(useStore.getState().analystProHoveredZoneId).toBeNull();
  });

  it('renders 8 edge-hotzone pseudo-element carriers (n/s/e/w + 4 corners)', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1');
    const edges = frame.querySelectorAll('.analyst-pro-zone-frame__edge');
    expect(edges.length).toBe(8);
  });

  it('shows zone.displayName when set, otherwise falls back to inferred label', () => {
    const { rerender } = render(
      <ZoneFrame
        zone={{ ...baseZone, displayName: 'Revenue chart' }}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
      >
        <div />
      </ZoneFrame>,
    );
    expect(screen.getByTestId('zone-frame-z1-name')).toHaveTextContent('Revenue chart');

    rerender(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
      >
        <div />
      </ZoneFrame>,
    );
    expect(screen.getByTestId('zone-frame-z1-name')).toHaveTextContent(/worksheet/i);
  });

  it('fires onContextMenu prop when the frame receives a right-click', () => {
    const onContextMenu = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={onContextMenu}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.contextMenu(screen.getByTestId('zone-frame-z1'));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0][1]).toEqual(baseZone); // (event, zone) signature
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`
Expected: FAIL with `Cannot find module '../ZoneFrame'` (or equivalent resolution error).

- [ ] **Step 3: Create the ZoneFrame component (minimal T3 scope — T4/T5/T6 add inline rename / quick actions / keyboard later)**

Create `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`:

```jsx
// frontend/src/components/dashboard/freeform/ZoneFrame.jsx
import { memo, useCallback } from 'react';
import { useStore } from '../../../store';

/**
 * Zone types whose title bar is shown by default.
 * Per Build_Tableau.md Appendix A.7 DashboardObjectType: worksheet / text /
 * webpage / filter / legend / parameter / navigation / extension all benefit
 * from a named title bar. blank + image default to chrome-less so they don't
 * intrude on static content; users opt in via the zone properties panel (Plan 5d).
 */
const TITLE_BAR_DEFAULT_VISIBLE = new Set([
  'worksheet',
  'text',
  'webpage',
  'filter',
  'legend',
  'parameter',
  'navigation',
  'extension',
]);

/**
 * Fall-back display label when zone.displayName is unset.
 * Keeps the title bar informative for freshly inserted zones.
 */
function inferDisplayName(zone) {
  if (zone.displayName) return zone.displayName;
  const typeLabel = (zone.type || 'zone').replace(/[-_]/g, ' ');
  return `${typeLabel} ${zone.id}`;
}

function shouldShowTitleBar(zone) {
  if (zone?.showTitleBar === false) return false;
  if (zone?.showTitleBar === true) return true;
  return TITLE_BAR_DEFAULT_VISIBLE.has(zone?.type);
}

function EdgeHotzones() {
  return (
    <>
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--n" data-edge="n" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--s" data-edge="s" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--e" data-edge="e" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--w" data-edge="w" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--ne" data-edge="ne" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--nw" data-edge="nw" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--se" data-edge="se" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--sw" data-edge="sw" />
    </>
  );
}

function ZoneFrame({ zone, resolved, children, onContextMenu, onQuickAction }) {
  const setHovered = useStore((s) => s.setAnalystProHoveredZoneId);

  const withTitle = shouldShowTitleBar(zone);
  const label = inferDisplayName(zone);

  const handleMouseEnter = useCallback(() => setHovered(zone.id), [setHovered, zone.id]);
  const handleMouseLeave = useCallback(() => setHovered(null), [setHovered]);
  const handleContextMenu = useCallback(
    (e) => {
      if (typeof onContextMenu === 'function') {
        e.preventDefault();
        onContextMenu(e, zone);
      }
    },
    [onContextMenu, zone],
  );

  // Read onQuickAction off props through the ref in the DOM to avoid eslint no-unused-vars;
  // T5 populates the buttons that actually use it.
  void onQuickAction;

  // resolved is { x, y, width, height } in dashboard coords — exposed for
  // downstream consumers (debug overlay) via data-* attributes.
  return (
    <div
      data-testid={`zone-frame-${zone.id}`}
      data-zone-id={zone.id}
      data-zone-type={zone.type}
      data-resolved-w={resolved?.width ?? 0}
      data-resolved-h={resolved?.height ?? 0}
      className={`analyst-pro-zone-frame${withTitle ? ' analyst-pro-zone-frame--with-title' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role="group"
      aria-label={label}
    >
      {withTitle && (
        <div
          data-testid={`zone-frame-${zone.id}-title`}
          className="analyst-pro-zone-frame__title"
        >
          <span className="analyst-pro-zone-frame__grip" aria-hidden="true">⋮⋮</span>
          <span
            data-testid={`zone-frame-${zone.id}-name`}
            className="analyst-pro-zone-frame__name"
          >
            {label}
          </span>
          {/* Quick-action buttons slot — populated in Plan 5a T5. */}
          <span className="analyst-pro-zone-frame__actions" data-testid={`zone-frame-${zone.id}-actions`} />
        </div>
      )}
      <EdgeHotzones />
      <div className="analyst-pro-zone-frame__body">{children}</div>
    </div>
  );
}

export default memo(ZoneFrame);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/ZoneFrame.jsx frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx
git commit -m "feat(analyst-pro): ZoneFrame skeleton + title bar + hover wiring (Plan 5a T3)"
```

---

### Task 4: Inline display-name editor

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`

Double-click on the `__name` span swaps it for an `<input>` seeded with `label`. Enter commits via `updateZoneAnalystPro(zone.id, { displayName: trimmed })`. Esc cancels (revert). Blur commits (matches Tableau's inline-rename UX). Empty-string commit clears `displayName` back to inferred.

- [ ] **Step 1: Extend the test file with rename cases (write failing first)**

Append to `ZoneFrame.test.tsx` inside a new `describe('ZoneFrame — inline rename', …)` block:

```tsx
describe('ZoneFrame — inline rename', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'd',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [baseZone] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [],
        actions: [],
      },
      analystProHoveredZoneId: null,
    });
  });

  it('double-click on name swaps to an input seeded with current label', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toMatch(/worksheet/i);
  });

  it('Enter commits the new displayName via updateZoneAnalystPro', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Revenue chart' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // editor closes
    expect(screen.queryByTestId('zone-frame-z1-name-input')).toBeNull();
    // store updated
    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName).toBe('Revenue chart');
  });

  it('Esc cancels without writing to store', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByTestId('zone-frame-z1-name-input')).toBeNull();
    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName).toBeUndefined();
  });

  it('empty-string commit clears displayName to fallback', () => {
    // Seed with a name.
    useStore.getState().updateZoneAnalystPro('z1', { displayName: 'Old name' });
    render(
      <ZoneFrame
        zone={{ ...baseZone, displayName: 'Old name' }}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName == null || tree.children[0].displayName === '').toBe(true);
  });

  it('blur commits the new displayName', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Via blur' } });
    fireEvent.blur(input);

    expect(screen.queryByTestId('zone-frame-z1-name-input')).toBeNull();
    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName).toBe('Via blur');
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`
Expected: 5 new tests FAIL (no input element rendered).

- [ ] **Step 3: Replace the ZoneFrame implementation to support inline rename**

Edit `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`. Replace the entire file with:

```jsx
// frontend/src/components/dashboard/freeform/ZoneFrame.jsx
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store';

const TITLE_BAR_DEFAULT_VISIBLE = new Set([
  'worksheet',
  'text',
  'webpage',
  'filter',
  'legend',
  'parameter',
  'navigation',
  'extension',
]);

function inferDisplayName(zone) {
  if (zone.displayName) return zone.displayName;
  const typeLabel = (zone.type || 'zone').replace(/[-_]/g, ' ');
  return `${typeLabel} ${zone.id}`;
}

function shouldShowTitleBar(zone) {
  if (zone?.showTitleBar === false) return false;
  if (zone?.showTitleBar === true) return true;
  return TITLE_BAR_DEFAULT_VISIBLE.has(zone?.type);
}

function EdgeHotzones() {
  return (
    <>
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--n" data-edge="n" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--s" data-edge="s" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--e" data-edge="e" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--w" data-edge="w" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--ne" data-edge="ne" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--nw" data-edge="nw" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--se" data-edge="se" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--sw" data-edge="sw" />
    </>
  );
}

function ZoneFrame({ zone, resolved, children, onContextMenu, onQuickAction }) {
  const setHovered = useStore((s) => s.setAnalystProHoveredZoneId);
  const updateZone = useStore((s) => s.updateZoneAnalystPro);

  const withTitle = shouldShowTitleBar(zone);
  const label = inferDisplayName(zone);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    setDraft(zone.displayName ?? label);
    setEditing(true);
  }, [zone.displayName, label]);

  const commit = useCallback(() => {
    const trimmed = (draft ?? '').trim();
    const nextDisplayName = trimmed.length === 0 ? undefined : trimmed;
    if (nextDisplayName !== zone.displayName) {
      updateZone(zone.id, { displayName: nextDisplayName });
    }
    setEditing(false);
  }, [draft, updateZone, zone.id, zone.displayName]);

  const cancel = useCallback(() => {
    setDraft(zone.displayName ?? label);
    setEditing(false);
  }, [zone.displayName, label]);

  const handleInputKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
      // stop propagation so Enter / Escape don't also hit the frame-level keydown.
      e.stopPropagation();
    },
    [commit, cancel],
  );

  const handleFrameKeyDown = useCallback(
    (e) => {
      // T6 populates F2 / Enter handlers. T4 leaves this as a no-op pass-through.
      void e;
    },
    [],
  );

  const handleMouseEnter = useCallback(() => setHovered(zone.id), [setHovered, zone.id]);
  const handleMouseLeave = useCallback(() => setHovered(null), [setHovered]);
  const handleContextMenu = useCallback(
    (e) => {
      if (typeof onContextMenu === 'function') {
        e.preventDefault();
        onContextMenu(e, zone);
      }
    },
    [onContextMenu, zone],
  );

  void onQuickAction; // populated in T5

  return (
    <div
      data-testid={`zone-frame-${zone.id}`}
      data-zone-id={zone.id}
      data-zone-type={zone.type}
      data-resolved-w={resolved?.width ?? 0}
      data-resolved-h={resolved?.height ?? 0}
      className={`analyst-pro-zone-frame${withTitle ? ' analyst-pro-zone-frame--with-title' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onKeyDown={handleFrameKeyDown}
      tabIndex={0}
      role="group"
      aria-label={label}
    >
      {withTitle && (
        <div
          data-testid={`zone-frame-${zone.id}-title`}
          className="analyst-pro-zone-frame__title"
        >
          <span className="analyst-pro-zone-frame__grip" aria-hidden="true">⋮⋮</span>
          {editing ? (
            <input
              ref={inputRef}
              data-testid={`zone-frame-${zone.id}-name-input`}
              className="analyst-pro-zone-frame__name-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={commit}
              aria-label={`Rename ${label}`}
            />
          ) : (
            <span
              data-testid={`zone-frame-${zone.id}-name`}
              className="analyst-pro-zone-frame__name"
              onDoubleClick={startEdit}
            >
              {label}
            </span>
          )}
          <span className="analyst-pro-zone-frame__actions" data-testid={`zone-frame-${zone.id}-actions`} />
        </div>
      )}
      <EdgeHotzones />
      <div className="analyst-pro-zone-frame__body">{children}</div>
    </div>
  );
}

export default memo(ZoneFrame);
```

- [ ] **Step 4: Run tests to confirm all rename tests pass**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`
Expected: PASS, 12 tests (7 from T3 + 5 from T4).

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/ZoneFrame.jsx frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx
git commit -m "feat(analyst-pro): inline displayName editor in ZoneFrame (Plan 5a T4)"
```

---

### Task 5: Quick-action buttons — ⋯ / ⛶ / ×

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`

Three buttons appear right-aligned in the title bar. `⋯` fires `onQuickAction('menu', zone, event)` and also invokes the `onContextMenu` prop (so the menu UI in 5c can reuse the same hook). `⛶` fires `onQuickAction('fit', zone, event)`. `×` fires `onQuickAction('close', zone, event)`. Hover reveals the action cluster via the `:hover .analyst-pro-zone-frame__actions { opacity: 1 }` rule added in T2.

- [ ] **Step 1: Extend tests (TDD)**

Append to `ZoneFrame.test.tsx`:

```tsx
describe('ZoneFrame — quick-action buttons', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'd',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [baseZone] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [],
        actions: [],
      },
      analystProHoveredZoneId: null,
    });
  });

  it('renders three quick-action buttons in the title bar', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    expect(screen.getByTestId('zone-frame-z1-action-menu')).toBeInTheDocument();
    expect(screen.getByTestId('zone-frame-z1-action-fit')).toBeInTheDocument();
    expect(screen.getByTestId('zone-frame-z1-action-close')).toBeInTheDocument();
  });

  it('menu button fires onContextMenu AND onQuickAction("menu", …)', () => {
    const onContextMenu = vi.fn();
    const onQuickAction = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={onContextMenu}
        onQuickAction={onQuickAction}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.click(screen.getByTestId('zone-frame-z1-action-menu'));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onQuickAction).toHaveBeenCalledWith('menu', baseZone, expect.anything());
  });

  it('fit button fires onQuickAction("fit", …) only', () => {
    const onContextMenu = vi.fn();
    const onQuickAction = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={onContextMenu}
        onQuickAction={onQuickAction}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.click(screen.getByTestId('zone-frame-z1-action-fit'));
    expect(onContextMenu).not.toHaveBeenCalled();
    expect(onQuickAction).toHaveBeenCalledWith('fit', baseZone, expect.anything());
  });

  it('close button fires onQuickAction("close", …)', () => {
    const onQuickAction = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onQuickAction={onQuickAction}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.click(screen.getByTestId('zone-frame-z1-action-close'));
    expect(onQuickAction).toHaveBeenCalledWith('close', baseZone, expect.anything());
  });

  it('clicking a quick-action button does not toggle inline rename', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    fireEvent.click(screen.getByTestId('zone-frame-z1-action-menu'));
    expect(screen.queryByTestId('zone-frame-z1-name-input')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`
Expected: 5 new tests FAIL (buttons not rendered).

- [ ] **Step 3: Add the quick-action button cluster to ZoneFrame**

Edit `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`. Replace the empty `<span className="analyst-pro-zone-frame__actions" …/>` placeholder with the populated cluster, and add the handler logic.

Locate this block:

```jsx
          <span className="analyst-pro-zone-frame__actions" data-testid={`zone-frame-${zone.id}-actions`} />
```

Replace with:

```jsx
          <span className="analyst-pro-zone-frame__actions" data-testid={`zone-frame-${zone.id}-actions`}>
            <button
              type="button"
              className="analyst-pro-zone-frame__action"
              data-testid={`zone-frame-${zone.id}-action-menu`}
              aria-label={`Menu for ${label}`}
              title="More"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onContextMenu === 'function') onContextMenu(e, zone);
                if (typeof onQuickAction === 'function') onQuickAction('menu', zone, e);
              }}
            >
              ⋯
            </button>
            <button
              type="button"
              className="analyst-pro-zone-frame__action"
              data-testid={`zone-frame-${zone.id}-action-fit`}
              aria-label={`Fit to content for ${label}`}
              title="Fit to content"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onQuickAction === 'function') onQuickAction('fit', zone, e);
              }}
            >
              ⛶
            </button>
            <button
              type="button"
              className="analyst-pro-zone-frame__action"
              data-testid={`zone-frame-${zone.id}-action-close`}
              aria-label={`Close ${label}`}
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onQuickAction === 'function') onQuickAction('close', zone, e);
              }}
            >
              ×
            </button>
          </span>
```

Also remove the `void onQuickAction;` line from the body of `ZoneFrame` — it is now referenced by real handlers.

- [ ] **Step 4: Run tests to confirm PASS**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/ZoneFrame.jsx frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx
git commit -m "feat(analyst-pro): quick-action buttons on ZoneFrame (Plan 5a T5)"
```

---

### Task 6: Keyboard navigation — Tab / Enter / F2

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`

Behavior:
- `Tab` — already works because every frame has `tabIndex={0}`; natural DOM order cycles depth-first through tree.
- `F2` — if not already editing, open inline rename (same path as dbl-click).
- `Enter` — if not editing, fire `onContextMenu(e, zone)` so the user can open the zone menu via keyboard.
- `Escape` on the frame (not the input) — blur the frame so focus returns to the canvas.

- [ ] **Step 1: Extend tests (TDD)**

Append to `ZoneFrame.test.tsx`:

```tsx
describe('ZoneFrame — keyboard affordances', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'd',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [baseZone] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [],
        actions: [],
      },
      analystProHoveredZoneId: null,
    });
  });

  it('frame is tabbable (tabIndex=0)', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    expect(screen.getByTestId('zone-frame-z1')).toHaveAttribute('tabindex', '0');
  });

  it('F2 opens the inline rename editor', () => {
    render(
      <ZoneFrame zone={baseZone} resolved={{ x: 0, y: 0, width: 400, height: 300 }}>
        <div />
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1');
    frame.focus();
    fireEvent.keyDown(frame, { key: 'F2' });
    expect(screen.getByTestId('zone-frame-z1-name-input')).toBeInTheDocument();
  });

  it('Enter (when not editing) fires onContextMenu', () => {
    const onContextMenu = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={onContextMenu}
      >
        <div />
      </ZoneFrame>,
    );
    const frame = screen.getByTestId('zone-frame-z1');
    frame.focus();
    fireEvent.keyDown(frame, { key: 'Enter' });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('Enter inside the rename input commits (does not bubble to frame)', () => {
    const onContextMenu = vi.fn();
    render(
      <ZoneFrame
        zone={baseZone}
        resolved={{ x: 0, y: 0, width: 400, height: 300 }}
        onContextMenu={onContextMenu}
      >
        <div />
      </ZoneFrame>,
    );
    fireEvent.doubleClick(screen.getByTestId('zone-frame-z1-name'));
    const input = screen.getByTestId('zone-frame-z1-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Named via F2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onContextMenu).not.toHaveBeenCalled();
    const tree = useStore.getState().analystProDashboard!.tiledRoot as { children: Array<{ id: string; displayName?: string }> };
    expect(tree.children[0].displayName).toBe('Named via F2');
  });
});
```

- [ ] **Step 2: Run tests, confirm F2 / Enter tests fail**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`
Expected: 2 new tests FAIL (F2 does nothing; Enter does nothing). `tabIndex=0` and Enter-inside-input tests already pass from T3/T4.

- [ ] **Step 3: Populate the frame-level keydown handler**

In `ZoneFrame.jsx`, replace the body of `handleFrameKeyDown` with real logic:

```jsx
  const handleFrameKeyDown = useCallback(
    (e) => {
      if (editing) return; // input owns its own keys
      if (e.key === 'F2') {
        e.preventDefault();
        startEdit();
      } else if (e.key === 'Enter') {
        if (typeof onContextMenu === 'function') {
          e.preventDefault();
          onContextMenu(e, zone);
        }
      }
    },
    [editing, startEdit, onContextMenu, zone],
  );
```

- [ ] **Step 4: Run tests to confirm PASS**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/ZoneFrame.jsx frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx
git commit -m "feat(analyst-pro): F2 rename + Enter menu on ZoneFrame (Plan 5a T6)"
```

---

### Task 7: Wire ZoneFrame into AnalystProLayout.renderLeaf

**Files:**
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

Goal: every leaf zone rendered by `ZoneRenderer` (tiled) and `FloatingLayer` (floating) is wrapped in `ZoneFrame`. The existing outer wrapper inside `FreeformCanvas.jsx:198-209` handles pointerdown; ZoneFrame sits INSIDE that wrapper (i.e. is the child returned by `renderLeaf`).

`onQuickAction` and `onContextMenu` are stubbed with `console.debug` in 5a — Plan 5c wires a real menu.

- [ ] **Step 1: Read the current renderLeaf**

Run: `grep -n "renderLeaf\b" frontend/src/components/dashboard/modes/AnalystProLayout.jsx`
Expected: two hits — declaration at line ~62 and prop pass at line ~164.

- [ ] **Step 2: Add the ZoneFrame import**

Edit `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — below the existing `import AnalystProWorksheetTile …` line, add:

```jsx
import ZoneFrame from '../freeform/ZoneFrame';
```

- [ ] **Step 3: Replace the renderLeaf body to wrap output in ZoneFrame**

Locate this block:

```jsx
  const renderLeaf = useMemo(() => {
    return (zone) => {
      if (zone.type === 'worksheet' && zone.worksheetRef) {
        const tile = tiles.find((t) => String(t.id) === zone.worksheetRef);
        if (!tile) return null;
        // Plan 4a: route through the filter-aware wrapper.
        return (
          <AnalystProWorksheetTile
            tile={tile}
            sheetId={zone.worksheetRef}
            onTileClick={onTileClick}
          />
        );
      }
      // Plan 2: text / filter / legend / parameter / image / webpage / blank renderers.
      if (zone.type === 'blank') {
        return <div data-testid={`blank-${zone.id}`} style={{ width: '100%', height: '100%' }} />;
      }
      return null;
    };
  }, [tiles, onTileClick]);
```

Replace with:

```jsx
  const handleQuickAction = useCallback((action, zone, event) => {
    // Plan 5a: quick-action dispatch stub. Plan 5c replaces this with a real
    // context-menu mount; Plan 5d wires 'fit' and 'close' to zone ops.
    void event;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[AnalystPro] quick-action', action, zone?.id);
    }
  }, []);

  const handleZoneContextMenu = useCallback((event, zone) => {
    // Plan 5a: placeholder. Plan 5c mounts the real context menu here and
    // consumes this event.
    void event;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[AnalystPro] context-menu', zone?.id);
    }
  }, []);

  const renderLeaf = useMemo(() => {
    return (zone, resolved) => {
      let content = null;
      if (zone.type === 'worksheet' && zone.worksheetRef) {
        const tile = tiles.find((t) => String(t.id) === zone.worksheetRef);
        if (tile) {
          content = (
            <AnalystProWorksheetTile
              tile={tile}
              sheetId={zone.worksheetRef}
              onTileClick={onTileClick}
            />
          );
        }
      } else if (zone.type === 'blank') {
        content = <div data-testid={`blank-${zone.id}`} style={{ width: '100%', height: '100%' }} />;
      }

      return (
        <ZoneFrame
          zone={zone}
          resolved={resolved}
          onQuickAction={handleQuickAction}
          onContextMenu={handleZoneContextMenu}
        >
          {content}
        </ZoneFrame>
      );
    };
  }, [tiles, onTileClick, handleQuickAction, handleZoneContextMenu]);
```

- [ ] **Step 4: Add the `useCallback` import if not already present**

Run: `grep -n "useCallback" frontend/src/components/dashboard/modes/AnalystProLayout.jsx`
Expected: after edit, at least one import hit. If missing, extend the existing `import { useMemo } from 'react';` line to `import { useCallback, useMemo } from 'react';`.

- [ ] **Step 5: Run the AnalystProLayout integration tests to confirm no regression**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`
Expected: PASS for all existing tests. (The outer pointer-wrapper in `FreeformCanvas.jsx` still fires `onZonePointerDown`; ZoneFrame is a nested child and does not intercept pointerdown.)

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): wrap renderLeaf output in ZoneFrame (Plan 5a T7)"
```

---

### Task 8: Extend FreeformCanvas integration test — hover outline + edge hotzones

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`

Prove end-to-end that a zone rendered via `AnalystProLayout` through `FreeformCanvas` exposes the `.analyst-pro-zone-frame` wrapper, that its 8 edge hotzones are present, and that hovering updates `analystProHoveredZoneId`.

- [ ] **Step 1: Inspect current test file structure**

Run: `grep -n "describe\|it(" frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx | head -20`
Expected: existing describe blocks like `describe('FreeformCanvas integration', …)`. Identify the final test in the file.

- [ ] **Step 2: Append new integration cases**

Append this block at the end of `FreeformCanvas.integration.test.tsx` (before the trailing file close):

```tsx
describe('FreeformCanvas integration — ZoneFrame (Plan 5a)', () => {
  it('renders a ZoneFrame wrapper around every leaf zone', () => {
    const tiles = [
      { id: 'w1', chart_spec: { mark: 'bar' }, question: 'q', sql: 'SELECT 1' },
      { id: 'w2', chart_spec: { mark: 'line' }, question: 'q', sql: 'SELECT 1' },
    ];
    render(
      <AnalystProLayout
        tiles={tiles}
        dashboardId="d1"
        dashboardName="d"
        size={{ mode: 'fixed', preset: 'desktop' }}
      />,
    );
    expect(document.querySelectorAll('.analyst-pro-zone-frame').length).toBeGreaterThanOrEqual(2);
  });

  it('each ZoneFrame exposes 8 edge hotzones', () => {
    const tiles = [{ id: 'w1', chart_spec: { mark: 'bar' }, question: 'q', sql: 'SELECT 1' }];
    render(
      <AnalystProLayout
        tiles={tiles}
        dashboardId="d1"
        dashboardName="d"
        size={{ mode: 'fixed', preset: 'desktop' }}
      />,
    );
    const frame = document.querySelector('.analyst-pro-zone-frame');
    expect(frame).not.toBeNull();
    expect(frame!.querySelectorAll('.analyst-pro-zone-frame__edge').length).toBe(8);
  });

  it('hovering a zone sets analystProHoveredZoneId in the store', () => {
    const tiles = [{ id: 'w1', chart_spec: { mark: 'bar' }, question: 'q', sql: 'SELECT 1' }];
    render(
      <AnalystProLayout
        tiles={tiles}
        dashboardId="d1"
        dashboardName="d"
        size={{ mode: 'fixed', preset: 'desktop' }}
      />,
    );
    const frame = document.querySelector('.analyst-pro-zone-frame') as HTMLElement;
    expect(frame).not.toBeNull();
    fireEvent.mouseEnter(frame);
    const zoneId = frame.getAttribute('data-zone-id');
    expect(useStore.getState().analystProHoveredZoneId).toBe(zoneId);
    fireEvent.mouseLeave(frame);
    expect(useStore.getState().analystProHoveredZoneId).toBeNull();
  });
});
```

If the file does not already import `AnalystProLayout`, `fireEvent`, or `useStore`, extend the existing imports at the top of the file:

```tsx
import AnalystProLayout from '../../modes/AnalystProLayout';
import { fireEvent, render } from '@testing-library/react';
import { useStore } from '../../../../store';
```

(Keep existing imports intact — merge, do not replace.)

- [ ] **Step 3: Run the integration test file**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`
Expected: PASS (all pre-existing cases + 3 new cases).

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx
git commit -m "test(analyst-pro): FreeformCanvas ZoneFrame hover + edge hotzones (Plan 5a T8)"
```

---

### Task 9: Smoke — full test run + lint + build

**Files:** (verification only — no code changes unless fixups needed)

- [ ] **Step 1: Run the full chart-ir / freeform test suite**

Run: `cd "QueryCopilot V1/frontend" && npm run test:chart-ir`
Expected: PASS. Baseline failure count (per `QueryCopilot V1/CLAUDE.md` Known Test Debt) ≈ 22 pre-existing chart-ir failures in `router.test.ts`, `renderStrategyRouter.test.ts`, `editor/*.test.tsx`. Plan 5a must not increase that count. Confirm new failures = 0 by diffing the failure list vs. a baseline run from `main`.

- [ ] **Step 2: Lint**

Run: `cd "QueryCopilot V1/frontend" && npm run lint`
Expected: no new warnings in files touched by this plan (`ZoneFrame.jsx`, `AnalystProLayout.jsx`, `store.js`, `ZoneFrame.test.tsx`, `FreeformCanvas.integration.test.tsx`). Note: the ESLint flat config ignores unused vars matching `^[A-Z_]` (per `CLAUDE.md`); the `void onContextMenu` guards are safe.

- [ ] **Step 3: Build**

Run: `cd "QueryCopilot V1/frontend" && npm run build`
Expected: build completes with no new TypeScript errors. Expected existing warnings (bundle chunk sizes, framer-motion) are OK; only regressions fail the gate.

- [ ] **Step 4: Fixup commit if lint / build surfaced any issue**

If any of Steps 1–3 surfaced an issue introduced by this plan, fix inline and commit as:

```bash
cd "QueryCopilot V1"
git add <touched files>
git commit -m "fix(analyst-pro): <short description> (Plan 5a T9 fixup)"
```

If Steps 1–3 are clean, skip the commit.

- [ ] **Step 5: Manual smoke (optional if tests green)**

Run: `cd "QueryCopilot V1/frontend" && npm run dev` and navigate to `/analytics` → switch to Analyst Pro archetype. Verify:
1. Hovering a zone shows a 1px blue outline.
2. Hovering zone edges shows `ns-resize` / `ew-resize` / corner cursors.
3. Dbl-clicking the title name swaps to an input; Enter saves; Esc cancels.
4. ⋯ / ⛶ / × buttons fade in on hover; clicking logs to console.
5. F2 on a focused frame opens rename; Enter opens the (stub) context-menu log.

---

## Self-Review

**Spec coverage (roadmap §5a deliverables):**

| Roadmap item | Task(s) |
|---|---|
| 1. `ZoneFrame.jsx` wraps any leaf zone — props `zone`, `resolved`, `renderContent` (we use `children` — equivalent), `onContextMenu`, `onQuickAction` — title bar + border + hover outline + grip + hover-reveal quick actions — CSS-only hover | T2, T3, T4, T5 |
| 2. Hover cursor + outline on body; 4px edge hotzones with `ns/ew/nwse/nesw-resize` via CSS pseudo-elements | T2 (CSS), T3 (8 edge divs) |
| 3. Title bar 24px strip — grip `⋮⋮` + editable `displayName` + hover-reveal `⋯`/`⛶`/`×`; shown on worksheet/text/webpage, hidden on blank/image by default | T3 (default rule), T4 (rename), T5 (actions) |
| 4. Store fields — `analystProHoveredZoneId` + `setAnalystProHoveredZoneId` | T1 |
| 5. Extend `renderLeaf` in `AnalystProLayout.jsx` to wrap every leaf in ZoneFrame | T7 |
| 6. Keyboard — Tab cycles, Enter opens context menu, F2 opens rename | T6 (F2 + Enter); Tab intrinsic via `tabIndex=0` on every frame |

**Build_Tableau.md citations honored:**
- §IX.1 BaseZone shape — ZoneFrame reads `zone.id`, `zone.type`, `zone.displayName`; no new wire fields.
- §IX.6 StyledBox — T2's CSS scaffolds border/background application; Plan 5d supplies values.
- Appendix A.7 — `TITLE_BAR_DEFAULT_VISIBLE` maps worksheet/text/webpage/filter/legend/parameter/navigation/extension → visible; blank/image → hidden.
- Appendix E.15 visibility rule — `ZoneRenderer.jsx:31` evaluates `evaluateRule` before invoking `renderLeaf`, so ZoneFrame is never rendered for a hidden zone. No duplicate evaluation needed.

**Placeholder scan:** Every code step ships complete code. No "TBD" / "similar to Task N" / vague "add error handling". Quick-action stubs (`fit`, `close`) are intentionally documented as deferred to Plan 5c/5d — not placeholder code.

**Type consistency:** `onContextMenu(event, zone)` signature is used everywhere (T3 tests, T5 button handlers, T6 keyboard handler, T7 wiring). `onQuickAction(action, zone, event)` signature consistent across T5 buttons + T7 parent stub. `analystProHoveredZoneId: string | null` consistent between T1 setter and T3/T8 test assertions.

**Test coverage:** 21 unit tests on ZoneFrame (T3 + T4 + T5 + T6). 3 integration tests on FreeformCanvas (T8). 9 commits (one per task, T9 may be 0 fixups).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5a-zone-chrome.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task (T1 → T9), review between tasks, fast iteration. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in a single session with checkpoints. Use `superpowers:executing-plans`.
