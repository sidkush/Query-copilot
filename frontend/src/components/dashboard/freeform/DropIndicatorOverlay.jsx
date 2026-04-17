// frontend/src/components/dashboard/freeform/DropIndicatorOverlay.jsx
import { useStore } from '../../../store';

/**
 * Presentational overlay — reads analystProDragState and renders:
 *   - 3 px blue bar between sibling slots when targetContainerId + targetIndex set.
 *   - 6 px edge highlight on the nearest side of a leaf when dropEdge is top/bottom/left/right.
 *   - Dashed ring over a leaf when dropEdge === 'center'.
 *   - 1 px amber dashed guide lines from activeGuides.
 *
 * Coordinate space matches `.freeform-sheet` (0,0 at top-left). Uses
 * `resolvedList` from layoutResolver to look up container + child rects.
 */
export default function DropIndicatorOverlay({ resolvedList }) {
  const drag = useStore((s) => s.analystProDragState);
  if (!drag) return null;

  const byId = new Map();
  for (const r of resolvedList || []) byId.set(r.zone.id, r);

  // Bar between siblings inside a container drop.
  let bar = null;
  if (drag.targetContainerId && drag.targetIndex != null && !drag.dropEdge) {
    const container = byId.get(drag.targetContainerId);
    const t = container?.zone?.type;
    if (container && t && t.startsWith('container-') && container.zone.children) {
      const isHorz = t === 'container-horz';
      const children = container.zone.children;
      const idx = Math.max(0, Math.min(drag.targetIndex, children.length));
      const BAR = 3;
      if (isHorz) {
        let x;
        if (idx === 0) x = container.x;
        else if (idx >= children.length) x = container.x + container.width - BAR;
        else {
          const prev = byId.get(children[idx - 1].id);
          x = prev ? prev.x + prev.width - BAR / 2 : container.x;
        }
        bar = { x, y: container.y, width: BAR, height: container.height };
      } else {
        let y;
        if (idx === 0) y = container.y;
        else if (idx >= children.length) y = container.y + container.height - BAR;
        else {
          const prev = byId.get(children[idx - 1].id);
          y = prev ? prev.y + prev.height - BAR / 2 : container.y;
        }
        bar = { x: container.x, y, width: container.width, height: BAR };
      }
    }
  }

  // Edge highlight / center ring on a leaf drop.
  let edge = null;
  let ring = null;
  if (drag.dropEdge && drag.targetContainerId) {
    const leaf = byId.get(drag.targetContainerId);
    if (leaf) {
      const E = 6;
      if (drag.dropEdge === 'center') {
        ring = { x: leaf.x + 6, y: leaf.y + 6, width: leaf.width - 12, height: leaf.height - 12 };
      } else if (drag.dropEdge === 'top') {
        edge = { x: leaf.x, y: leaf.y, width: leaf.width, height: E };
      } else if (drag.dropEdge === 'bottom') {
        edge = { x: leaf.x, y: leaf.y + leaf.height - E, width: leaf.width, height: E };
      } else if (drag.dropEdge === 'left') {
        edge = { x: leaf.x, y: leaf.y, width: E, height: leaf.height };
      } else if (drag.dropEdge === 'right') {
        edge = { x: leaf.x + leaf.width - E, y: leaf.y, width: E, height: leaf.height };
      }
    }
  }

  const guides = drag.activeGuides || [];

  return (
    <div
      data-testid="drop-indicator-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {bar && (
        <div
          className="analyst-pro-drop-indicator-bar"
          style={{ left: bar.x, top: bar.y, width: bar.width, height: bar.height }}
        />
      )}
      {edge && (
        <div
          className="analyst-pro-drop-indicator-edge"
          style={{ left: edge.x, top: edge.y, width: edge.width, height: edge.height }}
        />
      )}
      {ring && (
        <div
          className="analyst-pro-drop-indicator-center"
          style={{ left: ring.x, top: ring.y, width: ring.width, height: ring.height }}
        />
      )}
      {guides.map((g, i) => (
        <div
          key={`guide-${i}`}
          className="analyst-pro-smart-guide"
          data-axis={g.axis}
          style={g.axis === 'x'
            ? { left: g.position, top: g.start, height: g.end - g.start }
            : { top: g.position, left: g.start, width: g.end - g.start }}
        />
      ))}
    </div>
  );
}
