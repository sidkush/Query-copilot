import { describe, it, expect } from 'vitest';
import { analyzeResultShape } from '../recommender/resultShape';
import {
  REVENUE_MEASURE,
  REGION_DIM,
  ORDER_DATE,
  STORE_LOCATION,
  UNITS_MEASURE,
  CUSTOMER_DIM,
} from './fixtures/column-profiles';

describe('analyzeResultShape', () => {
  it('counts dimensions and measures correctly', () => {
    const shape = analyzeResultShape({
      columns: [REGION_DIM, REVENUE_MEASURE],
      rowCount: 4,
    });
    expect(shape.nDimensions).toBe(1);
    expect(shape.nMeasures).toBe(1);
    expect(shape.hasDate).toBe(false);
    expect(shape.hasGeo).toBe(false);
  });

  it('detects temporal dimension', () => {
    const shape = analyzeResultShape({
      columns: [ORDER_DATE, REVENUE_MEASURE],
      rowCount: 365,
    });
    expect(shape.hasDate).toBe(true);
    expect(shape.nDimensions).toBe(1);
  });

  it('detects geographic dimension', () => {
    const shape = analyzeResultShape({
      columns: [STORE_LOCATION, REVENUE_MEASURE],
      rowCount: 47,
    });
    expect(shape.hasGeo).toBe(true);
  });

  it('handles multi-measure shapes', () => {
    const shape = analyzeResultShape({
      columns: [ORDER_DATE, REVENUE_MEASURE, UNITS_MEASURE],
      rowCount: 365,
    });
    expect(shape.nMeasures).toBe(2);
    expect(shape.hasDate).toBe(true);
  });

  it('flags high-cardinality dimensions', () => {
    const shape = analyzeResultShape({
      columns: [CUSTOMER_DIM, REVENUE_MEASURE],
      rowCount: 8421,
    });
    expect(shape.maxDimensionCardinality).toBe(8421);
    expect(shape.hasHighCardinalityDim).toBe(true);
  });
});
