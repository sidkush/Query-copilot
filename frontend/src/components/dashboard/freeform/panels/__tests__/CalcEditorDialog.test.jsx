import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalcEditorDialog } from '../CalcEditorDialog';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock('../../../../../api', () => ({
  validateCalc: vi.fn().mockResolvedValue({ valid: true, warnings: [] }),
  evaluateCalc: vi.fn().mockResolvedValue({ value: null, type: null, error: null }),
  fetchSampleRows: vi.fn().mockResolvedValue({ columns: ['Sales'], rows: [{ Sales: 1 }] }),
  suggestCalc: vi.fn().mockResolvedValue({
    formula: 'SUM([Sales])',
    explanation: '',
    confidence: 0.9,
    is_generative_ai_web_authoring: true,
  }),
}));

describe('CalcEditorDialog', () => {
  const baseProps = {
    connId: 'c1',
    schemaFields: [{ name: 'Sales', dataType: 'number' }],
    parameters: [],
    sets: [],
    existingCalcs: [],
    onSave: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders modal with role=dialog aria-modal, name input, Monaco', () => {
    render(<CalcEditorDialog {...baseProps} />);
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText(/calculation name/i)).toBeInTheDocument();
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('Esc closes, Cmd+Enter saves', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CalcEditorDialog {...baseProps} onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/calculation name/i), {
      target: { value: 'Avg Sales' },
    });
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: 'SUM([Sales])' },
    });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Avg Sales',
        formula: 'SUM([Sales])',
        is_generative_ai_web_authoring: false,
      }),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('accepts LLM suggestion → save stamps is_generative_ai_web_authoring=true', async () => {
    const onSave = vi.fn();
    render(<CalcEditorDialog {...baseProps} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /suggest with AI/i }));
    // Bypass sub-dialog via hidden test-only affordance.
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: 'SUM([Sales])' },
    });
    fireEvent.click(screen.getByTestId('mark-ai-generated'));
    fireEvent.change(screen.getByLabelText(/calculation name/i), {
      target: { value: 'AI Avg' },
    });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'AI Avg',
        is_generative_ai_web_authoring: true,
      }),
    );
  });
});
