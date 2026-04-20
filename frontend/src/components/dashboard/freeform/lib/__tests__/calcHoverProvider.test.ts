import { describe, it, expect } from 'vitest';
import { buildHoverProvider } from '../calcHoverProvider';

const fakeModel = (text: string) => ({
  getLineContent: () => text,
  getWordAtPosition: (p: any) => {
    const before = text.substring(0, p.column - 1);
    const m = before.match(/[A-Za-z_][A-Za-z0-9_]*$/);
    return m ? { word: m[0], startColumn: p.column - m[0].length, endColumn: p.column } : null;
  },
});

describe('buildHoverProvider', () => {
  it('hover on SUM returns docstring + signature', () => {
    const prov = buildHoverProvider({
      schemaFields: [{ name: 'Sales', dataType: 'number', sampleValues: [1, 2, 3] }],
    });
    const text = 'SUM';
    const res = prov.provideHover(fakeModel(text) as any, { lineNumber: 1, column: text.length + 1 } as any) as any;
    const joined = (res?.contents ?? []).map((c: any) => c.value).join(' ');
    expect(joined).toMatch(/SUM\(expression\)/);
    expect(joined).toMatch(/aggregation/i);
  });

  it('hover on [Sales] returns field type + sample values', () => {
    const prov = buildHoverProvider({
      schemaFields: [{ name: 'Sales', dataType: 'number', sampleValues: [10, 20, 30] }],
    });
    const text = '[Sales]';
    const res = prov.provideHover(fakeModel('Sales') as any, { lineNumber: 1, column: 6 } as any) as any;
    const joined = (res?.contents ?? []).map((c: any) => c.value).join(' ');
    expect(joined).toMatch(/number/);
    expect(joined).toMatch(/10.*20.*30/);
  });
});
