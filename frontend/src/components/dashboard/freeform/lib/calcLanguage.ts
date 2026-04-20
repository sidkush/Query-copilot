import { monarchTokens, languageConfiguration, themeRules } from './calcMonarch';
import { buildCompletionProvider, type CalcCompletionContext } from './calcCompletionProvider';
import { buildSignatureProvider } from './calcSignatureProvider';
import { buildHoverProvider, type HoverContext } from './calcHoverProvider';

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

export interface CalcProvidersRegistration {
  dispose: () => void;
}

/**
 * Attach completion / signature / hover providers bound to the given editor
 * context. Returns a disposer that unregisters all three — the dialog calls
 * it on close so providers never leak across dialog instances.
 *
 * Plan 8d T11.
 */
export function registerCalcProviders(
  monaco: typeof import('monaco-editor'),
  ctx: CalcCompletionContext & HoverContext,
): CalcProvidersRegistration {
  const disposers = [
    monaco.languages.registerCompletionItemProvider(
      ASKDB_CALC_LANGUAGE_ID,
      buildCompletionProvider(monaco, ctx),
    ),
    monaco.languages.registerSignatureHelpProvider(
      ASKDB_CALC_LANGUAGE_ID,
      buildSignatureProvider(monaco),
    ),
    monaco.languages.registerHoverProvider(
      ASKDB_CALC_LANGUAGE_ID,
      buildHoverProvider(ctx),
    ),
  ];
  return { dispose: () => disposers.forEach((d) => d.dispose()) };
}
