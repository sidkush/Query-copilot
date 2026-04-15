import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CustomTypePicker from '../../../components/editor/CustomTypePicker';
import { globalUserChartTypeRegistry } from '../../../chart-ir';

vi.mock('../../../api', () => ({
  default: {
    listChartTypes: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import api from '../../../api';

const SAMPLE_TYPE = {
  id: 'org:waterfall',
  name: 'Waterfall',
  description: 'Waterfall bar variant',
  category: 'Org',
  schemaVersion: 1,
  parameters: [
    {
      name: 'categoryField',
      kind: 'field',
      required: true,
      semanticType: 'nominal',
    },
    {
      name: 'valueField',
      kind: 'field',
      required: true,
      semanticType: 'quantitative',
    },
  ],
  specTemplate: {
    $schema: 'askdb/chart-spec/v1',
    type: 'cartesian',
    mark: 'bar',
    encoding: {
      x: { field: '${categoryField}', type: 'nominal' },
      y: {
        field: '${valueField}',
        type: 'quantitative',
        aggregate: 'sum',
      },
    },
  },
};

beforeEach(() => {
  globalUserChartTypeRegistry.clear();
  vi.mocked(api.listChartTypes).mockResolvedValue({
    chart_types: [SAMPLE_TYPE],
  });
});

describe('CustomTypePicker', () => {
  it('fetches chart types from api.listChartTypes on mount and lists them by category', async () => {
    render(<CustomTypePicker onSpecChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('custom-type-item-org:waterfall')).toBeDefined();
    });
    expect(screen.getByTestId('custom-type-group-Org')).toBeDefined();
  });

  it('opens the param form when a type is clicked', async () => {
    render(<CustomTypePicker onSpecChange={() => {}} />);
    await waitFor(() => screen.getByTestId('custom-type-item-org:waterfall'));
    fireEvent.click(screen.getByTestId('custom-type-item-org:waterfall'));
    expect(screen.getByTestId('custom-type-param-form')).toBeDefined();
    expect(screen.getByTestId('custom-type-param-categoryField')).toBeDefined();
    expect(screen.getByTestId('custom-type-param-valueField')).toBeDefined();
  });

  it('submits the form and dispatches an instantiated spec via onSpecChange', async () => {
    const onSpecChange = vi.fn();
    render(<CustomTypePicker onSpecChange={onSpecChange} />);
    await waitFor(() => screen.getByTestId('custom-type-item-org:waterfall'));
    fireEvent.click(screen.getByTestId('custom-type-item-org:waterfall'));
    fireEvent.change(screen.getByTestId('custom-type-param-categoryField'), {
      target: { value: 'region' },
    });
    fireEvent.change(screen.getByTestId('custom-type-param-valueField'), {
      target: { value: 'revenue' },
    });
    fireEvent.click(screen.getByTestId('custom-type-param-submit'));
    expect(onSpecChange).toHaveBeenCalledTimes(1);
    const nextSpec = onSpecChange.mock.calls[0]?.[0];
    expect(nextSpec.type).toBe('cartesian');
    expect(nextSpec.encoding.x.field).toBe('region');
    expect(nextSpec.encoding.y.field).toBe('revenue');
  });

  it('renders a column dropdown for field params when columnProfile is supplied', async () => {
    render(
      <CustomTypePicker
        onSpecChange={() => {}}
        columnProfile={[
          { name: 'region', role: 'dimension', semanticType: 'nominal' },
          { name: 'revenue', role: 'measure', semanticType: 'quantitative' },
        ]}
      />,
    );
    await waitFor(() => screen.getByTestId('custom-type-item-org:waterfall'));
    fireEvent.click(screen.getByTestId('custom-type-item-org:waterfall'));
    const select = screen.getByTestId(
      'custom-type-param-categoryField',
    ) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.querySelectorAll('option').length).toBeGreaterThanOrEqual(2);
  });
});
