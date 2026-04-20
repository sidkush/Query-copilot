import type * as monacoNs from 'monaco-editor';
import { functionByName } from './calcFunctionCatalogue';

/**
 * Schema field shape consumed by calc editor hover + completion.
 * Duplicated locally until the Plan 8d T3 completion provider lands and
 * re-exports a canonical type.
 */
export interface SchemaField {
  name: string;
  dataType: string;
  sampleValues?: unknown[];
}

export interface HoverContext {
  schemaFields: readonly SchemaField[];
  /** Optional — Plan 8b LOD warning lookup keyed by field name. */
  lodWarnings?: Readonly<Record<string, string>>;
}

export function buildHoverProvider(
  ctx: HoverContext,
): monacoNs.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // Function hover
      const fn = functionByName(word.word);
      if (fn) {
        return {
          contents: [
            { value: `**${fn.signature}**` },
            { value: fn.docstring },
            { value: `_category: ${fn.category}_` },
          ],
        };
      }

      // Field hover — we match bare identifier words; square brackets
      // are consumed by Monarch as punctuation around the same word.
      const field = ctx.schemaFields.find(
        (f) => f.name.toLowerCase() === word.word.toLowerCase(),
      );
      if (field) {
        const samples = (field.sampleValues ?? [])
          .slice(0, 3)
          .map((v) => String(v))
          .join(', ');
        const warn = ctx.lodWarnings?.[field.name];
        const lines = [
          { value: `**[${field.name}]** — ${field.dataType}` },
          samples ? { value: `samples: ${samples}` } : null,
          warn ? { value: `warning: ${warn}` } : null,
        ].filter(Boolean) as { value: string }[];
        return { contents: lines };
      }
      return null;
    },
  };
}
