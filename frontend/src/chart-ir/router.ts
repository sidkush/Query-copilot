/**
 * IR Router — dispatches a ChartSpec to the appropriate renderer based on
 * spec.type. Each renderer is implemented as a separate React component
 * with a uniform props interface. The router lives in the IR layer (no
 * React imports here) so it can be used by both the frontend and the
 * server-side validation tools.
 *
 * Renderer modules:
 *   - vega-lite: components/editor/renderers/VegaRenderer.tsx (Phase 1)
 *   - maplibre:  components/editor/renderers/MapLibreRenderer.tsx (Phase 1)
 *   - deckgl:    components/editor/renderers/DeckRenderer.tsx (Phase 4)
 *   - three:     components/editor/renderers/CreativeRenderer.tsx (Phase 5)
 *
 * Sub-project B (task B2.1) adds a richer `routeSpecWithStrategy()` variant
 * that consults the Render Strategy Router (RSR) to pick a specific backend
 * (SVG / Canvas / WebGL) and downsample decision on top of the family ID.
 * The plain `routeSpec()` remains as the sub-project A entry point for
 * callers that don't want RSR's additional inputs.
 */
import { pickRenderStrategy } from './rsr/renderStrategyRouter';
import type {
  InstancePressure,
  RenderStrategy,
  ResultProfile,
  FrameBudgetState,
  GpuTier,
  StrategyTier,
} from './rsr/strategy';
import type { ChartSpec, SpecType } from './types';

export type RendererId = 'vizql' | 'vega-lite' | 'maplibre' | 'deckgl' | 'three';

/** Route a ChartSpec to its renderer. Pure function. */
export function routeSpec(spec: ChartSpec): RendererId {
  return mapTypeToRenderer(spec.type);
}

function mapTypeToRenderer(type: SpecType | string): RendererId {
  switch (type) {
    case 'cartesian':
      return 'vizql';
    case 'map':
      return 'maplibre';
    case 'geo-overlay':
      return 'deckgl';
    case 'creative':
      return 'three';
    default:
      throw new Error(`Unknown spec type: ${type}`);
  }
}

/**
 * Map a RenderStrategy's rendererFamily onto a concrete RendererId. Strategy
 * families are logical ('vega' / 'deck' / ...); IDs are the physical
 * renderer components A ships. T2/T3 cartesian strategies override the
 * spec-type-based mapping — e.g., a 10M-row cartesian line chart is still
 * spec.type === 'cartesian' but must render via the deck.gl path.
 */
function familyToRendererId(family: RenderStrategy['rendererFamily']): RendererId {
  switch (family) {
    case 'vega':
      return 'vizql';
    case 'vizql':
      return 'vizql';
    case 'deck':
      return 'deckgl';
    case 'maplibre':
      return 'maplibre';
    case 'creative':
      return 'three';
    default: {
      // Exhaustiveness — compile error if a new family is added without updating this map
      const _exhaustive: never = family;
      void _exhaustive;
      throw new Error(`Unmapped renderer family: ${String(family)}`);
    }
  }
}

/** Routing input for {@link routeSpecWithStrategy}. */
export interface RouteWithStrategyInput {
  spec: ChartSpec;
  resultProfile: ResultProfile;
  gpuTier: GpuTier;
  frameBudgetState: FrameBudgetState;
  instancePressure: InstancePressure;
  pixelWidth?: number;
  hint?: StrategyTier;
}

/** Routing output for {@link routeSpecWithStrategy}. */
export interface RouteWithStrategyResult {
  rendererId: RendererId;
  strategy: RenderStrategy;
}

/**
 * B2.1 — Route a ChartSpec to its renderer AND pick a concrete render
 * strategy (backend, downsample method, streaming). The renderer ID can
 * differ from {@link routeSpec}'s output when RSR escalates a cartesian
 * spec onto the deck.gl path (large scatter, huge time series).
 *
 * Pure function. Consumers in Phase B2.2+ will pass the resulting
 * `strategy` into their renderer components as props.
 */
export function routeSpecWithStrategy(
  input: RouteWithStrategyInput,
): RouteWithStrategyResult {
  const strategy = pickRenderStrategy({
    spec: input.spec,
    resultProfile: input.resultProfile,
    gpuTier: input.gpuTier,
    frameBudgetState: input.frameBudgetState,
    instancePressure: input.instancePressure,
    pixelWidth: input.pixelWidth,
    hint: input.hint,
  });
  return {
    rendererId: familyToRendererId(strategy.rendererFamily),
    strategy,
  };
}
