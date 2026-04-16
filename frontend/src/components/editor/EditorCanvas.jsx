import { useMemo, useState, useCallback, useEffect } from "react";
import { routeSpecWithStrategy } from "../../chart-ir";
import { getGPUTier } from "../../lib/gpuDetect";
import VegaRenderer from "./renderers/VegaRenderer";
import MapLibreRenderer from "./renderers/MapLibreRenderer";
import DeckRenderer from "./renderers/DeckRenderer";
import CreativeRenderer from "./renderers/CreativeRenderer";
import OnObjectOverlay from "./onobject/OnObjectOverlay";
import TierBadge from "./TierBadge";
import IframeChartHost from "../chartTypes/IframeChartHost";
import DevVizLoader from "../chartTypes/DevVizLoader";
import { useStore } from "../../store";

/**
 * EditorCanvas — center pane. Dispatches to a renderer via
 * routeSpecWithStrategy(). For Phase 1, only VegaRenderer is a real (stub)
 * implementation that renders the compiled Vega-Lite JSON in a <pre>. The
 * other three renderers render placeholder cards explaining when the real
 * integration lands.
 */
export default function EditorCanvas({ spec, resultSet, onSpecChange, onDrillthrough }) {
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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
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
    return <CanvasEmpty message="No chart spec provided" />;
  }
  if (routing?.error) {
    return <CanvasEmpty message={`Routing error: ${routing.error}`} />;
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

  return (
    <div
      data-testid="editor-canvas"
      data-renderer-id={rendererId}
      data-strategy-tier={strategy.tier}
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        padding: 16,
        background: "var(--bg-canvas, rgba(255,255,255,0.015))",
        overflow: "auto",
      }}
    >
      <TierBadge strategy={strategy} />
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

function CanvasEmpty({ message }) {
  return (
    <div
      data-testid="editor-canvas-empty"
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}
