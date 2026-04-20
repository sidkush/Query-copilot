import type * as monacoNs from 'monaco-editor';
import { CALC_FUNCTIONS } from './calcFunctionCatalogue';

/**
 * Walk back from the cursor to find the enclosing function call and current
 * argument index. Depth-tracks nested parens + brackets. Returns null if
 * the cursor is not inside a function's argument list.
 */
function currentCallContext(
  source: string,
  cursor: number,
): { name: string; argIndex: number } | null {
  let depth = 0;
  let argIdx = 0;
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = source[i];
    if (ch === ')' || ch === ']') {
      depth++;
    } else if (ch === '[') {
      if (depth > 0) depth--;
    } else if (ch === '(') {
      if (depth === 0) {
        const m = source.substring(0, i).match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
        if (!m) return null;
        return { name: m[1], argIndex: argIdx };
      }
      depth--;
    } else if (ch === ',' && depth === 0) {
      argIdx++;
    }
  }
  return null;
}

export function buildSignatureProvider(
  _monaco: typeof import('monaco-editor'),
): monacoNs.languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const before = line.substring(0, position.column - 1);
      const call = currentCallContext(before, before.length);
      if (!call) return null;
      const fn = CALC_FUNCTIONS.find(
        (f) => f.name.toUpperCase() === call.name.toUpperCase(),
      );
      if (!fn) return null;

      // Split signature parameters from e.g. "PERCENTILE(expression, p)".
      const inside = fn.signature.replace(/^[^(]*\(/, '').replace(/\)$/, '');
      const params = inside.length
        ? inside.split(',').map((s) => ({ label: s.trim() }))
        : [];

      return {
        value: {
          signatures: [
            {
              label: fn.signature,
              documentation: { value: fn.docstring },
              parameters: params,
            },
          ],
          activeSignature: 0,
          activeParameter: Math.min(call.argIndex, Math.max(params.length - 1, 0)),
        },
        dispose: () => {},
      };
    },
  };
}
