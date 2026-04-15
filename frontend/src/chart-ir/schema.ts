/**
 * JSON Schema for runtime ChartSpec validation.
 *
 * Hand-written rather than auto-generated from TypeScript so we control
 * the validation messages and error format. Source of truth is types.ts;
 * keep in sync when adding new fields.
 *
 * Used by:
 * - Backend: validate ChartSpec emitted by agent before storing
 * - Frontend: validate ChartSpec edits before re-render
 * - Tests: snapshot validation for canonical chart shapes
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { ChartSpec } from './types';

const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false });
addFormats(ajv);

const MARKS = [
  'bar', 'line', 'area', 'point', 'circle', 'square', 'tick',
  'rect', 'arc', 'text', 'geoshape', 'boxplot', 'errorbar',
  'rule', 'trail', 'image',
] as const;

const SEMANTIC_TYPES = ['nominal', 'ordinal', 'quantitative', 'temporal', 'geographic'] as const;

const AGGREGATES = [
  'sum', 'avg', 'min', 'max', 'count', 'distinct',
  'median', 'stdev', 'variance', 'p25', 'p75', 'p95', 'none',
] as const;

const fieldRefSchema = {
  type: 'object',
  required: ['field', 'type'],
  additionalProperties: false,
  properties: {
    field: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: SEMANTIC_TYPES },
    aggregate: { type: 'string', enum: AGGREGATES },
    bin: {
      oneOf: [
        { type: 'boolean' },
        {
          type: 'object',
          required: ['maxbins'],
          properties: { maxbins: { type: 'integer', minimum: 1, maximum: 200 } },
        },
      ],
    },
    timeUnit: {
      type: 'string',
      enum: ['year', 'quarter', 'month', 'week', 'day', 'hour'],
    },
    sort: {
      oneOf: [
        { type: 'string', enum: ['asc', 'desc'] },
        {
          type: 'object',
          required: ['field', 'op'],
          properties: {
            field: { type: 'string' },
            op: { type: 'string', enum: AGGREGATES },
          },
        },
      ],
    },
    format: { type: 'string' },
    title: { type: 'string' },
    scheme: { type: 'string' },
  },
};

const encodingChannels = [
  'x', 'y', 'x2', 'y2', 'color', 'size', 'shape', 'opacity',
  'tooltip', 'text', 'row', 'column', 'order',
];

const encodingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...Object.fromEntries(encodingChannels.map((c) => [c, fieldRefSchema])),
    detail: { type: 'array', items: fieldRefSchema },
  },
};

export const chartSpecSchema = {
  $id: 'askdb/chart-spec/v1',
  type: 'object',
  required: ['$schema', 'type'],
  properties: {
    $schema: { type: 'string', const: 'askdb/chart-spec/v1' },
    type: { type: 'string', enum: ['cartesian', 'map', 'geo-overlay', 'creative'] },
    title: { type: 'string' },
    description: { type: 'string' },
    mark: {
      oneOf: [
        { type: 'string', enum: MARKS },
        {
          type: 'object',
          required: ['type'],
          properties: { type: { type: 'string', enum: MARKS } },
        },
      ],
    },
    encoding: encodingSchema,
    transform: { type: 'array' },
    selection: { type: 'array' },
    layer: { type: 'array', items: { $ref: '#' } },
    facet: {
      type: 'object',
      required: ['spec'],
      properties: {
        row: fieldRefSchema,
        column: fieldRefSchema,
        spec: { $ref: '#' },
      },
    },
    hconcat: { type: 'array', items: { $ref: '#' } },
    vconcat: { type: 'array', items: { $ref: '#' } },
    map: {
      type: 'object',
      required: ['provider', 'style', 'center', 'zoom', 'layers'],
      properties: {
        provider: { type: 'string', enum: ['maplibre', 'mapbox', 'google'] },
        style: { type: 'string' },
        center: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        zoom: { type: 'number', minimum: 0, maximum: 22 },
        layers: { type: 'array' },
      },
    },
    overlay: {
      type: 'object',
      required: ['layers'],
      properties: { layers: { type: 'array' } },
    },
    creative: {
      type: 'object',
      required: ['engine', 'component', 'props'],
      properties: {
        engine: { type: 'string', enum: ['three', 'r3f'] },
        component: { type: 'string' },
        props: { type: 'object' },
      },
    },
    config: {
      type: 'object',
      properties: {
        theme: { type: 'string' },
        palette: { type: 'string' },
        density: { type: 'string', enum: ['comfortable', 'compact'] },
      },
    },
  },
} as const;

const validate = ajv.compile(chartSpecSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a ChartSpec against the v1 JSON Schema.
 * Returns valid:true with empty errors on success.
 * Returns valid:false with array of human-readable error messages on failure.
 */
export function validateChartSpec(spec: unknown): ValidationResult {
  const valid = validate(spec);
  if (valid) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`),
  };
}

/** Type-narrowing assertion variant for use in code paths that require validity. */
export function assertValidChartSpec(spec: unknown): asserts spec is ChartSpec {
  const result = validateChartSpec(spec);
  if (!result.valid) {
    throw new Error(`Invalid ChartSpec: ${result.errors.join('; ')}`);
  }
}
