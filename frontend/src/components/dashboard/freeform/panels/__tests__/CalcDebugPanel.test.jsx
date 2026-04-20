import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CalcDebugPanel } from '../CalcDebugPanel';

vi.mock('../../../../../api', () => ({
  evaluateCalc: vi.fn().mockResolvedValue({
    value: 1, type: 'number', error: null,
    trace: {
      nodes: [
        { label: 'IF [Sales] > 10 THEN 1 ELSE 0 END', value: 1 },
        { label: '[Sales] > 10', value: true },
        { label: '[Sales]', value: 15 },
        { label: '10', value: 10 },
      ],
    },
  }),
}));

describe('CalcDebugPanel', () => {
  it('renders each AST node with its evaluated value', async () => {
    render(<CalcDebugPanel formula="IF [Sales] > 10 THEN 1 ELSE 0 END" row={{ Sales: 15 }} schemaRef={{ Sales: 'number' }} />);
    await waitFor(() => expect(screen.getByText('[Sales] > 10')).toBeInTheDocument());
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders empty-state when no formula', () => {
    render(<CalcDebugPanel formula="" row={{}} schemaRef={{}} />);
    expect(screen.getByText(/No formula/)).toBeInTheDocument();
  });
});
