import { render, screen } from '@testing-library/react';
import ProvenanceChip from './ProvenanceChip';
import { describe, it, expect } from 'vitest';


describe('ProvenanceChip', () => {
  it('renders nothing when chip is null', () => {
    const { container } = render(<ProvenanceChip chip={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Live shape with row count', () => {
    render(<ProvenanceChip chip={{
      trust: 'live',
      label: 'Live · 4,832 rows',
      row_count: 4832,
    }} />);
    expect(screen.getByText(/Live · 4,832 rows/)).toBeInTheDocument();
  });

  it('renders Turbo shape with staleness', () => {
    render(<ProvenanceChip chip={{
      trust: 'turbo',
      label: 'Turbo · 3m stale · est. 4,830',
      staleness_seconds: 180,
    }} />);
    expect(screen.getByText(/3m stale/)).toBeInTheDocument();
  });

  it('renders Sample shape with stratum', () => {
    render(<ProvenanceChip chip={{
      trust: 'sample',
      label: 'Sample 1% (stratified on region) · 4,500 ±200',
      sample_pct: 1,
      stratified_on: 'region',
      margin_of_error: 200,
    }} />);
    expect(screen.getByText(/stratified on region/)).toBeInTheDocument();
  });

  it('renders Unverified shape with reason', () => {
    render(<ProvenanceChip chip={{
      trust: 'unverified',
      label: 'Unverified scope · expression predicate',
      reason: 'expression predicate',
    }} />);
    expect(screen.getByText(/expression predicate/)).toBeInTheDocument();
  });
});
