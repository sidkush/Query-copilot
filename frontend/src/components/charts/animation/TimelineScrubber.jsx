import { useMemo, useCallback } from 'react';
import { TOKENS } from '../../dashboard/tokens';

/**
 * TimelineScrubber — premium glass pill that mounts below any chart
 * whose chartDef declares `supportsTimeAnimation` and whose data has
 * a detected time field.
 *
 * Reads entirely from useTimeAnimation state, writes back via the
 * imperative handles. Stateless itself — a dumb UI shell.
 *
 * Layout:
 *   [ ▶ ]  ◉━━━━━━━●━━━━━━━━━━━  2024-03  0.5× 1× 2× 4×  ⟲
 *   play   slider                frame    speed          loop
 */

const SPEEDS = [0.5, 1, 2, 4];

export default function TimelineScrubber({
  frames,
  currentIndex,
  currentFrame,
  isPlaying,
  onToggle,
  onSetFrame,
  speed,
  onSetSpeed,
  loop,
  onSetLoop,
}) {
  const max = Math.max(frames.length - 1, 0);

  const frameLabel = useMemo(() => {
    if (currentFrame == null) return '—';
    const str = String(currentFrame);
    // Prefer YYYY-MM-DD cropping to Y-M so the label fits in tight tiles.
    const m = str.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (m) return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
    return str.length > 14 ? `${str.slice(0, 12)}…` : str;
  }, [currentFrame]);

  const handleSlider = useCallback(
    (e) => {
      onSetFrame(Number(e.target.value));
    },
    [onSetFrame]
  );

  if (frames.length <= 1) return null;

  return (
    <div
      className="timeline-scrubber"
      role="group"
      aria-label="Time animation controls"
    >
      {/* Play / pause */}
      <button
        type="button"
        className="timeline-scrubber__play"
        aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
        onClick={onToggle}
        data-active={isPlaying || undefined}
      >
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 5v14l12-7z" />
          </svg>
        )}
      </button>

      {/* Scrub slider + frame label */}
      <div className="timeline-scrubber__track">
        <input
          type="range"
          min={0}
          max={max}
          value={Math.min(currentIndex, max)}
          onChange={handleSlider}
          className="timeline-scrubber__range"
          aria-label={`Frame ${currentIndex + 1} of ${frames.length}`}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={currentIndex}
          aria-valuetext={frameLabel}
        />
        <div className="timeline-scrubber__label">
          <span className="timeline-scrubber__frame">{frameLabel}</span>
          <span className="timeline-scrubber__progress">
            {currentIndex + 1} / {frames.length}
          </span>
        </div>
      </div>

      {/* Speed selector */}
      <div className="timeline-scrubber__speeds" role="radiogroup" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSetSpeed(s)}
            role="radio"
            aria-checked={speed === s}
            aria-label={`${s}× speed`}
            className="timeline-scrubber__speed"
            data-active={speed === s || undefined}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Loop toggle */}
      <button
        type="button"
        onClick={() => onSetLoop(!loop)}
        className="timeline-scrubber__loop"
        aria-label={loop ? 'Loop on — click to disable' : 'Loop off — click to enable'}
        aria-pressed={loop}
        data-active={loop || undefined}
        title={loop ? 'Loop on' : 'Loop off'}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </button>

      <style>{`
        .timeline-scrubber {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 8px 12px 10px;
          padding: 6px 10px;
          border-radius: 9999px;
          background: var(--glass-bg-card);
          border: 1px solid var(--glass-border);
          box-shadow: 0 1px 0 var(--glass-highlight) inset, 0 14px 28px -18px var(--shadow-deep);
          backdrop-filter: blur(12px) saturate(1.3);
          -webkit-backdrop-filter: blur(12px) saturate(1.3);
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        }
        .timeline-scrubber__play {
          flex-shrink: 0;
          width: 28px;
          height: 28px;
          border-radius: 9999px;
          background: color-mix(in oklab, var(--accent) 14%, transparent);
          border: 1px solid color-mix(in oklab, var(--accent) 32%, transparent);
          color: var(--accent);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .timeline-scrubber__play:hover {
          background: color-mix(in oklab, var(--accent) 22%, transparent);
          transform: scale(1.05);
        }
        .timeline-scrubber__play[data-active] {
          background: color-mix(in oklab, var(--accent) 28%, transparent);
        }
        .timeline-scrubber__play:active { transform: scale(0.98); }
        .timeline-scrubber__play:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .timeline-scrubber__track {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .timeline-scrubber__range {
          width: 100%;
          height: 4px;
          appearance: none;
          -webkit-appearance: none;
          background: color-mix(in oklab, var(--text-muted) 18%, transparent);
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
        }
        .timeline-scrubber__range::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 13px;
          height: 13px;
          border-radius: 9999px;
          background: var(--accent);
          border: 2px solid var(--bg-elevated);
          box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 50%, transparent), 0 4px 12px -2px color-mix(in oklab, var(--accent) 50%, transparent);
          cursor: grab;
          transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .timeline-scrubber__range::-webkit-slider-thumb:hover {
          transform: scale(1.14);
        }
        .timeline-scrubber__range::-moz-range-thumb {
          width: 13px;
          height: 13px;
          border-radius: 9999px;
          background: var(--accent);
          border: 2px solid var(--bg-elevated);
          cursor: grab;
        }
        .timeline-scrubber__label {
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
          font-weight: 600;
          color: var(--text-muted);
          font-family: 'Outfit', system-ui, sans-serif;
          letter-spacing: 0.02em;
          margin-top: 2px;
        }
        .timeline-scrubber__frame {
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
        }
        .timeline-scrubber__progress {
          font-variant-numeric: tabular-nums;
          opacity: 0.75;
        }
        .timeline-scrubber__speeds {
          display: flex;
          gap: 1px;
          padding: 2px;
          border-radius: 9999px;
          background: color-mix(in oklab, var(--text-muted) 10%, transparent);
          flex-shrink: 0;
        }
        .timeline-scrubber__speed {
          font-size: 9.5px;
          font-weight: 700;
          padding: 3px 7px;
          border-radius: 9999px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-family: 'Outfit', system-ui, sans-serif;
          letter-spacing: -0.005em;
          font-variant-numeric: tabular-nums;
          transition: all 160ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .timeline-scrubber__speed:hover { color: var(--text-secondary); }
        .timeline-scrubber__speed[data-active] {
          background: var(--glass-bg-card);
          color: var(--accent);
          box-shadow: 0 1px 0 var(--glass-highlight) inset;
        }
        .timeline-scrubber__loop {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          border-radius: 9999px;
          background: transparent;
          border: 1px solid var(--border-default);
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .timeline-scrubber__loop:hover {
          color: var(--text-primary);
          border-color: var(--border-hover);
        }
        .timeline-scrubber__loop[data-active] {
          color: var(--accent);
          border-color: color-mix(in oklab, var(--accent) 40%, transparent);
          background: color-mix(in oklab, var(--accent) 10%, transparent);
        }
      `}</style>
    </div>
  );
}
