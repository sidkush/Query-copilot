import { useMemo } from 'react';
import VegaRenderer from './renderers/VegaRenderer';
import { instantiateUserChartType } from '../../chart-ir';

/**
 * SpecTemplatePreview — live preview for a draft UserChartType.
 *
 * Accepts a partial UserChartType (specTemplate + parameters may be
 * incomplete), synthesises mock params + a mock resultSet, calls
 * instantiateUserChartType(), and passes the result to VegaRenderer.
 *
 * This is the preview pane used by the chart-type editor so authors
 * can see how their template renders while they are building it.
 *
 * Props:
 *   chartType — partial UserChartType (may be under construction)
 *
 * data-testid:
 *   template-preview       — success container
 *   template-preview-error — error container
 */

// ---------------------------------------------------------------------------
// Mock value generators
// ---------------------------------------------------------------------------

/** Generate a mock param value for a given parameter definition. */
function mockParamValue(param) {
  switch (param.kind) {
    case 'field':
      return `mock_${param.name}`;
    case 'aggregate':
      return param.default ?? 'sum';
    case 'number':
      return param.default ?? 10;
    case 'boolean':
      return param.default ?? true;
    case 'literal':
    default:
      return param.default ?? param.name;
  }
}

/** Build a record of mock param values for every parameter in the type. */
function buildMockParams(parameters) {
  const out = {};
  for (const p of parameters) {
    out[p.name] = mockParamValue(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

const NOMINAL_VALUES   = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
const ORDINAL_VALUES   = ['Low', 'Medium', 'High', 'Critical'];
const GEO_VALUES       = ['United States', 'Germany', 'Japan', 'Brazil', 'India'];
const ROW_COUNT        = 20;

/** Starting epoch for temporal series — 2026-01-01 */
const TEMPORAL_START = new Date('2026-01-01').getTime();
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Generate sample column values based on semanticType. */
function mockColumnValues(semanticType) {
  switch (semanticType) {
    case 'nominal':
      return NOMINAL_VALUES;
    case 'ordinal':
      return ORDINAL_VALUES;
    case 'geographic':
      return GEO_VALUES;
    case 'temporal': {
      const vals = [];
      for (let i = 0; i < ROW_COUNT; i++) {
        const d = new Date(TEMPORAL_START + i * ONE_WEEK_MS);
        vals.push(d.toISOString().slice(0, 10)); // 'YYYY-MM-DD'
      }
      return vals;
    }
    case 'quantitative':
    default: {
      const vals = [];
      for (let i = 0; i < ROW_COUNT; i++) {
        vals.push(Math.round(Math.random() * 1000));
      }
      return vals;
    }
  }
}

/**
 * Build a mock resultSet ({ columns, rows }) from the field parameters
 * of the chart type.
 *
 * Column name for a field param is `mock_${param.name}`.
 * Row count is driven by the longest column value array (quantitative /
 * temporal = 20; categorical = 5).
 */
function buildMockResultSet(parameters) {
  const fieldParams = parameters.filter((p) => p.kind === 'field');

  if (fieldParams.length === 0) {
    // No field params — produce a minimal single-row dataset so Vega
    // doesn't choke on an empty datasource.
    return { columns: ['mock_value'], rows: [[42]] };
  }

  const columnNames = fieldParams.map((p) => `mock_${p.name}`);
  const columnValues = fieldParams.map((p) =>
    mockColumnValues(p.semanticType ?? 'quantitative'),
  );

  const rowCount = Math.max(...columnValues.map((v) => v.length));
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const row = columnValues.map((vals) => vals[i % vals.length]);
    rows.push(row);
  }

  return { columns: columnNames, rows };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpecTemplatePreview({ chartType }) {
  const { spec, error } = useMemo(() => {
    try {
      // Guard: chartType must be a valid-enough object to attempt
      if (
        !chartType ||
        typeof chartType !== 'object' ||
        !chartType.specTemplate ||
        typeof chartType.specTemplate !== 'object' ||
        !Array.isArray(chartType.parameters)
      ) {
        return { spec: null, error: 'Chart type is incomplete — add a spec template and parameters to see the preview.' };
      }

      const mockParams = buildMockParams(chartType.parameters);
      const instantiated = instantiateUserChartType(chartType, mockParams);
      return { spec: instantiated, error: null };
    } catch (err) {
      return {
        spec: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [chartType]);

  const mockResultSet = useMemo(() => {
    if (!Array.isArray(chartType?.parameters)) return { columns: [], rows: [] };
    return buildMockResultSet(chartType.parameters);
  }, [chartType?.parameters]);

  if (error || !spec) {
    return (
      <div
        data-testid="template-preview-error"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '24px 16px',
          borderRadius: 8,
          background: 'rgba(229, 62, 62, 0.06)',
          border: '1px solid rgba(229, 62, 62, 0.2)',
          color: 'rgba(248, 113, 113, 0.9)',
          fontSize: 12,
          fontFamily: 'monospace',
          minHeight: 200,
          lineHeight: 1.5,
        }}
      >
        {error ?? 'Unable to render preview.'}
      </div>
    );
  }

  return (
    <div
      data-testid="template-preview"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary, #b0b0b6)',
          marginBottom: 4,
        }}
      >
        Live Preview · mock data
      </div>
      <VegaRenderer spec={spec} resultSet={mockResultSet} />
    </div>
  );
}
