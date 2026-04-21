import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import NumberFormatEditor from '../NumberFormatEditor';

describe('NumberFormatEditor', () => {
  it('renders preset dropdown with all defaults', () => {
    render(<NumberFormatEditor value="" onChange={() => {}} />);
    const select = screen.getByTestId('nfmt-preset');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
    expect(options).toEqual(expect.arrayContaining([
      'Custom', 'Number (Standard)', 'Number (Decimal)',
      'Currency (Standard)', 'Currency (Custom)', 'Scientific', 'Percentage',
    ]));
  });

  it('selecting preset fires onChange with pattern', () => {
    const onChange = vi.fn();
    render(<NumberFormatEditor value="" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('nfmt-preset'), { target: { value: 'Percentage' } });
    expect(onChange).toHaveBeenCalledWith('0.0%');
  });

  it('typing custom pattern fires onChange', () => {
    const onChange = vi.fn();
    render(<NumberFormatEditor value="#,##0" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('nfmt-custom'), { target: { value: '0.00%' } });
    expect(onChange).toHaveBeenCalledWith('0.00%');
  });

  it('shows live preview of 1234567.89 against current pattern', () => {
    render(<NumberFormatEditor value="#,##0.00" onChange={() => {}} />);
    expect(screen.getByTestId('nfmt-preview')).toHaveTextContent('Sample: 1,234,567.89');
  });

  it('shows error indicator for invalid pattern', () => {
    render(<NumberFormatEditor value='0 "unclosed' onChange={() => {}} />);
    expect(screen.getByTestId('nfmt-error')).toBeInTheDocument();
  });

  it('preset auto-selects "Custom" when pattern is not a catalogue default', () => {
    render(<NumberFormatEditor value="000.00" onChange={() => {}} />);
    expect(screen.getByTestId('nfmt-preset')).toHaveValue('Custom');
  });
});
