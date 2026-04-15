/**
 * Registry of chart type metadata for the Show Me picker.
 * Each entry describes a chart's data requirements and how to construct
 * a starting ChartSpec from a result shape.
 *
 * Reference: docs/chart_systems_research.md §2.1 (Tableau Show Me catalog)
 */
import type { Mark, ChartSpec } from '../types';
import type { ResultShape, ColumnProfile } from './resultShape';

export type ChartCategory =
  | 'comparison'
  | 'trend'
  | 'distribution'
  | 'correlation'
  | 'composition'
  | 'ranking'
  | 'map'
  | 'table';

export interface ChartTypeRequirements {
  minDims?: number;
  minMeasures?: number;
  requiresTemporal?: boolean;
  requiresGeo?: boolean;
  maxRows?: number;
}

export interface ChartTypeDef {
  id: string;
  label: string;
  mark: Mark;
  category: ChartCategory;
  description: string;
  requires: ChartTypeRequirements;
  /** Build a starting ChartSpec from a result shape. */
  autoAssign(shape: ResultShape): ChartSpec;
}

/** Helper: pick the first dimension matching a semantic type. */
function firstDim(
  shape: ResultShape,
  type?: 'nominal' | 'temporal' | 'geographic',
): ColumnProfile | undefined {
  return shape.columns.find(
    (c) => c.role === 'dimension' && (!type || c.semanticType === type),
  );
}

/** Helper: pick the first measure column. */
function firstMeasure(shape: ResultShape): ColumnProfile | undefined {
  return shape.columns.find((c) => c.role === 'measure');
}

export const CHART_TYPES: ChartTypeDef[] = [
  {
    id: 'bar',
    label: 'Bar chart',
    mark: 'bar',
    category: 'comparison',
    description: 'Compare values across categories.',
    requires: { minDims: 1, minMeasures: 1 },
    autoAssign(shape) {
      const dim = firstDim(shape, 'nominal') ?? firstDim(shape);
      const measure = firstMeasure(shape);
      return {
        $schema: 'askdb/chart-spec/v1',
        type: 'cartesian',
        mark: 'bar',
        encoding: {
          x: dim ? { field: dim.name, type: dim.semanticType } : undefined,
          y: measure
            ? { field: measure.name, type: 'quantitative', aggregate: 'sum' }
            : undefined,
        },
      };
    },
  },
  {
    id: 'line',
    label: 'Line chart',
    mark: 'line',
    category: 'trend',
    description: 'Show change over time.',
    requires: { minMeasures: 1, requiresTemporal: true },
    autoAssign(shape) {
      const dim = firstDim(shape, 'temporal');
      const measure = firstMeasure(shape);
      return {
        $schema: 'askdb/chart-spec/v1',
        type: 'cartesian',
        mark: 'line',
        encoding: {
          x: dim ? { field: dim.name, type: 'temporal' } : undefined,
          y: measure
            ? { field: measure.name, type: 'quantitative', aggregate: 'sum' }
            : undefined,
        },
      };
    },
  },
  {
    id: 'area',
    label: 'Area chart',
    mark: 'area',
    category: 'trend',
    description: 'Show change over time with filled area.',
    requires: { minMeasures: 1, requiresTemporal: true },
    autoAssign(shape) {
      const dim = firstDim(shape, 'temporal');
      const measure = firstMeasure(shape);
      return {
        $schema: 'askdb/chart-spec/v1',
        type: 'cartesian',
        mark: 'area',
        encoding: {
          x: dim ? { field: dim.name, type: 'temporal' } : undefined,
          y: measure
            ? { field: measure.name, type: 'quantitative', aggregate: 'sum' }
            : undefined,
        },
      };
    },
  },
  {
    id: 'scatter',
    label: 'Scatter plot',
    mark: 'point',
    category: 'correlation',
    description: 'Compare two numeric measures.',
    requires: { minMeasures: 2 },
    autoAssign(shape) {
      const measures = shape.columns.filter((c) => c.role === 'measure');
      return {
        $schema: 'askdb/chart-spec/v1',
        type: 'cartesian',
        mark: 'point',
        encoding: {
          x: measures[0]
            ? { field: measures[0].name, type: 'quantitative' }
            : undefined,
          y: measures[1]
            ? { field: measures[1].name, type: 'quantitative' }
            : undefined,
        },
      };
    },
  },
  {
    id: 'pie',
    label: 'Pie chart',
    mark: 'arc',
    category: 'composition',
    description: 'Show parts of a whole.',
    requires: { minDims: 1, minMeasures: 1, maxRows: 8 },
    autoAssign(shape) {
      const dim = firstDim(shape, 'nominal');
      const measure = firstMeasure(shape);
      return {
        $schema: 'askdb/chart-spec/v1',
        type: 'cartesian',
        mark: 'arc',
        encoding: {
          color: dim ? { field: dim.name, type: 'nominal' } : undefined,
          y: measure
            ? { field: measure.name, type: 'quantitative', aggregate: 'sum' }
            : undefined,
        },
      };
    },
  },
  {
    id: 'map',
    label: 'Symbol map',
    mark: 'geoshape',
    category: 'map',
    description: 'Plot data on a geographic map.',
    requires: { requiresGeo: true },
    autoAssign(shape) {
      const geoDim = firstDim(shape, 'geographic');
      return {
        $schema: 'askdb/chart-spec/v1',
        type: 'map',
        map: {
          provider: 'maplibre',
          style: 'osm-bright',
          center: [0, 0],
          zoom: 2,
          layers: geoDim
            ? [{ type: 'circle', source: 'data', paint: { 'circle-radius': 4 } }]
            : [],
        },
      };
    },
  },
  // Additional types (treemap, heatmap, boxplot, histogram, etc.)
  // get added in subsequent expansion tasks. Keeping the registry to 6
  // for Phase 0 to keep tests bounded; full Show Me catalog expansion
  // happens in Phase 1 alongside the chart picker UI.
];
