import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CalcEditorDialog } from '../CalcEditorDialog';

// Minimal Monaco stub. Invokes `onMount` once with no-op editor/monaco so
// CalcEditorDialog can wire its diagnostics runner (which actually fires
// `validateCalc` on formula changes). Without this, the runner is never
// built and the `validateCalc` assertion below would deadlock.
vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');
  const noop = () => {};
  const fakeEditor = { getModel: () => null };
  const fakeMonaco = {
    languages: {
      register: noop,
      setMonarchTokensProvider: noop,
      setLanguageConfiguration: noop,
      registerCompletionItemProvider: () => ({ dispose: noop }),
      registerSignatureHelpProvider: () => ({ dispose: noop }),
      registerHoverProvider: () => ({ dispose: noop }),
    },
    editor: {
      defineTheme: noop,
      setModelMarkers: noop,
    },
  };
  function MockMonacoEditor({ value, onChange, onMount }) {
    React.useEffect(() => {
      if (onMount) onMount(fakeEditor, fakeMonaco);
    }, [onMount]);
    return (
      <textarea
        data-testid="monaco-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return { default: MockMonacoEditor };
});

const api = vi.hoisted(() => ({
  validateCalc: vi.fn().mockResolvedValue({ valid: true, warnings: [] }),
  evaluateCalc: vi.fn().mockResolvedValue({ value: 42, type: 'number', error: null, trace: { nodes: [] } }),
  fetchSampleRows: vi.fn().mockResolvedValue({
    columns: ['Sales'], rows: [{ Sales: 20 }, { Sales: 21 }],
  }),
  suggestCalc: vi.fn().mockResolvedValue({
    formula: 'SUM([Sales])', explanation: 'Total sales.', confidence: 0.9, is_generative_ai_web_authoring: true,
  }),
}));
vi.mock('../../../../../api', () => api);

describe('CalcEditorDialog — integration', () => {
  it('open → type SUM([Sales]) → evaluate fires → save produces calc with formula', async () => {
    const onSave = vi.fn();
    render(<CalcEditorDialog connId="c1" schemaFields={[{ name: 'Sales', dataType: 'number' }]} parameters={[]} sets={[]} existingCalcs={[]} onSave={onSave} onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('20').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(/calculation name/i), { target: { value: 'Total Sales' } });
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'SUM([Sales])' } });
    await waitFor(() => expect(api.validateCalc).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Total Sales', formula: 'SUM([Sales])',
    }));
  });

  it('LLM suggest → accept → save stamps is_generative_ai_web_authoring=true', async () => {
    const onSave = vi.fn();
    render(<CalcEditorDialog connId="c1" schemaFields={[{ name: 'Sales', dataType: 'number' }]} parameters={[]} sets={[]} existingCalcs={[]} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /suggest with AI/i }));
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'total sales' } });
    fireEvent.click(screen.getByRole('button', { name: /^Suggest$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    fireEvent.change(screen.getByLabelText(/calculation name/i), { target: { value: 'AI Total' } });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'AI Total',
      formula: 'SUM([Sales])',
      is_generative_ai_web_authoring: true,
    }));
  });
});
