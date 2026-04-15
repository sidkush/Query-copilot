import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SemanticFieldRail from '../../../components/editor/SemanticFieldRail';
import { useStore } from '../../../store';

vi.mock('../../../api', () => ({
  api: {
    listSemanticModels: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import { api } from '../../../api';

const SAMPLE_MODEL = {
  id: 'retail',
  name: 'Retail',
  version: 1,
  dataset: 'retail_facts',
  dimensions: [
    { id: 'region', label: 'Region', field: 'region', semanticType: 'nominal' },
  ],
  measures: [
    {
      id: 'revenue',
      label: 'Revenue',
      field: 'revenue',
      aggregate: 'sum',
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

beforeEach(() => {
  vi.mocked(api.listSemanticModels).mockResolvedValue({
    semantic_models: [SAMPLE_MODEL],
  });
  // Reset slice state between runs.
  useStore.setState({
    activeSemanticModel: null,
    availableSemanticModels: [],
  });
});

describe('SemanticFieldRail', () => {
  it('fetches semantic models on mount and hydrates the store', async () => {
    render(<SemanticFieldRail />);
    await waitFor(() => {
      expect(useStore.getState().availableSemanticModels.length).toBe(1);
      expect(useStore.getState().activeSemanticModel?.id).toBe('retail');
    });
  });

  it('renders draggable dimension / measure / metric pills', async () => {
    render(<SemanticFieldRail />);
    await waitFor(() => screen.getByTestId('semantic-pill-region'));
    expect(screen.getByTestId('semantic-pill-region')).toBeDefined();
    expect(screen.getByTestId('semantic-pill-revenue')).toBeDefined();
    expect(screen.getByTestId('semantic-pill-arpu')).toBeDefined();
  });

  it('drag payload includes a semantic envelope for measures', async () => {
    render(<SemanticFieldRail />);
    await waitFor(() => screen.getByTestId('semantic-pill-revenue'));
    const pill = screen.getByTestId('semantic-pill-revenue');
    const dataStore: Record<string, string> = {};
    const fakeEvent = {
      dataTransfer: {
        setData: (type: string, value: string) => {
          dataStore[type] = value;
        },
        effectAllowed: '',
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pill as any).ondragstart?.(fakeEvent);
    // dragstart handler is attached via React synthetic events, not onX,
    // so we dispatch via fireEvent-style instead:
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fireEvent, createEvent } = await import('@testing-library/react');
    const dragStart = createEvent.dragStart(pill);
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: {
        setData: (type: string, value: string) => {
          dataStore[type] = value;
        },
        effectAllowed: '',
      },
    });
    fireEvent(pill, dragStart);
    const raw = dataStore['application/x-askdb-field'];
    expect(raw).toBeDefined();
    const payload = JSON.parse(raw as string);
    expect(payload.semantic).toEqual({ measure: 'revenue' });
    expect(payload.semanticType).toBe('quantitative');
    expect(payload.role).toBe('measure');
  });

  it('toggles open/closed via the accordion button', async () => {
    render(<SemanticFieldRail />);
    await waitFor(() => screen.getByTestId('semantic-pill-region'));
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByTestId('semantic-field-rail-toggle'));
    expect(screen.queryByTestId('semantic-pill-region')).toBeNull();
  });
});
