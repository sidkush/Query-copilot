import { useEffect, useRef, useState, useCallback } from "react";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import { ARCHETYPE_THEMES, TOKENS } from "../tokens";
import { getChapterAccent } from "../lib/archetypeStyling";
import { BreathingDot } from "../motion";

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
          color: "var(--text-muted, #64748b)",
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
      className="story-layout-root"
      style={{
        position: "relative",
        height: "100%",
        background: THEME.background.dashboard,
        display: "grid",
        gridTemplateColumns: "minmax(0, 160px) 1fr",
      }}
    >
      {/* ── Chapter nav rail (left) ── */}
      <ChapterRail
        tiles={tiles}
        activeId={activeId}
        onJump={scrollToChapter}
      />

      <div style={{ position: "relative", minWidth: 0 }}>
        {/* Scroll progress — 2px SVG line on the left margin of the
            scrollable viewport growing top→bottom with scroll fraction */}
        <svg
          data-testid="story-scroll-progress"
          aria-hidden="true"
          width="2"
          preserveAspectRatio="none"
          viewBox="0 0 2 100"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 2,
            height: "100%",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <line x1="1" y1="0" x2="1" y2="100" stroke="var(--border-default, rgba(15,23,42,0.08))" strokeWidth="2" />
          <line
            x1="1"
            y1="0"
            x2="1"
            y2={scrollProgress * 100}
            stroke={THEME.accent}
            strokeWidth="2"
            style={{ transition: "y2 80ms linear" }}
          />
        </svg>

        <div
          data-testid="layout-story"
          data-active-chapter={activeId || ""}
          ref={containerRef}
          className="story-layout-scroll"
          style={{
            padding: "40px 32px",
            overflowY: "auto",
            height: "100%",
            color: "var(--text-primary, #1f2937)",
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
                        color: isActive ? chapterAccent : "var(--text-muted)",
                        marginBottom: 14,
                        transition: "color 400ms ease",
                        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      Chapter {String(i + 1).padStart(2, "0")}
                    </div>

                    {/* Chapter title (serif) — first letter rendered as drop-cap
                        in the display font for editorial gravitas */}
                    {tile.title && (() => {
                      const first = tile.title.charAt(0);
                      const rest = tile.title.slice(1);
                      return (
                        <div
                          style={{
                            fontSize: 24,
                            lineHeight: 1.25,
                            color: "var(--text-primary, #0f172a)",
                            fontFamily: THEME.typography.headingFont,
                            fontWeight: THEME.typography.headingWeight,
                            marginBottom: 14,
                            letterSpacing: "-0.01em",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              float: "left",
                              fontFamily: TOKENS.fontDisplay,
                              fontWeight: 800,
                              fontSize: 48,
                              lineHeight: 0.9,
                              color: chapterAccent,
                              paddingRight: 6,
                              paddingTop: 4,
                              letterSpacing: "-0.04em",
                            }}
                          >
                            {first}
                          </span>
                          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                            {first}
                          </span>
                          {rest}
                        </div>
                      );
                    })()}

                    {/* Annotation — editorial serif body */}
                    {tile.annotation && (
                      <div
                        data-testid={`annotation-${tile.id}`}
                        style={{
                          padding: "12px 18px",
                          fontSize: 16,
                          lineHeight: 1.75,
                          color: "var(--text-secondary, #334155)",
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
                          color: "var(--text-muted, #64748b)",
                          fontStyle: "italic",
                          borderLeft: `3px solid ${isActive ? chapterAccent : "var(--border-default)"}`,
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
                      border: "1px solid var(--border-default, rgba(15,23,42,0.06))",
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
          /* Below the tablet breakpoint, collapse the chapter rail so the
             chart + annotation column get the full viewport width. The rail
             stays in the DOM (screen reader still reaches it) but occupies
             0 columns; a future hamburger affordance can toggle it back. */
          @media (max-width: 768px) {
            .story-layout-root {
              grid-template-columns: 0 1fr !important;
            }
            .story-layout-root [data-testid="story-chapter-rail"] {
              display: none;
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
        borderRight: "1px solid var(--border-default, rgba(15,23,42,0.06))",
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
          color: "var(--text-muted, rgba(15,23,42,0.5))",
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
              color: isActive ? accent : "var(--text-secondary, rgba(15,23,42,0.55))",
              fontSize: 11,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: "0.02em",
              transition: "color 200ms ease",
            }}
          >
            {isActive ? (
              <BreathingDot color={accent} size={6} glow={false} />
            ) : (
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--border-hover, rgba(15,23,42,0.15))",
                  flexShrink: 0,
                  transition: "all 300ms ease",
                }}
              />
            )}
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
