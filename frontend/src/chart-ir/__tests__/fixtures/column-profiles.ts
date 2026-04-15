import type { ColumnProfile } from '../../recommender/resultShape';

/** A pure-numeric measure column. */
export const REVENUE_MEASURE: ColumnProfile = {
  name: 'revenue',
  dtype: 'float',
  role: 'measure',
  semanticType: 'quantitative',
  cardinality: 1247,
  nullPct: 0.02,
  sampleValues: [12450.0, 8902.5, 15670.25],
};

/** A low-cardinality nominal dimension. */
export const REGION_DIM: ColumnProfile = {
  name: 'region',
  dtype: 'string',
  role: 'dimension',
  semanticType: 'nominal',
  cardinality: 4,
  nullPct: 0.0,
  sampleValues: ['North', 'South', 'East', 'West'],
};

/** A high-cardinality nominal dimension. */
export const CUSTOMER_DIM: ColumnProfile = {
  name: 'customer_name',
  dtype: 'string',
  role: 'dimension',
  semanticType: 'nominal',
  cardinality: 8421,
  nullPct: 0.0,
  sampleValues: ['Acme', 'Globex', 'Initech'],
};

/** A temporal dimension. */
export const ORDER_DATE: ColumnProfile = {
  name: 'order_date',
  dtype: 'date',
  role: 'dimension',
  semanticType: 'temporal',
  cardinality: 365,
  nullPct: 0.0,
  sampleValues: ['2026-01-01', '2026-01-02', '2026-01-03'],
};

/** A geographic dimension (lat/lng). */
export const STORE_LOCATION: ColumnProfile = {
  name: 'store_location',
  dtype: 'string',
  role: 'dimension',
  semanticType: 'geographic',
  cardinality: 47,
  nullPct: 0.0,
  sampleValues: ['37.7749,-122.4194', '40.7128,-74.0060'],
};

/** A second numeric measure. */
export const UNITS_MEASURE: ColumnProfile = {
  name: 'units',
  dtype: 'int',
  role: 'measure',
  semanticType: 'quantitative',
  cardinality: 1247,
  nullPct: 0.0,
  sampleValues: [12, 8, 15],
};
