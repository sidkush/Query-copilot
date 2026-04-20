import { describe, it, expect } from 'vitest';
import { monarchTokens, languageConfiguration, themeRules } from '../calcMonarch';

/**
 * jsdom-based `monaco.editor.tokenize` is unreliable because Monaco's
 * standalone editor depends on browser APIs that jsdom doesn't provide.
 * Per plan guidance (Option 2), we instead assert the structural shape of
 * `monarchTokens.tokenizer.root` — verifying that each expected regex +
 * token-name pair is present. This validates the tokenizer definition
 * without booting a full Monaco instance.
 *
 * Strategy: each test locates a rule whose regex matches a representative
 * sample and whose emitted token name matches the expected class. Rules are
 * tuples of [regex, tokenSpec] where tokenSpec is either a string (token
 * name) or `{ token, next? }`. We flatten to a `{ regex, token }` form for
 * assertions.
 */

type RuleTuple = readonly [RegExp, string | { token: string; next?: string }];

function tokenNameFor(spec: string | { token: string }): string {
  return typeof spec === 'string' ? spec : spec.token;
}

function rootRules(): RuleTuple[] {
  return (monarchTokens as any).tokenizer.root as RuleTuple[];
}

/** Find the first root rule whose regex matches `sample`. */
function matchRule(sample: string): { token: string; regex: RegExp } | null {
  for (const rule of rootRules()) {
    const [re] = rule;
    if (re.test(sample)) {
      return { token: tokenNameFor(rule[1] as any), regex: re };
    }
  }
  return null;
}

describe('calcMonarch tokenizer — structural shape', () => {
  it('classifies IF/THEN/ELSE/END as keyword.control via the identifier-dispatch rule', () => {
    // The identifier rule is a single regex [a-zA-Z_]... with a `cases` dispatch.
    // We assert the keywords list includes IF/THEN/ELSE/END and the rule dispatches
    // to 'keyword.control'.
    const idRule = rootRules().find(([re]) => re.source.includes('a-zA-Z_'));
    expect(idRule).toBeTruthy();
    const spec = idRule![1] as any;
    expect(spec.cases['@keywords']).toBe('keyword.control');
    // And monarchTokens.keywords must include the control keywords.
    const keywords: string[] = (monarchTokens as any).keywords;
    for (const kw of ['IF', 'THEN', 'ELSE', 'END', 'ELSEIF', 'CASE', 'WHEN', 'AND', 'OR']) {
      expect(keywords).toContain(kw);
    }
  });

  it('classifies FIXED/INCLUDE/EXCLUDE as keyword.lod via the identifier-dispatch rule', () => {
    const idRule = rootRules().find(([re]) => re.source.includes('a-zA-Z_'));
    expect(idRule).toBeTruthy();
    const spec = idRule![1] as any;
    expect(spec.cases['@lodKeywords']).toBe('keyword.lod');
    const lod: string[] = (monarchTokens as any).lodKeywords;
    for (const kw of ['FIXED', 'INCLUDE', 'EXCLUDE']) {
      expect(lod).toContain(kw);
    }
  });

  it('classifies SUM / AVG / COUNT as predefined.function via the identifier-dispatch rule', () => {
    const idRule = rootRules().find(([re]) => re.source.includes('a-zA-Z_'));
    expect(idRule).toBeTruthy();
    const spec = idRule![1] as any;
    expect(spec.cases['@functions']).toBe('predefined.function');
    const functions: string[] = (monarchTokens as any).functions;
    for (const fn of ['SUM', 'AVG', 'COUNT']) {
      expect(functions).toContain(fn);
    }
  });

  it('classifies [Field] as identifier.field and [Parameters].[X] as identifier.param', () => {
    // `[Parameters].[X]` must match the parameter rule first
    const paramMatch = matchRule('[Parameters].[Threshold]');
    expect(paramMatch?.token).toBe('identifier.param');

    // Bare `[Sales]` must match the field rule.
    // Skip the parameter rule (which also matches `[Parameters]`) and confirm the
    // field rule exists and matches bracketed identifiers.
    const fieldRule = rootRules().find(
      ([re, spec]) =>
        re.test('[Sales]') && tokenNameFor(spec as any) === 'identifier.field',
    );
    expect(fieldRule).toBeTruthy();

    // And the parameter rule must be declared *before* the field rule so that
    // `[Parameters].[X]` hits the parameter branch first (Monarch picks the first
    // matching rule in order).
    const rules = rootRules();
    const paramIdx = rules.findIndex(([re]) =>
      re.source.includes('Parameters'),
    );
    const fieldIdx = rules.findIndex(
      ([re, spec]) =>
        re.test('[Sales]') && tokenNameFor(spec as any) === 'identifier.field',
    );
    expect(paramIdx).toBeGreaterThanOrEqual(0);
    expect(fieldIdx).toBeGreaterThan(paramIdx);
  });

  it('classifies // line comments and /* block */ comments', () => {
    const lineMatch = matchRule('// comment');
    expect(lineMatch?.token).toMatch(/comment/);

    // Block comment starter leads to blockComment state
    const blockRule = rootRules().find(([re]) => re.source.includes('\\*'));
    expect(blockRule).toBeTruthy();
    const blockSpec = blockRule![1] as any;
    const blockToken =
      typeof blockSpec === 'string' ? blockSpec : blockSpec.token;
    expect(blockToken).toMatch(/comment/);

    // blockComment state must exist
    const blockState = (monarchTokens as any).tokenizer.blockComment;
    expect(Array.isArray(blockState)).toBe(true);
    expect(blockState.length).toBeGreaterThan(0);
  });

  it('classifies string literals, numbers (int / float / scientific)', () => {
    // Double-quoted string
    const dq = matchRule('"hello"');
    expect(dq?.token).toMatch(/string/);

    // Integer
    const int = matchRule('42');
    expect(int?.token).toMatch(/number/);
    expect(int?.token).not.toMatch(/float/);

    // Float
    const fl = matchRule('3.14');
    expect(fl?.token).toBe('number.float');

    // Scientific
    const sci = matchRule('1.2e10');
    expect(sci?.token).toMatch(/number/);
  });
});

describe('calcMonarch language configuration', () => {
  it('declares comments / brackets / autoClosingPairs / surroundingPairs', () => {
    expect(languageConfiguration.comments).toEqual({
      lineComment: '//',
      blockComment: ['/*', '*/'],
    });
    expect(languageConfiguration.brackets).toEqual(
      expect.arrayContaining([
        ['(', ')'],
        ['{', '}'],
        ['[', ']'],
      ]),
    );
    expect(languageConfiguration.autoClosingPairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ open: '(', close: ')' }),
        expect.objectContaining({ open: '{', close: '}' }),
        expect.objectContaining({ open: '[', close: ']' }),
      ]),
    );
    expect(languageConfiguration.surroundingPairs).toBeTruthy();
  });
});

describe('calcMonarch theme rules', () => {
  it('defines theme rules for all key token categories', () => {
    const tokens = themeRules.map((r) => r.token);
    for (const expected of [
      'keyword.control',
      'keyword.lod',
      'predefined.function',
      'identifier.field',
      'identifier.param',
      'comment.line',
      'comment.block',
      'string.double',
      'number.float',
    ]) {
      expect(tokens).toContain(expected);
    }
  });
});
