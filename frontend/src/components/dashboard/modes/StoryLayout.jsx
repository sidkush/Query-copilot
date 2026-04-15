import { useEffect, useRef, useState } from "react";
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
 * come from `tile.annotation` (optional) and live in a left-side column
 * that remains sticky while the chart scrolls.
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
          gap: 40,
          maxWidth: 920,
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
                gridTemplateColumns: "240px 1fr",
                gap: 20,
                alignItems: "start",
                opacity: isActive ? 1 : 0.6,
                transition: "opacity 400ms ease",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary, #b0b0b6)",
                  fontStyle: "italic",
                  borderLeft: `3px solid ${
                    isActive ? "var(--accent, #60a5fa)" : "transparent"
                  }`,
                  paddingLeft: 12,
                  transition: "border-color 400ms ease",
                  position: "sticky",
                  top: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-muted, rgba(255,255,255,0.4))",
                    marginBottom: 6,
                  }}
                >
                  Chapter {i + 1}
                </div>
                {tile.annotation || tile.subtitle || "—"}
              </div>
              <div style={{ minHeight: 260 }}>
                <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
