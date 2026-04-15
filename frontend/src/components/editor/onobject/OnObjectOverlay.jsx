import { useEffect, useRef, useState, useCallback } from "react";
import AxisPopover from "./AxisPopover";
import LegendPopover from "./LegendPopover";
import SeriesPopover from "./SeriesPopover";

/**
 * OnObjectOverlay — the click-capture surface for in-chart editing.
 *
 * Phase 2b contract:
 *   - Receives the Vega `view` via props (from VegaRenderer's onNewView
 *     callback when B2.2 mounts the real view). Until then, the overlay
 *     can also be driven by DOM event capture on the wrapping div — see
 *     the fallback hit-test in handleClick below.
 *   - Hit-tests clicks against the Vega scenegraph (group markname =
 *     'axis', 'legend', 'title', or a mark name). The scenegraph is
 *     inspected via view.scenegraph() which returns the root Scene.
 *   - Opens one of the popover components anchored to the click point.
 *
 * Popover anchoring uses @floating-ui/react for positioning. The
 * overlay component itself only tracks the active target + the mouse
 * coordinates; each popover handles its own visibility state.
 *
 * This is a shell implementation — it captures clicks and opens the
 * correct popover but the Vega scenegraph introspection is minimal
 * (reads item.mark.marktype to distinguish axis vs legend vs mark).
 * Richer detail like "which axis side" or "which legend entry" ships
 * in Phase 2b.2 alongside the popover body expansions.
 */
export default function OnObjectOverlay({ view, spec, onSpecChange, children }) {
  const containerRef = useRef(null);
  const [active, setActive] = useState(null);
  // active: null | { kind: 'axis' | 'legend' | 'series' | 'title', x, y, meta }

  const handleClick = useCallback(
    (e) => {
      // Only intercept primary clicks; right-click opens the context menu.
      if (e.button !== 0) return;
      // Don't hijack clicks inside popovers themselves.
      if (e.target.closest("[data-on-object-popover]")) return;
      if (!view || typeof view.scenegraph !== "function") {
        // No real Vega view — fall back to DOM-based hit testing via data
        // attributes on the renderer output. Lets us exercise the flow in
        // jsdom tests without mounting react-vega.
        const axisHit = e.target.closest("[data-vega-role='axis']");
        if (axisHit) {
          const rect = axisHit.getBoundingClientRect();
          setActive({ kind: "axis", x: rect.left + rect.width / 2, y: rect.top, meta: {} });
          return;
        }
        const legendHit = e.target.closest("[data-vega-role='legend']");
        if (legendHit) {
          const rect = legendHit.getBoundingClientRect();
          setActive({ kind: "legend", x: rect.left + rect.width / 2, y: rect.top, meta: {} });
          return;
        }
        setActive(null);
        return;
      }
      // Real Vega view present — use scenegraph hit-test.
      try {
        const scene = view.scenegraph().root;
        const hit = findHitTarget(scene, e.offsetX, e.offsetY);
        if (hit) {
          setActive({ kind: hit.kind, x: e.clientX, y: e.clientY, meta: hit.meta });
          return;
        }
      } catch {
        // Scenegraph API shape may vary across Vega versions; fail soft.
      }
      setActive(null);
    },
    [view],
  );

  const handleClose = useCallback(() => setActive(null), []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.addEventListener("click", handleClick);
    return () => node.removeEventListener("click", handleClick);
  }, [handleClick]);

  return (
    <div
      data-testid="on-object-overlay"
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {children}
      {active?.kind === "axis" && (
        <AxisPopover
          x={active.x}
          y={active.y}
          spec={spec}
          onSpecChange={onSpecChange}
          onClose={handleClose}
        />
      )}
      {active?.kind === "legend" && (
        <LegendPopover
          x={active.x}
          y={active.y}
          spec={spec}
          onSpecChange={onSpecChange}
          onClose={handleClose}
        />
      )}
      {active?.kind === "series" && (
        <SeriesPopover
          x={active.x}
          y={active.y}
          spec={spec}
          meta={active.meta}
          onSpecChange={onSpecChange}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

/**
 * Walk the Vega scenegraph root looking for the element containing the
 * given (x, y) coordinates. Returns `{ kind, meta }` or null.
 *
 * This is a minimal implementation — it traverses groups and checks
 * `item.marktype` or `item.name` against well-known role markers. Vega
 * itself ships a richer hit-test via the View API but using that
 * requires the view instance, not just its scenegraph.
 */
function findHitTarget(scene, x, y) {
  if (!scene || !scene.items) return null;
  for (const item of scene.items) {
    if (!item) continue;
    const isAxis = item.role === "axis" || item.name === "axis" || item.marktype === "group" && item.role === "axis";
    const isLegend = item.role === "legend" || item.name === "legend";
    const isTitle = item.role === "title" || item.name === "title";
    if (isAxis && hitInside(item, x, y)) {
      return { kind: "axis", meta: { orient: item.orient } };
    }
    if (isLegend && hitInside(item, x, y)) {
      return { kind: "legend", meta: { orient: item.orient } };
    }
    if (isTitle && hitInside(item, x, y)) {
      return { kind: "title", meta: {} };
    }
    if (item.items) {
      const nested = findHitTarget(item, x, y);
      if (nested) return nested;
    }
  }
  return null;
}

function hitInside(item, x, y) {
  const b = item.bounds;
  if (!b) return false;
  return x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2;
}
