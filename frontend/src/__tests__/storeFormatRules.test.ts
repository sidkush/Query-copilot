// frontend/src/__tests__/storeFormatRules.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../store';
import { StyleProp } from '../components/dashboard/freeform/lib/formattingTypes';

describe('analystProFormatRules slice', () => {
  beforeEach(() => {
    useStore.setState({ analystProFormatRules: [] });
  });

  it('setFormatRuleAnalystPro adds a rule', () => {
    useStore.getState().setFormatRuleAnalystPro(
      { kind: 'mark', markId: 'm1' },
      StyleProp.Color,
      '#ff0000',
    );
    expect(useStore.getState().analystProFormatRules).toHaveLength(1);
    const r = useStore.getState().analystProFormatRules[0];
    expect(r.selector).toEqual({ kind: 'mark', markId: 'm1' });
    expect(r.properties[StyleProp.Color]).toBe('#ff0000');
  });

  it('setFormatRuleAnalystPro merges onto existing selector rule', () => {
    const setRule = useStore.getState().setFormatRuleAnalystPro;
    setRule({ kind: 'mark', markId: 'm1' }, StyleProp.Color, '#ff0000');
    setRule({ kind: 'mark', markId: 'm1' }, StyleProp.FontSize, 14);
    const rules = useStore.getState().analystProFormatRules;
    expect(rules).toHaveLength(1);
    expect(rules[0].properties[StyleProp.Color]).toBe('#ff0000');
    expect(rules[0].properties[StyleProp.FontSize]).toBe(14);
  });

  it('clearFormatRuleAnalystPro removes one property', () => {
    const s = useStore.getState();
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color, '#ff0000');
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.FontSize, 14);
    s.clearFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color);
    const rules = useStore.getState().analystProFormatRules;
    expect(rules[0].properties[StyleProp.Color]).toBeUndefined();
    expect(rules[0].properties[StyleProp.FontSize]).toBe(14);
  });

  it('clearFormatRuleAnalystPro drops empty rule entirely', () => {
    const s = useStore.getState();
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color, '#ff0000');
    s.clearFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color);
    expect(useStore.getState().analystProFormatRules).toHaveLength(0);
  });

  it('resetFormatScopeAnalystPro removes all rules for a selector', () => {
    const s = useStore.getState();
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.Color, '#ff0000');
    s.setFormatRuleAnalystPro({ kind: 'mark', markId: 'm1' }, StyleProp.FontSize, 14);
    s.setFormatRuleAnalystPro({ kind: 'sheet', sheetId: 's1' }, StyleProp.Color, '#0000ff');
    s.resetFormatScopeAnalystPro({ kind: 'mark', markId: 'm1' });
    const rules = useStore.getState().analystProFormatRules;
    expect(rules).toHaveLength(1);
    expect(rules[0].selector).toEqual({ kind: 'sheet', sheetId: 's1' });
  });
});
