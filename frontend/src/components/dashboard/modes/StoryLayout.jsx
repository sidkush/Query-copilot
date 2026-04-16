import { useEffect, useRef, useState, useCallback } from "react";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";

/**
 * StoryLayout — Phase 4c real implementation.
 *
 * Spec S7.4: scrollytelling flow with per-section annotations that
 * activate as the user scrolls. Each tile is a chapter; chapters are
 * wrapped in <section> elements watched by an IntersectionObserver.
 * When a section enters the viewport (>= 50% visible), the annotation
 * column pulses and the active chapter id is set.
 *
 * Chart tiles render via DashboardTileCanvas — no ECharts. Annotations
 * come from `tile.annotation` (optional) and live in a left-side sticky
 * column displayed in Georgia serif with a blue left-border accent.
 * A thin scroll-progress bar runs along the right edge of the container.
 *
 * Props:
 *   - tiles             array of chapter tiles
 *   - onChapterEnter    (chapterId) => void — fired when a chapter
 *                       becomes the active chapter (≥ 50% visible)
 */
export default function StoryLayout({ tiles = [], onChapterEnter, onTileClick }) {
  const containerRef = useRef(null);
  const [activeId, setActiveId] = useState(
    tiles.length > 0 ? String(tiles[0].id ?? 0) : null,
  );
  const [scrollProgress, setScrollProgress] = useState(0);

  // Scroll-progress bar: 0–1 fraction through the scrollable content.
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const max = scrollHeight - clientHeight;
    setScrollProgress(max > 0 ? scrollTop / max : 0);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;

    const sections = containerRef.current.querySelectorAll(
      "[data-testid^='layout-story-tile-']",
    );
    if (sections.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the greatest intersection ratio.
        let best = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry;
          }
        }
        if (best && best.target instanceof HTMLElement) {
          const id = best.target.getAttribute("data-chapter-id");
          if (id && id !== activeId) {
            setActiveId(id);
            if (onChapterEnter) onChapterEnter(id);
          }
        }
      },
      {
        root: containerRef.current,
        rootMargin: "-20% 0px -20% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [tiles, activeId, onChapterEnter]);

  if (tiles.length === 0) {
    return (
      <div
        data-testid="layout-story"
        style={{
          padding: 40,
          fontSize: 13,
          color: "var(--text-muted, rgba(255,255,255,0.5))",
          textAlign: "center",
          fontStyle: "italic",
        }}
      >
        Empty story. Add chapters by dragging tiles from the analytics drawer.
      </div>
    );
  }

  return (
    <div
      style={{ position: "relative", height: "100%" }}
    >
      {/* Scroll progress bar — thin vertical strip on the right edge */}
      <div
        data-testid="story-scroll-progress"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 3,
          height: "100%",
          background: "rgba(255,255,255,0.06)",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "100%",
            height: `${scrollProgress * 100}%`,
            background: "#3b82f6",
            transition: "height 80ms linear",
            borderRadius: "0 0 2px 2px",
          }}
        />
      </div>

      <div
        data-testid="layout-story"
        data-active-chapter={activeId || ""}
        ref={containerRef}
        style={{
          padding: 24,
          overflowY: "auto",
          height: "100%",
          background: "var(--bg-page, #06060e)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 48,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          {tiles.map((tile, i) => {
            const id = String(tile.id ?? i);
            const isActive = id === activeId;
            return (
              <section
                key={id}
                data-testid={`layout-story-tile-${id}`}
                data-chapter-id={id}
                data-active={isActive ? "true" : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: "280px 1fr",
                  gap: 28,
                  alignItems: "start",
                  opacity: isActive ? 1 : 0.55,
                  transition: "opacity 400ms ease",
                }}
              >
                {/* Annotation column — sticky while chart scrolls past */}
                <div style={{ position: "sticky", top: 80, alignSelf: "start" }}>
                  {/* Chapter label */}
                  <div
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: isActive
                        ? "var(--accent, #3b82f6)"
                        : "var(--text-muted, rgba(255,255,255,0.35))",
                      marginBottom: 10,
                      transition: "color 400ms ease",
                      fontFamily: "Inter, system-ui, sans-serif",
                    }}
                  >
                    Chapter {i + 1}
                  </div>

                  {/* Annotation card — only rendered when annotation text exists */}
                  {tile.annotation && (
                    <div
                      data-testid={`annotation-${tile.id}`}
                      style={{
                        padding: "14px 16px",
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: "var(--text-primary, rgba(255,255,255,0.88))",
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        borderLeft: "3px solid #3b82f6",
                        paddingLeft: 16,
                        background: isActive
                          ? "rgba(59,130,246,0.07)"
                          : "transparent",
                        borderRadius: "0 6px 6px 0",
                        transition: "background 400ms ease",
                      }}
                    >
                      {tile.annotation}
                    </div>
                  )}

                  {/* Fallback label when no annotation */}
                  {!tile.annotation && tile.subtitle && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary, #b0b0b6)",
                        fontStyle: "italic",
                        borderLeft: `3px solid ${isActive ? "var(--accent, #60a5fa)" : "rgba(255,255,255,0.1)"}`,
                        paddingLeft: 12,
                        transition: "border-color 400ms ease",
                      }}
                    >
                      {tile.subtitle}
                    </div>
                  )}
                </div>

                {/* Chart tile */}
                <div style={{ minHeight: 260 }}>
                  <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
