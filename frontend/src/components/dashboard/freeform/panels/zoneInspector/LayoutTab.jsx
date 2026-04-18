import React from 'react';
import {
  DEFAULT_INNER_PADDING,
  DEFAULT_OUTER_PADDING,
  DEFAULT_FIT_MODE,
} from '../../lib/zoneDefaults';
import { useStore } from '../../../../../store';
import { findResizeTarget } from '../../lib/findResizeTarget';

const FIT_MODES = [
  { value: 'fit',        label: 'Fit' },
  { value: 'fit-width',  label: 'Fit Width' },
  { value: 'fit-height', label: 'Fit Height' },
  { value: 'entire',     label: 'Entire View' },
  { value: 'fixed',      label: 'Fixed' },
];

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export default function LayoutTab({ zone, onPatch }) {
  const isFloating = zone.floating === true;
  const innerPadding = typeof zone.innerPadding === 'number' ? zone.innerPadding : DEFAULT_INNER_PADDING;
  const outerPadding = typeof zone.outerPadding === 'number' ? zone.outerPadding : DEFAULT_OUTER_PADDING;
  const fitMode = zone.fitMode || DEFAULT_FIT_MODE;

  const patchInner = (v) => onPatch({ innerPadding: clamp(Number(v), 0, 100) });
  const patchOuter = (v) => onPatch({ outerPadding: clamp(Number(v), 0, 100) });

  // Plan 7 T15 — tiled resize goes through a dedicated store action so
  // sibling proportions renormalize to sum === 100000 (the invariant).
  // setZonePropertyAnalystPro (onPatch) would break that by patching only
  // the one child's w/h and leaving siblings unchanged.
  //
  // Plan 7 T19 — target the ancestor whose parent splits along the axis
  // being resized. A leaf inside a horz row can only change its own h if
  // we resize the ROW's h in the vert grandparent; resizing the leaf's h
  // is a no-op because horz-parent axis === 'w'. Symmetric for w.
  const resizeZoneAnalystPro = useStore((s) => s.resizeZoneAnalystPro);
  const detachTileToFloat = useStore((s) => s.detachTileToFloatAnalystPro);
  const tiledRoot = useStore((s) => s.analystProDashboard?.tiledRoot);
  const dashSize = useStore((s) => s.analystProDashboard?.size);

  // Plan 7 T19 — find the actual zone that holds the proportional value
  // for each axis, and report its current percentage in the input.
  const wTargetId = !isFloating && tiledRoot ? (findResizeTarget(tiledRoot, zone.id, 'w') ?? zone.id) : null;
  const hTargetId = !isFloating && tiledRoot ? (findResizeTarget(tiledRoot, zone.id, 'h') ?? zone.id) : null;
  const findInTree = (t, id) => {
    if (!t || !id) return null;
    if (t.id === id) return t;
    for (const c of t.children ?? []) {
      const f = findInTree(c, id);
      if (f) return f;
    }
    return null;
  };
  const wZone = findInTree(tiledRoot, wTargetId) || zone;
  const hZone = findInTree(tiledRoot, hTargetId) || zone;

  // Plan 8 T25 — detect whether a per-axis edit would inevitably resize
  // siblings. If the resize target is an ancestor (not the leaf itself)
  // AND that ancestor's parent splits along the OTHER axis (so the
  // ancestor's siblings share this axis), the edit grows every sibling
  // — the "whole row shifts" bug. In that case, move the tile to the
  // floating layer where each tile has independent pxW/pxH.
  const findParent = (t, id, parent = null) => {
    if (!t || !id) return null;
    if (t.id === id) return parent;
    for (const c of t.children ?? []) {
      const f = findParent(c, id, t);
      if (f !== null) return f;
    }
    return null;
  };
  const leafParent = findParent(tiledRoot, zone.id);
  const wEditAffectsSiblings = !isFloating && wTargetId && wTargetId !== zone.id && leafParent?.type === 'container-vert' && (leafParent.children?.length ?? 0) > 1;
  const hEditAffectsSiblings = !isFloating && hTargetId && hTargetId !== zone.id && leafParent?.type === 'container-horz' && (leafParent.children?.length ?? 0) > 1;

  // Resolve canvas px for detach fallback (derive current tile px from
  // its leaf proportion + canvas size).
  const canvasWPx = dashSize?.mode === 'fixed' ? dashSize.width : 1440;
  const canvasHPx = dashSize?.mode === 'fixed' ? dashSize.height : 900;

  const patchTiledWidth = (v) => {
    const pct = clamp(Number(v), 1, 99);
    if (wEditAffectsSiblings) {
      // Detach so each tile gets independent pxW.
      const pxW = Math.round((pct / 100) * canvasWPx);
      const pxH = Math.round(((zone.h || 100000) / 100000) * canvasHPx);
      detachTileToFloat(zone.id, { pxW, pxH });
      return;
    }
    if (!wTargetId) return;
    resizeZoneAnalystPro(wTargetId, { w: pct * 1000 });
  };
  const patchTiledHeight = (v) => {
    const pct = clamp(Number(v), 1, 99);
    if (hEditAffectsSiblings) {
      // Detach so each tile gets independent pxH.
      const pxW = Math.round(((zone.w || 100000) / 100000) * canvasWPx);
      const pxH = Math.round((pct / 100) * canvasHPx);
      detachTileToFloat(zone.id, { pxW, pxH });
      return;
    }
    if (!hTargetId) return;
    resizeZoneAnalystPro(hTargetId, { h: pct * 1000 });
  };

  return (
    <div data-testid="zone-properties-layout-tab" className="analyst-pro-zone-inspector__body">
      <label style={lblStyle} aria-label="Position">
        Position
        <span style={readonlyStyle}>{isFloating ? `floating (${zone.x ?? 0}, ${zone.y ?? 0})` : 'tiled'}</span>
      </label>

      {isFloating ? (
        <>
          <label style={lblStyle}>
            X (px)
            <input
              aria-label="X (px)"
              type="number"
              value={zone.x ?? 0}
              onChange={(e) => onPatch({ x: Number(e.target.value) || 0 })}
              style={inputStyle}
            />
          </label>
          <label style={lblStyle}>
            Y (px)
            <input
              aria-label="Y (px)"
              type="number"
              value={zone.y ?? 0}
              onChange={(e) => onPatch({ y: Number(e.target.value) || 0 })}
              style={inputStyle}
            />
          </label>
          <label style={lblStyle}>
            Width (px)
            <input
              aria-label="Width (px)"
              type="number"
              value={zone.pxW ?? 0}
              onChange={(e) => onPatch({ pxW: Math.max(20, Number(e.target.value) || 0) })}
              style={inputStyle}
            />
          </label>
          <label style={lblStyle}>
            Height (px)
            <input
              aria-label="Height (px)"
              type="number"
              value={zone.pxH ?? 0}
              onChange={(e) => onPatch({ pxH: Math.max(20, Number(e.target.value) || 0) })}
              style={inputStyle}
            />
          </label>
        </>
      ) : (
        <>
          <label style={lblStyle}>
            Width %
            <input
              aria-label="Width %"
              type="number"
              min={1}
              max={99}
              value={Math.round((wZone.w || 0) / 1000)}
              onChange={(e) => patchTiledWidth(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={lblStyle}>
            Height %
            <input
              aria-label="Height %"
              type="number"
              min={1}
              max={99}
              value={Math.round((hZone.h || 0) / 1000)}
              onChange={(e) => patchTiledHeight(e.target.value)}
              style={inputStyle}
            />
          </label>
        </>
      )}

      <label style={lblStyle}>
        Size Mode
        <select
          aria-label="Size Mode"
          value={fitMode}
          onChange={(e) => onPatch({ fitMode: e.target.value })}
          style={inputStyle}
        >
          {FIT_MODES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </label>

      <label style={lblStyle}>
        Inner Padding
        <input
          aria-label="Inner Padding"
          type="range"
          min={0}
          max={100}
          value={innerPadding}
          onChange={(e) => patchInner(e.target.value)}
          style={inputStyle}
        />
        <span style={readonlyStyle}>{innerPadding} px</span>
      </label>

      <label style={lblStyle}>
        Outer Padding
        <input
          aria-label="Outer Padding"
          type="range"
          min={0}
          max={100}
          value={outerPadding}
          onChange={(e) => patchOuter(e.target.value)}
          style={inputStyle}
        />
        <span style={readonlyStyle}>{outerPadding} px</span>
      </label>
    </div>
  );
}

const lblStyle = { fontSize: 11, opacity: 0.7, display: 'flex', flexDirection: 'column', gap: 2 };
const inputStyle = {
  padding: 4,
  fontSize: 12,
  background: 'var(--bg-input, #0b0b10)',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
  borderRadius: 3,
};
const readonlyStyle = { fontSize: 11, opacity: 0.6 };
