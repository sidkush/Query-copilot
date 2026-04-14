import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { isDateColumn } from '../../../lib/fieldClassification';

/**
 * useTimeAnimation — play/pause/scrub over a data set with a time
 * dimension. Engine-agnostic: returns `filteredRows` which is just the
 * subset of rows for the current frame, so any chart engine can consume
 * the animation without knowing how it's implemented.
 *
 * Frame detection:
 *   - If `timeField` option given, use it
 *   - Otherwise auto-detect via isDateColumn across `columns`
 *   - Frames = sorted unique values of the time column
 *
 * Playback:
 *   - requestAnimationFrame driven, time-delta based (speed-independent
 *     of frame rate)
 *   - Default interval 600ms per frame at 1× speed → 300ms at 2×, etc.
 *   - prefers-reduced-motion → auto-pause on mount (user can still scrub)
 *
 * Shape of returned state matches the plan spec so TimelineScrubber is
 * a straight wire-up: { frames, currentIndex, isPlaying, play, pause,
 * toggle, setFrame, filteredRows, timeField, speed, setSpeed, loop,
 * setLoop }.
 */

const DEFAULT_FRAME_INTERVAL_MS = 600;

export default function useTimeAnimation(
  columns,
  rows,
  { timeField = null, defaultSpeed = 1, defaultLoop = true } = {}
) {
  const detectedField = useMemo(() => {
    if (timeField) return timeField;
    if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) return null;
    return columns.find((c) => isDateColumn(c, rows)) || null;
  }, [columns, rows, timeField]);

  const frames = useMemo(() => {
    if (!detectedField || !rows?.length) return [];
    const uniq = new Set();
    for (const r of rows) {
      const v = r[detectedField];
      if (v != null) uniq.add(v);
    }
    return [...uniq].sort();
  }, [detectedField, rows]);

  // isPlaying defaults to false anyway; the reduced-motion check is a
  // no-op at mount. Lazy initializer keeps it pure and avoids an effect
  // (which would trip react-hooks/set-state-in-effect).
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(defaultSpeed);
  const [loop, setLoop] = useState(defaultLoop);
  // Track previous frames.length so we can clamp currentIndex during
  // render instead of in an effect (React-docs "adjust state while
  // rendering" pattern).
  const [prevFrameCount, setPrevFrameCount] = useState(frames.length);
  if (prevFrameCount !== frames.length) {
    setPrevFrameCount(frames.length);
    if (frames.length === 0) {
      if (currentIndex !== 0) setCurrentIndex(0);
    } else if (currentIndex >= frames.length) {
      setCurrentIndex(frames.length - 1);
    }
  }

  // rAF playback loop — measures real elapsed time so 2× is actually 2×
  // regardless of monitor refresh rate.
  const rafRef = useRef(null);
  const lastTickRef = useRef(0);

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return undefined;
    }
    lastTickRef.current = performance.now();
    const interval = DEFAULT_FRAME_INTERVAL_MS / Math.max(speed, 0.01);

    const tick = (ts) => {
      if (ts - lastTickRef.current >= interval) {
        lastTickRef.current = ts;
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (next >= frames.length) {
            if (loop) return 0;
            setIsPlaying(false);
            return prev;
          }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, speed, frames.length, loop]);

  const filteredRows = useMemo(() => {
    if (!detectedField || frames.length === 0) return rows || [];
    const currentFrame = frames[currentIndex];
    if (currentFrame == null) return rows || [];
    return (rows || []).filter((r) => r[detectedField] === currentFrame);
  }, [rows, detectedField, frames, currentIndex]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const toggle = useCallback(() => setIsPlaying((p) => !p), []);
  const setFrame = useCallback(
    (idx) => {
      setCurrentIndex(Math.max(0, Math.min(frames.length - 1, idx)));
    },
    [frames.length]
  );

  return {
    frames,
    currentIndex,
    currentFrame: frames[currentIndex] ?? null,
    isPlaying,
    play,
    pause,
    toggle,
    setFrame,
    filteredRows,
    timeField: detectedField,
    speed,
    setSpeed,
    loop,
    setLoop,
  };
}
