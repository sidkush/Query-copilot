// frontend/src/components/dashboard/freeform/FloatingLayer.jsx
import { memo } from 'react';

/**
 * Renders the floating layer of a freeform dashboard.
 * Each floating zone is absolute-positioned inside a container that sits
 * above the tiled tree. The tiled tree renders underneath via ZoneRenderer.
 *
 * Floating zones are sorted by zIndex ascending so higher z paints last.
 */
function FloatingLayer({ zones, renderLeaf }) {
  if (!zones || zones.length === 0) return null;
  const sorted = [...zones].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return (
    <div
      data-testid="floating-layer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {sorted.map((zone) => (
        <div
          key={zone.id}
          data-testid={`floating-zone-${zone.id}`}
          data-zone-type={zone.type}
          style={{
            position: 'absolute',
            left: zone.x,
            top: zone.y,
            width: zone.pxW,
            height: zone.pxH,
            zIndex: zone.zIndex ?? 0,
            pointerEvents: 'auto',
          }}
        >
          {renderLeaf(zone)}
        </div>
      ))}
    </div>
  );
}

export default memo(FloatingLayer);
