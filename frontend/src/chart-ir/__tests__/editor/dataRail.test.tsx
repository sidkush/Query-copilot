import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DataRail from '../../../components/editor/DataRail';
import {
  REGION_DIM,
  REVENUE_MEASURE,
  ORDER_DATE,
} from '../fixtures/column-profiles';

describe('DataRail column routing', () => {
  it('renders dimensions and measures in the correct accordion sections', () => {
    render(<DataRail columnProfile={[REGION_DIM, ORDER_DATE, REVENUE_MEASURE]} />);

    // Both dimension columns appear in the Dimensions section
    const regionPill = screen.getByTestId('data-pill-region');
    const datePill = screen.getByTestId('data-pill-order_date');
    const revenuePill = screen.getByTestId('data-pill-revenue');

    expect(regionPill.getAttribute('data-kind')).toBe('dimension');
    expect(datePill.getAttribute('data-kind')).toBe('dimension');
    expect(revenuePill.getAttribute('data-kind')).toBe('measure');

    // Section headers show correct counts
    const dimensionsSection = screen.getByTestId('data-rail-section-dimensions');
    const measuresSection = screen.getByTestId('data-rail-section-measures');
    expect(dimensionsSection.textContent).toContain('2');
    expect(measuresSection.textContent).toContain('1');
  });

  it('renders empty-hint placeholders when no columns match a section', () => {
    render(<DataRail columnProfile={[REGION_DIM]} />);
    // No measures → empty hint in the Measures section
    const measuresSection = screen.getByTestId('data-rail-section-measures');
    expect(measuresSection.textContent).toContain('No measures');
  });

  it('renders Calculated and Parameters as Phase 2 placeholders', () => {
    render(<DataRail columnProfile={[REGION_DIM, REVENUE_MEASURE]} />);
    const calculated = screen.getByTestId('data-rail-section-calculated');
    const parameters = screen.getByTestId('data-rail-section-parameters');
    expect(calculated).toBeDefined();
    expect(parameters).toBeDefined();
  });

  it('tolerates an empty column profile without crashing', () => {
    render(<DataRail columnProfile={[]} />);
    expect(screen.getByTestId('data-rail')).toBeDefined();
  });
});
