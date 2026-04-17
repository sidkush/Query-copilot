import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PresentationEngine from "../PresentationEngine";
import { ARCHETYPE_THEMES, TOKENS } from "../tokens";
import { BreathingDot, TWEENS } from "../motion";

/**
 * PitchLayout — SP-6 polish pass.
 *
 * Cinematic dark presentation. Driven by ARCHETYPE_THEMES.pitch:
 *   - Pure black bg (#000), oversized headings (48px), edge-to-edge
 *     tiles (zero gap), 40px internal padding per slide
 *   - Slide counter chip ("Slide N of M") in top-right
 *   - Fullscreen toggle button — wraps the document fullscreen API
 *   - PresentationEngine receives themeConfig derived from archetype
 *     so slide chart palette, typography, and spacing stay in sync
 *
 * Delegates slide navigation/auto-play/exit to PresentationEngine.
 */
const THEME = ARCHETYPE_THEMES.pitch;

function adaptTilesToDashboard(tiles, dashboardName) {
  const tabsMap = new Map();
  tiles.forEach((tile) => {
    const tabName = tile.tab || "Main";
    if (!tabsMap.has(tabName)) {
      tabsMap.set(tabName, []);
    }
    tabsMap.get(tabName).push(tile);
  });

  const tabs = Array.from(tabsMap.entries()).map(([name, tabTiles], i) => ({
    id: `pitch-tab-${i}`,
    name,
    sections: [
      {
        id: `pitch-section-${i}-0`,
        name,
        tiles: tabTiles,
      },
    ],
  }));

  return {
    id: "pitch-preview",
    name: dashboardName || "Presentation",
    tabs,
  };
}

/** Build themeConfig for PresentationEngine from the pitch archetype. */
function buildPitchThemeConfig(base) {
  const t = ARCHETYPE_THEMES.pitch;
  return {
    ...(base || {}),
    background: t.background,
    spacing: t.spacing,
    typography: t.typography,
    palette: t.palette,
    tile: t.tile,
    accent: t.accent,
  };
}

export default function PitchLayout({
  tiles = [],
  dashboardName = "Presentation",
  themeConfig,
  onExit,
}) {
  const [closed, setClosed] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef(null);

  const dashboard = useMemo(
    () => adaptTilesToDashboard(tiles, dashboardName),
    [tiles, dashboardName],
  );

  const pitchTheme = useMemo(() => buildPitchThemeConfig(themeConfig), [themeConfig]);

  // Track browser fullscreen state
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = async () => {
    const node = wrapperRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (node.requestFullscreen) {
        await node.requestFullscreen();
      }
    } catch {
      /* silently ignore — some browsers block fullscreen in dev */
    }
  };

  const handleExit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    setClosed(true);
    if (onExit) onExit();
  };

  const totalSlides = Math.max(1, tiles.length);

  if (tiles.length === 0) {
    return (
      <div
        data-testid="layout-pitch"
        style={{
          padding: 40,
          textAlign: "center",
          fontSize: 15,
          color: "rgba(255,255,255,0.5)",
          fontStyle: "italic",
          background: THEME.background.dashboard,
          fontFamily: THEME.typography.bodyFont,
          minHeight: "100%",
        }}
      >
        Pitch mode empty. Add tiles to the dashboard to present.
      </div>
    );
  }

  if (closed) {
    return (
      <div
        data-testid="layout-pitch"
        style={{
          padding: 24,
          color: "rgba(255,255,255,0.5)",
          background: THEME.background.dashboard,
          minHeight: "100%",
        }}
      >
        Pitch closed.
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      data-testid="layout-pitch"
      data-tile-count={tiles.length}
      data-fullscreen={isFullscreen ? "true" : "false"}
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        background: THEME.background.dashboard,
        fontFamily: THEME.typography.bodyFont,
      }}
    >
      <PresentationEngine
        dashboard={dashboard}
        themeConfig={pitchTheme}
        onExit={handleExit}
        onSlideChange={(i) => setSlideIndex(i)}
      />

      {/* ═══ Layout-level chrome: slide counter + fullscreen ═══ */}
      <div
        data-testid="pitch-chrome"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 8,
          pointerEvents: "auto",
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={slideIndex}
            data-testid="pitch-slide-counter"
            className="premium-liquid-glass"
            initial={{ opacity: 0, scale: 0.98, y: -2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: 2 }}
            transition={TWEENS.ease}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              fontSize: 11,
              fontFamily: TOKENS.fontMono,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.78)",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 4,
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <BreathingDot color="rgba(255,255,255,0.85)" size={5} glow={false} />
            Slide {slideIndex + 1} of {totalSlides}
          </motion.div>
        </AnimatePresence>
        <button
          type="button"
          data-testid="pitch-fullscreen-toggle"
          className="pitch-chrome-btn premium-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          style={{
            width: 32,
            height: 32,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.8)",
            borderRadius: 4,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isFullscreen ? (
              <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      </div>

      {/* Scoped focus-visible ring for chrome buttons — keyboard users need
          a visible focus indicator on top of the cinematic black background. */}
      <style>{`
        .pitch-chrome-btn:focus-visible {
          outline: 2px solid rgba(255,255,255,0.85);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
