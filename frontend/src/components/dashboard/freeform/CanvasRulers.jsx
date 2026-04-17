// frontend/src/components/dashboard/freeform/CanvasRulers.jsx
// Plan 6a — horizontal + vertical rulers synchronized to canvas zoom & pan.
import { TOKENS } from '../tokens';

const TICK_PX = 50;
const LABEL_PX = 100;
const STRIP = 24;

export default function CanvasRulers({
  canvasWidth = 800,
  canvasHeight = 600,
  zoom = 1,
  pan = { x: 0, y: 0 },
}) {
  const safeZoom = zoom > 0 ? zoom : 1;
  const startX = Math.floor((-pan.x) / safeZoom / TICK_PX) * TICK_PX - TICK_PX;
  const endX = Math.ceil((canvasWidth - pan.x) / safeZoom / TICK_PX) * TICK_PX + TICK_PX;
  const startY = Math.floor((-pan.y) / safeZoom / TICK_PX) * TICK_PX - TICK_PX;
  const endY = Math.ceil((canvasHeight - pan.y) / safeZoom / TICK_PX) * TICK_PX + TICK_PX;

  const ticksX = range(startX, endX, TICK_PX);
  const ticksY = range(startY, endY, TICK_PX);

  return (
    <>
      <div
        data-testid="canvas-ruler-h"
        style={{
          position: 'absolute',
          top: 0,
          left: STRIP,
          right: 0,
          height: STRIP,
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-default)',
          overflow: 'hidden',
          zIndex: 70,
          fontFamily: TOKENS.fontMono,
          fontSize: 9,
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }}
      >
        {ticksX.map((sheetX) => {
          const screenX = sheetX * safeZoom + pan.x;
          const isLabel = sheetX % LABEL_PX === 0;
          return (
            <span
              key={`h${sheetX}`}
              data-testid={isLabel ? `ruler-h-label-${sheetX}` : undefined}
              style={{
                position: 'absolute',
                left: screenX,
                top: isLabel ? 4 : 14,
                height: isLabel ? 20 : 10,
                borderLeft: '1px solid var(--border-default)',
                paddingLeft: isLabel ? 2 : 0,
                fontSize: 9,
              }}
            >
              {isLabel ? sheetX : ''}
            </span>
          );
        })}
      </div>
      <div
        data-testid="canvas-ruler-v"
        style={{
          position: 'absolute',
          top: STRIP,
          left: 0,
          bottom: 0,
          width: STRIP,
          background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border-default)',
          overflow: 'hidden',
          zIndex: 70,
          fontFamily: TOKENS.fontMono,
          fontSize: 9,
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }}
      >
        {ticksY.map((sheetY) => {
          const screenY = sheetY * safeZoom + pan.y;
          const isLabel = sheetY % LABEL_PX === 0;
          return (
            <span
              key={`v${sheetY}`}
              data-testid={isLabel ? `ruler-v-label-${sheetY}` : undefined}
              style={{
                position: 'absolute',
                top: screenY,
                left: isLabel ? 4 : 14,
                width: isLabel ? 20 : 10,
                borderTop: '1px solid var(--border-default)',
                paddingTop: isLabel ? 2 : 0,
                writingMode: 'vertical-rl',
                fontSize: 9,
              }}
            >
              {isLabel ? sheetY : ''}
            </span>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: STRIP,
          height: STRIP,
          background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border-default)',
          borderBottom: '1px solid var(--border-default)',
          zIndex: 71,
        }}
      />
    </>
  );
}

function range(start, end, step) {
  const out = [];
  for (let v = start; v <= end; v += step) out.push(v);
  return out;
}
