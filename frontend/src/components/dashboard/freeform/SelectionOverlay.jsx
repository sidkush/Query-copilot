// frontend/src/components/dashboard/freeform/SelectionOverlay.jsx
import { memo } from 'react';

/**
 * SelectionOverlay — renders a selection ring + 8 resize handles over every
 * selected zone. Purely visual; consumer wires pointer events.
 *
 * Props:
 *   - selectedResolved: ResolvedZone[]  — resolved coords of selected zones
 *   - onResizeHandlePointerDown: (zoneId, handle, event) => void
 *   - onSelectionPointerDown: (zoneId, event) => void  // drag-start on selection body
 */
const HANDLE_POSITIONS = [
  { id: 'nw', cursor: 'nwse-resize' },
  { id: 'n',  cursor: 'ns-resize'   },
  { id: 'ne', cursor: 'nesw-resize' },
  { id: 'e',  cursor: 'ew-resize'   },
  { id: 'se', cursor: 'nwse-resize' },
  { id: 's',  cursor: 'ns-resize'   },
  { id: 'sw', cursor: 'nesw-resize' },
  { id: 'w',  cursor: 'ew-resize'   },
];

function getHandleStyle(handle, width, height) {
  const HS = 8; // handle size
  const HALF = HS / 2;
  const base = { position: 'absolute', width: HS, height: HS, background: 'var(--accent, #2563eb)', border: '1.5px solid var(--bg-elevated, #fff)', borderRadius: 2, boxShadow: '0 1px 2px rgba(0,0,0,0.2)', pointerEvents: 'auto' };
  switch (handle.id) {
    case 'nw': return { ...base, left: -HALF, top: -HALF, cursor: handle.cursor };
    case 'n':  return { ...base, left: width / 2 - HALF, top: -HALF, cursor: handle.cursor };
    case 'ne': return { ...base, right: -HALF, top: -HALF, cursor: handle.cursor };
    case 'e':  return { ...base, right: -HALF, top: height / 2 - HALF, cursor: handle.cursor };
    case 'se': return { ...base, right: -HALF, bottom: -HALF, cursor: handle.cursor };
    case 's':  return { ...base, left: width / 2 - HALF, bottom: -HALF, cursor: handle.cursor };
    case 'sw': return { ...base, left: -HALF, bottom: -HALF, cursor: handle.cursor };
    case 'w':  return { ...base, left: -HALF, top: height / 2 - HALF, cursor: handle.cursor };
    default:   return base;
  }
}

function SelectionOverlay({ selectedResolved, onResizeHandlePointerDown, onSelectionPointerDown }) {
  if (!selectedResolved || selectedResolved.length === 0) return null;
  return (
    <div data-testid="selection-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {selectedResolved.map((r) => (
        <div
          key={r.zone.id}
          data-testid={`selection-ring-${r.zone.id}`}
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.width,
            height: r.height,
            border: '1.5px solid var(--accent, #2563eb)',
            borderRadius: 4,
            pointerEvents: 'none',
            boxShadow: '0 0 0 4px color-mix(in oklab, var(--accent) 15%, transparent)',
            zIndex: 1000,
          }}
        >
          {HANDLE_POSITIONS.map((h) => (
            <div
              key={h.id}
              data-testid={`resize-handle-${r.zone.id}-${h.id}`}
              style={getHandleStyle(h, r.width, r.height)}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown?.(r.zone.id, h.id, e);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default memo(SelectionOverlay);
