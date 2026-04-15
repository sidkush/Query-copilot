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
 */
import type { ChartSpec, SpecType } from './types';

export type RendererId = 'vega-lite' | 'maplibre' | 'deckgl' | 'three';

/** Route a ChartSpec to its renderer. Pure function. */
export function routeSpec(spec: ChartSpec): RendererId {
  return mapTypeToRenderer(spec.type);
}

function mapTypeToRenderer(type: SpecType | string): RendererId {
  switch (type) {
    case 'cartesian':
      return 'vega-lite';
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
