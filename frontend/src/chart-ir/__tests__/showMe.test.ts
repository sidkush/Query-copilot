import { describe, it, expect, beforeEach } from 'vitest';
import { recommendCharts, availableChartTypes } from '../recommender/showMe';
import { analyzeResultShape } from '../recommender/resultShape';
import { globalUserChartTypeRegistry } from '../userTypes/registry';
import {
  REVENUE_MEASURE,
  REGION_DIM,
  CUSTOMER_DIM,
  ORDER_DATE,
  STORE_LOCATION,
  UNITS_MEASURE,
} from './fixtures/column-profiles';

describe('Show Me recommender — Mackinlay rules', () => {
  it('1 nominal dim + 1 measure → bar chart top recommendation', () => {
    const shape = analyzeResultShape({
      columns: [REGION_DIM, REVENUE_MEASURE],
      rowCount: 4,
    });
    const recs = recommendCharts(shape);
    expect(recs[0]!.mark).toBe('bar');
  });

  it('1 temporal dim + 1 measure → line chart top recommendation', () => {
    const shape = analyzeResultShape({
      columns: [ORDER_DATE, REVENUE_MEASURE],
      rowCount: 365,
    });
    const recs = recommendCharts(shape);
    expect(recs[0]!.mark).toBe('line');
  });

  it('1 temporal + 2 measures → multi-line', () => {
    const shape = analyzeResultShape({
      columns: [ORDER_DATE, REVENUE_MEASURE, UNITS_MEASURE],
      rowCount: 365,
    });
    const recs = recommendCharts(shape);
    expect(recs[0]!.mark).toBe('line');
  });

  it('2 measures, 0 dims → scatter plot', () => {
    const shape = analyzeResultShape({
      columns: [REVENUE_MEASURE, UNITS_MEASURE],
      rowCount: 1247,
    });
    const recs = recommendCharts(shape);
    expect(recs[0]!.mark).toBe('point');
  });

  it('1 high-cardinality dim + 1 measure → bar (sorted top-N) over treemap', () => {
    const shape = analyzeResultShape({
      columns: [CUSTOMER_DIM, REVENUE_MEASURE],
      rowCount: 8421,
    });
    const recs = recommendCharts(shape);
    const topMarks = recs.slice(0, 3).map((r) => r.mark);
    expect(topMarks).toContain('bar');
  });

  it('1 geographic dim → map (geoshape mark)', () => {
    const shape = analyzeResultShape({
      columns: [STORE_LOCATION, REVENUE_MEASURE],
      rowCount: 47,
    });
    const recs = recommendCharts(shape);
    expect(recs[0]!.mark).toBe('geoshape');
  });

  it('returns ranked list with reasons and disabled flags', () => {
    const shape = analyzeResultShape({
      columns: [REGION_DIM, REVENUE_MEASURE],
      rowCount: 4,
    });
    const recs = recommendCharts(shape);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]!.score).toBeGreaterThan(0);
    expect(recs[0]!.reason).toBeTruthy();
    expect(recs[0]!.disabled).toBe(false);
  });
});

describe('availableChartTypes', () => {
  it('marks irrelevant chart types as unavailable with explanation', () => {
    const shape = analyzeResultShape({
      columns: [REGION_DIM, REVENUE_MEASURE],
      rowCount: 4,
    });
    const all = availableChartTypes(shape);
    const lineEntry = all.find((t) => t.mark === 'line');
    expect(lineEntry?.available).toBe(false);
    expect(lineEntry?.missing).toContain('temporal');
  });
});

describe('recommendCharts with user types', () => {
  beforeEach(() => {
    globalUserChartTypeRegistry.clear();
  });

  it('includes matching user types in recommendations', () => {
    globalUserChartTypeRegistry.register({
      id: 'org:waterfall',
      name: 'Revenue Waterfall',
      schemaVersion: 1,
      parameters: [
        { name: 'category', kind: 'field', semanticType: 'nominal' },
        { name: 'amount', kind: 'field', semanticType: 'quantitative' },
      ],
      specTemplate: {
        $schema: 'askdb/chart-spec/v1',
        type: 'cartesian',
        mark: 'bar',
        encoding: {},
      },
    });

    const shape = analyzeResultShape({
      columns: [REGION_DIM, REVENUE_MEASURE],
      rowCount: 4,
    });
    const recs = recommendCharts(shape);
    const waterfallRec = recs.find((r) => r.id === 'org:waterfall');

    expect(waterfallRec).toBeDefined();
    expect(waterfallRec!.label).toBe('Revenue Waterfall');
    expect(waterfallRec!.score).toBe(50);
    expect(waterfallRec!.reason).toBe('Custom type: Revenue Waterfall');
    expect(waterfallRec!.disabled).toBe(false);
  });

  it('does not include user types that do not match data shape', () => {
    globalUserChartTypeRegistry.register({
      id: 'org:geo-heatmap',
      name: 'Geo Heatmap',
      schemaVersion: 1,
      parameters: [
        { name: 'location', kind: 'field', semanticType: 'geographic' },
      ],
      specTemplate: {
        $schema: 'askdb/chart-spec/v1',
        type: 'map',
        mark: 'geoshape',
        encoding: {},
      },
    });

    // Shape has no geographic dimension.
    const shape = analyzeResultShape({
      columns: [REGION_DIM, REVENUE_MEASURE],
      rowCount: 4,
    });
    const recs = recommendCharts(shape);
    const geoRec = recs.find((r) => r.id === 'org:geo-heatmap');

    expect(geoRec).toBeUndefined();
  });
});
