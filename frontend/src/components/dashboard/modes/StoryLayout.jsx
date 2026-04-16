import { useEffect, useRef, useState, useCallback } from "react";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import { ARCHETYPE_THEMES } from "../tokens";
import { getChapterAccent } from "../lib/archetypeStyling";

/**
 * StoryLayout — SP-6 polish pass.
 *
 * NYT/Pudding editorial scrollytelling. Driven by ARCHETYPE_THEMES.story:
 *   - Cream paper bg (#FDFBF7), forced light scheme
 *   - Serif body (Source Serif 4 → Georgia), serif chapter headings
 *   - Sticky annotation column with per-chapter accent color
 *   - NEW: Chapter navigation rail on the left — 140px sticky index
 *     listing chapters; click scrolls to chapter
 *   - Scroll-progress bar on the right edge
 *   - Muted palette — inactive chapters fade to 0.55 opacity
 *   - Print-friendly: page break per chapter
 */
const THEME = ARCHETYPE_THEMES.story;

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

  const scrollToChapter = (id) => {
    const root = containerRef.current;
    if (!root) return;
    const target = root.querySelector(`[data-chapter-id="${id}"]`);
    if (target && "scrollIntoView" in target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (tiles.length === 0) {
    return (
      <div
        data-testid="layout-story"
        style={{
          padding: 40,
          fontSize: 15,
          color: "#64748b",
          textAlign: "center",
          fontStyle: "italic",
          fontFamily: THEME.typography.bodyFont,
          background: THEME.background.dashboard,
          minHeight: "100%",
        }}
      >
        Empty story. Add chapters by dragging tiles from the analytics drawer.
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        background: THEME.background.dashboard,
        display: "grid",
        gridTemplateColumns: "160px 1fr",
      }}
    >
      {/* ── Chapter nav rail (left) ── */}
      <ChapterRail
        tiles={tiles}
        activeId={activeId}
        onJump={scrollToChapter}
      />

      <div style={{ position: "relative", minWidth: 0 }}>
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
            background: "rgba(15,23,42,0.06)",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: "100%",
              height: `${scrollProgress * 100}%`,
              background: THEME.accent,
              transition: "height 80ms linear",
              borderRadius: "0 0 2px 2px",
            }}
          />
        </div>

        <div
          data-testid="layout-story"
          data-active-chapter={activeId || ""}
          ref={containerRef}
          className="story-layout-scroll"
          style={{
            padding: "40px 32px",
            overflowY: "auto",
            height: "100%",
            color: "#1f2937",
            fontFamily: THEME.typography.bodyFont,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 72,
              maxWidth: 1100,
              margin: "0 auto",
            }}
          >
            {tiles.map((tile, i) => {
              const id = String(tile.id ?? i);
              const isActive = id === activeId;
              const chapterAccent = getChapterAccent(i);
              return (
                <section
                  key={id}
                  data-testid={`layout-story-tile-${id}`}
                  data-chapter-id={id}
                  data-active={isActive ? "true" : undefined}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "300px 1fr",
                    gap: 36,
                    alignItems: "start",
                    opacity: isActive ? 1 : 0.55,
                    transition: "opacity 500ms ease",
                    pageBreakBefore: "auto",
                    breakInside: "avoid",
                  }}
                >
                  {/* Annotation column — sticky while chart scrolls past */}
                  <div style={{ position: "sticky", top: 80, alignSelf: "start" }}>
                    {/* Chapter label */}
                    <div
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.18em",
                        color: isActive ? chapterAccent : "rgba(15,23,42,0.35)",
                        marginBottom: 14,
                        transition: "color 400ms ease",
                        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      Chapter {String(i + 1).padStart(2, "0")}
                    </div>

                    {/* Chapter title (serif) */}
                    {tile.title && (
                      <div
                        style={{
                          fontSize: 24,
                          lineHeight: 1.25,
                          color: "#0f172a",
                          fontFamily: THEME.typography.headingFont,
                          fontWeight: THEME.typography.headingWeight,
                          marginBottom: 14,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {tile.title}
                      </div>
                    )}

                    {/* Annotation — editorial serif body */}
                    {tile.annotation && (
                      <div
                        data-testid={`annotation-${tile.id}`}
                        style={{
                          padding: "12px 18px",
                          fontSize: 16,
                          lineHeight: 1.75,
                          color: "#334155",
                          fontFamily: THEME.typography.bodyFont,
                          borderLeft: `3px solid ${chapterAccent}`,
                          background: isActive
                            ? `color-mix(in oklab, ${chapterAccent} 6%, transparent)`
                            : "transparent",
                          borderRadius: "0 6px 6px 0",
                          transition: "background 400ms ease",
                        }}
                      >
                        {tile.annotation}
                      </div>
                    )}

                    {!tile.annotation && tile.subtitle && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#64748b",
                          fontStyle: "italic",
                          borderLeft: `3px solid ${isActive ? chapterAccent : "rgba(15,23,42,0.1)"}`,
                          paddingLeft: 14,
                          transition: "border-color 400ms ease",
                        }}
                      >
                        {tile.subtitle}
                      </div>
                    )}
                  </div>

                  {/* Chart tile */}
                  <div
                    style={{
                      minHeight: 280,
                      background: THEME.background.tile,
                      borderRadius: THEME.spacing.tileRadius,
                      border: "1px solid rgba(15,23,42,0.06)",
                      overflow: "hidden",
                    }}
                  >
                    <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <style>{`
          @media print {
            .story-layout-scroll section {
              page-break-after: always;
              opacity: 1 !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

/**
 * Left-rail chapter index. Sticky, shows all chapter numbers + a dot
 * per chapter that fills in as the reader scrolls. Clicking a row
 * smooth-scrolls the chart viewport to that chapter.
 */
function ChapterRail({ tiles, activeId, onJump }) {
  return (
    <nav
      data-testid="story-chapter-rail"
      aria-label="Chapter navigation"
      style={{
        position: "sticky",
        top: 0,
        alignSelf: "start",
        height: "100%",
        padding: "40px 12px 40px 20px",
        borderRight: "1px solid rgba(15,23,42,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "rgba(15,23,42,0.5)",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Story
      </div>
      {tiles.map((tile, i) => {
        const id = String(tile.id ?? i);
        const isActive = id === activeId;
        const accent = getChapterAccent(i);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onJump(id)}
            style={{
              appearance: "none",
              background: "none",
              border: "none",
              padding: "4px 6px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              textAlign: "left",
              color: isActive ? accent : "rgba(15,23,42,0.55)",
              fontSize: 11,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: "0.02em",
              transition: "color 200ms ease",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isActive ? accent : "rgba(15,23,42,0.15)",
                flexShrink: 0,
                boxShadow: isActive ? `0 0 0 3px color-mix(in oklab, ${accent} 15%, transparent)` : "none",
                transition: "all 300ms ease",
              }}
            />
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {String(i + 1).padStart(2, "0")} · {tile.title || "Untitled"}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
