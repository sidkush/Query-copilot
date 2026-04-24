import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import IntentEcho from './IntentEcho';

describe('IntentEcho', () => {
  it('renders nothing in auto_proceed mode', () => {
    const { container } = render(
      <IntentEcho
        card={{ mode: 'auto_proceed', interpretations: [], warnings: [], operational_definition: '' }}
        onAccept={() => {}}
        onChoose={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows Proceed button in proceed_button mode', () => {
    const onAccept = vi.fn();
    render(
      <IntentEcho
        card={{
          mode: 'proceed_button',
          interpretations: [{ id: 'proceed', text: 'Proceed' }],
          warnings: [],
          operational_definition: 'count users',
          ambiguity: 0.5,
        }}
        onAccept={onAccept}
        onChoose={() => {}}
      />
    );
    const btn = screen.getByRole('button', { name: /proceed/i });
    fireEvent.click(btn);
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('shows mandatory-choice pills in mandatory_choice mode', () => {
    const onChoose = vi.fn();
    render(
      <IntentEcho
        card={{
          mode: 'mandatory_choice',
          interpretations: [
            { id: 'churn_30', text: '30 days' },
            { id: 'churn_60', text: '60 days' },
            { id: 'churn_90', text: '90 days' },
          ],
          warnings: [],
          operational_definition: 'churn',
          ambiguity: 0.9,
        }}
        onAccept={() => {}}
        onChoose={onChoose}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: /60 days/i }));
    expect(onChoose).toHaveBeenCalledWith('churn_60');
  });

  it('exposes accessible labels in mandatory_choice mode', () => {
    render(
      <IntentEcho
        card={{
          mode: 'mandatory_choice',
          operational_definition: 'Show all orders',
          interpretations: [
            { id: 'a', text: 'This year' },
            { id: 'b', text: 'Last 30 days' },
          ],
          warnings: [],
          ambiguity: 0.9,
        }}
        onAccept={() => {}}
        onChoose={() => {}}
      />
    );
    expect(screen.getByRole('radiogroup', { name: /choose interpretation/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('renders warnings list when present', () => {
    render(
      <IntentEcho
        card={{
          mode: 'proceed_button',
          interpretations: [{ id: 'proceed', text: 'Proceed' }],
          warnings: ["Clause 'by station' had no SQL counterpart"],
          operational_definition: 'x',
          ambiguity: 0.5,
        }}
        onAccept={() => {}}
        onChoose={() => {}}
      />
    );
    expect(screen.getByText(/by station/)).toBeInTheDocument();
  });

  it('renders banner when card has one (non-interactive mode)', () => {
    render(
      <IntentEcho
        card={{
          mode: 'auto_proceed',
          interpretations: [],
          warnings: [],
          operational_definition: 'x',
          ambiguity: 0.85,
          banner: 'Interpretation unconfirmed',
        }}
        onAccept={() => {}}
        onChoose={() => {}}
      />
    );
    expect(screen.getByText(/unconfirmed/i)).toBeInTheDocument();
  });
});
