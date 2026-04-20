import { monarchTokens, languageConfiguration, themeRules } from './calcMonarch';

export const ASKDB_CALC_LANGUAGE_ID = 'askdb-calc';

let _registered = false;

/**
 * Register the askdb-calc language with a Monaco instance.
 * Idempotent — subsequent calls are no-ops so HMR / re-mount does not stack providers.
 */
export function registerAskdbCalcLanguage(monaco: typeof import('monaco-editor')): void {
  if (_registered) return;
  _registered = true;

  monaco.languages.register({ id: ASKDB_CALC_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(ASKDB_CALC_LANGUAGE_ID, monarchTokens);
  monaco.languages.setLanguageConfiguration(ASKDB_CALC_LANGUAGE_ID, languageConfiguration);
  monaco.editor.defineTheme('askdb-calc-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: themeRules,
    colors: {},
  });
}

/** Test-only reset hook — never call from production code. */
export function __resetForTests(): void {
  _registered = false;
}
