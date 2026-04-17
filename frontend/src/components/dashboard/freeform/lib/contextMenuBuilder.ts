// Pure helper that produces the right-click menu catalogue for Analyst Pro zones.
// Mirrors Tableau's tabuiactions ↔ tabdocactions split (Build_Tableau.md §XI.9):
// this module is the headless model; ContextMenu.jsx is the UI.
//
// Commands that require store actions not yet implemented (Plan 5d / 5e) carry
// a `todo` field so the dispatcher in ContextMenu.jsx logs a single debug line
// instead of crashing.

import type { ContainerZone, Dashboard, Zone } from './types';
import { isContainer } from './zoneTree';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  if (zone == null) {
    return buildCanvasEmptyMenu();
  }
  // Task 3–6 fill these branches.
  return [];
}

function buildCanvasEmptyMenu(): MenuItem[] {
  // Filled in Task 6.
  return [{ kind: 'command', id: 'canvas.paste', label: 'Paste', shortcut: '⌘V' }];
}
