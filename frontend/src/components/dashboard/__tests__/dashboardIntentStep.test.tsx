// Plan TSS2 T12 — tests for the single-textarea intent step that replaces
// the 5-step semantic tag wizard in the default dashboard-save flow.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardIntentStep from '../DashboardIntentStep';

describe('DashboardIntentStep', () => {
  it('renders a single textarea with example placeholder', () => {
    render(<DashboardIntentStep value="" onChange={() => {}} onSubmit={() => {}} />);
    const ta = screen.getByTestId('dashboard-intent-textarea');
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta).toHaveAttribute('placeholder');
    expect((ta.getAttribute('placeholder') || '').toLowerCase()).toMatch(/e\.g\./i);
  });

  it('calls onSubmit with the trimmed intent text when the CTA fires', () => {
    const onSubmit = vi.fn();
    render(
      <DashboardIntentStep
        value="  show monthly ride counts  "
        onChange={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByTestId('dashboard-intent-submit'));
    expect(onSubmit).toHaveBeenCalledWith('show monthly ride counts');
  });
});
