// frontend/src/components/dashboard/freeform/panels/__tests__/FormatInspectorPanel.test.tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../../store';
import { StyleProp } from '../../lib/formattingTypes';
import FormatInspectorPanel from '../FormatInspectorPanel';

describe('FormatInspectorPanel', () => {
  it('shows resolved value + winning layer', () => {
    useStore.setState({
      analystProFormatRules: [
        { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#000000' } },
        { selector: { kind: 'mark', markId: 'z1' }, properties: { [StyleProp.Color]: '#ff0000' } },
      ],
    });
    render(
      <FormatInspectorPanel
        selector={{ kind: 'mark', markId: 'z1' }}
        context={{ markId: 'z1', fieldId: null, sheetId: 's1', dsId: 'd1' }}
      />,
    );
    // Colour row renders the resolved value + source layer.
    expect(screen.getByTestId('fmt-color-value').textContent).toBe('#ff0000');
    expect(screen.getByTestId('fmt-color-source').textContent).toMatch(/mark/i);
  });

  it('edit writes an override at the selected layer', () => {
    useStore.setState({ analystProFormatRules: [] });
    render(
      <FormatInspectorPanel
        selector={{ kind: 'sheet', sheetId: 's1' }}
        context={{ markId: 'z1', fieldId: null, sheetId: 's1', dsId: 'd1' }}
      />,
    );
    fireEvent.change(screen.getByTestId('fmt-color-input'), { target: { value: '#123456' } });
    const rules = useStore.getState().analystProFormatRules;
    expect(rules).toHaveLength(1);
    expect(rules[0].selector).toEqual({ kind: 'sheet', sheetId: 's1' });
    expect(rules[0].properties[StyleProp.Color]).toBe('#123456');
  });

  it('reset button clears override at the selected layer only', () => {
    useStore.setState({
      analystProFormatRules: [
        { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#000000' } },
        { selector: { kind: 'sheet', sheetId: 's1' }, properties: { [StyleProp.Color]: '#ff0000' } },
      ],
    });
    render(
      <FormatInspectorPanel
        selector={{ kind: 'sheet', sheetId: 's1' }}
        context={{ markId: 'z1', fieldId: null, sheetId: 's1', dsId: 'd1' }}
      />,
    );
    fireEvent.click(screen.getByTestId('fmt-color-reset'));
    const rules = useStore.getState().analystProFormatRules;
    // Sheet rule dropped; workbook preserved.
    expect(rules).toHaveLength(1);
    expect(rules[0].selector).toEqual({ kind: 'workbook' });
  });
});
