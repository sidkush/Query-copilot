import { describe, it, expect } from 'vitest';
import { buildCompletionProvider, type CalcCompletionContext } from '../calcCompletionProvider';

function ctx(partial: Partial<CalcCompletionContext> = {}): CalcCompletionContext {
  return {
    schemaFields: [
      { name: 'Sales',  dataType: 'number' },
      { name: 'Region', dataType: 'string' },
      { name: 'Order Date', dataType: 'date' },
    ],
    parameters: [
      { name: 'Threshold', dataType: 'number' },
    ],
    sets: [{ name: 'Top Customers' }],
    ...partial,
  };
}

const fakeModel = (text: string, pos: number) => ({
  getLineContent: (_: number) => text,
  getWordUntilPosition: () => ({ word: '', startColumn: pos, endColumn: pos }),
  getLineCount: () => 1,
  getValueInRange: (r: any) => text.substring(r.startColumn - 1, r.endColumn - 1),
});

const monaco = {
  languages: {
    CompletionItemKind: { Field: 4, Function: 3, Variable: 6, Keyword: 14, Snippet: 27 },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
  },
} as any;

describe('buildCompletionProvider', () => {
  it('after "[" suggests all fields', () => {
    const prov = buildCompletionProvider(monaco, ctx());
    const text = 'SUM([';
    const res = prov.provideCompletionItems(
      fakeModel(text, text.length + 1) as any,
      { lineNumber: 1, column: text.length + 1 } as any,
    ) as any;
    const labels = res.suggestions.map((s: any) => s.label);
    expect(labels).toEqual(expect.arrayContaining(['Sales', 'Region', 'Order Date']));
  });

  it('after "[Parameters].[" suggests parameter names only', () => {
    const prov = buildCompletionProvider(monaco, ctx());
    const text = '[Parameters].[';
    const res = prov.provideCompletionItems(
      fakeModel(text, text.length + 1) as any,
      { lineNumber: 1, column: text.length + 1 } as any,
    ) as any;
    const labels = res.suggestions.map((s: any) => s.label);
    expect(labels).toEqual(['Threshold']);
  });

  it('at start-of-line with partial suggests functions', () => {
    const prov = buildCompletionProvider(monaco, ctx());
    const text = 'SU';
    const res = prov.provideCompletionItems(
      fakeModel(text, text.length + 1) as any,
      { lineNumber: 1, column: text.length + 1 } as any,
    ) as any;
    const labels = res.suggestions.map((s: any) => s.label);
    expect(labels).toContain('SUM');
  });

  it('after "{" suggests LOD types FIXED/INCLUDE/EXCLUDE', () => {
    const prov = buildCompletionProvider(monaco, ctx());
    const text = '{';
    const res = prov.provideCompletionItems(
      fakeModel(text, text.length + 1) as any,
      { lineNumber: 1, column: text.length + 1 } as any,
    ) as any;
    const labels = res.suggestions.map((s: any) => s.label);
    expect(labels).toEqual(expect.arrayContaining(['FIXED', 'INCLUDE', 'EXCLUDE']));
  });

  it('declares trigger characters [ ( space { .', () => {
    const prov = buildCompletionProvider(monaco, ctx());
    expect(prov.triggerCharacters).toEqual(expect.arrayContaining(['[', '(', ' ', '{', '.']));
  });
});
