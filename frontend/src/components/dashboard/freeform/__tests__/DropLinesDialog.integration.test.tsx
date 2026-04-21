import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import DropLinesDialog from '../panels/DropLinesDialog';
import { useStore } from '../../../../store';

beforeEach(() => {
  useStore.setState({
    ...useStore.getState(),
    analystProDropLinesBySheet: {},
    analystProDropLinesDialogCtx: { sheetId: 'sheet_a' },
  });
});

describe('DropLinesDialog integration', () => {
  it('writes a per-sheet spec on Save', () => {
    render(<DropLinesDialog />);
    fireEvent.click(screen.getByLabelText(/Both axes/i));
    fireEvent.click(screen.getByLabelText(/Dashed/i));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    const map = useStore.getState().analystProDropLinesBySheet;
    expect(map.sheet_a.mode).toBe('both');
    expect(map.sheet_a.line_style).toBe('dashed');
  });

  it("mode='off' persists as an explicit choice", () => {
    render(<DropLinesDialog />);
    fireEvent.click(screen.getByLabelText(/^Off$/i));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(useStore.getState().analystProDropLinesBySheet.sheet_a.mode).toBe('off');
  });
});
