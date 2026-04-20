import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CalcSuggestDialog } from '../CalcSuggestDialog';

vi.mock('../../../../../api', () => ({
  suggestCalc: vi.fn().mockResolvedValue({
    formula: 'SUM([Sales]) / COUNTD([Customer])',
    explanation: 'Average per customer.',
    confidence: 0.88,
    is_generative_ai_web_authoring: true,
  }),
}));

describe('CalcSuggestDialog', () => {
  it('renders description input, calls suggestCalc on submit, surfaces formula + confidence', async () => {
    const onAccept = vi.fn();
    render(
      <CalcSuggestDialog
        schemaRef={{ Sales: 'number', Customer: 'string' }}
        parameters={[]}
        sets={[]}
        existingCalcs={[]}
        onAccept={onAccept}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: /description/i }), {
      target: { value: 'avg sales per customer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /suggest/i }));
    await waitFor(() =>
      expect(screen.getByText(/Average per customer/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/88%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({
        formula: 'SUM([Sales]) / COUNTD([Customer])',
        is_generative_ai_web_authoring: true,
      }),
    );
  });
});
