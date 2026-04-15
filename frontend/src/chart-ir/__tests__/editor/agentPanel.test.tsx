import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentPanel from '../../../components/editor/AgentPanel';

describe('AgentPanel', () => {
  it('renders the suggestion chip empty state when no steps', () => {
    render(<AgentPanel steps={[]} onSubmit={() => {}} />);
    expect(screen.getByTestId('editor-agent-panel')).toBeDefined();
    // One of the hard-coded suggestion chips should be visible
    expect(screen.getByText(/Make this a stacked bar/i)).toBeDefined();
  });

  it('submits text via the input form', () => {
    const onSubmit = vi.fn();
    render(<AgentPanel steps={[]} onSubmit={onSubmit} />);
    const input = screen.getByTestId('editor-agent-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'color by region' } });
    fireEvent.click(screen.getByTestId('editor-agent-submit'));
    expect(onSubmit).toHaveBeenCalledWith('color by region');
    expect(input.value).toBe('');
  });

  it('ignores empty submissions', () => {
    const onSubmit = vi.fn();
    render(<AgentPanel steps={[]} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('editor-agent-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders a step card per step entry', () => {
    const steps = [
      { id: '1', type: 'plan', text: 'I will add a color encoding.' },
      { id: '2', type: 'tool_call', text: 'create_dashboard_tile' },
      { id: '3', type: 'error', text: 'Validation failed' },
    ];
    render(<AgentPanel steps={steps} onSubmit={() => {}} />);
    expect(screen.getByTestId('agent-step-plan')).toBeDefined();
    expect(screen.getByTestId('agent-step-tool_call')).toBeDefined();
    expect(screen.getByTestId('agent-step-error')).toBeDefined();
  });

  it('shows a loading indicator when loading=true', () => {
    render(<AgentPanel steps={[]} onSubmit={() => {}} loading />);
    expect(screen.getByTestId('agent-loading')).toBeDefined();
  });

  it('clicking a suggestion chip fires the click handler', () => {
    const onSuggestionClick = vi.fn();
    render(<AgentPanel steps={[]} onSuggestionClick={onSuggestionClick} onSubmit={() => {}} />);
    fireEvent.click(screen.getByTestId('agent-suggestion-make-this-a-stacked-bar'));
    expect(onSuggestionClick).toHaveBeenCalledWith('Make this a stacked bar');
  });
});
