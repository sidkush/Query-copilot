import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import SemanticTagWizard from '../SemanticTagWizard';

const SAMPLE_PROFILE = {
  tables: [
    {
      name: 'orders',
      columns: [
        { name: 'order_date', dtype: 'date', semantic_type: 'temporal', role: 'dimension' },
        { name: 'created_at', dtype: 'timestamp', role: 'dimension' },
        { name: 'revenue', dtype: 'numeric', role: 'measure' },
        { name: 'quantity', dtype: 'int', role: 'measure' },
        { name: 'region', dtype: 'varchar', role: 'dimension', cardinality: 12 },
        { name: 'customer_name', dtype: 'varchar', role: 'dimension', cardinality: 5000 },
      ],
    },
  ],
};

describe('SemanticTagWizard', () => {
  beforeEach(() => {
    cleanup();
  });

  it('step 1 combobox filters to temporal columns', () => {
    render(
      <SemanticTagWizard
        open
        onClose={() => {}}
        dashboardId="d-1"
        connId="c-1"
        schemaProfile={SAMPLE_PROFILE}
        onComplete={() => {}}
      />
    );

    const options = screen.getByTestId('semantic-wizard-options-0');
    // Only order_date + created_at qualify as temporal.
    expect(within(options).getByTestId('semantic-wizard-option-order_date')).toBeInTheDocument();
    expect(within(options).getByTestId('semantic-wizard-option-created_at')).toBeInTheDocument();
    expect(within(options).queryByTestId('semantic-wizard-option-revenue')).toBeNull();
    expect(within(options).queryByTestId('semantic-wizard-option-region')).toBeNull();
  });

  it('Next advances step and Back returns', () => {
    render(
      <SemanticTagWizard
        open
        onClose={() => {}}
        dashboardId="d-1"
        connId="c-1"
        schemaProfile={SAMPLE_PROFILE}
        onComplete={() => {}}
      />
    );

    // Pick a temporal column + click Next.
    fireEvent.click(screen.getByTestId('semantic-wizard-option-order_date'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    // Step 2 should now be visible — revenue is a measure.
    const step2 = screen.getByTestId('semantic-wizard-options-1');
    expect(within(step2).getByTestId('semantic-wizard-option-revenue')).toBeInTheDocument();
    expect(within(step2).queryByTestId('semantic-wizard-option-order_date')).toBeNull();

    // Back returns to step 1.
    fireEvent.click(screen.getByTestId('semantic-wizard-back'));
    const step1Again = screen.getByTestId('semantic-wizard-options-0');
    expect(within(step1Again).getByTestId('semantic-wizard-option-order_date')).toBeInTheDocument();
  });

  it('Skip on step 3 advances without setting a tag', () => {
    const onComplete = vi.fn();
    render(
      <SemanticTagWizard
        open
        onClose={() => {}}
        dashboardId="d-1"
        connId="c-1"
        schemaProfile={SAMPLE_PROFILE}
        onComplete={onComplete}
      />
    );

    // Step 1 → pick + next
    fireEvent.click(screen.getByTestId('semantic-wizard-option-order_date'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));
    // Step 2 → pick + next
    fireEvent.click(screen.getByTestId('semantic-wizard-option-revenue'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));
    // Step 3 → Skip (primary dimension)
    fireEvent.click(screen.getByTestId('semantic-wizard-skip'));

    // We should now be on step 4 (entity name — string + card > 10).
    const step4 = screen.getByTestId('semantic-wizard-options-3');
    expect(within(step4).getByTestId('semantic-wizard-option-region')).toBeInTheDocument();

    // And the primaryDimension tag must not have been set — we can
    // verify by skipping through the remaining steps and checking the
    // resulting payload.
    fireEvent.click(screen.getByTestId('semantic-wizard-skip'));
    // Step 5 — time grain radio; pick one + finish.
    fireEvent.click(screen.getByTestId('semantic-wizard-grain-month'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const payload = onComplete.mock.calls[0][0];
    expect(payload.primaryDate).toBe('order_date');
    expect(payload.revenueMetric).toEqual({ column: 'revenue', agg: 'SUM' });
    expect(payload.primaryDimension).toBeUndefined();
    expect(payload.entityName).toBeUndefined();
    expect(payload.timeGrain).toBe('month');
  });

  it('final Next fires onComplete with the accumulated tags', () => {
    const onComplete = vi.fn();
    render(
      <SemanticTagWizard
        open
        onClose={() => {}}
        dashboardId="d-1"
        connId="c-1"
        schemaProfile={SAMPLE_PROFILE}
        onComplete={onComplete}
      />
    );

    // Walk every step with a pick.
    fireEvent.click(screen.getByTestId('semantic-wizard-option-order_date'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    fireEvent.click(screen.getByTestId('semantic-wizard-option-revenue'));
    // Flip aggregation to AVG before advancing to exercise the pill flow.
    fireEvent.click(screen.getByTestId('semantic-wizard-agg-AVG'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    fireEvent.click(screen.getByTestId('semantic-wizard-option-region'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    fireEvent.click(screen.getByTestId('semantic-wizard-option-customer_name'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    // Time-grain step — pick month.
    fireEvent.click(screen.getByTestId('semantic-wizard-grain-month'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const payload = onComplete.mock.calls[0][0];
    expect(payload).toEqual({
      primaryDate: 'order_date',
      revenueMetric: { column: 'revenue', agg: 'AVG' },
      primaryDimension: 'region',
      entityName: 'customer_name',
      timeGrain: 'month',
    });
  });
});
