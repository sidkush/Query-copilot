// frontend/src/components/dashboard/freeform/CanvasZoomControls.jsx
// Plan 6a — top-right floating zoom widget.
import { useStore } from '../../../store';
import { TOKENS } from '../tokens';

const PRESETS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];

export default function CanvasZoomControls() {
  const zoom = useStore((s) => s.analystProCanvasZoom);
  const setZoom = useStore((s) => s.setCanvasZoomAnalystPro);
  const setPan = useStore((s) => s.setCanvasPanAnalystPro);

  const onFit = () => {
    setZoom(1.0);
    setPan(0, 0);
  };

  return (
    <div
      data-testid="canvas-zoom-controls"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        boxShadow: TOKENS.shadow.diffusion,
        fontFamily: TOKENS.fontMono,
        fontSize: 11,
      }}
    >
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          data-testid={`zoom-preset-${Math.round(p * 100)}`}
          onClick={() => setZoom(p)}
          aria-label={`Zoom to ${Math.round(p * 100)}%`}
          aria-pressed={Math.abs(zoom - p) < 1e-6}
          style={presetBtn(Math.abs(zoom - p) < 1e-6)}
        >
          {Math.round(p * 100)}%
        </button>
      ))}
      <button
        type="button"
        data-testid="zoom-fit"
        onClick={onFit}
        aria-label="Fit to screen (Ctrl+0)"
        title="Fit (Ctrl+0)"
        style={presetBtn(false)}
      >
        Fit
      </button>
      <span
        data-testid="canvas-zoom-display"
        style={{
          padding: '4px 8px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          borderLeft: '1px solid var(--border-default)',
          marginLeft: 4,
        }}
      >
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
}

function presetBtn(active) {
  return {
    padding: '4px 8px',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary)',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    fontFamily: 'inherit',
  };
}
