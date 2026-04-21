import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CalcResultPreview } from '../CalcResultPreview';

vi.mock('../../../../../api', () => ({
  evaluateCalc: vi.fn(),
  evaluateCalcOnSource: vi.fn().mockResolvedValue(null),
}));

describe('CalcResultPreview', () => {
  it('shows computed value on successful evaluate', async () => {
    const { evaluateCalc } = await import('../../../../../api');
    evaluateCalc.mockResolvedValueOnce({ value: 42, type: 'number', error: null });
    render(<CalcResultPreview formula="[Sales] * 2" row={{ Sales: 21 }} schemaRef={{ Sales: 'number' }} />);
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.getByText(/number/i)).toBeInTheDocument();
  });

  it('shows error banner when both tiers fail', async () => {
    const { evaluateCalc, evaluateCalcOnSource } = await import('../../../../../api');
    evaluateCalc.mockRejectedValueOnce(Object.assign(new Error('ParseError'), { status: 400 }));
    evaluateCalcOnSource.mockRejectedValueOnce(Object.assign(new Error('ParseError'), { status: 400 }));
    render(<CalcResultPreview formula="bad" row={{}} schemaRef={{}} connId="c1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/ParseError/));
  });

  it('debounces to one evaluate call within 350ms for 3 rapid updates', async () => {
    const { evaluateCalc } = await import('../../../../../api');
    evaluateCalc.mockClear();
    vi.useFakeTimers();
    evaluateCalc.mockResolvedValue({ value: 1, type: 'number', error: null });
    const { rerender } = render(<CalcResultPreview formula="a" row={{}} schemaRef={{}} />);
    rerender(<CalcResultPreview formula="ab" row={{}} schemaRef={{}} />);
    rerender(<CalcResultPreview formula="abc" row={{}} schemaRef={{}} />);
    await vi.advanceTimersByTimeAsync(400);
    expect(evaluateCalc).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
