import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EditorCanvas from '../../../components/editor/EditorCanvas';
import { SIMPLE_BAR } from '../fixtures/canonical-charts';
import type { ChartSpec } from '../../types';

const MAP_SPEC: ChartSpec = {
  $schema: 'askdb/chart-spec/v1',
  type: 'map',
  map: {
    provider: 'maplibre',
    style: 'positron',
    center: [0, 0],
    zoom: 2,
    layers: [],
  },
};

const GEO_OVERLAY_SPEC: ChartSpec = {
  $schema: 'askdb/chart-spec/v1',
  type: 'geo-overlay',
  overlay: { layers: [] },
};

const CREATIVE_SPEC: ChartSpec = {
  $schema: 'askdb/chart-spec/v1',
  type: 'creative',
  creative: { engine: 'three', component: 'Hologram', props: {} },
};

const resultSet = {
  columns: ['category', 'value'],
  rows: [
    ['A', 10],
    ['B', 20],
    ['C', 30],
  ],
};

describe('EditorCanvas routing via routeSpecWithStrategy', () => {
  it('routes a cartesian spec to VegaRenderer (vega-lite)', () => {
    render(<EditorCanvas spec={SIMPLE_BAR} resultSet={resultSet} />);
    const canvas = screen.getByTestId('editor-canvas');
    expect(canvas.getAttribute('data-renderer-id')).toBe('vega-lite');
    expect(screen.getByTestId('vega-renderer')).toBeDefined();
  });

  it('routes a map spec to MapLibreRenderer placeholder', () => {
    render(<EditorCanvas spec={MAP_SPEC} resultSet={resultSet} />);
    const canvas = screen.getByTestId('editor-canvas');
    expect(canvas.getAttribute('data-renderer-id')).toBe('maplibre');
    const placeholder = screen.getByTestId('renderer-placeholder');
    expect(placeholder.getAttribute('data-title')).toBe('MapLibre renderer');
  });

  it('routes a geo-overlay spec to DeckRenderer placeholder', () => {
    render(<EditorCanvas spec={GEO_OVERLAY_SPEC} resultSet={resultSet} />);
    const canvas = screen.getByTestId('editor-canvas');
    expect(canvas.getAttribute('data-renderer-id')).toBe('deckgl');
    const placeholder = screen.getByTestId('renderer-placeholder');
    expect(placeholder.getAttribute('data-title')).toBe('deck.gl renderer');
  });

  it('routes a creative spec to CreativeRenderer placeholder', () => {
    render(<EditorCanvas spec={CREATIVE_SPEC} resultSet={resultSet} />);
    const canvas = screen.getByTestId('editor-canvas');
    expect(canvas.getAttribute('data-renderer-id')).toBe('three');
    const placeholder = screen.getByTestId('renderer-placeholder');
    expect(placeholder.getAttribute('data-title')).toBe('Creative (Three.js) renderer');
  });

  it('mounts the real VegaLite view for a cartesian spec (B2.2 contract)', () => {
    render(<EditorCanvas spec={SIMPLE_BAR} resultSet={resultSet} />);
    const view = screen.getByTestId('vega-renderer-view');
    expect(view).toBeDefined();
    // The VegaLite component renders into the view wrapper. Assert its
    // presence without depending on Vega's internal DOM structure.
    const renderer = screen.getByTestId('vega-renderer');
    expect(renderer.getAttribute('data-vega-backend')).toMatch(/svg|canvas/);
    expect(Number(renderer.getAttribute('data-row-count'))).toBe(3);
    expect(Number(renderer.getAttribute('data-downsampled-to'))).toBe(3);
  });

  it('shows empty state when no spec provided', () => {
    render(<EditorCanvas spec={undefined} resultSet={resultSet} />);
    expect(screen.getByTestId('editor-canvas-empty')).toBeDefined();
  });
});
