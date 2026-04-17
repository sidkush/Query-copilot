// Pure helper that produces the right-click menu catalogue for Analyst Pro zones.
// Mirrors Tableau's tabuiactions ↔ tabdocactions split (Build_Tableau.md §XI.9):
// this module is the headless model; ContextMenu.jsx is the UI.
//
// Commands that require store actions not yet implemented (Plan 5d / 5e) carry
// a `todo` field so the dispatcher in ContextMenu.jsx logs a single debug line
// instead of crashing.

import type { ContainerZone, Dashboard, Zone } from './types';
import { isContainer } from './zoneTree';
import { defaultShowTitle, isFloatingZone } from './zoneDefaults';

export type MenuCommandId =
  // ---------------- Plan 5c wired commands (existing store actions) ----------------
  | 'deselect'
  | 'selectParent'
  | 'toggleShowTitle'
  | 'toggleShowCaption'
  | 'copy'
  | 'paste'
  | 'openActionsDialog'
  | 'removeContainerUnwrap'         // ungroupAnalystPro
  // ---------------- Plan 5d TODO (setZoneProperty / removeZone / setFitMode) -------
  | 'setFitMode.fit'
  | 'setFitMode.fitWidth'
  | 'setFitMode.fitHeight'
  | 'setFitMode.entireView'
  | 'setFitMode.fixed'
  | 'openProperties.style.background'
  | 'openProperties.style.border'
  | 'openProperties.layout.innerPadding'
  | 'openProperties.layout.outerPadding'
  | 'remove'                         // removeZoneAnalystPro — preserves visibilityRule
  | 'swapSheets'
  // ---------------- Plan 5e TODO (float / z-order / container commands) -----------
  | 'toggleFloat'
  | 'bringForward'
  | 'sendBackward'
  | 'bringToFront'
  | 'sendToBack'
  | 'distributeEvenly'
  | 'fitContainerToContent'
  // ---------------- Canvas-empty ---------------------------------------------------
  | 'canvas.paste'
  | 'canvas.addText'
  | 'canvas.addImage'
  | 'canvas.addBlank'
  // ---------------- Filter submenu placeholder (Plan 7a real enumeration) ----------
  | 'openFilters';

export type TodoRef = { plan: '5d' | '5e' | '7a'; reason: string };

export type MenuItem =
  | {
      kind: 'command';
      id: MenuCommandId;
      label: string;
      shortcut?: string;
      disabled?: boolean;
      todo?: TodoRef;
    }
  | {
      kind: 'checkbox';
      id: MenuCommandId;
      label: string;
      checked: boolean;
      disabled?: boolean;
      todo?: TodoRef;
    }
  | {
      kind: 'submenu';
      id: string;
      label: string;
      items: MenuItem[];
      disabled?: boolean;
    }
  | { kind: 'separator' };

const SEP: MenuItem = { kind: 'separator' };

// ----- Pure helpers (exported for tests) ------------------------------------

/** Returns the direct parent container id of `zoneId`, or null if the zone is the
 *  root container or is not found. Floating zones return null (they have no
 *  tiled parent; the "Select Parent" action is tiled-only in Plan 5c scope). */
export function findParentZoneId(root: ContainerZone, zoneId: string): string | null {
  if (!root || root.id === zoneId) return null;
  const walk = (container: ContainerZone): string | null => {
    for (const child of container.children) {
      if (child.id === zoneId) return container.id;
      if (isContainer(child)) {
        const hit = walk(child);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(root);
}

/** Clamp a menu's top-left (x, y) so the menu of size (w, h) stays inside the
 *  (viewportW, viewportH) rect. Overflow on the right → flip to x-w. Overflow on
 *  the bottom → flip to y-h. If the menu is larger than the viewport, pin to 0. */
export function clampToViewport(
  x: number, y: number, w: number, h: number, viewportW: number, viewportH: number,
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (w >= viewportW) nx = 0;
  else if (nx + w > viewportW) nx = Math.max(0, nx - w);
  if (h >= viewportH) ny = 0;
  else if (ny + h > viewportH) ny = Math.max(0, ny - h);
  return { x: nx, y: ny };
}

// ----- Public builder -------------------------------------------------------

export function buildContextMenu(
  zone: Zone | null,
  dashboard: Dashboard | null,
  selection: ReadonlySet<string>,
): MenuItem[] {
  if (!dashboard) return [];
  if (zone == null) return buildCanvasEmptyMenu();

  const items: MenuItem[] = [];
  appendCommonHead(items, zone, dashboard);
  // Tasks 4 + 5 inject worksheet-specific / container-specific items here.
  appendWorksheetExtras(items, zone);
  appendContainerExtras(items, zone, dashboard);
  appendFloatingExtras(items, zone);
  appendCommonTail(items, zone, dashboard, selection);
  return items;
}

function appendFloatingExtras(items: MenuItem[], zone: Zone): void {
  if (!isFloatingZone(zone)) return;
  items.push(SEP);
  items.push({
    kind: 'submenu',
    id: 'zOrder',
    label: 'Z-Order',
    items: [
      { kind: 'command', id: 'bringForward',  label: 'Bring Forward',   todo: { plan: '5e', reason: 'Float z-order actions land in Plan 5e.' } },
      { kind: 'command', id: 'sendBackward',  label: 'Send Backward',   todo: { plan: '5e', reason: 'Float z-order actions land in Plan 5e.' } },
      { kind: 'command', id: 'bringToFront',  label: 'Bring to Front',  todo: { plan: '5e', reason: 'Float z-order actions land in Plan 5e.' } },
      { kind: 'command', id: 'sendToBack',    label: 'Send to Back',    todo: { plan: '5e', reason: 'Float z-order actions land in Plan 5e.' } },
    ],
  });
}

function appendWorksheetExtras(items: MenuItem[], zone: Zone): void {
  if (zone.type !== 'worksheet') return;

  // Inserted after the common head's Show Title checkbox, before Deselect.
  // Show Caption lives next to Show Title for visual grouping.
  items.push({
    kind: 'checkbox',
    id: 'toggleShowCaption',
    label: 'Show Caption',
    checked: (zone as { showCaption?: boolean }).showCaption === true,
  });

  items.push(SEP);

  items.push({
    kind: 'command',
    id: 'swapSheets',
    label: 'Swap Sheets…',
    todo: { plan: '5d', reason: 'Swap-sheets dialog lands with Plan 5d property-panel rewrite.' },
  });

  items.push({
    kind: 'submenu',
    id: 'filter',
    label: 'Filter',
    items: [
      // Plan 7a will enumerate marks-card fields here (Build_Tableau.md Part VII).
      {
        kind: 'command',
        id: 'openFilters',
        label: '(no filters configured — open Filters panel…)',
        todo: { plan: '7a', reason: 'Per-sheet marks-card filter enumeration ships with VizQL Plan 7a.' },
      },
    ],
  });

  items.push({
    kind: 'command',
    id: 'openActionsDialog',
    label: 'Actions…',
  });
}

function appendContainerExtras(items: MenuItem[], zone: Zone, dashboard: Dashboard): void {
  if (!isContainer(zone)) return;
  items.push(SEP);
  items.push({
    kind: 'command',
    id: 'distributeEvenly',
    label: 'Distribute Evenly',
    disabled: zone.children.length < 2,
    todo: { plan: '5e', reason: 'distributeEvenlyAnalystPro lands in Plan 5e.' },
  });
  items.push({
    kind: 'command',
    id: 'fitContainerToContent',
    label: 'Fit Container to Content',
    todo: { plan: '5e', reason: 'fitContainerToContentAnalystPro lands in Plan 5e.' },
  });
  const isRoot = dashboard.tiledRoot.id === zone.id;
  items.push({
    kind: 'command',
    id: 'removeContainerUnwrap',
    label: 'Remove Container',
    disabled: isRoot,
    // Dispatcher wires this to existing ungroupAnalystPro(containerId) (store.js:1017).
  });
}

function appendCommonHead(items: MenuItem[], zone: Zone, _dashboard: Dashboard): void {
  items.push({
    kind: 'checkbox',
    id: 'toggleFloat',
    label: 'Floating',
    checked: isFloatingZone(zone),
    todo: { plan: '5e', reason: 'toggleZoneFloatAnalystPro lands in Plan 5e.' },
  });

  items.push(SEP);

  items.push({
    kind: 'submenu',
    id: 'fit',
    label: 'Fit',
    items: [
      { kind: 'command', id: 'setFitMode.fit',        label: 'Fit' },
      { kind: 'command', id: 'setFitMode.fitWidth',   label: 'Fit Width' },
      { kind: 'command', id: 'setFitMode.fitHeight',  label: 'Fit Height' },
      { kind: 'command', id: 'setFitMode.entireView', label: 'Entire View' },
      { kind: 'command', id: 'setFitMode.fixed',      label: 'Fixed Pixels…' },
    ],
  });

  items.push(SEP);

  items.push({
    kind: 'command',
    id: 'openProperties.style.background',
    label: 'Background…',
  });
  items.push({
    kind: 'command',
    id: 'openProperties.style.border',
    label: 'Border…',
  });
  items.push({
    kind: 'submenu',
    id: 'padding',
    label: 'Padding',
    items: [
      { kind: 'command', id: 'openProperties.layout.innerPadding', label: 'Inner Padding…' },
      { kind: 'command', id: 'openProperties.layout.outerPadding', label: 'Outer Padding…' },
    ],
  });

  items.push(SEP);

  const showTitleDefault = defaultShowTitle(zone);
  // Plan 5d: `showTitle` is the authoritative field; legacy fixtures may
  // still carry `showTitleBar` — honour either.
  const legacyShow = (zone as { showTitleBar?: boolean }).showTitleBar;
  const showTitleChecked = zone.showTitle ?? legacyShow ?? showTitleDefault;
  items.push({
    kind: 'checkbox',
    id: 'toggleShowTitle',
    label: 'Show Title',
    checked: showTitleChecked,
  });
}

function appendCommonTail(
  items: MenuItem[], zone: Zone, dashboard: Dashboard, _selection: ReadonlySet<string>,
): void {
  items.push(SEP);
  items.push({ kind: 'command', id: 'deselect', label: 'Deselect' });
  const parentId = findParentZoneId(dashboard.tiledRoot, zone.id);
  items.push({
    kind: 'command',
    id: 'selectParent',
    label: 'Select Parent Container',
    disabled: parentId == null,
  });

  items.push(SEP);
  items.push({ kind: 'command', id: 'copy',  label: 'Copy',  shortcut: '⌘C' });
  items.push({ kind: 'command', id: 'paste', label: 'Paste', shortcut: '⌘V' });

  items.push(SEP);
  items.push({
    kind: 'command',
    id: 'remove',
    label: 'Remove from Dashboard',
    shortcut: 'Del',
    todo: { plan: '5d', reason: 'removeZoneAnalystPro lands in Plan 5d (preserves zone.visibilityRule per Appendix E.15).' },
  });
}

function buildCanvasEmptyMenu(): MenuItem[] {
  return [
    { kind: 'command', id: 'canvas.paste',    label: 'Paste',     shortcut: '⌘V' },
    SEP,
    { kind: 'command', id: 'canvas.addText',  label: 'Add Text'  },
    { kind: 'command', id: 'canvas.addImage', label: 'Add Image' },
    { kind: 'command', id: 'canvas.addBlank', label: 'Add Blank' },
  ];
}
