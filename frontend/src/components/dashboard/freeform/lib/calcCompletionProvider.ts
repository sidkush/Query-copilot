import type * as monacoNs from 'monaco-editor';
import { CALC_FUNCTIONS, CALC_LOD_KEYWORDS } from './calcFunctionCatalogue';

export interface SchemaField { name: string; dataType: string; sampleValues?: unknown[]; }
export interface ParamRef    { name: string; dataType: string; }
export interface SetRef      { name: string; }

export interface CalcCompletionContext {
  schemaFields: readonly SchemaField[];
  parameters: readonly ParamRef[];
  sets: readonly SetRef[];
}

export function buildCompletionProvider(
  monaco: typeof import('monaco-editor'),
  context: CalcCompletionContext,
): monacoNs.languages.CompletionItemProvider & { triggerCharacters: string[] } {
  const K = monaco.languages.CompletionItemKind;
  const R = monaco.languages.CompletionItemInsertTextRule;

  return {
    triggerCharacters: ['[', '(', ' ', '{', '.'],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const before = line.substring(0, position.column - 1);

      // After `[Parameters].[` → parameter names
      if (/\[Parameters\]\.\[\s*[A-Za-z0-9_ ]*$/i.test(before)) {
        return {
          suggestions: context.parameters.map((p) => ({
            label: p.name,
            kind: K.Variable,
            insertText: `${p.name}]`,
            detail: `parameter (${p.dataType})`,
          } as monacoNs.languages.CompletionItem)),
        };
      }

      // After bare `[` → field names
      if (/(^|[^\w\]])\[[A-Za-z0-9_ ]*$/.test(before)) {
        return {
          suggestions: context.schemaFields.map((f) => ({
            label: f.name,
            kind: K.Field,
            insertText: `${f.name}]`,
            detail: `field (${f.dataType})`,
          } as monacoNs.languages.CompletionItem)),
        };
      }

      // After `{` → LOD keywords
      if (/\{\s*[A-Za-z]*$/.test(before)) {
        return {
          suggestions: CALC_LOD_KEYWORDS.map((kw) => ({
            label: kw,
            kind: K.Keyword,
            insertText: `${kw} [\${1:dim}] : \${2:expression}`,
            insertTextRules: R.InsertAsSnippet,
            detail: `LOD expression (${kw.toLowerCase()})`,
          } as monacoNs.languages.CompletionItem)),
        };
      }

      // Default — function names (rank aggregate first when line has no args yet)
      return {
        suggestions: CALC_FUNCTIONS.map((fn) => ({
          label: fn.name,
          kind: K.Function,
          insertText: fn.maxArgs === 0 ? `${fn.name}()` : `${fn.name}($0)`,
          insertTextRules: R.InsertAsSnippet,
          detail: fn.signature,
          documentation: { value: fn.docstring },
          sortText: fn.category === 'aggregate' ? `0_${fn.name}` : `1_${fn.name}`,
        } as monacoNs.languages.CompletionItem)),
      };
    },
  };
}
