import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS, CHART_PALETTES } from './tokens';
import KPICard from './KPICard';
import DashboardTileCanvas from './lib/DashboardTileCanvas';
import LegacyResultChart from './lib/LegacyResultChart';
import { scoreTile as sharedScoreTile } from './lib/importanceScoring';

/* ── Tile importance scoring ──
 * Delegates to the shared importanceScoring module (Phase 4c). The
 * shared version recognizes both the legacy shape (chartType + rows +
 * sql) and the new ChartSpec shape (chart_spec with encoding), so
 * migrated dashboards don't silently score 0.
 */
function scoreTile(tile) {
  return sharedScoreTile(tile);
}

/* ── Bin-pack tiles into 16:9 slide pages ── */
function packIntoSlides(allTiles, maxPerSlide = 6) {
  if (allTiles.length === 0) return [];

  // Sort by importance descending
  const sorted = [...allTiles].sort((a, b) => scoreTile(b) - scoreTile(a));

  const slides = [];
  let current = [];

  for (const tile of sorted) {
    if (scoreTile(tile) === 0) continue; // skip empty tiles
    current.push(tile);
    if (current.length >= maxPerSlide) {
      slides.push(current);
      current = [];
    }
  }
  if (current.length > 0) slides.push(current);

  return slides;
}

/* ── Determine CSS grid template for N tiles ── */
function getGridTemplate(tiles) {
  const n = tiles.length;
  const kpiCount = tiles.filter(t => t.chartType === 'kpi').length;

  // Single tile = full viewport
  if (n === 1) {
    return { columns: '1fr', rows: '1fr', areas: [['a0']] };
  }

  // 2 tiles: side by side or KPI + chart
  if (n === 2) {
    if (kpiCount === 2) return { columns: '1fr 1fr', rows: '1fr', areas: [['a0', 'a1']] };
    return { columns: '1fr 1fr', rows: '1fr', areas: [['a0', 'a1']] };
  }

  // 3 tiles: top 2 + bottom 1 wide
  if (n === 3) {
    if (kpiCount === 3) return { columns: '1fr 1fr 1fr', rows: '1fr', areas: [['a0', 'a1', 'a2']] };
    return { columns: '1fr 1fr', rows: '1fr 1fr', areas: [['a0', 'a1'], ['a2', 'a2']] };
  }

  // 4 tiles: 2x2 grid
  if (n === 4) {
    if (kpiCount === 4) return { columns: '1fr 1fr 1fr 1fr', rows: '1fr', areas: [['a0', 'a1', 'a2', 'a3']] };
    return { columns: '1fr 1fr', rows: '1fr 1fr', areas: [['a0', 'a1'], ['a2', 'a3']] };
  }

  // 5 tiles: 3 top + 2 bottom
  if (n === 5) {
    if (kpiCount >= 3) {
      return { columns: '1fr 1fr 1fr', rows: 'auto 1fr', areas: [['a0', 'a1', 'a2'], ['a3', 'a3', 'a4']] };
    }
    return { columns: '1fr 1fr 1fr', rows: '1fr 1fr', areas: [['a0', 'a1', 'a2'], ['a3', 'a3', 'a4']] };
  }

  // 6 tiles: 3x2 grid
  return { columns: '1fr 1fr 1fr', rows: '1fr 1fr', areas: [['a0', 'a1', 'a2'], ['a3', 'a4', 'a5']] };
}

/* ── Build gridTemplateAreas string from areas array ── */
function buildGridAreas(areas) {
  return areas.map(row => `"${row.join(' ')}"`).join(' ');
}

/* ── Slide transition variants ── */
const slideVariants = {
  enter: (direction) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({ x: direction < 0 ? '100%' : '-100%', opacity: 0 }),
};

/* ── Presentation Tile — renders a single tile in presentation mode ──
 *
 * Phase 4c+3: every non-KPI tile renders via the new VegaRenderer path.
 *   1. If the tile carries a `chart_spec`, mount DashboardTileCanvas
 *      directly (fast path, post-migration + post-cutover).
 *   2. Otherwise, mount LegacyResultChart with the tile's columns+rows
 *      — the bridge recomputes a ChartSpec on the fly via the Show Me
 *      recommender so un-migrated tiles still render.
 *   3. KPI tiles keep the standalone KPICard renderer.
 *
 * The legacy ResultsChart + ECharts branch has been removed entirely.
 */
function PresentationTile({ tile, index, themeConfig, gridArea }) {
  const isKPI = tile?.chartType === 'kpi';
  const hasChartSpec = Boolean(tile?.chart_spec || tile?.chartSpec);
  const hasRows = Array.isArray(tile?.rows) && tile.rows.length > 0;

  return (
    <div
      style={{
        gridArea,
        background: themeConfig?.background?.tile || TOKENS.bg.elevated,
        borderRadius: 16,
        border: `1px solid ${TOKENS.border.default}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {isKPI ? (
        <>
          <div style={{ padding: '14px 20px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text.primary, letterSpacing: '-0.01em' }}>
              {tile?.title || 'Untitled'}
            </span>
            {tile?.subtitle && (
              <span style={{ fontSize: 12, color: TOKENS.text.muted }}>{tile.subtitle}</span>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <KPICard tile={tile} index={index} />
          </div>
        </>
      ) : hasChartSpec ? (
        <DashboardTileCanvas tile={tile} height="100%" />
      ) : hasRows ? (
        <LegacyResultChart
          columns={tile.columns || []}
          rows={tile.rows || []}
          title={tile?.title}
          subtitle={tile?.subtitle}
          height="100%"
        />
      ) : tile?.sql ? (
        <div style={{ padding: '14px 20px' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: TOKENS.text.primary }}>
            {tile?.title || 'Untitled'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, color: TOKENS.text.muted, fontSize: 13 }}>
            Loading data...
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px 20px' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: TOKENS.text.primary }}>
            {tile?.title || 'Untitled'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, color: TOKENS.text.muted, fontSize: 13 }}>
            No data
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PresentationEngine — auto-layout presentation mode
   ══════════════════════════════════════════════════════════════════ */
export default function PresentationEngine({ dashboard, themeConfig, onExit, onSlideChange }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlayInterval, setAutoPlayInterval] = useState(10); // seconds
  const autoPlayTimer = useRef(null);

  // SP-6: emit slide index to parent (PitchLayout) for chrome overlays
  useEffect(() => {
    if (typeof onSlideChange === "function") onSlideChange(currentSlide);
  }, [currentSlide, onSlideChange]);

  // [ADV-FIX H6] Guard clause for 0-tile dashboard
  // [ADV-FIX M3] structuredClone for safe layout cloning
  const slides = useMemo(() => {
    if (!dashboard?.tabs) return [];
    const cloned = structuredClone(dashboard);
    const allTiles = [];
    for (const tab of cloned.tabs) {
      for (const sec of tab.sections || []) {
        for (const tile of sec.tiles || []) {
          allTiles.push(tile);
        }
      }
    }
    if (allTiles.length === 0) return [];
    return packIntoSlides(allTiles);
  }, [dashboard]);

  const totalSlides = slides.length;

  // Navigation
  const goTo = useCallback((idx, dir) => {
    setDirection(dir);
    setCurrentSlide(Math.max(0, Math.min(idx, totalSlides - 1)));
  }, [totalSlides]);

  const next = useCallback(() => {
    if (currentSlide < totalSlides - 1) goTo(currentSlide + 1, 1);
    else if (autoPlay) goTo(0, 1); // loop
  }, [currentSlide, totalSlides, goTo, autoPlay]);

  const prev = useCallback(() => {
    if (currentSlide > 0) goTo(currentSlide - 1, -1);
  }, [currentSlide, goTo]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onExit?.();
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === 'Home') goTo(0, -1);
      if (e.key === 'End') goTo(totalSlides - 1, 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, goTo, totalSlides, onExit]);

  // Auto-play timer
  useEffect(() => {
    if (autoPlay) {
      autoPlayTimer.current = setInterval(next, autoPlayInterval * 1000);
    }
    return () => { if (autoPlayTimer.current) clearInterval(autoPlayTimer.current); };
  }, [autoPlay, autoPlayInterval, next]);

  // Empty state
  if (totalSlides === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: themeConfig?.background?.dashboard || 'var(--bg-page)' }}>
        <div className="text-center">
          <p style={{ color: TOKENS.text.muted, fontSize: 16, marginBottom: 12 }}>No tiles to present</p>
          <button onClick={onExit} className="px-4 py-2 rounded-lg text-sm cursor-pointer"
            style={{ background: TOKENS.accent, color: '#fff', border: 'none' }}>
            Exit Presentation
          </button>
        </div>
      </div>
    );
  }

  const currentTiles = slides[currentSlide] || [];
  const grid = getGridTemplate(currentTiles);
  const gridAreas = buildGridAreas(grid.areas);

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ background: themeConfig?.background?.dashboard || 'var(--bg-page)' }}>

      {/* Slide content */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentSlide}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            id={`presentation-slide-${currentSlide}`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: grid.columns,
              gridTemplateRows: grid.rows,
              gridTemplateAreas: gridAreas,
              gap: 16,
              padding: 24,
            }}
          >
            {currentTiles.map((tile, i) => (
              <PresentationTile
                key={tile.id}
                tile={tile}
                index={i}
                themeConfig={themeConfig}
                gridArea={`a${i}`}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls bar */}
      <div style={{
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--modal-overlay)',
        backdropFilter: 'blur(8px)',
      }}>
        {/* Left: dashboard name + slide counter */}
        <div className="flex items-center gap-4">
          <span style={{ color: TOKENS.text.primary, fontSize: 14, fontWeight: 600 }}>
            {dashboard?.name || 'Dashboard'}
          </span>
          <span style={{ color: TOKENS.text.muted, fontSize: 13 }}>
            {currentSlide + 1} / {totalSlides}
          </span>
        </div>

        {/* Center: navigation + progress bar */}
        <div className="flex items-center gap-3">
          <button onClick={prev} disabled={currentSlide === 0}
            className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
            style={{
              background: currentSlide === 0 ? 'transparent' : TOKENS.bg.elevated,
              color: currentSlide === 0 ? TOKENS.text.muted : TOKENS.text.primary,
              border: `1px solid ${TOKENS.border.default}`,
              opacity: currentSlide === 0 ? 0.4 : 1,
            }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button key={i} onClick={() => goTo(i, i > currentSlide ? 1 : -1)}
                className="rounded-full cursor-pointer transition-all"
                style={{
                  width: i === currentSlide ? 24 : 8,
                  height: 8,
                  background: i === currentSlide ? TOKENS.accent : TOKENS.text.muted,
                  opacity: i === currentSlide ? 1 : 0.4,
                  border: 'none',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>

          <button onClick={next} disabled={currentSlide === totalSlides - 1 && !autoPlay}
            className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
            style={{
              background: (currentSlide === totalSlides - 1 && !autoPlay) ? 'transparent' : TOKENS.bg.elevated,
              color: (currentSlide === totalSlides - 1 && !autoPlay) ? TOKENS.text.muted : TOKENS.text.primary,
              border: `1px solid ${TOKENS.border.default}`,
              opacity: (currentSlide === totalSlides - 1 && !autoPlay) ? 0.4 : 1,
            }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* Right: auto-play + exit */}
        <div className="flex items-center gap-3">
          <button onClick={() => setAutoPlay(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
            style={{
              background: autoPlay ? TOKENS.accentGlow : TOKENS.bg.elevated,
              color: autoPlay ? TOKENS.accent : TOKENS.text.secondary,
              border: `1px solid ${autoPlay ? TOKENS.accent : TOKENS.border.default}`,
            }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {autoPlay ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              )}
            </svg>
            {autoPlay ? 'Pause' : 'Auto-play'}
          </button>

          {autoPlay && (
            <select
              value={autoPlayInterval}
              onChange={e => setAutoPlayInterval(Number(e.target.value))}
              style={{
                background: TOKENS.bg.elevated,
                color: TOKENS.text.secondary,
                border: `1px solid ${TOKENS.border.default}`,
                borderRadius: 8,
                padding: '4px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
            </select>
          )}

          <button onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
            style={{
              background: TOKENS.bg.elevated,
              color: TOKENS.text.secondary,
              border: `1px solid ${TOKENS.border.default}`,
            }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
