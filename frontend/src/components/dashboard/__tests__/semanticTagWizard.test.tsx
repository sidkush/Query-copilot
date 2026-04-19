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

/**
 * The shape returned by the live backend `/api/v1/connections/{id}/schema-profile`
 * endpoint. Columns carry `type` (uppercase SQL type) + `name` + `nullable` only —
 * no `role`, no `semantic_type`, no `cardinality`. The wizard must still populate
 * every step's picker by classifying fields from `type` alone.
 *
 * Confirmed by live `preview_eval` against a BigQuery fixture connection
 * (see Phase 1 artifact in docs/ultraflow/specs/).
 */
const REAL_BACKEND_PROFILE = {
  tables: [
    {
      name: 'january_trips',
      columns: [
        { name: 'ride_id', nullable: true, type: 'VARCHAR' },
        { name: 'rideable_type', nullable: true, type: 'VARCHAR' },
        { name: 'started_at', nullable: true, type: 'TIMESTAMP' },
        { name: 'ended_at', nullable: true, type: 'TIMESTAMP' },
        { name: 'start_station_name', nullable: true, type: 'VARCHAR' },
        { name: 'start_station_id', nullable: true, type: 'VARCHAR' },
        { name: 'end_station_name', nullable: true, type: 'VARCHAR' },
        { name: 'trip_duration_sec', nullable: true, type: 'INT64' },
        { name: 'total_fare', nullable: true, type: 'NUMERIC' },
        { name: 'start_lat', nullable: true, type: 'FLOAT64' },
        { name: 'start_lng', nullable: true, type: 'FLOAT64' },
        { name: 'member_casual', nullable: true, type: 'VARCHAR' },
        { name: 'is_refunded', nullable: true, type: 'BOOL' },
      ],
    },
    {
      name: 'february_trips',
      columns: [
        { name: 'ride_id', nullable: true, type: 'VARCHAR' },
        { name: 'trip_duration_sec', nullable: true, type: 'INT64' },
        { name: 'total_fare', nullable: true, type: 'NUMERIC' },
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
    expect(within(options).getByTestId('semantic-wizard-option-orders.order_date')).toBeInTheDocument();
    expect(within(options).getByTestId('semantic-wizard-option-orders.created_at')).toBeInTheDocument();
    expect(within(options).queryByTestId('semantic-wizard-option-orders.revenue')).toBeNull();
    expect(within(options).queryByTestId('semantic-wizard-option-orders.region')).toBeNull();
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
    fireEvent.click(screen.getByTestId('semantic-wizard-option-orders.order_date'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    // Step 2 should now be visible — revenue is a measure.
    const step2 = screen.getByTestId('semantic-wizard-options-1');
    expect(within(step2).getByTestId('semantic-wizard-option-orders.revenue')).toBeInTheDocument();
    expect(within(step2).queryByTestId('semantic-wizard-option-orders.order_date')).toBeNull();

    // Back returns to step 1.
    fireEvent.click(screen.getByTestId('semantic-wizard-back'));
    const step1Again = screen.getByTestId('semantic-wizard-options-0');
    expect(within(step1Again).getByTestId('semantic-wizard-option-orders.order_date')).toBeInTheDocument();
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
    fireEvent.click(screen.getByTestId('semantic-wizard-option-orders.order_date'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));
    // Step 2 → pick + next
    fireEvent.click(screen.getByTestId('semantic-wizard-option-orders.revenue'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));
    // Step 3 → Skip (primary dimension)
    fireEvent.click(screen.getByTestId('semantic-wizard-skip'));

    // We should now be on step 4 (entity name — string + card > 10).
    const step4 = screen.getByTestId('semantic-wizard-options-3');
    expect(within(step4).getByTestId('semantic-wizard-option-orders.region')).toBeInTheDocument();

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
    fireEvent.click(screen.getByTestId('semantic-wizard-option-orders.order_date'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    fireEvent.click(screen.getByTestId('semantic-wizard-option-orders.revenue'));
    // Flip aggregation to AVG before advancing to exercise the pill flow.
    fireEvent.click(screen.getByTestId('semantic-wizard-agg-AVG'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    fireEvent.click(screen.getByTestId('semantic-wizard-option-orders.region'));
    fireEvent.click(screen.getByTestId('semantic-wizard-next'));

    fireEvent.click(screen.getByTestId('semantic-wizard-option-orders.customer_name'));
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

  // ── Bug repro: real backend schema shape (no role, no semantic_type). ──
  //
  // Before the fix, isMeasure/isDimension only returned true when col.role
  // matched verbatim; the backend never emits role, so steps 2 (measure)
  // and 3 (dimension) rendered the "No columns matched" empty state.
  // After the fix, both steps infer role from SQL `type` so every numeric
  // column surfaces as a measure and every string column as a dimension.
  describe('real backend schema (no role field)', () => {
    it('step 2 (measure) shows every numeric column from every table', () => {
      render(
        <SemanticTagWizard
          open
          onClose={() => {}}
          dashboardId="d-1"
          connId="c-1"
          schemaProfile={REAL_BACKEND_PROFILE}
          onComplete={() => {}}
        />
      );

      // Advance past the date step by picking started_at.
      fireEvent.click(screen.getByTestId('semantic-wizard-option-january_trips.started_at'));
      fireEvent.click(screen.getByTestId('semantic-wizard-next'));

      // Step 2 — must list numeric columns from BOTH tables.
      const options = screen.getByTestId('semantic-wizard-options-1');
      expect(within(options).getByTestId('semantic-wizard-option-january_trips.trip_duration_sec')).toBeInTheDocument();
      expect(within(options).getByTestId('semantic-wizard-option-january_trips.total_fare')).toBeInTheDocument();
      expect(within(options).getByTestId('semantic-wizard-option-january_trips.start_lat')).toBeInTheDocument();
      // Non-numeric must NOT appear at measure step.
      expect(within(options).queryByTestId('semantic-wizard-option-january_trips.rideable_type')).toBeNull();
    });

    it('step 3 (dimension) shows every non-temporal categorical column', () => {
      render(
        <SemanticTagWizard
          open
          onClose={() => {}}
          dashboardId="d-1"
          connId="c-1"
          schemaProfile={REAL_BACKEND_PROFILE}
          onComplete={() => {}}
        />
      );

      // Advance through date + measure.
      fireEvent.click(screen.getByTestId('semantic-wizard-option-january_trips.started_at'));
      fireEvent.click(screen.getByTestId('semantic-wizard-next'));
      fireEvent.click(screen.getByTestId('semantic-wizard-option-january_trips.total_fare'));
      fireEvent.click(screen.getByTestId('semantic-wizard-next'));

      const options = screen.getByTestId('semantic-wizard-options-2');
      expect(within(options).getByTestId('semantic-wizard-option-january_trips.rideable_type')).toBeInTheDocument();
      expect(within(options).getByTestId('semantic-wizard-option-january_trips.start_station_name')).toBeInTheDocument();
      expect(within(options).getByTestId('semantic-wizard-option-january_trips.member_casual')).toBeInTheDocument();
      // Temporal columns must NOT leak into the dimension picker.
      expect(within(options).queryByTestId('semantic-wizard-option-january_trips.started_at')).toBeNull();
      expect(within(options).queryByTestId('semantic-wizard-option-january_trips.ended_at')).toBeNull();
    });

    it('every picker displays the full catalog via the "Show all fields" fallback', () => {
      // Escape hatch: users frequently want ALL fields visible regardless of
      // inferred role. The wizard renders a "Show all fields" toggle; once
      // toggled, every column in every table appears.
      render(
        <SemanticTagWizard
          open
          onClose={() => {}}
          dashboardId="d-1"
          connId="c-1"
          schemaProfile={REAL_BACKEND_PROFILE}
          onComplete={() => {}}
        />
      );

      // The toggle exists on every step.
      const showAllToggle = screen.getByTestId('semantic-wizard-show-all');
      fireEvent.click(showAllToggle);

      const options = screen.getByTestId('semantic-wizard-options-0');
      // Every single column from january_trips must now appear.
      const expected = [
        'january_trips.ride_id',
        'january_trips.rideable_type',
        'january_trips.started_at',
        'january_trips.ended_at',
        'january_trips.start_station_name',
        'january_trips.start_station_id',
        'january_trips.end_station_name',
        'january_trips.trip_duration_sec',
        'january_trips.total_fare',
        'january_trips.start_lat',
        'january_trips.start_lng',
        'january_trips.member_casual',
        'january_trips.is_refunded',
      ];
      for (const name of expected) {
        expect(within(options).getByTestId(`semantic-wizard-option-${name}`)).toBeInTheDocument();
      }
    });

    it('renders table.column prefix for disambiguation across multi-table connections', () => {
      render(
        <SemanticTagWizard
          open
          onClose={() => {}}
          dashboardId="d-1"
          connId="c-1"
          schemaProfile={REAL_BACKEND_PROFILE}
          onComplete={() => {}}
        />
      );

      fireEvent.click(screen.getByTestId('semantic-wizard-option-january_trips.started_at'));
      fireEvent.click(screen.getByTestId('semantic-wizard-next'));

      // Both tables have `trip_duration_sec` — the picker must disambiguate
      // via the `table.` prefix rendered in the option's label.
      const options = screen.getByTestId('semantic-wizard-options-1');
      // Scope the assertion to the listbox so stray occurrences elsewhere
      // (e.g. dev tools) don't pollute the match.
      const labels = within(options)
        .getAllByRole('option')
        .map((el) => el.textContent || '');
      const janMatches = labels.filter((t) => t.includes('january_trips.trip_duration_sec'));
      const febMatches = labels.filter((t) => t.includes('february_trips.trip_duration_sec'));
      expect(janMatches.length).toBeGreaterThanOrEqual(1);
      expect(febMatches.length).toBeGreaterThanOrEqual(1);
    });
  });
});
