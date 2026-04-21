import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import FormatInspectorPanel from '../panels/FormatInspectorPanel';
import { StyleProp } from '../lib/formattingTypes';

describe('Plan 10a integration', () => {
  it('edit in inspector → ZoneFrame reflects change', () => {
    useStore.setState({ analystProFormatRules: [] });
    render(
      <FormatInspectorPanel
        selector={{ kind: 'sheet', sheetId: 'sX' }}
        context={{ markId: 'z1', fieldId: null, sheetId: 'sX', dsId: 'd1' }}
      />,
    );
    fireEvent.change(screen.getByTestId('fmt-background-color-input'), {
      target: { value: '#abcdef' },
    });
    expect(useStore.getState().analystProFormatRules[0].properties[StyleProp.BackgroundColor])
      .toBe('#abcdef');
  });
});
