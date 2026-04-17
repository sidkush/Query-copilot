import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ObjectLibraryPanel from '../panels/ObjectLibraryPanel';

describe('ObjectLibraryPanel', () => {
  it('renders 6 object types', () => {
    render(<ObjectLibraryPanel />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(6);
  });

  it('has aria-label "Object library"', () => {
    render(<ObjectLibraryPanel />);
    expect(screen.getByLabelText('Object library')).toBeInTheDocument();
  });

  it('sets the correct dataTransfer payload on dragStart for text', () => {
    render(<ObjectLibraryPanel />);
    const textItem = screen.getByText('Text').closest('li');
    // Build a mock dataTransfer
    const setData = vi.fn();
    fireEvent.dragStart(textItem!, {
      dataTransfer: {
        setData,
        effectAllowed: '',
      },
    });
    expect(setData).toHaveBeenCalledWith(
      'application/askdb-analyst-pro-object+json',
      JSON.stringify({ type: 'text' }),
    );
  });
});
