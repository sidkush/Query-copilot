import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAskdbCalcLanguage, ASKDB_CALC_LANGUAGE_ID, __resetForTests } from '../calcLanguage';

describe('calcLanguage.registerAskdbCalcLanguage', () => {
  beforeEach(() => {
    __resetForTests();
  });

  it('registers language exactly once even when called twice', () => {
    const monaco = fakeMonaco();
    registerAskdbCalcLanguage(monaco as any);
    registerAskdbCalcLanguage(monaco as any);
    expect(monaco.languages.register).toHaveBeenCalledTimes(1);
    expect(monaco.languages.register).toHaveBeenCalledWith({ id: ASKDB_CALC_LANGUAGE_ID });
  });

  it('sets Monarch tokens provider, theme rules and language configuration', () => {
    const monaco = fakeMonaco();
    registerAskdbCalcLanguage(monaco as any);
    expect(monaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
      ASKDB_CALC_LANGUAGE_ID,
      expect.any(Object),
    );
    expect(monaco.languages.setLanguageConfiguration).toHaveBeenCalledWith(
      ASKDB_CALC_LANGUAGE_ID,
      expect.any(Object),
    );
    expect(monaco.editor.defineTheme).toHaveBeenCalledWith('askdb-calc-theme', expect.any(Object));
  });
});

function fakeMonaco() {
  return {
    languages: {
      register: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      registerCompletionItemProvider: vi.fn(() => ({ dispose: () => {} })),
      registerSignatureHelpProvider: vi.fn(() => ({ dispose: () => {} })),
      registerHoverProvider: vi.fn(() => ({ dispose: () => {} })),
      getLanguages: () => [],
    },
    editor: {
      defineTheme: vi.fn(),
      setModelMarkers: vi.fn(),
    },
  };
}
