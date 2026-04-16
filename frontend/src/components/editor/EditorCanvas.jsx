import { useMemo, useState, useCallback, useEffect } from "react";
import { routeSpecWithStrategy } from "../../chart-ir";
import { getGPUTier } from "../../lib/gpuDetect";
import VegaRenderer from "./renderers/VegaRenderer";
import MapLibreRenderer from "./renderers/MapLibreRenderer";
import DeckRenderer from "./renderers/DeckRenderer";
import CreativeRenderer from "./renderers/CreativeRenderer";
import OnObjectOverlay from "./onobject/OnObjectOverlay";
import TierBadge from "./TierBadge";
import { useStore } from "../../store";

/**
 * EditorCanvas — center pane. Dispatches to a renderer via
 * routeSpecWithStrategy(). For Phase 1, only VegaRenderer is a real (stub)
 * implementation that renders the compiled Vega-Lite JSON in a <pre>. The
 * other three renderers render placeholder cards explaining when the real
 * integration lands.
 */
export default function EditorCanvas({ spec, resultSet, onSpecChange }) {
  const [vegaView, setVegaView] = useState(null);
  const handleViewReady = useCallback((view) => setVegaView(view), []);

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
    if (!spec) return null;
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
  }, [spec, resultProfile]);

  if (!spec) {
    return <CanvasEmpty message="No chart spec provided" />;
  }
  if (routing?.error) {
    return <CanvasEmpty message={`Routing error: ${routing.error}`} />;
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
