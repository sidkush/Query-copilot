// frontend/src/components/dashboard/freeform/lib/deviceLayout.ts
//
// Plan 6a — Device-layout overrides.
//
// Matches Tableau's DashboardDeviceLayout semantics (Build_Tableau.md §IX.5,
// Appendix A.13, E.15): Tablet/Phone inherit from the base (Desktop) tree and
// layer a sparse per-zone override on top. We never rebuild the tree. Setting
// `visible: false` is our equivalent of Tableau's HiddenByUser flag — the
// data pipeline still runs (zone stays in worksheets[], still resolved for
// layout), only the renderer skips it (ZoneFrame reads the `hidden` prop).
//
// All operations are pure: the input dashboard is never mutated.
import type { DashboardDeviceLayout, ZoneOverride } from './types';

type Dash = any;
type Zone = any;

const DEVICE_PRESETS: Record<Exclude<DashboardDeviceLayout, 'desktop'>, {
  mode: 'fixed';
  preset: string;
  width: number;
  height: number;
}> = {
  tablet: { mode: 'fixed', preset: 'ipad-landscape', width: 1024, height: 768 },
  phone: { mode: 'fixed', preset: 'phone', width: 375, height: 667 },
};

export function resolveDeviceCanvasSize(baseSize: any, device: DashboardDeviceLayout): any {
  if (device === 'desktop') return baseSize;
  return DEVICE_PRESETS[device];
}

export function applyDeviceOverrides(dashboard: Dash, device: DashboardDeviceLayout): Dash {
  if (device === 'desktop') return dashboard;
  const layouts = dashboard?.deviceLayouts;
  const override = layouts?.[device];
  if (!override || !override.zoneOverrides) return dashboard;
  const zoneOverrides = override.zoneOverrides as Record<string, ZoneOverride>;

  const nextTiled = applyToTree(dashboard.tiledRoot, zoneOverrides);
  const nextFloating = (dashboard.floatingLayer || []).map((z: Zone) => applyToFloating(z, zoneOverrides[z.id]));

  return { ...dashboard, tiledRoot: nextTiled, floatingLayer: nextFloating };
}

function applyToTree(node: Zone, zoneOverrides: Record<string, ZoneOverride>): Zone {
  const ov = zoneOverrides[node.id];
  const children = Array.isArray(node.children)
    ? node.children.map((c: Zone) => applyToTree(c, zoneOverrides))
    : undefined;
  if (!ov && !children) return node;
  const next = children ? { ...node, children } : { ...node };
  if (ov) {
    if (ov.w !== undefined) next.w = ov.w;
    if (ov.h !== undefined) next.h = ov.h;
    if (ov.visible === false) next.hidden = true;
    else if (ov.visible === true) next.hidden = false;
  }
  return next;
}

function applyToFloating(zone: Zone, ov: ZoneOverride | undefined): Zone {
  if (!ov) return zone;
  const next = { ...zone };
  if (ov.x !== undefined) next.x = ov.x;
  if (ov.y !== undefined) next.y = ov.y;
  if (ov.w !== undefined) next.pxW = ov.w;
  if (ov.h !== undefined) next.pxH = ov.h;
  if (ov.visible === false) next.hidden = true;
  else if (ov.visible === true) next.hidden = false;
  return next;
}
