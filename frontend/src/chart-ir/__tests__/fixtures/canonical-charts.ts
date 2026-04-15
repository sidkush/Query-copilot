import type { ChartSpec } from '../../types';

export const SIMPLE_BAR: ChartSpec = {
  $schema: 'askdb/chart-spec/v1',
  type: 'cartesian',
  mark: 'bar',
  encoding: {
    x: { field: 'category', type: 'nominal' },
    y: { field: 'value', type: 'quantitative', aggregate: 'sum' },
  },
};

export const TIME_SERIES_LINE: ChartSpec = {
  $schema: 'askdb/chart-spec/v1',
  type: 'cartesian',
  mark: 'line',
  encoding: {
    x: { field: 'date', type: 'temporal' },
    y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
    color: { field: 'region', type: 'nominal' },
  },
};

export const SCATTER_WITH_SIZE: ChartSpec = {
  $schema: 'askdb/chart-spec/v1',
  type: 'cartesian',
  mark: 'point',
  encoding: {
    x: { field: 'gdp', type: 'quantitative' },
    y: { field: 'life_expectancy', type: 'quantitative' },
    size: { field: 'population', type: 'quantitative' },
    color: { field: 'continent', type: 'nominal' },
  },
};

export const FACETED_BARS: ChartSpec = {
  $schema: 'askdb/chart-spec/v1',
  type: 'cartesian',
  facet: {
    column: { field: 'region', type: 'nominal' },
    spec: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'product', type: 'nominal' },
        y: { field: 'sales', type: 'quantitative', aggregate: 'sum' },
      },
    },
  },
};

export const LAYERED_LINE_POINT: ChartSpec = {
  $schema: 'askdb/chart-spec/v1',
  type: 'cartesian',
  layer: [
    {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'line',
      encoding: {
        x: { field: 'date', type: 'temporal' },
        y: { field: 'price', type: 'quantitative' },
      },
    },
    {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'point',
      encoding: {
        x: { field: 'date', type: 'temporal' },
        y: { field: 'price', type: 'quantitative' },
      },
    },
  ],
};
