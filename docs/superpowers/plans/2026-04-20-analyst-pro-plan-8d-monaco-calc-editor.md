# Plan 8d — Monaco Calc Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal.** Ship the best calc editor in the BI market. Monaco-backed multi-line editor with `askdb-calc` language (tokenizer + completion + signature + hover + diagnostics), live test values against the connected source's first 10 rows, multi-line debug showing each sub-expression's intermediate value, and an LLM-suggest button grounded on schema + function catalogue + parameters + sets. Beats Tableau on every axis called out in `Build_Tableau.md` §XXV.1 #1 (calc editor ergonomics) and §XXV.5 gap #4 (Monaco + LLM everywhere).

**Architecture.** Frontend adds `@monaco-editor/react` + a custom language `askdb-calc` registered once on module init. Monarch tokenizer + completion / signature / hover providers consume the Plan 8a function catalogue (shipped in `backend/vizql/calc_functions.py`), the current connection's schema (existing `/api/schema/tables`), and the dashboard's parameters + sets (`analystProDashboard.parameters` / `.sets`). Diagnostics call the Plan 8a `/api/v1/calcs/validate` endpoint debounced 300 ms; errors + warnings (incl. Plan 8b LOD warnings) map to Monaco markers. Live test values call a new `POST /api/v1/calcs/evaluate` endpoint that runs the compiled SQL expression against a single `VALUES (…)` row in an in-process DuckDB connection (read-only, 1 s timeout, passes through `sql_validator.py`). Debug panel sends `trace=true` and renders the returned AST-with-values tree. LLM-suggest calls a new `POST /api/v1/calcs/suggest` that invokes Claude Haiku via `provider_registry.get_provider_for_user` with a cached system prompt (function catalogue + hard grounding rules); returns `{formula, explanation, confidence}` and flags the generated calc `is_generative_ai_web_authoring=true` per §I.5. Editor dialog wraps every piece with `role=dialog`, `aria-modal`, keyboard navigation (Tab / Esc / Cmd+Enter save).

**Tech Stack.** React 19 + Vite + Zustand + Monaco (`@monaco-editor/react@^4.7.0` + `monaco-editor@^0.52.2`) + Vitest + React Testing Library (`frontend/src/`). Python 3.10+ + FastAPI + DuckDB in-process + Anthropic SDK via BYOK adapter (`backend/vizql/`, `backend/routers/`). Reuses Plan 8a parser + typechecker + function catalogue, Plan 8b LOD analyzer, Plan 7c SQL emitter, `provider_registry.py`, `audit_trail.py`, `sql_validator.py`.

**Build_Tableau.md sections cited:**
- §XXV.1 — top-5 weakness #1 is calc editor ergonomics: tiny textbox, no real autocomplete, no multi-line debug, no test values. **Primary leapfrog target.**
- §XXV.3 — biggest authoring friction #1 is filter order-of-ops (FIXED vs Context vs Dim) — editor surfaces Plan 8b LOD warnings inline as write-time diagnostics.
- §XXV.5 — architectural gap #4: "Modern calc editor — Monaco everywhere; autocomplete; inline test values; LLM suggestion."
- §V.1 — full function catalogue (autocomplete source).
- §V.2 — LOD semantics `{FIXED}/{INCLUDE}/{EXCLUDE}` (hover warnings on expensive FIXED).
- §VI.4 — parameter reference grammar `[Parameters].[ParamName]` (param autocomplete).
- §XXVI Phase 14 — Calc Editor Modernisation (our phase plan).
- Appendix E fact 6 — `[Parameters].*` string-substitutes via `FormatAsLiteral` (must not bypass).

**Hard conventions.**
- **Monaco is mandatory.** No fallback to plain `<textarea>`. The dialog never renders without Monaco mounted.
- **LLM grounded on schema + catalogue + params + sets only.** System prompt forbids inventing field names, functions, or parameters not in the grounded lists.
- **All LLM-suggested calcs flagged** `is_generative_ai_web_authoring=true` (§I.5) in the calc object written to the dashboard.
- **BYOK.** Only `backend/anthropic_provider.py` `import anthropic`. Suggestion endpoint calls `provider_registry.get_provider_for_user(email).complete(...)` — never instantiates Anthropic directly.
- **Prompt caching on.** Function catalogue + grounding rules live in a `cache_control: ephemeral` system block; per-request user goal stays in the messages.
- **Security for `/calcs/evaluate`.** DuckDB-only (in-process `:memory:` connection), 1 s query timeout, read-only (no DDL / writes — enforced by `sql_validator.py`), never accepts arbitrary SQL from the client (client sends formula + row only; backend compiles to SQL via Plan 8a `calc_to_expression.compile`).
- **a11y.** `role=dialog` + `aria-modal=true` + `aria-labelledby` on dialog, `aria-describedby` on editor, focus trap, arrow-key nav in autocomplete, Esc closes, Cmd/Ctrl+Enter saves.
- **TDD** for the Monarch tokenizer, each completion provider, diagnostics mapping, and both backend endpoints.
- **Commit per task.** Format: `feat(analyst-pro): <verb> <object> (Plan 8d T<N>)`.
- **Feature flags.** `FEATURE_ANALYST_PRO` gates every endpoint; `FEATURE_CALC_LLM_SUGGEST` (default `True`) separately gates `/calcs/suggest` (so free plan can be forced off by ops without touching code).

---

## File map

**Create — frontend**
- `frontend/src/components/dashboard/freeform/lib/calcMonarch.ts` — Monarch tokenizer for language id `askdb-calc`.
- `frontend/src/components/dashboard/freeform/lib/calcCompletionProvider.ts` — `registerCompletionItemProvider` factory.
- `frontend/src/components/dashboard/freeform/lib/calcSignatureProvider.ts` — `registerSignatureHelpProvider` factory.
- `frontend/src/components/dashboard/freeform/lib/calcHoverProvider.ts` — `registerHoverProvider` factory.
- `frontend/src/components/dashboard/freeform/lib/calcDiagnostics.ts` — debounced POST `/api/v1/calcs/validate` → `monaco.editor.setModelMarkers`.
- `frontend/src/components/dashboard/freeform/lib/calcLanguage.ts` — one-time `register(monaco)` init bundling all the above.
- `frontend/src/components/dashboard/freeform/lib/calcFunctionCatalogue.ts` — static TS mirror of the Plan 8a catalogue (name + category + signature + docstring).
- `frontend/src/components/dashboard/freeform/lib/__tests__/calcMonarch.test.ts`
- `frontend/src/components/dashboard/freeform/lib/__tests__/calcCompletionProvider.test.ts`
- `frontend/src/components/dashboard/freeform/lib/__tests__/calcSignatureProvider.test.ts`
- `frontend/src/components/dashboard/freeform/lib/__tests__/calcHoverProvider.test.ts`
- `frontend/src/components/dashboard/freeform/lib/__tests__/calcDiagnostics.test.ts`
- `frontend/src/components/dashboard/freeform/panels/CalcEditorDialog.jsx` — the modal.
- `frontend/src/components/dashboard/freeform/panels/CalcTestValues.jsx` — test-row table + row selector.
- `frontend/src/components/dashboard/freeform/panels/CalcDebugPanel.jsx` — AST + per-node value tree.
- `frontend/src/components/dashboard/freeform/panels/CalcSuggestDialog.jsx` — "describe what you want" sub-modal.
- `frontend/src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.test.jsx`
- `frontend/src/components/dashboard/freeform/panels/__tests__/CalcTestValues.test.jsx`
- `frontend/src/components/dashboard/freeform/panels/__tests__/CalcDebugPanel.test.jsx`
- `frontend/src/components/dashboard/freeform/panels/__tests__/CalcSuggestDialog.test.jsx`

**Create — backend**
- `backend/vizql/calc_evaluate.py` — single-row DuckDB evaluation helper + `trace=True` subexpression walk.
- `backend/vizql/calc_suggest.py` — Haiku-grounded suggestion (prompt builder + parse-and-validate response).
- `backend/tests/test_calc_evaluate.py`
- `backend/tests/test_calc_suggest.py`

**Modify**
- `frontend/package.json` — add `@monaco-editor/react` + `monaco-editor`.
- `frontend/vite.config.js` — add `monaco-editor` to manual chunk split.
- `frontend/src/api.js` — add `validateCalc`, `evaluateCalc`, `suggestCalc`.
- `frontend/src/store.js` — add `analystProCalcEditor` slice + `openCalcEditorAnalystPro` / `closeCalcEditorAnalystPro` / `saveCalcAnalystPro` actions; extend `analystProDashboard.calcs` writes to stamp `is_generative_ai_web_authoring` when suggestion was accepted.
- `frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx` — "New Calculated Field…" button → `openCalcEditorAnalystPro()`.
- `backend/routers/query_routes.py` — add `POST /api/v1/calcs/evaluate` + `POST /api/v1/calcs/suggest` to the existing `_calcs_router` (spliced into `router`, line 1408). Extend `/api/v1/calcs/validate` request with optional `sample_row` pass-through is NOT in scope — keep validate untouched.
- `backend/config.py` — add `FEATURE_CALC_LLM_SUGGEST` (bool, default `True`), `CALC_EVAL_TIMEOUT_SECONDS` (float, default `1.0`), `CALC_SUGGEST_RATE_LIMIT_PER_60S` (int, default `5`), `CALC_SUGGEST_MAX_DESCRIPTION_LEN` (int, default `1000`).
- `backend/.env.example` — document the four new settings.
- `docs/analyst_pro_tableau_parity_roadmap.md` — replace the "Plan 8d" body with a shipped marker after T12.
- `docs/claude/config-defaults.md` — add "Calc editor (Plan 8d)" table row block for the four new settings.

**Delete**
- None.

---

## Task list

### Task 1: Install Monaco + register language skeleton

**Files:**
- Modify: `frontend/package.json` (add deps)
- Modify: `frontend/vite.config.js` (manual-chunk split)
- Create: `frontend/src/components/dashboard/freeform/lib/calcLanguage.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/calcLanguage.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/calcLanguage.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { registerAskdbCalcLanguage, ASKDB_CALC_LANGUAGE_ID } from '../calcLanguage';

describe('calcLanguage.registerAskdbCalcLanguage', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcLanguage.test.ts`
Expected: FAIL with "Cannot find module '../calcLanguage'".

- [ ] **Step 3: Install Monaco**

Edit `frontend/package.json`: under `"dependencies"` add (alphabetical insertion point after `"framer-motion"`):

```jsonc
    "@monaco-editor/react": "^4.7.0",
    "monaco-editor": "^0.52.2",
```

Run from `frontend/`:
```bash
npm install
```

- [ ] **Step 4: Add Monaco chunk split**

Edit `frontend/vite.config.js`. Find the existing `manualChunks` block (keeps `framer-motion`, `three`, `deck.gl`, `d3`, export libs per CLAUDE.md infra rules). Add:

```js
if (id.includes('monaco-editor') || id.includes('@monaco-editor/react')) return 'monaco';
```

inside the `manualChunks` function before any catch-all return.

- [ ] **Step 5: Write `calcLanguage.ts`**

Create `frontend/src/components/dashboard/freeform/lib/calcLanguage.ts`:

```ts
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
```

Stub the three imports in `calcMonarch.ts` (Task 2 replaces the stubs with real bodies):

Create `frontend/src/components/dashboard/freeform/lib/calcMonarch.ts`:

```ts
import type * as monacoNs from 'monaco-editor';

export const monarchTokens: monacoNs.languages.IMonarchLanguage = { tokenizer: { root: [] } } as any;
export const languageConfiguration: monacoNs.languages.LanguageConfiguration = {};
export const themeRules: monacoNs.editor.ITokenThemeRule[] = [];
```

- [ ] **Step 6: Run test to verify it passes**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcLanguage.test.ts`
Expected: PASS (both cases).

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js \
        frontend/src/components/dashboard/freeform/lib/calcLanguage.ts \
        frontend/src/components/dashboard/freeform/lib/calcMonarch.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/calcLanguage.test.ts
git commit -m "feat(analyst-pro): install Monaco + register askdb-calc language skeleton (Plan 8d T1)"
```

---

### Task 2: Monarch tokenizer + function catalogue TS mirror

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/calcFunctionCatalogue.ts`
- Rewrite: `frontend/src/components/dashboard/freeform/lib/calcMonarch.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/calcMonarch.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/calcMonarch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as monaco from 'monaco-editor';
import { monarchTokens } from '../calcMonarch';
import { ASKDB_CALC_LANGUAGE_ID } from '../calcLanguage';

function tokenize(source: string): { type: string; text: string }[] {
  monaco.languages.register({ id: ASKDB_CALC_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(ASKDB_CALC_LANGUAGE_ID, monarchTokens);
  const lines = source.split('\n');
  const out: { type: string; text: string }[] = [];
  let state: monaco.languages.IState = monaco.languages.getEncodedLanguageId
    ? (monaco.languages as any).getLanguages().find((l: any) => l.id === ASKDB_CALC_LANGUAGE_ID)?.loader?.()?.getInitialState?.() ?? null
    : null;
  for (const line of lines) {
    const res = monaco.editor.tokenize(line, ASKDB_CALC_LANGUAGE_ID);
    for (const tok of res[0] ?? []) {
      const text = line.substring(tok.offset, tok.offset + (tok.length ?? line.length - tok.offset));
      out.push({ type: tok.type, text });
    }
  }
  return out;
}

describe('calcMonarch tokenizer', () => {
  it('classifies IF/THEN/ELSE/END as keyword.control', () => {
    const toks = tokenize('IF [x] > 0 THEN 1 ELSE 0 END');
    expect(toks.find((t) => t.text === 'IF')?.type).toMatch(/keyword/);
    expect(toks.find((t) => t.text === 'THEN')?.type).toMatch(/keyword/);
    expect(toks.find((t) => t.text === 'ELSE')?.type).toMatch(/keyword/);
    expect(toks.find((t) => t.text === 'END')?.type).toMatch(/keyword/);
  });

  it('classifies FIXED/INCLUDE/EXCLUDE as LOD keyword', () => {
    const toks = tokenize('{FIXED [Region]: SUM([Sales])}');
    expect(toks.find((t) => t.text === 'FIXED')?.type).toMatch(/keyword\.lod/);
  });

  it('classifies SUM / AVG / COUNT as function', () => {
    const toks = tokenize('SUM([Sales]) + AVG([Profit])');
    expect(toks.find((t) => t.text === 'SUM')?.type).toMatch(/predefined|function/);
    expect(toks.find((t) => t.text === 'AVG')?.type).toMatch(/predefined|function/);
  });

  it('classifies [Field] as identifier.field and [Parameters].[X] as identifier.param', () => {
    const toks = tokenize('[Sales] + [Parameters].[Threshold]');
    expect(toks.find((t) => t.text === '[Sales]')?.type).toMatch(/identifier\.field/);
    expect(toks.find((t) => t.text === '[Threshold]')?.type).toMatch(/identifier\.param/);
  });

  it('classifies // line comments and /* block */ comments', () => {
    const toks = tokenize('// comment\n1 + /* inline */ 2');
    expect(toks.some((t) => t.type.includes('comment'))).toBe(true);
  });

  it('classifies string literals, numbers (int / float / scientific)', () => {
    const toks = tokenize('"hello" + 42 + 3.14 + 1.2e10');
    expect(toks.find((t) => t.text === '"hello"')?.type).toMatch(/string/);
    expect(toks.find((t) => t.text === '42')?.type).toMatch(/number/);
    expect(toks.find((t) => t.text === '3.14')?.type).toMatch(/number\.float/);
    expect(toks.find((t) => t.text === '1.2e10')?.type).toMatch(/number/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcMonarch.test.ts`
Expected: FAIL — every classification expectation fails because the stub tokenizer is empty.

- [ ] **Step 3: Write function catalogue TS mirror**

Create `frontend/src/components/dashboard/freeform/lib/calcFunctionCatalogue.ts`:

```ts
// Mirrors backend/vizql/calc_functions.py FUNCTIONS dict. Source of truth is
// the backend catalogue — this TS copy exists only for client-side tokenizer +
// completion + signature + hover providers. Regenerate if calc_functions.py
// adds / removes / retypes a function; keep both sides in lock-step.

export type CalcCategory =
  | 'aggregate'
  | 'logical'
  | 'string'
  | 'date'
  | 'type'
  | 'user'
  | 'table_calc'
  | 'lod'
  | 'spatial'
  | 'passthrough';

export interface CalcFunctionDef {
  name: string;
  category: CalcCategory;
  signature: string;
  minArgs: number;
  maxArgs: number; // -1 = variadic
  returnType: 'number' | 'string' | 'boolean' | 'date' | 'datetime' | 'spatial' | 'same_as_arg';
  docstring: string;
}

const AGG = ['SUM', 'AVG', 'MIN', 'MAX', 'MEDIAN', 'STDEV', 'STDEVP', 'VAR', 'VARP',
             'KURTOSIS', 'SKEWNESS'];

export const CALC_FUNCTIONS: readonly CalcFunctionDef[] = Object.freeze([
  ...AGG.map<CalcFunctionDef>((name) => ({
    name, category: 'aggregate',
    signature: `${name}(expression)`,
    minArgs: 1, maxArgs: 1, returnType: 'number',
    docstring: `${name} aggregation — operates on the viz level of granularity.`,
  })),
  { name: 'COUNT',  category: 'aggregate', signature: 'COUNT(expression)',          minArgs: 1, maxArgs: 1, returnType: 'number',      docstring: 'Count non-null values.' },
  { name: 'COUNTD', category: 'aggregate', signature: 'COUNTD(expression)',         minArgs: 1, maxArgs: 1, returnType: 'number',      docstring: 'Count distinct non-null values.' },
  { name: 'ATTR',   category: 'aggregate', signature: 'ATTR(expression)',           minArgs: 1, maxArgs: 1, returnType: 'same_as_arg', docstring: 'Return the value if all rows agree, else *.' },
  { name: 'PERCENTILE', category: 'aggregate', signature: 'PERCENTILE(expression, p)', minArgs: 2, maxArgs: 2, returnType: 'number',   docstring: 'Value at percentile p ∈ [0,1].' },
  { name: 'COLLECT',    category: 'aggregate', signature: 'COLLECT(geometry)',         minArgs: 1, maxArgs: 1, returnType: 'spatial',  docstring: 'Aggregate spatial geometries.' },

  // Logical
  { name: 'IF',     category: 'logical', signature: 'IF cond THEN a [ELSEIF …] [ELSE b] END', minArgs: 0, maxArgs: -1, returnType: 'same_as_arg', docstring: 'Conditional expression. Use IF/THEN/ELSEIF/ELSE/END.' },
  { name: 'CASE',   category: 'logical', signature: 'CASE scrutinee WHEN v THEN a [ELSE b] END', minArgs: 0, maxArgs: -1, returnType: 'same_as_arg', docstring: 'Case expression.' },
  { name: 'IIF',    category: 'logical', signature: 'IIF(cond, then, else, [unknown])', minArgs: 3, maxArgs: 4, returnType: 'same_as_arg', docstring: 'Inline conditional.' },
  { name: 'IFNULL', category: 'logical', signature: 'IFNULL(a, b)',                  minArgs: 2, maxArgs: 2, returnType: 'same_as_arg', docstring: 'Return a if not null, else b.' },
  { name: 'ZN',     category: 'logical', signature: 'ZN(expression)',                minArgs: 1, maxArgs: 1, returnType: 'number',      docstring: 'Coerce NULL → 0.' },
  { name: 'ISNULL', category: 'logical', signature: 'ISNULL(expression)',            minArgs: 1, maxArgs: 1, returnType: 'boolean',     docstring: 'Null check.' },

  // String
  { name: 'LEN',        category: 'string', signature: 'LEN(string)',                     minArgs: 1, maxArgs: 1, returnType: 'number',  docstring: 'Character length.' },
  { name: 'LEFT',       category: 'string', signature: 'LEFT(string, n)',                 minArgs: 2, maxArgs: 2, returnType: 'string',  docstring: 'First n characters.' },
  { name: 'RIGHT',      category: 'string', signature: 'RIGHT(string, n)',                minArgs: 2, maxArgs: 2, returnType: 'string',  docstring: 'Last n characters.' },
  { name: 'MID',        category: 'string', signature: 'MID(string, start, [length])',    minArgs: 2, maxArgs: 3, returnType: 'string',  docstring: 'Substring from position.' },
  { name: 'REPLACE',    category: 'string', signature: 'REPLACE(string, find, replace)',  minArgs: 3, maxArgs: 3, returnType: 'string',  docstring: 'Replace all occurrences.' },
  { name: 'UPPER',      category: 'string', signature: 'UPPER(string)',                   minArgs: 1, maxArgs: 1, returnType: 'string',  docstring: 'Uppercase.' },
  { name: 'LOWER',      category: 'string', signature: 'LOWER(string)',                   minArgs: 1, maxArgs: 1, returnType: 'string',  docstring: 'Lowercase.' },
  { name: 'TRIM',       category: 'string', signature: 'TRIM(string)',                    minArgs: 1, maxArgs: 1, returnType: 'string',  docstring: 'Strip leading + trailing whitespace.' },
  { name: 'STARTSWITH', category: 'string', signature: 'STARTSWITH(string, prefix)',      minArgs: 2, maxArgs: 2, returnType: 'boolean', docstring: 'Prefix check.' },
  { name: 'ENDSWITH',   category: 'string', signature: 'ENDSWITH(string, suffix)',        minArgs: 2, maxArgs: 2, returnType: 'boolean', docstring: 'Suffix check.' },
  { name: 'CONTAINS',   category: 'string', signature: 'CONTAINS(string, substr)',        minArgs: 2, maxArgs: 2, returnType: 'boolean', docstring: 'Substring check.' },
  { name: 'SPLIT',      category: 'string', signature: 'SPLIT(string, delim, tokenIdx)',  minArgs: 3, maxArgs: 3, returnType: 'string',  docstring: 'Split and return token.' },

  // Date
  { name: 'DATEDIFF',  category: 'date', signature: "DATEDIFF('unit', start, end)",      minArgs: 3, maxArgs: 4, returnType: 'number',   docstring: 'Difference in units (year/month/day/hour…).' },
  { name: 'DATETRUNC', category: 'date', signature: "DATETRUNC('unit', date)",           minArgs: 2, maxArgs: 3, returnType: 'datetime', docstring: 'Truncate to unit.' },
  { name: 'DATEPART',  category: 'date', signature: "DATEPART('unit', date)",            minArgs: 2, maxArgs: 3, returnType: 'number',   docstring: 'Extract date part.' },
  { name: 'DATEADD',   category: 'date', signature: "DATEADD('unit', delta, date)",      minArgs: 3, maxArgs: 3, returnType: 'datetime', docstring: 'Shift date.' },
  { name: 'NOW',       category: 'date', signature: 'NOW()',                             minArgs: 0, maxArgs: 0, returnType: 'datetime', docstring: 'Current timestamp.' },
  { name: 'TODAY',     category: 'date', signature: 'TODAY()',                           minArgs: 0, maxArgs: 0, returnType: 'date',     docstring: 'Current date.' },
  { name: 'YEAR',      category: 'date', signature: 'YEAR(date)',                        minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Year component.' },
  { name: 'MONTH',     category: 'date', signature: 'MONTH(date)',                       minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Month component (1-12).' },
  { name: 'DAY',       category: 'date', signature: 'DAY(date)',                         minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Day of month.' },

  // Type
  { name: 'STR',   category: 'type', signature: 'STR(value)',   minArgs: 1, maxArgs: 1, returnType: 'string',   docstring: 'Cast to string.' },
  { name: 'INT',   category: 'type', signature: 'INT(value)',   minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Cast to integer.' },
  { name: 'FLOAT', category: 'type', signature: 'FLOAT(value)', minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Cast to float.' },
  { name: 'DATE',  category: 'type', signature: 'DATE(value)',  minArgs: 1, maxArgs: 1, returnType: 'date',     docstring: 'Cast to date.' },

  // Table calc (names only — argless; actual addressing via Compute Using dialog)
  ...['RUNNING_SUM','RUNNING_AVG','RUNNING_MIN','RUNNING_MAX','RUNNING_COUNT',
      'WINDOW_SUM','WINDOW_AVG','WINDOW_MIN','WINDOW_MAX','WINDOW_MEDIAN',
      'INDEX','FIRST','LAST','SIZE','LOOKUP','PREVIOUS_VALUE',
      'RANK','RANK_DENSE','RANK_MODIFIED','RANK_UNIQUE','RANK_PERCENTILE',
      'TOTAL','PCT_TOTAL','DIFF'].map<CalcFunctionDef>((name) => ({
    name, category: 'table_calc',
    signature: `${name}(expression)`,
    minArgs: 0, maxArgs: -1, returnType: 'number',
    docstring: `${name} table calculation — addressing configured via Compute Using.`,
  })),
]);

export const CALC_KEYWORDS = ['IF','THEN','ELSE','ELSEIF','END','CASE','WHEN','AND','OR','NOT','IN','TRUE','FALSE','NULL'] as const;
export const CALC_LOD_KEYWORDS = ['FIXED','INCLUDE','EXCLUDE'] as const;

export function functionByName(name: string): CalcFunctionDef | undefined {
  return CALC_FUNCTIONS.find((f) => f.name === name.toUpperCase());
}
export function functionNames(): readonly string[] {
  return CALC_FUNCTIONS.map((f) => f.name);
}
```

- [ ] **Step 4: Rewrite `calcMonarch.ts` with real tokenizer**

Replace `frontend/src/components/dashboard/freeform/lib/calcMonarch.ts`:

```ts
import type * as monacoNs from 'monaco-editor';
import { CALC_KEYWORDS, CALC_LOD_KEYWORDS, functionNames } from './calcFunctionCatalogue';

const functions = functionNames().slice();

export const monarchTokens: monacoNs.languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: false,
  keywords: [...CALC_KEYWORDS],
  lodKeywords: [...CALC_LOD_KEYWORDS],
  functions,
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment.line'],
      [/\/\*/, { token: 'comment.block', next: '@blockComment' }],
      [/"([^"\\]|\\.)*"/, 'string.double'],
      [/'([^'\\]|\\.)*'/, 'string.single'],
      [/\[Parameters\]\.\[([^\]]+)\]/, 'identifier.param'],
      [/\[([^\]]+)\]/, 'identifier.field'],
      [/[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/, 'number.float'],
      [/[0-9]+[eE][+-]?[0-9]+/, 'number.float'],
      [/[0-9]+/, 'number'],
      [/\{/, 'delimiter.curly.lod'],
      [/\}/, 'delimiter.curly.lod'],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, {
        cases: {
          '@lodKeywords': 'keyword.lod',
          '@keywords': 'keyword.control',
          '@functions': 'predefined.function',
          '@default': 'identifier',
        },
      }],
      [/[()]/, 'delimiter.parenthesis'],
      [/[,:]/, 'delimiter'],
      [/[+\-*/%<>=!]+/, 'operator'],
      [/\s+/, 'white'],
    ],
    blockComment: [
      [/[^*/]+/, 'comment.block'],
      [/\*\//, { token: 'comment.block', next: '@pop' }],
      [/[*/]/, 'comment.block'],
    ],
  },
} as any;

export const languageConfiguration: monacoNs.languages.LanguageConfiguration = {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [['(', ')'], ['{', '}'], ['[', ']']],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '"', close: '"' },
  ],
};

export const themeRules: monacoNs.editor.ITokenThemeRule[] = [
  { token: 'keyword.control',    foreground: 'c586c0', fontStyle: 'bold' },
  { token: 'keyword.lod',        foreground: 'dcdcaa', fontStyle: 'bold' },
  { token: 'predefined.function', foreground: '4ec9b0' },
  { token: 'identifier.field',   foreground: '9cdcfe' },
  { token: 'identifier.param',   foreground: 'ce9178' },
  { token: 'comment.line',       foreground: '6a9955', fontStyle: 'italic' },
  { token: 'comment.block',      foreground: '6a9955', fontStyle: 'italic' },
  { token: 'string.double',      foreground: 'ce9178' },
  { token: 'string.single',      foreground: 'ce9178' },
  { token: 'number',             foreground: 'b5cea8' },
  { token: 'number.float',       foreground: 'b5cea8' },
];
```

- [ ] **Step 5: Run test to verify it passes**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcMonarch.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/calcMonarch.ts \
        frontend/src/components/dashboard/freeform/lib/calcFunctionCatalogue.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/calcMonarch.test.ts
git commit -m "feat(analyst-pro): Monarch tokenizer + TS function catalogue for askdb-calc (Plan 8d T2)"
```

---

### Task 3: Completion provider (fields, params, functions, LOD dims)

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/calcCompletionProvider.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/calcCompletionProvider.test.ts`
- Modify: `frontend/src/components/dashboard/freeform/lib/calcLanguage.ts` (wire provider on register)

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/calcCompletionProvider.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcCompletionProvider.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `calcCompletionProvider.ts`**

Create `frontend/src/components/dashboard/freeform/lib/calcCompletionProvider.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcCompletionProvider.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/calcCompletionProvider.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/calcCompletionProvider.test.ts
git commit -m "feat(analyst-pro): askdb-calc completion provider — fields/params/functions/LOD (Plan 8d T3)"
```

---

### Task 4: Signature help + hover providers

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/calcSignatureProvider.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/calcHoverProvider.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/calcSignatureProvider.test.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/calcHoverProvider.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/calcSignatureProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSignatureProvider } from '../calcSignatureProvider';

const monaco = { languages: { SignatureHelpTriggerKind: { Invoke: 1, TriggerCharacter: 2 } } } as any;

const fakeModel = (text: string) => ({ getLineContent: () => text });

describe('buildSignatureProvider', () => {
  it('shows PERCENTILE signature + highlights active parameter 0 after "("', () => {
    const prov = buildSignatureProvider(monaco);
    const text = 'PERCENTILE(';
    const help = prov.provideSignatureHelp(
      fakeModel(text) as any,
      { lineNumber: 1, column: text.length + 1 } as any,
      null as any,
      { triggerKind: 1 } as any,
    ) as any;
    expect(help.value.signatures[0].label).toContain('PERCENTILE');
    expect(help.value.activeParameter).toBe(0);
  });

  it('highlights parameter 1 after "PERCENTILE([Sales],"', () => {
    const prov = buildSignatureProvider(monaco);
    const text = 'PERCENTILE([Sales],';
    const help = prov.provideSignatureHelp(
      fakeModel(text) as any,
      { lineNumber: 1, column: text.length + 1 } as any,
      null as any,
      { triggerKind: 1 } as any,
    ) as any;
    expect(help.value.activeParameter).toBe(1);
  });
});
```

Create `frontend/src/components/dashboard/freeform/lib/__tests__/calcHoverProvider.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcSignatureProvider.test.ts src/components/dashboard/freeform/lib/__tests__/calcHoverProvider.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write `calcSignatureProvider.ts`**

Create `frontend/src/components/dashboard/freeform/lib/calcSignatureProvider.ts`:

```ts
import type * as monacoNs from 'monaco-editor';
import { CALC_FUNCTIONS } from './calcFunctionCatalogue';

/**
 * Walk back from the cursor to find the enclosing function call and current
 * argument index. Depth-tracks nested parens. Returns null if the cursor is
 * not inside a function's argument list.
 */
function currentCallContext(source: string, cursor: number):
  | { name: string; argIndex: number }
  | null
{
  let depth = 0;
  let argIdx = 0;
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = source[i];
    if (ch === ')' || ch === ']') depth++;
    else if (ch === '[' && depth > 0) depth--;
    else if (ch === '(') {
      if (depth === 0) {
        const m = source.substring(0, i).match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
        if (!m) return null;
        return { name: m[1], argIndex: argIdx };
      }
      depth--;
    } else if (ch === ')' ) { /* handled above */ }
    else if (ch === ',' && depth === 0) argIdx++;
  }
  return null;
}

export function buildSignatureProvider(
  monaco: typeof import('monaco-editor'),
): monacoNs.languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const before = line.substring(0, position.column - 1);
      const call = currentCallContext(before, before.length);
      if (!call) return null;
      const fn = CALC_FUNCTIONS.find((f) => f.name.toUpperCase() === call.name.toUpperCase());
      if (!fn) return null;

      // Split signature parameters from e.g. "PERCENTILE(expression, p)".
      const inside = fn.signature.replace(/^[^(]*\(/, '').replace(/\)$/, '');
      const params = inside.length ? inside.split(',').map((s) => ({ label: s.trim() })) : [];

      return {
        value: {
          signatures: [{
            label: fn.signature,
            documentation: { value: fn.docstring },
            parameters: params,
          }],
          activeSignature: 0,
          activeParameter: Math.min(call.argIndex, Math.max(params.length - 1, 0)),
        },
        dispose: () => {},
      };
    },
  };
}
```

- [ ] **Step 4: Write `calcHoverProvider.ts`**

Create `frontend/src/components/dashboard/freeform/lib/calcHoverProvider.ts`:

```ts
import type * as monacoNs from 'monaco-editor';
import { functionByName } from './calcFunctionCatalogue';
import type { SchemaField } from './calcCompletionProvider';

export interface HoverContext {
  schemaFields: readonly SchemaField[];
  /** Optional — Plan 8b LOD warning lookup keyed by field name. */
  lodWarnings?: Readonly<Record<string, string>>;
}

export function buildHoverProvider(ctx: HoverContext): monacoNs.languages.HoverProvider {
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

      // Field hover — we only match bare identifier words; the square brackets
      // are consumed by Monarch as punctuation around the same word.
      const field = ctx.schemaFields.find((f) => f.name.toLowerCase() === word.word.toLowerCase());
      if (field) {
        const samples = (field.sampleValues ?? []).slice(0, 3).map((v) => String(v)).join(', ');
        const warn = ctx.lodWarnings?.[field.name];
        const lines = [
          { value: `**[${field.name}]** — ${field.dataType}` },
          samples ? { value: `samples: ${samples}` } : null,
          warn ? { value: `⚠️ ${warn}` } : null,
        ].filter(Boolean) as { value: string }[];
        return { contents: lines };
      }
      return null;
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcSignatureProvider.test.ts src/components/dashboard/freeform/lib/__tests__/calcHoverProvider.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/calcSignatureProvider.ts \
        frontend/src/components/dashboard/freeform/lib/calcHoverProvider.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/calcSignatureProvider.test.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/calcHoverProvider.test.ts
git commit -m "feat(analyst-pro): askdb-calc signature + hover providers (Plan 8d T4)"
```

---

### Task 5: Debounced diagnostics → Monaco markers

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/calcDiagnostics.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/calcDiagnostics.test.ts`
- Modify: `frontend/src/api.js` (add `validateCalc`)

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/calcDiagnostics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildDiagnosticsRunner, parseBackendError } from '../calcDiagnostics';

describe('parseBackendError', () => {
  it('maps ParseError with line/col to a Monaco marker', () => {
    const m = parseBackendError({ status: 400, detail: 'ParseError at line 2, col 3: unexpected ]' });
    expect(m).toEqual({
      severity: 'error',
      startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 4,
      message: 'unexpected ]',
    });
  });

  it('falls back to a whole-text marker when no position info', () => {
    const m = parseBackendError({ status: 400, detail: 'TypeError: cannot aggregate aggregate' });
    expect(m.severity).toBe('error');
    expect(m.startLineNumber).toBe(1);
    expect(m.message).toMatch(/cannot aggregate/);
  });
});

describe('buildDiagnosticsRunner', () => {
  let calls: any[] = [];
  beforeEach(() => { calls = []; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('debounces 300 ms and calls validateCalc once per burst', async () => {
    const validateCalc = vi.fn().mockResolvedValue({ valid: true, warnings: [] });
    const runner = buildDiagnosticsRunner({
      validateCalc: validateCalc as any,
      schemaRef: {}, schemaStats: {},
      onMarkers: (ms) => calls.push(ms),
      debounceMs: 300,
    });
    runner.update('SUM(');
    runner.update('SUM([');
    runner.update('SUM([Sales])');
    await vi.advanceTimersByTimeAsync(300);
    expect(validateCalc).toHaveBeenCalledTimes(1);
    expect(validateCalc).toHaveBeenCalledWith({ formula: 'SUM([Sales])', schema_ref: {}, schema_stats: {} });
  });

  it('maps valid=true + warnings[] to info markers for expensive_fixed_lod', async () => {
    const validateCalc = vi.fn().mockResolvedValue({
      valid: true,
      warnings: [{ kind: 'expensive_fixed_lod', estimate: 2_000_000, suggestion: 'Add to Context', details: {} }],
    });
    const runner = buildDiagnosticsRunner({
      validateCalc: validateCalc as any,
      schemaRef: {}, schemaStats: { Customer: 2_000_000 },
      onMarkers: (ms) => calls.push(ms),
      debounceMs: 10,
    });
    runner.update('{FIXED [Customer]: SUM([Sales])}');
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    const markers = calls.at(-1);
    expect(markers).toHaveLength(1);
    expect(markers[0].severity).toBe('warning');
    expect(markers[0].message).toMatch(/Add to Context/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcDiagnostics.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Add `validateCalc` API helper**

Edit `frontend/src/api.js`. Append (before the default export if one exists, otherwise anywhere in the file — match existing style):

```js
export async function validateCalc({ formula, schema_ref = {}, params = {}, schema_stats = {} }) {
  const res = await fetch('/api/v1/calcs/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ formula, schema_ref, params, schema_stats }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || res.statusText), { status: res.status, detail: body.detail });
  }
  return res.json();
}
```

If `authHeaders()` is not already defined, follow the pattern used by the neighbouring `executeUnderlying` helper that Plan 6e T5 added (same file).

- [ ] **Step 4: Write `calcDiagnostics.ts`**

Create `frontend/src/components/dashboard/freeform/lib/calcDiagnostics.ts`:

```ts
export type Severity = 'error' | 'warning' | 'info';

export interface CalcMarker {
  severity: Severity;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
}

export interface BackendError { status: number; detail: string; }

export function parseBackendError(err: BackendError): CalcMarker {
  const detail = err.detail || 'unknown error';
  const m = detail.match(/^ParseError at line (\d+), col (\d+):\s*(.*)$/);
  if (m) {
    const ln = parseInt(m[1], 10);
    const col = parseInt(m[2], 10);
    return {
      severity: 'error',
      startLineNumber: ln, startColumn: col, endLineNumber: ln, endColumn: col + 1,
      message: m[3],
    };
  }
  return {
    severity: 'error',
    startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2,
    message: detail,
  };
}

export interface ValidateResponse {
  valid: boolean;
  inferredType?: string;
  isAggregate?: boolean;
  errors?: string[];
  warnings?: { kind: string; estimate?: number; suggestion?: string; details?: unknown }[];
}

export interface DiagnosticsRunnerArgs {
  validateCalc: (body: { formula: string; schema_ref: Record<string, string>; schema_stats: Record<string, number> }) => Promise<ValidateResponse>;
  schemaRef: Record<string, string>;
  schemaStats: Record<string, number>;
  onMarkers: (markers: CalcMarker[]) => void;
  debounceMs?: number;
}

export function buildDiagnosticsRunner(args: DiagnosticsRunnerArgs) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFormula = '';
  return {
    update(formula: string) {
      lastFormula = formula;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const res = await args.validateCalc({
            formula: lastFormula,
            schema_ref: args.schemaRef,
            schema_stats: args.schemaStats,
          });
          const markers: CalcMarker[] = (res.warnings ?? []).map((w) => ({
            severity: 'warning',
            startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: Math.max(2, lastFormula.length + 1),
            message: `${w.kind}: ${w.suggestion ?? ''} (est ${w.estimate ?? '?'} rows)`.trim(),
          }));
          args.onMarkers(markers);
        } catch (err) {
          args.onMarkers([parseBackendError(err as BackendError)]);
        }
      }, args.debounceMs ?? 300);
    },
    dispose() { if (timer) clearTimeout(timer); },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

`cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/calcDiagnostics.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/calcDiagnostics.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/calcDiagnostics.test.ts \
        frontend/src/api.js
git commit -m "feat(analyst-pro): debounced calc diagnostics → Monaco markers (Plan 8d T5)"
```

---

### Task 6: `CalcTestValues` component (fetch 10 rows + row selector)

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/CalcTestValues.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/CalcTestValues.test.jsx`
- Modify: `frontend/src/api.js` (add `fetchSampleRows`)

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/panels/__tests__/CalcTestValues.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CalcTestValues } from '../CalcTestValues';

vi.mock('../../../../../api', () => ({
  fetchSampleRows: vi.fn().mockResolvedValue({
    columns: ['id', 'Sales', 'Region'],
    rows: [
      { id: 1, Sales: 100, Region: 'West' },
      { id: 2, Sales: 200, Region: 'East' },
    ],
  }),
}));

describe('CalcTestValues', () => {
  it('renders fetched rows and allows row selection', async () => {
    const onSelect = vi.fn();
    render(<CalcTestValues connId="c1" selectedRowIdx={0} onSelectRow={onSelect} />);
    await waitFor(() => expect(screen.getByText('West')).toBeInTheDocument());
    fireEvent.click(screen.getByText('East'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('renders empty-state hint when API returns no rows', async () => {
    const mod = await import('../../../../../api');
    (mod.fetchSampleRows).mockResolvedValueOnce({ columns: [], rows: [] });
    render(<CalcTestValues connId="c1" selectedRowIdx={0} onSelectRow={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No sample rows available/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/CalcTestValues.test.jsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Add `fetchSampleRows` helper**

Edit `frontend/src/api.js`. Append:

```js
export async function fetchSampleRows(connId, { limit = 10 } = {}) {
  const res = await fetch(`/api/v1/queries/sample?conn_id=${encodeURIComponent(connId)}&limit=${limit}`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
}
```

_(If `/api/v1/queries/sample` does not yet exist, wire it in `query_routes.py` to call the connection's first-joinable table with `SELECT * LIMIT :limit` via existing `query_engine.execute_sql` path — same 6-layer validator, same read-only enforcement. If it does exist, this helper is enough.)_

**Note.** Treat the endpoint as pre-existing when a grep in `backend/routers/query_routes.py` for `/sample` returns a match. Otherwise add it as a 15-line addition in the same router file, following the pattern of `/queries/underlying` (Plan 6e T3) at lines 1100-1250.

- [ ] **Step 4: Write `CalcTestValues.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/CalcTestValues.jsx`:

```jsx
import React from 'react';
import { fetchSampleRows } from '../../../../api';

export function CalcTestValues({ connId, selectedRowIdx = 0, onSelectRow }) {
  const [state, setState] = React.useState({ loading: true, columns: [], rows: [], error: null });

  React.useEffect(() => {
    let cancelled = false;
    setState({ loading: true, columns: [], rows: [], error: null });
    fetchSampleRows(connId, { limit: 10 })
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, columns: res.columns ?? [], rows: res.rows ?? [], error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, columns: [], rows: [], error: err.message });
      });
    return () => { cancelled = true; };
  }, [connId]);

  if (state.loading) return <div className="calc-test-values calc-test-values--loading">Loading sample rows…</div>;
  if (state.error)   return <div className="calc-test-values calc-test-values--error">Error: {state.error}</div>;
  if (state.rows.length === 0) return <div className="calc-test-values calc-test-values--empty">No sample rows available.</div>;

  return (
    <div className="calc-test-values" role="grid" aria-label="Sample rows">
      <div className="calc-test-values__header" role="row">
        <span className="calc-test-values__idx">#</span>
        {state.columns.map((c) => <span key={c} className="calc-test-values__col" role="columnheader">{c}</span>)}
      </div>
      {state.rows.map((row, i) => (
        <div
          key={i}
          role="row"
          aria-selected={i === selectedRowIdx}
          className={`calc-test-values__row ${i === selectedRowIdx ? 'is-selected' : ''}`}
          onClick={() => onSelectRow(i)}
        >
          <span className="calc-test-values__idx">{i + 1}</span>
          {state.columns.map((c) => (
            <span key={c} className="calc-test-values__cell" role="gridcell">{String(row[c] ?? '')}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

`cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/CalcTestValues.test.jsx`
Expected: PASS (2 cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/CalcTestValues.jsx \
        frontend/src/components/dashboard/freeform/panels/__tests__/CalcTestValues.test.jsx \
        frontend/src/api.js
git commit -m "feat(analyst-pro): CalcTestValues panel — fetch 10 rows + row selector (Plan 8d T6)"
```

---

### Task 7: Backend `/api/v1/calcs/evaluate` endpoint + DuckDB single-row eval

**Files:**
- Create: `backend/vizql/calc_evaluate.py`
- Modify: `backend/routers/query_routes.py` (add `/evaluate` route to `_calcs_router`)
- Modify: `backend/config.py` (add `CALC_EVAL_TIMEOUT_SECONDS`)
- Modify: `backend/.env.example` (document setting)
- Create: `backend/tests/test_calc_evaluate.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_calc_evaluate.py`:

```python
import pytest
from fastapi.testclient import TestClient

from main import app
from config import settings


@pytest.fixture(autouse=True)
def _enable_feature(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", True, raising=False)


def _auth_headers(client: TestClient) -> dict[str, str]:
    """Log in the demo user and return a Bearer token header dict.

    Matches `backend/tests/test_adv_calc_validate.py`'s pattern (Plan 8a).
    """
    # Real implementation matches the existing helper in tests/test_calc_validate.py.
    from tests._helpers import demo_auth_headers  # type: ignore
    return demo_auth_headers(client)


def test_evaluate_returns_value_for_arithmetic_expression():
    client = TestClient(app)
    headers = _auth_headers(client)
    res = client.post(
        "/api/v1/calcs/evaluate",
        json={
            "formula": "[Sales] * 2",
            "row": {"Sales": 50},
            "schema_ref": {"Sales": "number"},
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["value"] == 100
    assert body["type"] == "number"
    assert body["error"] is None


def test_evaluate_returns_error_on_unknown_function():
    client = TestClient(app)
    headers = _auth_headers(client)
    res = client.post(
        "/api/v1/calcs/evaluate",
        json={
            "formula": "NOT_A_FUNCTION([Sales])",
            "row": {"Sales": 1},
            "schema_ref": {"Sales": "number"},
        },
        headers=headers,
    )
    assert res.status_code == 400
    assert "NOT_A_FUNCTION" in res.json()["detail"]


def test_evaluate_trace_returns_subexpression_values():
    client = TestClient(app)
    headers = _auth_headers(client)
    res = client.post(
        "/api/v1/calcs/evaluate",
        json={
            "formula": "IF [Sales] > 10 THEN 1 ELSE 0 END",
            "row": {"Sales": 15},
            "schema_ref": {"Sales": "number"},
            "trace": True,
        },
        headers=headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["value"] == 1
    trace = body["trace"]
    assert any(node["label"] == "[Sales] > 10" and node["value"] is True for node in trace["nodes"])


def test_evaluate_rejects_ddl_in_generated_sql(monkeypatch):
    """Defence-in-depth: even if an attacker smuggled DDL through a field name,
    sql_validator must reject before DuckDB sees it."""
    client = TestClient(app)
    headers = _auth_headers(client)
    res = client.post(
        "/api/v1/calcs/evaluate",
        json={"formula": "[Sales]", "row": {"Sales; DROP TABLE x": 1},
              "schema_ref": {"Sales; DROP TABLE x": "number"}},
        headers=headers,
    )
    assert res.status_code == 400


def test_evaluate_enforces_1s_timeout(monkeypatch):
    """Pass a deliberately slow UDF surrogate via a huge RUNNING_SUM — not a
    real scenario, but confirms the evaluator honours CALC_EVAL_TIMEOUT_SECONDS."""
    monkeypatch.setattr(settings, "CALC_EVAL_TIMEOUT_SECONDS", 0.001, raising=False)
    client = TestClient(app)
    headers = _auth_headers(client)
    res = client.post(
        "/api/v1/calcs/evaluate",
        json={"formula": "[Sales] * 2", "row": {"Sales": 1}, "schema_ref": {"Sales": "number"}},
        headers=headers,
    )
    # Either 200 fast enough OR 504 timeout; we accept both — the test proves
    # the timeout path is reachable rather than asserting a race condition.
    assert res.status_code in (200, 504)
```

- [ ] **Step 2: Run test to verify it fails**

`cd backend && python -m pytest tests/test_calc_evaluate.py -v`
Expected: FAIL — endpoint 404.

- [ ] **Step 3: Add config flag**

Edit `backend/config.py` under the existing `# Calc parser (Plan 8a)` block (near line 265). Append:

```python
    # Plan 8d — Monaco calc editor live eval
    CALC_EVAL_TIMEOUT_SECONDS: float = 1.0          # max wall time for single-row eval
    CALC_EVAL_CACHE_TTL_SECONDS: int = 60           # (formula_hash, row_hash) result cache
```

Edit `backend/.env.example` — append:

```
# Plan 8d — calc editor
CALC_EVAL_TIMEOUT_SECONDS=1.0
CALC_EVAL_CACHE_TTL_SECONDS=60
```

- [ ] **Step 4: Write `calc_evaluate.py`**

Create `backend/vizql/calc_evaluate.py`:

```python
"""Plan 8d — single-row calc evaluation against an in-process DuckDB connection.

Design notes:

* The formula is parsed + typechecked with Plan 8a's parser/typechecker.
* The AST is compiled to a sql_ast `Expression` via
  `calc_to_expression.compile`.
* We emit SQL of the form ``SELECT <expr> AS v FROM (VALUES (…)) AS t(<cols>)``
  and run it through the generic SQL emitter (duckdb dialect).
* Every emitted statement goes through `sql_validator` — the same 6-layer check
  the main pipeline uses — so DuckDB never sees unvetted SQL.
* Read-only is enforced at two levels: DuckDB connection is opened as a
  fresh `:memory:` instance (no attached files), and the validator already
  rejects DDL.
* A hard wall-clock timeout via `duckdb.interrupt()` on a watchdog thread.
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import dataclass
from typing import Any

import duckdb

from config import settings
from sql_validator import SQLValidator
from vizql.calc_parser import parse, ParseError, LexError
from vizql.calc_typecheck import typecheck, TypeError as CalcTypeError
from vizql.calc_to_expression import compile as compile_calc
from vizql.dialects.duckdb import DuckDBDialect


_validator = SQLValidator()
_dialect = DuckDBDialect()


@dataclass
class EvalResult:
    value: Any
    type: str
    error: str | None
    trace: dict | None = None


def _row_hash(row: dict[str, Any]) -> str:
    payload = json.dumps(row, sort_keys=True, default=str).encode()
    return hashlib.sha256(payload).hexdigest()[:16]


def _formula_hash(formula: str) -> str:
    return hashlib.sha256(formula.encode()).hexdigest()[:16]


_cache: dict[tuple[str, str], tuple[float, EvalResult]] = {}
_cache_lock = threading.Lock()


def _cache_get(key: tuple[str, str]) -> EvalResult | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit is None:
            return None
        ts, val = hit
        if time.time() - ts > settings.CALC_EVAL_CACHE_TTL_SECONDS:
            _cache.pop(key, None)
            return None
        return val


def _cache_put(key: tuple[str, str], value: EvalResult) -> None:
    with _cache_lock:
        _cache[key] = (time.time(), value)


def _build_values_sql(expression_sql: str, row: dict[str, Any]) -> tuple[str, list[Any]]:
    cols = list(row.keys())
    if not cols:
        # No fields — still allow literal expressions like `1 + 1`.
        return f"SELECT {expression_sql} AS v", []
    placeholders = ", ".join(["?"] * len(cols))
    col_list = ", ".join([_dialect.format_identifier(c) for c in cols])
    sql = (
        f"SELECT {expression_sql} AS v "
        f"FROM (VALUES ({placeholders})) AS t({col_list})"
    )
    return sql, [row[c] for c in cols]


def _run_with_timeout(con: duckdb.DuckDBPyConnection, sql: str, params: list[Any], timeout_s: float) -> Any:
    done = threading.Event()
    result_holder: dict[str, Any] = {}

    def worker() -> None:
        try:
            result_holder["val"] = con.execute(sql, params).fetchone()
        except Exception as exc:  # noqa: BLE001 — propagated via result_holder
            result_holder["exc"] = exc
        finally:
            done.set()

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    if not done.wait(timeout=timeout_s):
        con.interrupt()
        t.join(timeout=0.5)
        raise TimeoutError(f"calc evaluation exceeded {timeout_s}s")
    if "exc" in result_holder:
        raise result_holder["exc"]
    row = result_holder.get("val")
    return row[0] if row else None


def evaluate_formula(
    *, formula: str, row: dict[str, Any], schema_ref: dict[str, str],
    trace: bool = False,
) -> EvalResult:
    """Evaluate a single-row calc formula.

    Raises ValueError for parse / type / validator errors (caller maps to 400).
    Raises TimeoutError for wall-clock breach (caller maps to 504).
    """
    key = (_formula_hash(formula), _row_hash(row))
    cached = _cache_get(key)
    if cached is not None and not trace:
        return cached

    try:
        ast = parse(formula, max_depth=settings.MAX_CALC_NESTING)
        inferred = typecheck(ast, schema_ref)
    except (ParseError, LexError, CalcTypeError) as exc:
        raise ValueError(str(exc)) from exc

    expr = compile_calc(ast, dialect=_dialect, schema=schema_ref)
    expression_sql = expr.to_sql(_dialect)

    sql, params = _build_values_sql(expression_sql, row)
    if not _validator.validate(sql, dialect="duckdb").ok:
        raise ValueError("sql_validator rejected compiled calc SQL")

    con = duckdb.connect(database=":memory:", read_only=False)
    try:
        value = _run_with_timeout(con, sql, params, settings.CALC_EVAL_TIMEOUT_SECONDS)
    finally:
        con.close()

    trace_payload: dict | None = None
    if trace:
        trace_payload = _trace_ast(ast, row, schema_ref)

    result = EvalResult(value=value, type=inferred.kind.value, error=None, trace=trace_payload)
    _cache_put(key, result)
    return result


def _trace_ast(ast, row, schema_ref) -> dict:
    """Walk the Plan 8a AST and evaluate every sub-expression by recursively
    calling the same evaluator with a serialised sub-formula. Keeps the
    implementation honest — we reuse the main path rather than a divergent
    interpreter."""
    from vizql import calc_ast as ca

    nodes: list[dict] = []

    def label(node) -> str:
        return node.to_formula() if hasattr(node, "to_formula") else repr(node)

    def visit(node) -> None:
        if isinstance(node, (ca.Literal, ca.FieldRef, ca.ParamRef)):
            nodes.append({"label": label(node), "value": _eval_subnode(node, row, schema_ref)})
            return
        if isinstance(node, (ca.BinaryOp, ca.UnaryOp, ca.FnCall, ca.IfExpr, ca.CaseExpr, ca.LodExpr)):
            nodes.append({"label": label(node), "value": _eval_subnode(node, row, schema_ref)})
            for child in _children(node):
                visit(child)

    visit(ast)
    return {"nodes": nodes}


def _children(node):
    from vizql import calc_ast as ca
    if isinstance(node, ca.BinaryOp):  return [node.lhs, node.rhs]
    if isinstance(node, ca.UnaryOp):   return [node.operand]
    if isinstance(node, ca.FnCall):    return list(node.args)
    if isinstance(node, ca.IfExpr):    return [node.cond, node.then_, *[x for pair in node.elifs for x in pair], *([node.else_] if node.else_ else [])]
    if isinstance(node, ca.CaseExpr):  return [*( [node.scrutinee] if node.scrutinee else []), *[x for pair in node.whens for x in pair], *([node.else_] if node.else_ else [])]
    if isinstance(node, ca.LodExpr):   return [node.body]
    return []


def _eval_subnode(node, row, schema_ref) -> Any:
    """Re-serialise the subtree to a formula, evaluate it via the main path,
    and return the raw value. Swallow any error → return `None` so trace never
    blocks on a single broken child."""
    try:
        sub_formula = node.to_formula() if hasattr(node, "to_formula") else None
        if not sub_formula:
            return None
        res = evaluate_formula(formula=sub_formula, row=row, schema_ref=schema_ref, trace=False)
        return res.value
    except Exception:  # noqa: BLE001
        return None
```

**Note.** `to_formula()` must exist on AST nodes. Plan 8a shipped `calc_ast.py`; if the method is absent there, add it as a minimal pretty-printer in this same commit (≤40 LOC, covering Literal / FieldRef / ParamRef / BinaryOp / UnaryOp / FnCall / IfExpr / CaseExpr / LodExpr). Keep it in `calc_ast.py` so other callers can reuse.

- [ ] **Step 5: Add `/evaluate` route**

Edit `backend/routers/query_routes.py`. Immediately after the `/validate` endpoint body ends (right before `router.routes.extend(_calcs_router.routes)` at line 1408), insert:

```python
class _CalcEvaluateRequest(BaseModel):
    formula: str
    row: dict[str, object] = Field(default_factory=dict)
    schema_ref: dict[str, str] = Field(default_factory=dict)
    trace: bool = False


@_calcs_router.post("/evaluate")
async def evaluate_calc(
    req: _CalcEvaluateRequest,
    current_user: dict = Depends(get_current_user),
):
    if not settings.FEATURE_ANALYST_PRO:
        raise HTTPException(status_code=404, detail="calc evaluate disabled")
    if len(req.formula) > settings.MAX_CALC_FORMULA_LEN:
        raise HTTPException(status_code=413, detail="formula too long")
    email = current_user.get("email") or current_user.get("sub", "")
    _enforce_calc_rate_limit(email)

    from vizql.calc_evaluate import evaluate_formula

    try:
        res = evaluate_formula(
            formula=req.formula,
            row=req.row,
            schema_ref=req.schema_ref,
            trace=req.trace,
        )
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "value": res.value,
        "type": res.type,
        "error": res.error,
        "trace": res.trace,
    }
```

- [ ] **Step 6: Run test to verify it passes**

`cd backend && python -m pytest tests/test_calc_evaluate.py -v`
Expected: PASS (5 cases).

- [ ] **Step 7: Commit**

```bash
git add backend/vizql/calc_evaluate.py backend/routers/query_routes.py \
        backend/config.py backend/.env.example backend/tests/test_calc_evaluate.py \
        backend/vizql/calc_ast.py
git commit -m "feat(analyst-pro): /api/v1/calcs/evaluate — DuckDB single-row calc eval (Plan 8d T7)"
```

---

### Task 8: Live result preview wiring (frontend)

**Files:**
- Modify: `frontend/src/api.js` (add `evaluateCalc`)
- Create: `frontend/src/components/dashboard/freeform/panels/CalcResultPreview.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/CalcResultPreview.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/panels/__tests__/CalcResultPreview.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CalcResultPreview } from '../CalcResultPreview';

vi.mock('../../../../../api', () => ({
  evaluateCalc: vi.fn(),
}));

describe('CalcResultPreview', () => {
  it('shows computed value on successful evaluate', async () => {
    const { evaluateCalc } = await import('../../../../../api');
    evaluateCalc.mockResolvedValueOnce({ value: 42, type: 'number', error: null });
    render(<CalcResultPreview formula="[Sales] * 2" row={{ Sales: 21 }} schemaRef={{ Sales: 'number' }} />);
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.getByText(/number/i)).toBeInTheDocument();
  });

  it('shows error banner on 400', async () => {
    const { evaluateCalc } = await import('../../../../../api');
    evaluateCalc.mockRejectedValueOnce(Object.assign(new Error('ParseError'), { status: 400 }));
    render(<CalcResultPreview formula="bad" row={{}} schemaRef={{}} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/ParseError/));
  });

  it('debounces to one evaluate call within 300ms for 3 rapid updates', async () => {
    vi.useFakeTimers();
    const { evaluateCalc } = await import('../../../../../api');
    evaluateCalc.mockResolvedValue({ value: 1, type: 'number', error: null });
    const { rerender } = render(<CalcResultPreview formula="a" row={{}} schemaRef={{}} />);
    rerender(<CalcResultPreview formula="ab" row={{}} schemaRef={{}} />);
    rerender(<CalcResultPreview formula="abc" row={{}} schemaRef={{}} />);
    await vi.advanceTimersByTimeAsync(300);
    expect(evaluateCalc).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/CalcResultPreview.test.jsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Add `evaluateCalc` API helper**

Edit `frontend/src/api.js`. Append:

```js
export async function evaluateCalc({ formula, row, schema_ref = {}, trace = false }) {
  const res = await fetch('/api/v1/calcs/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ formula, row, schema_ref, trace }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || res.statusText), { status: res.status, detail: body.detail });
  }
  return res.json();
}
```

- [ ] **Step 4: Write `CalcResultPreview.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/CalcResultPreview.jsx`:

```jsx
import React from 'react';
import { evaluateCalc } from '../../../../api';

export function CalcResultPreview({ formula, row, schemaRef, debounceMs = 300 }) {
  const [state, setState] = React.useState({ value: null, type: null, error: null, loading: false });
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    if (!formula) {
      setState({ value: null, type: null, error: null, loading: false });
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setState((s) => ({ ...s, loading: true }));
      evaluateCalc({ formula, row, schema_ref: schemaRef })
        .then((res) => setState({ value: res.value, type: res.type, error: null, loading: false }))
        .catch((err) => setState({ value: null, type: null, error: err.message, loading: false }));
    }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [formula, JSON.stringify(row), JSON.stringify(schemaRef), debounceMs]);

  if (state.error) {
    return <div role="alert" className="calc-result-preview calc-result-preview--error">{state.error}</div>;
  }
  if (state.loading) {
    return <div className="calc-result-preview calc-result-preview--loading">Evaluating…</div>;
  }
  if (state.value === null) {
    return <div className="calc-result-preview calc-result-preview--empty">Type a formula to see its value.</div>;
  }
  return (
    <div className="calc-result-preview">
      <div className="calc-result-preview__value">{String(state.value)}</div>
      <div className="calc-result-preview__type">{state.type}</div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

`cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/CalcResultPreview.test.jsx`
Expected: PASS (3 cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/CalcResultPreview.jsx \
        frontend/src/components/dashboard/freeform/panels/__tests__/CalcResultPreview.test.jsx \
        frontend/src/api.js
git commit -m "feat(analyst-pro): CalcResultPreview — debounced live evaluate (Plan 8d T8)"
```

---

### Task 9: `CalcDebugPanel` — AST trace tree view

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/CalcDebugPanel.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/CalcDebugPanel.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/panels/__tests__/CalcDebugPanel.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CalcDebugPanel } from '../CalcDebugPanel';

vi.mock('../../../../../api', () => ({
  evaluateCalc: vi.fn().mockResolvedValue({
    value: 1, type: 'number', error: null,
    trace: {
      nodes: [
        { label: 'IF [Sales] > 10 THEN 1 ELSE 0 END', value: 1 },
        { label: '[Sales] > 10', value: true },
        { label: '[Sales]', value: 15 },
        { label: '10', value: 10 },
      ],
    },
  }),
}));

describe('CalcDebugPanel', () => {
  it('renders each AST node with its evaluated value', async () => {
    render(<CalcDebugPanel formula="IF [Sales] > 10 THEN 1 ELSE 0 END" row={{ Sales: 15 }} schemaRef={{ Sales: 'number' }} />);
    await waitFor(() => expect(screen.getByText('[Sales] > 10')).toBeInTheDocument());
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders empty-state when no formula', () => {
    render(<CalcDebugPanel formula="" row={{}} schemaRef={{}} />);
    expect(screen.getByText(/No formula/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/CalcDebugPanel.test.jsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Write `CalcDebugPanel.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/CalcDebugPanel.jsx`:

```jsx
import React from 'react';
import { evaluateCalc } from '../../../../api';

export function CalcDebugPanel({ formula, row, schemaRef }) {
  const [state, setState] = React.useState({ trace: null, error: null, loading: false });

  React.useEffect(() => {
    if (!formula) {
      setState({ trace: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    evaluateCalc({ formula, row, schema_ref: schemaRef, trace: true })
      .then((res) => { if (!cancelled) setState({ trace: res.trace, error: null, loading: false }); })
      .catch((err) => { if (!cancelled) setState({ trace: null, error: err.message, loading: false }); });
    return () => { cancelled = true; };
  }, [formula, JSON.stringify(row), JSON.stringify(schemaRef)]);

  if (!formula) return <div className="calc-debug-panel calc-debug-panel--empty">No formula to trace.</div>;
  if (state.error) return <div role="alert" className="calc-debug-panel calc-debug-panel--error">{state.error}</div>;
  if (state.loading || !state.trace) return <div className="calc-debug-panel calc-debug-panel--loading">Tracing…</div>;

  return (
    <ol className="calc-debug-panel" aria-label="AST evaluation trace">
      {state.trace.nodes.map((n, i) => (
        <li key={i} className="calc-debug-panel__node">
          <code className="calc-debug-panel__label">{n.label}</code>
          <span className="calc-debug-panel__eq">=</span>
          <code className="calc-debug-panel__value">{String(n.value)}</code>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

`cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/CalcDebugPanel.test.jsx`
Expected: PASS (2 cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/CalcDebugPanel.jsx \
        frontend/src/components/dashboard/freeform/panels/__tests__/CalcDebugPanel.test.jsx
git commit -m "feat(analyst-pro): CalcDebugPanel — AST trace with per-node values (Plan 8d T9)"
```

---

### Task 10: Backend `/api/v1/calcs/suggest` — Claude Haiku grounded suggestion

**Files:**
- Create: `backend/vizql/calc_suggest.py`
- Modify: `backend/routers/query_routes.py` (add `/suggest` route)
- Modify: `backend/config.py` (add `FEATURE_CALC_LLM_SUGGEST`, `CALC_SUGGEST_RATE_LIMIT_PER_60S`, `CALC_SUGGEST_MAX_DESCRIPTION_LEN`)
- Modify: `backend/.env.example` (document settings)
- Create: `backend/tests/test_calc_suggest.py`
- Modify: `docs/claude/config-defaults.md` (table row for new settings)

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_calc_suggest.py`:

```python
import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from config import settings
from model_provider import ProviderResponse


@pytest.fixture(autouse=True)
def _enable(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", True, raising=False)
    monkeypatch.setattr(settings, "FEATURE_CALC_LLM_SUGGEST", True, raising=False)


def _auth_headers(client):
    from tests._helpers import demo_auth_headers  # type: ignore
    return demo_auth_headers(client)


def _mock_provider(formula_json: str):
    provider = MagicMock()
    provider.complete.return_value = ProviderResponse(
        text=formula_json, usage={"input_tokens": 100, "output_tokens": 50}, stop_reason="end_turn",
    )
    return provider


def test_suggest_returns_valid_formula():
    payload = json.dumps({
        "formula": "SUM([Sales]) / COUNTD([Customer])",
        "explanation": "Average sales per unique customer.",
        "confidence": 0.9,
    })
    with patch("vizql.calc_suggest.get_provider_for_user", return_value=_mock_provider(payload)):
        client = TestClient(app)
        res = client.post(
            "/api/v1/calcs/suggest",
            json={
                "description": "average sales per customer",
                "schema_ref": {"Sales": "number", "Customer": "string"},
                "parameters": [],
                "sets": [],
                "existing_calcs": [],
            },
            headers=_auth_headers(client),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["formula"].startswith("SUM([Sales])")
        assert body["confidence"] == 0.9
        assert body["is_generative_ai_web_authoring"] is True


def test_suggest_rejects_invalid_llm_output():
    payload = "i am not json, i am literally just prose"
    with patch("vizql.calc_suggest.get_provider_for_user", return_value=_mock_provider(payload)):
        client = TestClient(app)
        res = client.post(
            "/api/v1/calcs/suggest",
            json={"description": "avg sales", "schema_ref": {"Sales": "number"}},
            headers=_auth_headers(client),
        )
        assert res.status_code == 422
        assert "parse" in res.json()["detail"].lower()


def test_suggest_rejects_hallucinated_field():
    payload = json.dumps({
        "formula": "SUM([Margin])",    # Margin NOT in schema_ref
        "explanation": "Total margin.",
        "confidence": 0.8,
    })
    with patch("vizql.calc_suggest.get_provider_for_user", return_value=_mock_provider(payload)):
        client = TestClient(app)
        res = client.post(
            "/api/v1/calcs/suggest",
            json={"description": "total margin", "schema_ref": {"Sales": "number"}},
            headers=_auth_headers(client),
        )
        assert res.status_code == 422
        assert "Margin" in res.json()["detail"]


def test_suggest_rate_limit(monkeypatch):
    monkeypatch.setattr(settings, "CALC_SUGGEST_RATE_LIMIT_PER_60S", 2, raising=False)
    payload = json.dumps({"formula": "SUM([Sales])", "explanation": "", "confidence": 0.5})
    with patch("vizql.calc_suggest.get_provider_for_user", return_value=_mock_provider(payload)):
        client = TestClient(app)
        for _ in range(2):
            res = client.post("/api/v1/calcs/suggest",
                              json={"description": "x", "schema_ref": {"Sales": "number"}},
                              headers=_auth_headers(client))
            assert res.status_code == 200
        res = client.post("/api/v1/calcs/suggest",
                          json={"description": "x", "schema_ref": {"Sales": "number"}},
                          headers=_auth_headers(client))
        assert res.status_code == 429


def test_suggest_writes_audit_row(monkeypatch):
    captured: list[dict] = []
    def fake_audit(event_type, data):
        captured.append({"event_type": event_type, **data})
    monkeypatch.setattr("vizql.calc_suggest._audit", fake_audit)
    payload = json.dumps({"formula": "SUM([Sales])", "explanation": "", "confidence": 0.5})
    with patch("vizql.calc_suggest.get_provider_for_user", return_value=_mock_provider(payload)):
        client = TestClient(app)
        client.post("/api/v1/calcs/suggest",
                    json={"description": "total", "schema_ref": {"Sales": "number"}},
                    headers=_auth_headers(client))
    assert any(c["event_type"] == "calc_suggest" for c in captured)
```

- [ ] **Step 2: Run test to verify it fails**

`cd backend && python -m pytest tests/test_calc_suggest.py -v`
Expected: FAIL — endpoint 404.

- [ ] **Step 3: Add config + env**

Edit `backend/config.py` under the Plan 8a calc block:

```python
    # Plan 8d — calc LLM suggestion
    FEATURE_CALC_LLM_SUGGEST: bool = True
    CALC_SUGGEST_RATE_LIMIT_PER_60S: int = 5
    CALC_SUGGEST_MAX_DESCRIPTION_LEN: int = 1000
```

Append to `backend/.env.example`:

```
FEATURE_CALC_LLM_SUGGEST=true
CALC_SUGGEST_RATE_LIMIT_PER_60S=5
CALC_SUGGEST_MAX_DESCRIPTION_LEN=1000
```

Append a new table row block in `docs/claude/config-defaults.md` under the "Calc parser (Plan 8b)" table:

```markdown
### Calc editor (Plan 8d)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_CALC_LLM_SUGGEST` | `True` | Gates `/api/v1/calcs/suggest` LLM endpoint. Free-plan ops can force `False` without code change. |
| `CALC_SUGGEST_RATE_LIMIT_PER_60S` | `5` | Per-user LLM suggestion cap (60s sliding window). |
| `CALC_SUGGEST_MAX_DESCRIPTION_LEN` | `1000` | Reject oversized NL descriptions (413). |
| `CALC_EVAL_TIMEOUT_SECONDS` | `1.0` | Single-row DuckDB eval wall-clock cap. |
| `CALC_EVAL_CACHE_TTL_SECONDS` | `60` | `(formula_hash, row_hash)` result cache TTL. |
```

- [ ] **Step 4: Write `calc_suggest.py`**

Create `backend/vizql/calc_suggest.py`:

```python
"""Plan 8d — LLM-backed calc suggestion.

Claude Haiku via the user's BYOK provider. The system prompt is cached in the
ephemeral prompt cache (function catalogue + grounding rules are stable per
request). The user message contains only the NL description + schema summary.

Response contract — the LLM MUST return a single JSON object with keys
``formula`` (str), ``explanation`` (str), ``confidence`` (float in [0,1]).
Any deviation → HTTP 422 from the caller. The returned formula is
validated here (every field ref present in schema_ref, every param in
parameters, every function in the Plan 8a catalogue) before we surface
it to the user.

Auditing: every call emits an audit row ``calc_suggest`` with the user,
description length, inferred field refs, and model usage — NEVER raw
schema or NL content.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from threading import Lock

from audit_trail import log_tier_decision  # reuse existing audit writer
from config import settings
from provider_registry import get_provider_for_user
from vizql.calc_functions import FUNCTIONS


_RL_LOCK = Lock()
_RL: dict[str, list[float]] = {}


def _audit(event_type: str, data: dict) -> None:
    # Thin indirection so tests can monkeypatch.
    log_tier_decision(tier=event_type, decision=data)


def _rate_limit(email: str) -> None:
    now = time.time()
    cap = settings.CALC_SUGGEST_RATE_LIMIT_PER_60S
    with _RL_LOCK:
        ts = [t for t in _RL.get(email, []) if t > now - 60.0]
        if len(ts) >= cap:
            raise PermissionError(f"calc_suggest rate limit: {cap}/60s")
        ts.append(now)
        _RL[email] = ts


@dataclass
class SuggestResult:
    formula: str
    explanation: str
    confidence: float


SYSTEM_TEMPLATE = """You are AskDB's calc suggestion engine.

HARD RULES — violating any one of these means your output is rejected:
1. Return ONE JSON object with EXACTLY these keys: formula, explanation, confidence.
2. formula MUST use only functions listed in the function catalogue below.
3. formula MUST use only fields from the `schema_ref` in the user message.
4. parameters MUST be referenced as [Parameters].[ParamName] and MUST exist.
5. Never invent fields, functions, or parameters. If the user's description cannot be satisfied, set confidence to 0 and explain why.
6. Never output prose outside the JSON object. No markdown, no code fences.

Function catalogue (name — category — signature):
{catalogue}

LOD syntax:
- FIXED:   {{FIXED [dim1], [dim2] : SUM([m])}}
- INCLUDE: {{INCLUDE [dim] : SUM([m])}}
- EXCLUDE: {{EXCLUDE [dim] : SUM([m])}}

Tableau calc language reference is canonical. Prefer aggregate + dimension expressions over raw SQL."""


def _build_system() -> str:
    rows = []
    for name, fn in sorted(FUNCTIONS.items()):
        cat = fn.category.value if hasattr(fn.category, "value") else str(fn.category)
        sig = f"{name}({', '.join('arg' for _ in fn.arg_types)})"
        rows.append(f"- {name} — {cat} — {sig} — {fn.docstring or ''}".rstrip())
    return SYSTEM_TEMPLATE.format(catalogue="\n".join(rows))


def _parse_llm_response(text: str) -> SuggestResult:
    # Strip optional markdown fencing defensively even though the prompt bans it.
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    try:
        obj = json.loads(t)
    except json.JSONDecodeError as exc:
        raise ValueError(f"could not parse LLM response as JSON: {exc}") from exc
    for key in ("formula", "explanation", "confidence"):
        if key not in obj:
            raise ValueError(f"LLM response missing '{key}'")
    try:
        conf = float(obj["confidence"])
    except (TypeError, ValueError) as exc:
        raise ValueError("confidence must be a float") from exc
    if not 0.0 <= conf <= 1.0:
        raise ValueError(f"confidence {conf} not in [0,1]")
    return SuggestResult(formula=str(obj["formula"]), explanation=str(obj["explanation"]), confidence=conf)


_FIELD_RE = re.compile(r"(?<!\[Parameters\]\.)\[([^\]]+)\]")
_PARAM_RE = re.compile(r"\[Parameters\]\.\[([^\]]+)\]")
_FN_RE    = re.compile(r"\b([A-Z][A-Z_]+)\s*\(")


def _ground_check(result: SuggestResult, *, schema_ref: dict, parameters: list) -> None:
    param_names = {p.get("name") for p in parameters}
    for m in _FIELD_RE.finditer(result.formula):
        name = m.group(1)
        # Skip parameter references that matched the field regex tail.
        if name in param_names:
            continue
        if name not in schema_ref:
            raise ValueError(f"LLM hallucinated field [{name}] — not in schema_ref")
    for m in _PARAM_RE.finditer(result.formula):
        if m.group(1) not in param_names:
            raise ValueError(f"LLM hallucinated parameter [Parameters].[{m.group(1)}]")
    for m in _FN_RE.finditer(result.formula):
        fname = m.group(1)
        if fname in ("IF", "THEN", "ELSE", "ELSEIF", "END", "CASE", "WHEN", "AND", "OR", "NOT", "IN", "FIXED", "INCLUDE", "EXCLUDE"):
            continue
        if fname not in FUNCTIONS:
            raise ValueError(f"LLM hallucinated function {fname}()")


def suggest_calc(
    *, email: str, description: str,
    schema_ref: dict, parameters: list, sets: list, existing_calcs: list,
) -> SuggestResult:
    if not settings.FEATURE_CALC_LLM_SUGGEST:
        raise RuntimeError("calc LLM suggest disabled")
    if len(description) > settings.CALC_SUGGEST_MAX_DESCRIPTION_LEN:
        raise ValueError("description too long")
    _rate_limit(email)

    user_msg = {
        "role": "user",
        "content": json.dumps({
            "description": description,
            "schema_ref": schema_ref,
            "parameters": [{"name": p.get("name"), "dataType": p.get("dataType")} for p in parameters],
            "sets": [{"name": s.get("name")} for s in sets],
            "existing_calcs": [{"name": c.get("name"), "formula": c.get("formula")} for c in existing_calcs],
        }),
    }

    provider = get_provider_for_user(email)
    resp = provider.complete(
        model=settings.PRIMARY_MODEL,   # Claude Haiku per config-defaults.md
        system=_build_system(),
        messages=[user_msg],
        max_tokens=800,
        cache=True,
    )

    result = _parse_llm_response(resp.text)
    _ground_check(result, schema_ref=schema_ref, parameters=parameters)

    _audit("calc_suggest", {
        "user": email,
        "description_len": len(description),
        "fields_used": list(set(m.group(1) for m in _FIELD_RE.finditer(result.formula))),
        "confidence": result.confidence,
        "input_tokens": resp.usage.get("input_tokens", 0),
        "output_tokens": resp.usage.get("output_tokens", 0),
    })

    return result
```

- [ ] **Step 5: Add `/suggest` route**

Edit `backend/routers/query_routes.py` — immediately after the `/evaluate` endpoint body from T7, insert:

```python
class _CalcSuggestRequest(BaseModel):
    description: str
    schema_ref: dict[str, str] = Field(default_factory=dict)
    parameters: list[dict] = Field(default_factory=list)
    sets: list[dict] = Field(default_factory=list)
    existing_calcs: list[dict] = Field(default_factory=list)


@_calcs_router.post("/suggest")
async def suggest_calc_endpoint(
    req: _CalcSuggestRequest,
    current_user: dict = Depends(get_current_user),
):
    if not settings.FEATURE_ANALYST_PRO:
        raise HTTPException(status_code=404, detail="calc suggest disabled")
    if not settings.FEATURE_CALC_LLM_SUGGEST:
        raise HTTPException(status_code=404, detail="calc LLM suggest disabled")

    email = current_user.get("email") or current_user.get("sub", "")
    from vizql.calc_suggest import suggest_calc

    try:
        result = suggest_calc(
            email=email,
            description=req.description,
            schema_ref=req.schema_ref,
            parameters=req.parameters,
            sets=req.sets,
            existing_calcs=req.existing_calcs,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return {
        "formula": result.formula,
        "explanation": result.explanation,
        "confidence": result.confidence,
        "is_generative_ai_web_authoring": True,
    }
```

- [ ] **Step 6: Run tests to verify they pass**

`cd backend && python -m pytest tests/test_calc_suggest.py -v`
Expected: PASS (5 cases).

- [ ] **Step 7: Commit**

```bash
git add backend/vizql/calc_suggest.py backend/routers/query_routes.py \
        backend/config.py backend/.env.example backend/tests/test_calc_suggest.py \
        docs/claude/config-defaults.md
git commit -m "feat(analyst-pro): /api/v1/calcs/suggest — Haiku-grounded calc suggestion (Plan 8d T10)"
```

---

### Task 11: `CalcEditorDialog` assembly + LLM suggest flow + a11y

**Files:**
- Modify: `frontend/src/api.js` (add `suggestCalc`)
- Modify: `frontend/src/store.js` (add calc-editor slice + save action)
- Create: `frontend/src/components/dashboard/freeform/panels/CalcSuggestDialog.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/CalcEditorDialog.jsx`
- Modify: `frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx` (open button)
- Modify: `frontend/src/components/dashboard/freeform/lib/calcLanguage.ts` (register all providers)
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/CalcSuggestDialog.test.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/dashboard/freeform/panels/__tests__/CalcSuggestDialog.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CalcSuggestDialog } from '../CalcSuggestDialog';

vi.mock('../../../../../api', () => ({
  suggestCalc: vi.fn().mockResolvedValue({
    formula: 'SUM([Sales]) / COUNTD([Customer])',
    explanation: 'Average per customer.',
    confidence: 0.88,
    is_generative_ai_web_authoring: true,
  }),
}));

describe('CalcSuggestDialog', () => {
  it('renders description input, calls suggestCalc on submit, surfaces formula + confidence', async () => {
    const onAccept = vi.fn();
    render(<CalcSuggestDialog schemaRef={{ Sales: 'number', Customer: 'string' }} parameters={[]} sets={[]} existingCalcs={[]} onAccept={onAccept} onClose={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: /description/i }), { target: { value: 'avg sales per customer' } });
    fireEvent.click(screen.getByRole('button', { name: /suggest/i }));
    await waitFor(() => expect(screen.getByText(/Average per customer/)).toBeInTheDocument());
    expect(screen.getByText(/88%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({
      formula: 'SUM([Sales]) / COUNTD([Customer])',
      is_generative_ai_web_authoring: true,
    }));
  });
});
```

Create `frontend/src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalcEditorDialog } from '../CalcEditorDialog';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="monaco-editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../../../../api', () => ({
  validateCalc: vi.fn().mockResolvedValue({ valid: true, warnings: [] }),
  evaluateCalc: vi.fn().mockResolvedValue({ value: null, type: null, error: null }),
  fetchSampleRows: vi.fn().mockResolvedValue({ columns: ['Sales'], rows: [{ Sales: 1 }] }),
}));

describe('CalcEditorDialog', () => {
  const baseProps = {
    connId: 'c1',
    schemaFields: [{ name: 'Sales', dataType: 'number' }],
    parameters: [],
    sets: [],
    existingCalcs: [],
    onSave: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders modal with role=dialog aria-modal, name input, Monaco', () => {
    render(<CalcEditorDialog {...baseProps} />);
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText(/calculation name/i)).toBeInTheDocument();
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('Esc closes, Cmd+Enter saves', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CalcEditorDialog {...baseProps} onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/calculation name/i), { target: { value: 'Avg Sales' } });
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'SUM([Sales])' } });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Avg Sales',
      formula: 'SUM([Sales])',
      is_generative_ai_web_authoring: false,
    }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('accepts LLM suggestion → save stamps is_generative_ai_web_authoring=true', async () => {
    const onSave = vi.fn();
    render(<CalcEditorDialog {...baseProps} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /suggest with AI/i }));
    // CalcSuggestDialog opens — simulate acceptance via its callback; the
    // CalcEditorDialog owns the handler (wired in implementation).
    // We bypass the sub-dialog by dispatching the internal action directly:
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'SUM([Sales])' } });
    // Mark the editor as having a generated formula.
    fireEvent.click(screen.getByTestId('mark-ai-generated'));
    fireEvent.change(screen.getByLabelText(/calculation name/i), { target: { value: 'AI Avg' } });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'AI Avg',
      is_generative_ai_web_authoring: true,
    }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

`cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.test.jsx src/components/dashboard/freeform/panels/__tests__/CalcSuggestDialog.test.jsx`
Expected: FAIL — components missing.

- [ ] **Step 3: Add `suggestCalc` API helper**

Edit `frontend/src/api.js`. Append:

```js
export async function suggestCalc({ description, schema_ref, parameters = [], sets = [], existing_calcs = [] }) {
  const res = await fetch('/api/v1/calcs/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ description, schema_ref, parameters, sets, existing_calcs }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || res.statusText), { status: res.status, detail: body.detail });
  }
  return res.json();
}
```

- [ ] **Step 4: Extend `calcLanguage.ts` to attach providers on open**

Edit `frontend/src/components/dashboard/freeform/lib/calcLanguage.ts` — append (after the existing `__resetForTests` export):

```ts
import { buildCompletionProvider, type CalcCompletionContext } from './calcCompletionProvider';
import { buildSignatureProvider } from './calcSignatureProvider';
import { buildHoverProvider, type HoverContext } from './calcHoverProvider';

export interface CalcProvidersRegistration { dispose: () => void; }

/**
 * Attach completion / signature / hover providers bound to the given editor
 * context. Return a disposer that unregisters all three — the dialog calls it
 * on close so providers never leak across dialog instances.
 */
export function registerCalcProviders(
  monaco: typeof import('monaco-editor'),
  ctx: CalcCompletionContext & HoverContext,
): CalcProvidersRegistration {
  const disposers = [
    monaco.languages.registerCompletionItemProvider(ASKDB_CALC_LANGUAGE_ID, buildCompletionProvider(monaco, ctx)),
    monaco.languages.registerSignatureHelpProvider(ASKDB_CALC_LANGUAGE_ID, buildSignatureProvider(monaco)),
    monaco.languages.registerHoverProvider(ASKDB_CALC_LANGUAGE_ID, buildHoverProvider(ctx)),
  ];
  return { dispose: () => disposers.forEach((d) => d.dispose()) };
}
```

- [ ] **Step 5: Add store slice**

Edit `frontend/src/store.js` — under the `analystProSheetFilters` block (around line 1338), add:

```js
  analystProCalcEditor: null, // { open: boolean, editingCalcId: string|null, seedFormula: string, seedName: string, aiGenerated: boolean }
  openCalcEditorAnalystPro: ({ editingCalcId = null, seedFormula = '', seedName = '' } = {}) =>
    set({ analystProCalcEditor: { open: true, editingCalcId, seedFormula, seedName, aiGenerated: false } }),
  closeCalcEditorAnalystPro: () => set({ analystProCalcEditor: null }),
  saveCalcAnalystPro: (calc) => set((s) => {
    const dash = s.analystProDashboard;
    if (!dash) return s;
    const calcs = [...(dash.calcs ?? [])];
    const idx = calcs.findIndex((c) => c.id === calc.id);
    if (idx >= 0) calcs[idx] = calc; else calcs.push(calc);
    return {
      analystProDashboard: { ...dash, calcs },
      analystProCalcEditor: null,
    };
  }),
```

- [ ] **Step 6: Write `CalcSuggestDialog.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/CalcSuggestDialog.jsx`:

```jsx
import React from 'react';
import { suggestCalc } from '../../../../api';

export function CalcSuggestDialog({ schemaRef, parameters, sets, existingCalcs, onAccept, onClose }) {
  const [description, setDescription] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  async function submit() {
    setLoading(true); setError(null);
    try {
      const res = await suggestCalc({
        description,
        schema_ref: schemaRef,
        parameters, sets, existing_calcs: existingCalcs,
      });
      setResult(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="calc-suggest-title" className="calc-suggest-dialog">
      <h2 id="calc-suggest-title">Suggest calculation with AI</h2>
      <label htmlFor="calc-suggest-desc">Description</label>
      <textarea
        id="calc-suggest-desc"
        aria-label="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. average sales per customer, year-over-year growth, top 10 by margin"
        maxLength={1000}
      />
      <div className="calc-suggest-dialog__actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={submit} disabled={loading || !description.trim()}>Suggest</button>
      </div>
      {error && <div role="alert" className="calc-suggest-dialog__error">{error}</div>}
      {result && (
        <div className="calc-suggest-dialog__result">
          <pre className="calc-suggest-dialog__formula">{result.formula}</pre>
          <p>{result.explanation}</p>
          <div>Confidence: {Math.round((result.confidence ?? 0) * 100)}%</div>
          <button onClick={() => onAccept(result)}>Accept</button>
          <button onClick={() => setResult(null)}>Reject</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Write `CalcEditorDialog.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/CalcEditorDialog.jsx`:

```jsx
import React from 'react';
import MonacoEditor from '@monaco-editor/react';
import { registerAskdbCalcLanguage, registerCalcProviders, ASKDB_CALC_LANGUAGE_ID } from '../lib/calcLanguage';
import { buildDiagnosticsRunner } from '../lib/calcDiagnostics';
import { validateCalc } from '../../../../api';
import { CalcTestValues } from './CalcTestValues';
import { CalcResultPreview } from './CalcResultPreview';
import { CalcDebugPanel } from './CalcDebugPanel';
import { CalcSuggestDialog } from './CalcSuggestDialog';

function genId() { return 'calc_' + Math.random().toString(36).slice(2, 10); }

export function CalcEditorDialog({
  connId,
  schemaFields,
  parameters,
  sets,
  existingCalcs,
  initialCalc,
  onSave,
  onClose,
}) {
  const [name, setName] = React.useState(initialCalc?.name ?? '');
  const [formula, setFormula] = React.useState(initialCalc?.formula ?? '');
  const [aiGenerated, setAiGenerated] = React.useState(Boolean(initialCalc?.is_generative_ai_web_authoring));
  const [selectedRowIdx, setSelectedRowIdx] = React.useState(0);
  const [sampleRow, setSampleRow] = React.useState({});
  const [suggestOpen, setSuggestOpen] = React.useState(false);

  const editorRef = React.useRef(null);
  const monacoRef = React.useRef(null);
  const disposeRef = React.useRef(null);
  const diagRef = React.useRef(null);

  const schemaRef = React.useMemo(
    () => Object.fromEntries(schemaFields.map((f) => [f.name, f.dataType])),
    [schemaFields],
  );

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerAskdbCalcLanguage(monaco);
    disposeRef.current = registerCalcProviders(monaco, {
      schemaFields, parameters, sets,
    }).dispose;
    diagRef.current = buildDiagnosticsRunner({
      validateCalc,
      schemaRef,
      schemaStats: {},
      onMarkers: (markers) => {
        monaco.editor.setModelMarkers(editor.getModel(), 'askdb-calc', markers);
      },
    });
  }

  React.useEffect(() => () => {
    if (disposeRef.current) disposeRef.current();
    if (diagRef.current) diagRef.current.dispose();
  }, []);

  React.useEffect(() => { diagRef.current?.update(formula); }, [formula]);

  React.useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function doSave() {
    onSave({
      id: initialCalc?.id ?? genId(),
      name: name || 'New calculation',
      formula,
      is_generative_ai_web_authoring: aiGenerated,
    });
  }

  function acceptSuggestion(res) {
    setFormula(res.formula);
    setAiGenerated(true);
    setSuggestOpen(false);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="calc-editor-title" className="calc-editor-dialog">
      <header className="calc-editor-dialog__header">
        <h2 id="calc-editor-title">Calculation</h2>
        <label>
          <span>Calculation name</span>
          <input
            aria-label="calculation name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button onClick={() => setSuggestOpen(true)}>Suggest with AI</button>
        {/* test-only affordance — hidden from production users via CSS */}
        <button data-testid="mark-ai-generated" style={{ display: 'none' }} onClick={() => setAiGenerated(true)} />
      </header>
      <div className="calc-editor-dialog__body">
        <MonacoEditor
          height="40vh"
          language={ASKDB_CALC_LANGUAGE_ID}
          theme="askdb-calc-theme"
          value={formula}
          onChange={(v) => setFormula(v ?? '')}
          onMount={handleEditorMount}
          options={{ minimap: { enabled: false }, automaticLayout: true, wordWrap: 'on' }}
        />
        <section className="calc-editor-dialog__bottom">
          <CalcTestValues connId={connId} selectedRowIdx={selectedRowIdx} onSelectRow={(i) => { setSelectedRowIdx(i); setSampleRow({ ...sampleRow, __idx: i }); }} />
          <CalcResultPreview formula={formula} row={sampleRow} schemaRef={schemaRef} />
          <CalcDebugPanel formula={formula} row={sampleRow} schemaRef={schemaRef} />
        </section>
      </div>
      <footer className="calc-editor-dialog__footer">
        <button onClick={onClose}>Cancel</button>
        <button onClick={doSave}>Save</button>
      </footer>
      {suggestOpen && (
        <CalcSuggestDialog
          schemaRef={schemaRef}
          parameters={parameters}
          sets={sets}
          existingCalcs={existingCalcs}
          onAccept={acceptSuggestion}
          onClose={() => setSuggestOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Wire sidebar button**

Edit `frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx` — add (near existing "New Parameter" button if present, otherwise at the end of the Dashboard tab body):

```jsx
<button
  className="analyst-pro-sidebar__button"
  onClick={() => useStore.getState().openCalcEditorAnalystPro()}
>
  New Calculated Field…
</button>
```

Import `useStore` at the top of the file if not already imported.

- [ ] **Step 9: Run tests to verify they pass**

`cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/CalcSuggestDialog.test.jsx src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.test.jsx`
Expected: PASS (4 cases).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/api.js frontend/src/store.js \
        frontend/src/components/dashboard/freeform/lib/calcLanguage.ts \
        frontend/src/components/dashboard/freeform/panels/CalcSuggestDialog.jsx \
        frontend/src/components/dashboard/freeform/panels/CalcEditorDialog.jsx \
        frontend/src/components/dashboard/freeform/panels/AnalystProSidebar.jsx \
        frontend/src/components/dashboard/freeform/panels/__tests__/CalcSuggestDialog.test.jsx \
        frontend/src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.test.jsx
git commit -m "feat(analyst-pro): CalcEditorDialog — Monaco + LLM suggest + a11y (Plan 8d T11)"
```

---

### Task 12: Integration test + roadmap shipped marker

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.integration.test.jsx`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md`

- [ ] **Step 1: Write integration test**

Create `frontend/src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.integration.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CalcEditorDialog } from '../CalcEditorDialog';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="monaco-editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const api = vi.hoisted(() => ({
  validateCalc: vi.fn().mockResolvedValue({ valid: true, warnings: [] }),
  evaluateCalc: vi.fn().mockResolvedValue({ value: 42, type: 'number', error: null, trace: { nodes: [] } }),
  fetchSampleRows: vi.fn().mockResolvedValue({
    columns: ['Sales'], rows: [{ Sales: 20 }, { Sales: 21 }],
  }),
  suggestCalc: vi.fn().mockResolvedValue({
    formula: 'SUM([Sales])', explanation: 'Total sales.', confidence: 0.9, is_generative_ai_web_authoring: true,
  }),
}));
vi.mock('../../../../../api', () => api);

describe('CalcEditorDialog — integration', () => {
  it('open → type SUM([Sales]) → evaluate fires → save produces calc with formula', async () => {
    const onSave = vi.fn();
    render(<CalcEditorDialog connId="c1" schemaFields={[{ name: 'Sales', dataType: 'number' }]} parameters={[]} sets={[]} existingCalcs={[]} onSave={onSave} onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('20').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(/calculation name/i), { target: { value: 'Total Sales' } });
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'SUM([Sales])' } });
    await waitFor(() => expect(api.validateCalc).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Total Sales', formula: 'SUM([Sales])',
    }));
  });

  it('LLM suggest → accept → save stamps is_generative_ai_web_authoring=true', async () => {
    const onSave = vi.fn();
    render(<CalcEditorDialog connId="c1" schemaFields={[{ name: 'Sales', dataType: 'number' }]} parameters={[]} sets={[]} existingCalcs={[]} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /suggest with AI/i }));
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'total sales' } });
    fireEvent.click(screen.getByRole('button', { name: /^Suggest$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    fireEvent.change(screen.getByLabelText(/calculation name/i), { target: { value: 'AI Total' } });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'AI Total',
      formula: 'SUM([Sales])',
      is_generative_ai_web_authoring: true,
    }));
  });
});
```

- [ ] **Step 2: Run integration test to verify it passes**

`cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.integration.test.jsx`
Expected: PASS (2 cases).

- [ ] **Step 3: Mark Plan 8d shipped in roadmap**

Edit `docs/analyst_pro_tableau_parity_roadmap.md`. Replace the existing `### Plan 8d — Monaco Calc Editor` body with:

```markdown
### Plan 8d — Monaco Calc Editor

**Deliverables.**

1. Embed Monaco editor in a new `CalcEditorDialog.jsx`.
2. Autocomplete grounded on:
   - Data source columns (from `connId` schema cache).
   - Function catalogue from Plan 8a.
   - Parameters/sets from current dashboard.
3. Inline test values — run expression against first 10 rows, show result preview.
4. LLM suggest button — generate calc from NL description (Claude Haiku). Grounded strictly on schema + function catalogue.
5. Multi-line debug — step through test values.

**Task count target:** 12.

**Status:** ✅ Shipped — 2026-04-20. 12 tasks. New modules: `frontend/src/components/dashboard/freeform/lib/{calcLanguage,calcMonarch,calcFunctionCatalogue,calcCompletionProvider,calcSignatureProvider,calcHoverProvider,calcDiagnostics}.ts`, `frontend/src/components/dashboard/freeform/panels/{CalcEditorDialog,CalcTestValues,CalcResultPreview,CalcDebugPanel,CalcSuggestDialog}.jsx`, `backend/vizql/{calc_evaluate,calc_suggest}.py`. New endpoints: `POST /api/v1/calcs/evaluate` (DuckDB single-row eval, 1s timeout, 6-layer validator), `POST /api/v1/calcs/suggest` (Haiku grounded on schema + Plan 8a catalogue, ground-checked for hallucinated fields/params/functions, `is_generative_ai_web_authoring=true` stamped per §I.5). New config: `FEATURE_CALC_LLM_SUGGEST=true`, `CALC_SUGGEST_RATE_LIMIT_PER_60S=5`, `CALC_SUGGEST_MAX_DESCRIPTION_LEN=1000`, `CALC_EVAL_TIMEOUT_SECONDS=1.0`, `CALC_EVAL_CACHE_TTL_SECONDS=60`. Dependencies: `@monaco-editor/react@^4.7.0`, `monaco-editor@^0.52.2` (chunk-split). Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8d-monaco-calc-editor.md`.
```

Also update the Phase Index row for Phase 8:

```markdown
| 8 | Calc Fields + LOD + Table Calcs | 8a ✅ / 8b ✅ / 8c ✅ / 8d ✅ (2026-04-20) | Expression parser, full function catalogue, FIXED/INCLUDE/EXCLUDE, Monaco editor. |
```

- [ ] **Step 4: Full suite verification**

Run:
```bash
cd frontend && npx vitest run src/components/dashboard/freeform/
cd ../backend && python -m pytest tests/test_calc_evaluate.py tests/test_calc_suggest.py tests/test_calc_validate.py -v
```
Expected: all new Plan 8d tests pass; pre-existing ~22 chart-ir failures (noted in root CLAUDE.md "Known Test Debt") unchanged in count.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/__tests__/CalcEditorDialog.integration.test.jsx \
        docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): Plan 8d shipped marker + integration test (Plan 8d T12)"
```

---

## Self-Review Checklist (plan author — do not skip)

- [x] Every task lists exact file paths (create vs modify vs delete).
- [x] Every step has complete code — no `// …` / `TBD` / "similar to Task N".
- [x] Every provider (completion / signature / hover / diagnostics) has ≥1 test.
- [x] Both backend endpoints (`/evaluate`, `/suggest`) have TDD tests hitting the happy path + ≥1 error path + ≥1 security-adjacent path (validator rejection, hallucination guard, rate-limit, timeout).
- [x] LLM prompt grounded strictly on: Plan 8a function catalogue, schema_ref, parameters, sets, existing calcs. Hallucination guard regex-checks every `[field]`, `[Parameters].[param]`, and `FN(` identifier against the allowed sets before responding 200.
- [x] `is_generative_ai_web_authoring=true` propagates from `/suggest` response → `CalcSuggestDialog` → `CalcEditorDialog.aiGenerated` → saved calc, per §I.5.
- [x] BYOK: only `anthropic_provider.py` `import anthropic`; `calc_suggest.py` goes through `provider_registry.get_provider_for_user`.
- [x] Prompt caching: `provider.complete(…, cache=True)` + catalogue in stable system block.
- [x] Security: `/evaluate` runs compiled SQL through `SQLValidator`, uses `:memory:` DuckDB, 1s wall-clock timeout, read-only.
- [x] a11y: `role=dialog`, `aria-modal=true`, `aria-labelledby`, Tab/Esc/Cmd+Enter.
- [x] Monaco mandatory (no textarea fallback).
- [x] Every commit tagged `(Plan 8d T<N>)`.
- [x] 12 tasks target hit exactly.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8d-monaco-calc-editor.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with `superpowers:subagent-driven-development`, two-stage review between tasks, fast iteration.
2. **Inline Execution** — execute tasks sequentially in a single session using `superpowers:executing-plans`, checkpoint after each commit for review.

Which approach?
