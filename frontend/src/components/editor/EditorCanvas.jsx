import { useMemo, useState, useCallback, useEffect } from "react";
import { routeSpecWithStrategy } from "../../chart-ir";
import { getGPUTier } from "../../lib/gpuDetect";
import VizQLRenderer from "./renderers/VizQLRenderer";
import VegaRenderer from "./renderers/VegaRenderer";
import MapLibreRenderer from "./renderers/MapLibreRenderer";
import DeckRenderer from "./renderers/DeckRenderer";
import CreativeRenderer from "./renderers/CreativeRenderer";
import OnObjectOverlay from "./onobject/OnObjectOverlay";
import TierBadge from "./TierBadge";
import IframeChartHost from "../chartTypes/IframeChartHost";
import DevVizLoader from "../chartTypes/DevVizLoader";
import { useStore } from "../../store";
import { TOKENS } from "../dashboard/tokens";

/**
 * EditorCanvas — center pane. Dispatches to a renderer via
 * routeSpecWithStrategy(). For Phase 1, only VegaRenderer is a real (stub)
 * implementation that renders the compiled Vega-Lite JSON in a <pre>. The
 * other three renderers render placeholder cards explaining when the real
 * integration lands.
 */
export default function EditorCanvas({ spec, resultSet, onSpecChange, onDrillthrough, onDeselect, mode, sheetId, onMarkSelect }) {
  const [vegaView, setVegaView] = useState(null);
  const handleViewReady = useCallback((view) => setVegaView(view), []);
  const colorMap = useStore((s) => s.colorMap);
  const installedTypes = useStore((s) => s.installedChartTypes);

  // --- Dev-viz mode: ?dev-viz=<url> short-circuits all renderer logic -------
  // Computed unconditionally so hooks order is stable (Rules of Hooks).
  const devVizUrl = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('dev-viz')
    : null;

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'p') {
        e.preventDefault();
        useStore.getState().toggleTierBadge();
        return;
      }
      // Escape — clear any selection / exit inline editor on the canvas.
      // Ignore when typing into an input or contenteditable surface so we
      // don't steal ESC from the BottomDock text field.
      if (e.key === 'Escape') {
        const t = e.target;
        const tag = t?.tagName;
        const editable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          t?.isContentEditable;
        if (editable) return;
        if (typeof onDeselect === 'function') {
          onDeselect();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDeselect]);
  const resultProfile = useMemo(() => buildResultProfile(spec, resultSet), [spec, resultSet]);

  const routing = useMemo(() => {
    if (!spec || devVizUrl) return null;
    try {
      return routeSpecWithStrategy({
        spec,
        resultProfile,
        gpuTier: getGPUTier() || "medium",
        frameBudgetState: "normal",
        instancePressure: { activeContexts: 0, max: 8, pressureRatio: 0 },
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [spec, resultProfile, devVizUrl]);

  // --- Dev-viz early return — after all hooks, before Tier 2 / spec routing --
  if (devVizUrl) {
    return (
      <div
        data-testid="editor-canvas"
        data-renderer-id="dev-viz"
        data-strategy-tier="dev"
        style={{
          position: "relative",
          height: "100%",
          width: "100%",
          padding: 16,
          background: "var(--bg-canvas, rgba(255,255,255,0.015))",
          overflow: "auto",
          boxSizing: "border-box",
        }}
      >
        <DevVizLoader
          devUrl={devVizUrl}
          data={resultSet}
          viewport={{ width: 0, height: 0 }}
          theme={{}}
        />
      </div>
    );
  }

  // --- Tier 2: user-authored code-based chart type (Sub-project C) -------
  // If the spec carries a userTypeId that resolves to a 'code' tier type
  // with a compiled bundle, short-circuit to IframeChartHost. This check
  // runs before VegaRenderer so user types take priority over the default
  // Vega-Lite path. The common case (no userTypeId) skips this entirely.
  const customType = spec?.userTypeId
    ? installedTypes.find((t) => t.id === spec.userTypeId)
    : null;

  if (!spec) {
    return <CanvasEmpty message="No chart spec provided" mode={mode} />;
  }
  if (routing?.error) {
    return <CanvasEmpty message={`Routing error: ${routing.error}`} mode={mode} />;
  }

  // Render Tier 2 iframe sandbox if the spec targets a code-based user type.
  if (customType?.tier === 'code' && customType.bundle) {
    return (
      <div
        data-testid="editor-canvas"
        data-renderer-id="iframe-custom"
        data-strategy-tier="2"
        style={{
          position: "relative",
          height: "100%",
          width: "100%",
          padding: 16,
          background: "var(--bg-canvas, rgba(255,255,255,0.015))",
          overflow: "auto",
        }}
      >
        <IframeChartHost
          bundle={customType.bundle}
          data={resultSet}
          viewport={{ width: 0, height: 0 }}
          theme={{}}
          config={customType.config || {}}
        />
      </div>
    );
  }

  const { rendererId, strategy } = routing;
  const isStage = mode === "stage";

  return (
    <div
      data-testid="editor-canvas"
      data-renderer-id={rendererId}
      data-strategy-tier={strategy.tier}
      className="premium-grid-canvas"
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        padding: 16,
        background: "var(--bg-canvas, rgba(255,255,255,0.015))",
        overflow: "auto",
        boxShadow: isStage ? TOKENS.shadow.innerGlass : undefined,
      }}
    >
      <TierBadge strategy={strategy} />
      {rendererId === "vizql" && (
        <VizQLRenderer
          spec={spec}
          resultSet={resultSet}
          strategy={strategy}
          onDrillthrough={onDrillthrough}
        />
      )}
      {rendererId === "vega-lite" && (
        <OnObjectOverlay view={vegaView} spec={spec} onSpecChange={onSpecChange}>
          <VegaRenderer
            spec={spec}
            resultSet={resultSet}
            rendererBackend={strategy.rendererBackend}
            strategy={strategy}
            onViewReady={handleViewReady}
            colorMap={colorMap}
            onDrillthrough={onDrillthrough}
            sheetId={sheetId}
            onMarkSelect={onMarkSelect}
          />
        </OnObjectOverlay>
      )}
      {rendererId === "maplibre" && <MapLibreRenderer spec={spec} />}
      {rendererId === "deckgl" && <DeckRenderer spec={spec} />}
      {rendererId === "three" && <CreativeRenderer spec={spec} />}
    </div>
  );
}

function buildResultProfile(spec, resultSet) {
  const rowCount = resultSet?.rows?.length ?? 0;
  const enc = spec?.encoding ?? {};
  return {
    rowCount,
    xType: enc.x?.type,
    yType: enc.y?.type,
    markEligibleForDeck: true,
  };
}

function CanvasEmpty({ message, mode }) {
  const isStage = mode === "stage";
  return (
    <div
      data-testid="editor-canvas-empty"
      className="premium-grid-canvas"
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: "var(--bg-canvas, rgba(255,255,255,0.015))",
        boxShadow: isStage ? TOKENS.shadow.innerGlass : undefined,
      }}
    >
      {/* Title row skeleton */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          className="premium-shimmer-surface"
          style={{
            width: 180,
            height: 14,
            borderRadius: 4,
            background: "var(--overlay-light)",
          }}
        />
        <div
          className="premium-shimmer-surface"
          style={{
            width: 64,
            height: 10,
            borderRadius: 4,
            background: "var(--overlay-subtle)",
          }}
        />
      </div>
      {/* Chart body skeleton — aspect-ratio respecting rectangle */}
      <div
        className="premium-shimmer-surface"
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 8,
          background: "var(--overlay-faint)",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: 20,
          gap: 12,
        }}
      >
        {/* Column bars — hint at chart shape */}
        {[0.62, 0.38, 0.78, 0.45, 0.68, 0.52, 0.84].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h * 100}%`,
              borderRadius: 3,
              background: "var(--overlay-subtle)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 16,
          fontSize: 11,
          fontFamily: TOKENS.fontMono,
          color: "var(--text-muted, rgba(255,255,255,0.4))",
          letterSpacing: "0.02em",
        }}
      >
        {message}
      </div>
    </div>
  );
}
