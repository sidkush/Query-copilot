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
  it('routes a cartesian spec to VizQLRenderer (vizql)', () => {
    render(<EditorCanvas spec={SIMPLE_BAR} resultSet={resultSet} />);
    const canvas = screen.getByTestId('editor-canvas');
    expect(canvas.getAttribute('data-renderer-id')).toBe('vizql');
    expect(screen.getByTestId('vizql-renderer')).toBeDefined();
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

  it('routes a creative spec to CreativeRenderer and resolves via the creative registry', () => {
    render(<EditorCanvas spec={CREATIVE_SPEC} resultSet={resultSet} />);
    const canvas = screen.getByTestId('editor-canvas');
    expect(canvas.getAttribute('data-renderer-id')).toBe('three');
    // In jsdom getGPUTier() returns 'low' (no canvas context), so the
    // creative renderer renders the placeholder card with the
    // registry-resolved component name in its title.
    const placeholder = screen.getByTestId('renderer-placeholder');
    expect(placeholder.getAttribute('data-title')).toContain('Hologram');
  });

  it('mounts the VizQL renderer for a cartesian spec (post-VizQL migration)', () => {
    render(<EditorCanvas spec={SIMPLE_BAR} resultSet={resultSet} />);
    const renderer = screen.getByTestId('vizql-renderer');
    expect(renderer).toBeDefined();
    // VizQLRenderer renders into a <canvas> child; verify the canvas is mounted.
    expect(renderer.querySelector('canvas')).not.toBeNull();
  });

  it('shows empty state when no spec provided', () => {
    render(<EditorCanvas spec={undefined} resultSet={resultSet} />);
    expect(screen.getByTestId('editor-canvas-empty')).toBeDefined();
  });
});
