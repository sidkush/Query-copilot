import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useStore } from '../../../../store';
import ObjectLibraryPanel from '../panels/ObjectLibraryPanel';

describe('ObjectLibraryPanel', () => {
  it('renders 6 object types', () => {
    const { container } = render(<ObjectLibraryPanel />);
    // <li> carries role="button" for keyboard a11y, so query by element tag.
    const items = container.querySelectorAll('li');
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

  it('Enter on a library item inserts a floating object via store', () => {
    const calls: any[] = [];
    useStore.setState({ insertObjectAnalystPro: (arg: any) => calls.push(arg) } as any);
    render(<ObjectLibraryPanel />);
    const textItem = screen.getByText('Text').closest('li')!;
    textItem.focus();
    fireEvent.keyDown(textItem, { key: 'Enter' });
    expect(calls).toEqual([{ type: 'text', x: 40, y: 40 }]);
  });
});
