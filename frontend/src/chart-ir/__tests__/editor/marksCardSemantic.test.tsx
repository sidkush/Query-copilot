import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import MarksCard from '../../../components/editor/MarksCard';

vi.mock('../../../api', () => ({
  default: {
    listChartTypes: vi.fn().mockResolvedValue({ chart_types: [] }),
  },
}));

const BASE_SPEC = {
  $schema: 'askdb/chart-spec/v1',
  type: 'cartesian',
  mark: 'bar',
  encoding: {},
};

const SEMANTIC_MODEL = {
  id: 'retail',
  name: 'Retail',
  version: 1,
  dimensions: [
    { id: 'region', label: 'Region', field: 'region', semanticType: 'nominal' },
  ],
  measures: [
    {
      id: 'revenue',
      label: 'Revenue',
      field: 'revenue',
      aggregate: 'sum',
      format: '.2f',
    },
  ],
  metrics: [
    {
      id: 'arpu',
      label: 'ARPU',
      formula: 'datum.revenue / datum.users',
      dependencies: ['revenue'],
    },
  ],
};

function buildDropEvent(payload: object) {
  const target = document.createElement('div');
  const ev = createEvent.drop(target);
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      getData: (type: string) =>
        type === 'application/x-askdb-field' ? JSON.stringify(payload) : '',
      types: ['application/x-askdb-field'],
    },
  });
  return ev;
}

describe('MarksCard semantic drop resolution', () => {
  it('resolves a dimension drop via resolveSemanticRef and patches encoding', () => {
    const onSpecChange = vi.fn();
    render(
      <MarksCard
        spec={BASE_SPEC}
        onSpecChange={onSpecChange}
        activeSemanticModel={SEMANTIC_MODEL}
      />,
    );
    const xSlot = screen.getByTestId('channel-slot-x');
    fireEvent(
      xSlot,
      buildDropEvent({
        field: 'semantic:region',
        semanticType: 'nominal',
        role: 'dimension',
        semantic: { dimension: 'region' },
      }),
    );
    expect(onSpecChange).toHaveBeenCalledTimes(1);
    const nextSpec = onSpecChange.mock.calls[0]?.[0];
    expect(nextSpec.encoding.x).toMatchObject({
      field: 'region',
      type: 'nominal',
    });
  });

  it('resolves a measure drop and preserves aggregate', () => {
    const onSpecChange = vi.fn();
    render(
      <MarksCard
        spec={BASE_SPEC}
        onSpecChange={onSpecChange}
        activeSemanticModel={SEMANTIC_MODEL}
      />,
    );
    const ySlot = screen.getByTestId('channel-slot-y');
    fireEvent(
      ySlot,
      buildDropEvent({
        field: 'semantic:revenue',
        semanticType: 'quantitative',
        role: 'measure',
        semantic: { measure: 'revenue' },
      }),
    );
    const nextSpec = onSpecChange.mock.calls[0]?.[0];
    expect(nextSpec.encoding.y).toMatchObject({
      field: 'revenue',
      type: 'quantitative',
      aggregate: 'sum',
    });
  });

  it('resolves a metric drop and appends a calculate transform', () => {
    const onSpecChange = vi.fn();
    render(
      <MarksCard
        spec={BASE_SPEC}
        onSpecChange={onSpecChange}
        activeSemanticModel={SEMANTIC_MODEL}
      />,
    );
    const ySlot = screen.getByTestId('channel-slot-y');
    fireEvent(
      ySlot,
      buildDropEvent({
        field: 'semantic:arpu',
        semanticType: 'quantitative',
        role: 'measure',
        semantic: { metric: 'arpu' },
      }),
    );
    const nextSpec = onSpecChange.mock.calls[0]?.[0];
    expect(nextSpec.encoding.y).toMatchObject({
      field: 'arpu',
      type: 'quantitative',
    });
    expect(Array.isArray(nextSpec.transform)).toBe(true);
    expect(nextSpec.transform[0].calculate).toMatchObject({
      as: 'arpu',
      expr: 'datum.revenue / datum.users',
    });
  });

  it('no-ops when no active semantic model is supplied', () => {
    const onSpecChange = vi.fn();
    render(
      <MarksCard
        spec={BASE_SPEC}
        onSpecChange={onSpecChange}
        activeSemanticModel={null}
      />,
    );
    const xSlot = screen.getByTestId('channel-slot-x');
    fireEvent(
      xSlot,
      buildDropEvent({
        field: 'semantic:region',
        semanticType: 'nominal',
        role: 'dimension',
        semantic: { dimension: 'region' },
      }),
    );
    expect(onSpecChange).not.toHaveBeenCalled();
  });
});
