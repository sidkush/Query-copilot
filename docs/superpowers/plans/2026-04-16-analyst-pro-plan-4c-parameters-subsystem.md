# Analyst Pro — Plan 4c: Parameters Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Tableau-style **Parameters** for Analyst Pro — typed, user-adjustable scalar values referenced by `{{param_name}}` tokens in worksheet SQL. Persist per-dashboard, edit via a dedicated left-rail panel with typed widgets, and consume via the existing `ChangeParameterAction` runtime path + a safe server-side substitution pass ahead of the SQL validator.

**Architecture:** A new Zustand slice `analystProParameters: DashboardParameter[]` (lives inside `analystProDashboard.parameters`). Pure lib `parameterOps.ts` owns value coercion, domain validation, and `{{token}}` substitution with SQL-safe quoting. A left-rail `ParametersPanel` lists / creates / edits / deletes parameters; per-parameter `ParameterControl` widgets (dropdown / slider / toggle / date picker / free text) drive live value edits. `useActionRuntime.applyTargetOp` `case 'change-parameter'` writes through `setParameterValueAnalystPro`. `AnalystProWorksheetTile` already re-queries on filter changes — extend it to also watch `analystProParameters` and include the parameters map in `api.executeSQL`. Backend adds a pure `param_substitution.py` helper (mirrors the frontend op) and wires it into `/api/v1/queries/execute` **before** `sql_filter_injector` and `SQLValidator`. `waterfall_router.route*` accept an optional `parameters` kwarg for downstream consistency. Unknown tokens reject loudly; validator remains the final arbiter so injected string values can never slip past the 6-layer SELECT-only guard.

**Tech Stack:** React 19 + Zustand + TypeScript (lib) + Vitest + @testing-library/react (frontend); FastAPI + pytest (backend). No new runtime deps.

---

## Prerequisites

- Branch: `askdb-global-comp` (all commits land here).
- Plan 3 shipped: `actionTypes.ts` includes `ChangeParameterAction { kind:'change-parameter', targetParameterId, fieldMapping: SourceMapping[], aggregation? }`; `TargetOp` includes `{ kind:'change-parameter', parameterId, value }` (see [actionTypes.ts:50](frontend/src/components/dashboard/freeform/lib/actionTypes.ts) and [actionExecutor.ts:54](frontend/src/components/dashboard/freeform/lib/actionExecutor.ts)).
- Plan 4a shipped: `filterApplication.ts`, `sql_filter_injector.py`, `ExecuteRequest.additional_filters` wiring in `backend/routers/query_routes.py`, identifier regex `/^[A-Za-z_][A-Za-z0-9_]*$/`, `AnalystProWorksheetTile` wrapper at [AnalystProWorksheetTile.jsx](frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx).
- Plan 4b shipped: `setOps.ts`, `SetsPanel`, `parameters: []` slot already present in [dashboard_migration.py:351](backend/dashboard_migration.py) and whitelisted in [user_storage.py:630](backend/user_storage.py).
- Plan 3 runtime `case 'change-parameter'` currently a no-op stub in [useActionRuntime.js:42](frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js) — this plan wires it.
- Feature gate: `settings.FEATURE_ANALYST_PRO` (unchanged).
- Security: every parameter substitution MUST run **before** `SQLValidator` so the validator sees the final SQL string. Never bypass. Never allow raw SQL in a parameter value.
- Frontend tests: `cd frontend && npm run test:chart-ir -- <pattern>`. Backend tests: `cd backend && python -m pytest tests/ -v`. Lint: `cd frontend && npm run lint`. Build: `cd frontend && npm run build`.

---

## Data Model

```ts
// frontend/src/components/dashboard/freeform/lib/parameterTypes.ts
export type ParamType = 'string' | 'number' | 'boolean' | 'date';

export type ParamValue = string | number | boolean;

export type ParamDomain =
  | { kind: 'list'; values: ParamValue[] }
  | { kind: 'range'; min: number; max: number; step: number }
  | { kind: 'free' };

export type DashboardParameter = {
  id: string;          // nanoid-style, reuse generateZoneId
  name: string;        // unique within dashboard, /^[A-Za-z_][A-Za-z0-9_]*$/
  type: ParamType;
  value: ParamValue;   // current scalar value
  domain: ParamDomain;
  createdAt: string;   // ISO-8601 UTC
};
```

- `name` validated as `/^[A-Za-z_][A-Za-z0-9_]*$/` at creation. Case-insensitive uniqueness within a dashboard.
- `value` always coerced to match `type` via `coerceValue` (string → number with `Number.isFinite` guard, etc.).
- `date` values are ISO-8601 strings; stored and rendered as strings.
- `range` domains valid only for `type === 'number'`; `list` domains accept values of the parameter's type.

---

## Token Substitution Contract

The substitution pass replaces every `{{name}}` token in a SQL string with the parameter's current value, rendered as a SQL literal. Shared between frontend (client-side preview / unit tests) and backend (authoritative, runs before validator):

- Token regex: `/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g` — optional whitespace around the name, name must be a plain identifier.
- Unknown token names raise `UnknownParameterError` on backend / throw on frontend. No silent pass-through. No partial substitution.
- `string` / `date` values: quoted + single-quote-escaped (`'` → `''`).
- `number` values: rendered via `repr(v)` (Python) / `String(v)` (TS) — `Number.isFinite` gate rejects NaN / Infinity.
- `boolean` values: rendered as `TRUE` / `FALSE`.
- Total SQL length after substitution capped at `MAX_SUBSTITUTED_SQL_LEN = 100000` chars — prevents pathological value blow-ups.

**Security invariant:** substitution is always followed by `SQLValidator.validate()` on the final string. An adversarial value like `'; DROP TABLE users--` is rendered as `''';DROP TABLE users--'` (a safely-quoted literal) and if somehow escaped into raw position would still be rejected by the multi-statement / keyword-blocklist / sqlglot AST / SELECT-only gates.

---

## File Map

**Create**
- `frontend/src/components/dashboard/freeform/lib/parameterTypes.ts`
- `frontend/src/components/dashboard/freeform/lib/parameterOps.ts`
- `frontend/src/components/dashboard/freeform/__tests__/parameterOps.test.ts`
- `frontend/src/components/dashboard/freeform/panels/ParametersPanel.jsx`
- `frontend/src/components/dashboard/freeform/panels/ParameterControl.jsx`
- `frontend/src/components/dashboard/freeform/__tests__/ParametersPanel.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/ParameterControl.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/ChangeParameterRuntime.integration.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/ParametersEndToEnd.integration.test.tsx`
- `backend/param_substitution.py`
- `backend/tests/test_param_substitution.py`
- `backend/tests/test_execute_parameters.py`
- `backend/tests/test_parameters_roundtrip.py`

**Modify**
- `frontend/src/store.js` — add `analystProParameters` CRUD + `setParameterValueAnalystPro`
- `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js` — wire `case 'change-parameter'`
- `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx` — watch parameters + pass through
- `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — mount `ParametersPanel`
- `frontend/src/api.js` — `executeSQL` gains `parameters` argument
- `backend/routers/query_routes.py` — `ExecuteRequest.parameters` + substitute call + audit event
- `backend/waterfall_router.py` — `route` / `route_sync` / `_route_sync_impl` accept `parameters=None` passthrough
- `backend/dashboard_migration.py` — preserve existing `parameters` list (mirrors Plan 4b T8 sets fix)

---

## Task Checklist

- [ ] T1. `parameterTypes.ts` — types + `MAX_PARAM_TOKEN_LENGTH`, `MAX_SUBSTITUTED_SQL_LEN` constants.
- [ ] T2. `parameterOps.ts` + TDD tests — `validateParamName`, `coerceValue`, `validateAgainstDomain`, `substituteParamTokens`.
- [ ] T3. Backend `param_substitution.py` + pytest — Python mirror of `substituteParamTokens`, includes adversarial quoting tests.
- [ ] T4. Store slice — `analystProParameters` CRUD + `setParameterValueAnalystPro`.
- [ ] T5. `ParameterControl.jsx` per-type widget + tests.
- [ ] T6. `ParametersPanel.jsx` create/edit/delete + tests.
- [ ] T7. Mount `ParametersPanel` in `AnalystProLayout` left rail.
- [ ] T8. Wire `useActionRuntime` `case 'change-parameter'` + integration test.
- [ ] T9. Backend `/queries/execute` accepts `parameters` map + substitution call + audit + pytest (incl. SQL-injection hardening).
- [ ] T10. `waterfall_router` `parameters=None` passthrough.
- [ ] T11. Frontend `api.executeSQL` accepts `parameters`; `AnalystProWorksheetTile` watches params and passes them through.
- [ ] T12. Persistence round-trip: `dashboard_migration.legacy_to_freeform_schema` preserves input parameters + pytest.
- [ ] T13. End-to-end integration test + frontend/backend smoke. Report counts.

---

## Task Specifications

### T1 — `parameterTypes.ts`

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/parameterTypes.ts`

**Goal:** type-only module plus two numeric constants (`MAX_PARAM_TOKEN_LENGTH`, `MAX_SUBSTITUTED_SQL_LEN`). Pure TypeScript — no runtime logic beyond the constants.

- [ ] **Step 1: Create the file**

Create `frontend/src/components/dashboard/freeform/lib/parameterTypes.ts`:

```ts
/**
 * Plan 4c: Parameters subsystem type definitions.
 *
 * A DashboardParameter is a named typed scalar that worksheet SQL can
 * reference via a {{name}} token. Substitution happens before SQLValidator
 * so the validator still sees the final string.
 */

export type ParamType = 'string' | 'number' | 'boolean' | 'date';

/** Scalar payload for a parameter. Dates are ISO-8601 strings. */
export type ParamValue = string | number | boolean;

export type ParamDomainList = { kind: 'list'; values: ParamValue[] };
export type ParamDomainRange = { kind: 'range'; min: number; max: number; step: number };
export type ParamDomainFree = { kind: 'free' };

export type ParamDomain = ParamDomainList | ParamDomainRange | ParamDomainFree;

export type DashboardParameter = {
  /** Stable id, generated by generateZoneId at creation. */
  id: string;
  /** Parameter name — matches /^[A-Za-z_][A-Za-z0-9_]*$/, unique (case-insensitive) within dashboard. */
  name: string;
  type: ParamType;
  value: ParamValue;
  domain: ParamDomain;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
};

/** Hard cap on a parameter name's length (keeps token regex bounded). */
export const MAX_PARAM_TOKEN_LENGTH = 64;

/**
 * Hard cap on the length of a SQL string post-substitution. Prevents a
 * pathologically long `list` domain value from blowing up a query. The
 * backend enforces the same cap.
 */
export const MAX_SUBSTITUTED_SQL_LEN = 100_000;
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd frontend
npm run test:chart-ir -- parameterTypes 2>&1 | head -30
```

Expected: no compile errors referencing `parameterTypes.ts`. "No tests found" is acceptable — T2 lands the tests.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/parameterTypes.ts
git commit -m "feat(analyst-pro): parameterTypes — DashboardParameter + ParamDomain (Plan 4c T1)"
```

---

### T2 — `parameterOps.ts` + TDD tests

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/parameterOps.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/parameterOps.test.ts`

**Goal:** pure React-free ops — name/domain validators, value coercion, and the token substitution helper. Returns new objects; never mutates input. SQL quoting rules MUST match `backend/param_substitution.py` exactly (T3 mirrors this).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/dashboard/freeform/__tests__/parameterOps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  validateParamName,
  coerceValue,
  validateAgainstDomain,
  substituteParamTokens,
  ParamSubstitutionError,
} from '../lib/parameterOps';
import type { DashboardParameter } from '../lib/parameterTypes';

const mkParam = (over: Partial<DashboardParameter> = {}): DashboardParameter => ({
  id: 'p1',
  name: 'region',
  type: 'string',
  value: 'West',
  domain: { kind: 'free' },
  createdAt: '2026-04-16T00:00:00Z',
  ...over,
});

describe('validateParamName', () => {
  it('accepts plain identifiers', () => {
    expect(validateParamName('region', [])).toEqual({ ok: true });
    expect(validateParamName('_year', [])).toEqual({ ok: true });
    expect(validateParamName('x1', [])).toEqual({ ok: true });
  });

  it('rejects empty / whitespace / punctuation / leading digit', () => {
    expect(validateParamName('', []).ok).toBe(false);
    expect(validateParamName('  ', []).ok).toBe(false);
    expect(validateParamName('bad name', []).ok).toBe(false);
    expect(validateParamName('1bad', []).ok).toBe(false);
    expect(validateParamName('a.b', []).ok).toBe(false);
  });

  it('rejects names longer than MAX_PARAM_TOKEN_LENGTH', () => {
    const long = 'x'.repeat(65);
    expect(validateParamName(long, []).ok).toBe(false);
  });

  it('rejects case-insensitive duplicates', () => {
    const existing = [mkParam()];
    expect(validateParamName('REGION', existing)).toEqual({ ok: false, reason: 'duplicate' });
    expect(validateParamName('Region', existing)).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('ignores the param being renamed when its own id is passed', () => {
    const existing = [mkParam()];
    expect(validateParamName('region', existing, 'p1')).toEqual({ ok: true });
  });
});

describe('coerceValue', () => {
  it('string: accepts strings, stringifies numbers/booleans', () => {
    expect(coerceValue('string', 'hi')).toBe('hi');
    expect(coerceValue('string', 42)).toBe('42');
    expect(coerceValue('string', true)).toBe('true');
  });

  it('number: accepts finite numbers; parses numeric strings; rejects NaN/Infinity', () => {
    expect(coerceValue('number', 12)).toBe(12);
    expect(coerceValue('number', '3.14')).toBeCloseTo(3.14);
    expect(() => coerceValue('number', 'abc')).toThrow();
    expect(() => coerceValue('number', Number.POSITIVE_INFINITY)).toThrow();
    expect(() => coerceValue('number', Number.NaN)).toThrow();
  });

  it('boolean: normalises "true"/"false" strings and booleans', () => {
    expect(coerceValue('boolean', true)).toBe(true);
    expect(coerceValue('boolean', 'true')).toBe(true);
    expect(coerceValue('boolean', 'FALSE')).toBe(false);
    expect(() => coerceValue('boolean', 'maybe')).toThrow();
  });

  it('date: accepts ISO-8601, rejects free-form garbage', () => {
    expect(coerceValue('date', '2026-04-16')).toBe('2026-04-16');
    expect(coerceValue('date', '2026-04-16T12:00:00Z')).toBe('2026-04-16T12:00:00Z');
    expect(() => coerceValue('date', 'not-a-date')).toThrow();
  });
});

describe('validateAgainstDomain', () => {
  it('list domain: accepts listed values, rejects others', () => {
    const p = mkParam({ domain: { kind: 'list', values: ['East', 'West'] } });
    expect(validateAgainstDomain(p, 'West')).toEqual({ ok: true });
    expect(validateAgainstDomain(p, 'North')).toEqual({ ok: false, error: 'not-in-list' });
  });

  it('range domain: accepts within range, rejects outside', () => {
    const p = mkParam({ type: 'number', value: 5, domain: { kind: 'range', min: 0, max: 10, step: 1 } });
    expect(validateAgainstDomain(p, 5)).toEqual({ ok: true });
    expect(validateAgainstDomain(p, 11)).toEqual({ ok: false, error: 'out-of-range' });
    expect(validateAgainstDomain(p, -1)).toEqual({ ok: false, error: 'out-of-range' });
  });

  it('range domain: rejects non-number value types', () => {
    const p = mkParam({ type: 'number', value: 5, domain: { kind: 'range', min: 0, max: 10, step: 1 } });
    // @ts-expect-error — runtime guard
    expect(validateAgainstDomain(p, 'five').ok).toBe(false);
  });

  it('free domain: accepts any value whose type matches param.type', () => {
    const p = mkParam({ type: 'string', domain: { kind: 'free' } });
    expect(validateAgainstDomain(p, 'anything')).toEqual({ ok: true });
  });
});

describe('substituteParamTokens', () => {
  it('replaces {{name}} with a quoted string value', () => {
    const sql = 'SELECT * FROM sales WHERE region = {{region}}';
    const out = substituteParamTokens(sql, [mkParam()]);
    expect(out).toBe("SELECT * FROM sales WHERE region = 'West'");
  });

  it('replaces {{name}} with a number literal', () => {
    const sql = 'SELECT * FROM sales WHERE year = {{year}}';
    const out = substituteParamTokens(sql, [mkParam({ id: 'p2', name: 'year', type: 'number', value: 2026 })]);
    expect(out).toBe('SELECT * FROM sales WHERE year = 2026');
  });

  it('replaces {{name}} with a boolean literal', () => {
    const sql = 'SELECT * FROM t WHERE active = {{active}}';
    const out = substituteParamTokens(sql, [mkParam({ id: 'p3', name: 'active', type: 'boolean', value: true })]);
    expect(out).toBe('SELECT * FROM t WHERE active = TRUE');
  });

  it('escapes single-quotes in string values', () => {
    const sql = 'SELECT * FROM t WHERE name = {{n}}';
    const out = substituteParamTokens(sql, [mkParam({ id: 'p4', name: 'n', type: 'string', value: "O'Brien" })]);
    expect(out).toBe("SELECT * FROM t WHERE name = 'O''Brien'");
  });

  it('tolerates whitespace inside the token', () => {
    const sql = 'SELECT {{ region }} FROM t';
    const out = substituteParamTokens(sql, [mkParam()]);
    expect(out).toBe("SELECT 'West' FROM t");
  });

  it('throws on unknown token names', () => {
    const sql = 'SELECT * FROM t WHERE x = {{ghost}}';
    expect(() => substituteParamTokens(sql, [mkParam()])).toThrow(ParamSubstitutionError);
  });

  it('leaves SQL untouched when no tokens exist', () => {
    const sql = 'SELECT * FROM t';
    const out = substituteParamTokens(sql, [mkParam()]);
    expect(out).toBe(sql);
  });

  it('renders a malicious string value as a safely-quoted literal', () => {
    const sql = 'SELECT * FROM t WHERE x = {{n}}';
    const bad = "'; DROP TABLE users--";
    const out = substituteParamTokens(sql, [mkParam({ id: 'p5', name: 'n', type: 'string', value: bad })]);
    // The inner single-quote must be doubled, and the whole thing is inside ' ... '.
    expect(out).toBe("SELECT * FROM t WHERE x = '''; DROP TABLE users--'");
    expect(out).not.toContain("';");
  });

  it('replaces multiple occurrences of the same token', () => {
    const sql = 'SELECT {{region}} AS a, {{region}} AS b';
    const out = substituteParamTokens(sql, [mkParam()]);
    expect(out).toBe("SELECT 'West' AS a, 'West' AS b");
  });

  it('throws when the post-substitution SQL exceeds MAX_SUBSTITUTED_SQL_LEN', () => {
    const sql = 'SELECT {{n}} FROM t';
    const giant = 'x'.repeat(200_000);
    expect(() =>
      substituteParamTokens(sql, [mkParam({ id: 'p6', name: 'n', type: 'string', value: giant })]),
    ).toThrow(ParamSubstitutionError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npm run test:chart-ir -- parameterOps
```

Expected: FAIL — module `../lib/parameterOps` not found.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/dashboard/freeform/lib/parameterOps.ts`:

```ts
import {
  MAX_PARAM_TOKEN_LENGTH,
  MAX_SUBSTITUTED_SQL_LEN,
  type DashboardParameter,
  type ParamDomain,
  type ParamType,
  type ParamValue,
} from './parameterTypes';

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export class ParamSubstitutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParamSubstitutionError';
  }
}

export type NameValidation =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'invalid' | 'too-long' | 'duplicate' };

/**
 * Validate a prospective parameter name. Pass `ignoreId` when renaming so
 * the param's own current name is not counted as a collision.
 */
export function validateParamName(
  name: string,
  existing: readonly DashboardParameter[],
  ignoreId?: string,
): NameValidation {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > MAX_PARAM_TOKEN_LENGTH) return { ok: false, reason: 'too-long' };
  if (!IDENT_RE.test(trimmed)) return { ok: false, reason: 'invalid' };

  const lower = trimmed.toLowerCase();
  for (const p of existing) {
    if (ignoreId && p.id === ignoreId) continue;
    if (p.name.trim().toLowerCase() === lower) {
      return { ok: false, reason: 'duplicate' };
    }
  }
  return { ok: true };
}

/**
 * Coerce a raw user-entered value to the typed form demanded by `type`.
 * Throws when coercion is impossible (e.g. "abc" for a number parameter).
 */
export function coerceValue(type: ParamType, raw: unknown): ParamValue {
  switch (type) {
    case 'string':
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
      throw new ParamSubstitutionError(`Cannot coerce ${typeof raw} to string`);
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        throw new ParamSubstitutionError(`Cannot coerce ${String(raw)} to finite number`);
      }
      return n;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'string') {
        const low = raw.toLowerCase();
        if (low === 'true') return true;
        if (low === 'false') return false;
      }
      throw new ParamSubstitutionError(`Cannot coerce ${String(raw)} to boolean`);
    case 'date':
      if (typeof raw === 'string' && ISO_DATE_RE.test(raw)) return raw;
      throw new ParamSubstitutionError(`Cannot coerce ${String(raw)} to ISO-8601 date`);
  }
}

export type DomainValidation =
  | { ok: true }
  | { ok: false; error: 'not-in-list' | 'out-of-range' | 'type-mismatch' };

export function validateAgainstDomain(
  param: DashboardParameter,
  value: ParamValue,
): DomainValidation {
  const domain: ParamDomain = param.domain;
  switch (domain.kind) {
    case 'list':
      return domain.values.includes(value)
        ? { ok: true }
        : { ok: false, error: 'not-in-list' };
    case 'range':
      if (typeof value !== 'number') return { ok: false, error: 'type-mismatch' };
      return value >= domain.min && value <= domain.max
        ? { ok: true }
        : { ok: false, error: 'out-of-range' };
    case 'free':
      return { ok: true };
  }
}

function renderSqlLiteral(param: DashboardParameter): string {
  const v = param.value;
  switch (param.type) {
    case 'boolean':
      return v ? 'TRUE' : 'FALSE';
    case 'number': {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) {
        throw new ParamSubstitutionError(
          `Parameter ${param.name}: non-finite number ${String(v)}`,
        );
      }
      return String(n);
    }
    case 'string':
    case 'date': {
      const s = typeof v === 'string' ? v : String(v);
      return `'${s.replace(/'/g, "''")}'`;
    }
  }
}

/**
 * Replace every `{{name}}` token in `sql` with the matching parameter's
 * SQL literal. Unknown token names throw. Whitespace inside the braces is
 * tolerated. Returns a new string.
 *
 * Security: the result is still passed through SQLValidator downstream.
 * Values are quoted + single-quote-escaped so they cannot escape the
 * literal context.
 */
export function substituteParamTokens(
  sql: string,
  parameters: readonly DashboardParameter[],
): string {
  if (typeof sql !== 'string' || sql.length === 0) return sql;
  if (!sql.includes('{{')) return sql;

  const byName = new Map<string, DashboardParameter>();
  for (const p of parameters) byName.set(p.name, p);

  let threw: Error | null = null;
  const replaced = sql.replace(TOKEN_RE, (_match, rawName: string) => {
    const name = rawName.trim();
    const param = byName.get(name);
    if (!param) {
      threw = new ParamSubstitutionError(`Unknown parameter token: {{${name}}}`);
      return '';
    }
    try {
      return renderSqlLiteral(param);
    } catch (err) {
      threw = err instanceof Error ? err : new ParamSubstitutionError(String(err));
      return '';
    }
  });

  if (threw) throw threw;
  if (replaced.length > MAX_SUBSTITUTED_SQL_LEN) {
    throw new ParamSubstitutionError(
      `Substituted SQL exceeds ${MAX_SUBSTITUTED_SQL_LEN} chars`,
    );
  }
  return replaced;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
npm run test:chart-ir -- parameterOps
```

Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/parameterTypes.ts \
        frontend/src/components/dashboard/freeform/lib/parameterOps.ts \
        frontend/src/components/dashboard/freeform/__tests__/parameterOps.test.ts
git commit -m "feat(analyst-pro): parameterOps lib — validate/coerce/substitute + TDD (Plan 4c T2)"
```

---

### T3 — Backend `param_substitution.py` + pytest

**Files:**
- Create: `backend/param_substitution.py`
- Create: `backend/tests/test_param_substitution.py`

**Goal:** authoritative Python mirror of `substituteParamTokens`. Adversarial quoting tests. Output feeds `SQLValidator` and then `sql_filter_injector`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_param_substitution.py`:

```python
import pytest

from param_substitution import (
    substitute_param_tokens,
    UnknownParameterError,
    InvalidParameterError,
    MAX_SUBSTITUTED_SQL_LEN,
)


def _p(name, ptype, value):
    return {"id": f"p_{name}", "name": name, "type": ptype, "value": value}


class TestSubstituteParamTokens:
    def test_empty_sql_passthrough(self):
        assert substitute_param_tokens("", []) == ""

    def test_no_tokens_passthrough(self):
        sql = "SELECT * FROM t"
        assert substitute_param_tokens(sql, []) == sql

    def test_string_substitution_quotes_and_escapes(self):
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE region = {{region}}",
            [_p("region", "string", "West")],
        )
        assert out == "SELECT * FROM t WHERE region = 'West'"

    def test_number_substitution(self):
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE year = {{year}}",
            [_p("year", "number", 2026)],
        )
        assert out == "SELECT * FROM t WHERE year = 2026"

    def test_boolean_substitution(self):
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE flag = {{f}}",
            [_p("f", "boolean", True)],
        )
        assert out == "SELECT * FROM t WHERE flag = TRUE"

    def test_date_substitution(self):
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE d = {{d}}",
            [_p("d", "date", "2026-04-16")],
        )
        assert out == "SELECT * FROM t WHERE d = '2026-04-16'"

    def test_whitespace_inside_token(self):
        out = substitute_param_tokens(
            "SELECT {{  region  }} FROM t",
            [_p("region", "string", "West")],
        )
        assert out == "SELECT 'West' FROM t"

    def test_multiple_occurrences(self):
        out = substitute_param_tokens(
            "SELECT {{region}} AS a, {{region}} AS b",
            [_p("region", "string", "West")],
        )
        assert out == "SELECT 'West' AS a, 'West' AS b"

    def test_unknown_token_raises(self):
        with pytest.raises(UnknownParameterError):
            substitute_param_tokens(
                "SELECT {{ghost}} FROM t",
                [_p("region", "string", "West")],
            )

    def test_injection_attempt_renders_as_quoted_literal(self):
        bad = "'; DROP TABLE users--"
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE x = {{n}}",
            [_p("n", "string", bad)],
        )
        # Inner ' is doubled, the whole thing stays inside ' … '.
        assert out == "SELECT * FROM t WHERE x = '''; DROP TABLE users--'"
        # A closing-quote + semicolon pattern should NOT appear outside of
        # a quoted literal position.
        assert "';" not in out

    def test_nonfinite_number_rejected(self):
        with pytest.raises(InvalidParameterError):
            substitute_param_tokens(
                "SELECT {{x}} FROM t",
                [_p("x", "number", float("inf"))],
            )

    def test_invalid_date_rejected(self):
        with pytest.raises(InvalidParameterError):
            substitute_param_tokens(
                "SELECT {{d}} FROM t",
                [_p("d", "date", "not-a-date")],
            )

    def test_invalid_name_in_parameters_list_is_skipped_then_token_unknown(self):
        # A parameter whose name is not a valid identifier is ignored; a
        # token referencing it therefore resolves as unknown.
        with pytest.raises(UnknownParameterError):
            substitute_param_tokens(
                "SELECT {{region}} FROM t",
                [_p("bad name", "string", "West")],
            )

    def test_length_cap_enforced(self):
        huge = "x" * (MAX_SUBSTITUTED_SQL_LEN + 10)
        with pytest.raises(InvalidParameterError):
            substitute_param_tokens(
                "SELECT {{n}} FROM t",
                [_p("n", "string", huge)],
            )

    def test_non_string_sql_rejected(self):
        with pytest.raises(InvalidParameterError):
            substitute_param_tokens(None, [])  # type: ignore[arg-type]

    def test_parameters_dict_form_accepted(self):
        # We also accept a dict {name: param_dict} for convenience — the
        # query route sends this shape.
        out = substitute_param_tokens(
            "SELECT {{n}} FROM t",
            {"n": {"id": "p1", "name": "n", "type": "number", "value": 5}},
        )
        assert out == "SELECT 5 FROM t"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
python -m pytest tests/test_param_substitution.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'param_substitution'`.

- [ ] **Step 3: Write the implementation**

Create `backend/param_substitution.py`:

```python
"""
param_substitution.py — safe `{{name}}` token substitution for Analyst Pro
parameters. Runs BEFORE SQLValidator so the validator sees the final SQL.

- Token regex: r"\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}" .
- Unknown tokens raise UnknownParameterError. No silent pass-through.
- string / date values are single-quote-escaped and wrapped in quotes.
- number values must be finite; repr() renders them.
- boolean values render as TRUE / FALSE.
- Post-substitution length is capped at MAX_SUBSTITUTED_SQL_LEN.

This module performs no execution — it returns a new SQL string.
"""

from __future__ import annotations

import math
import re
from typing import Any, Iterable, Mapping

_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_TOKEN_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")
_ISO_DATE_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$"
)

MAX_SUBSTITUTED_SQL_LEN = 100_000
MAX_PARAM_TOKEN_LENGTH = 64


class UnknownParameterError(ValueError):
    """Raised when a {{name}} token has no matching parameter."""


class InvalidParameterError(ValueError):
    """Raised when a parameter dict is malformed or a value is out of range."""


def _render_literal(param: Mapping[str, Any]) -> str:
    ptype = param.get("type")
    value = param.get("value")
    name = param.get("name", "?")

    if ptype == "boolean":
        if not isinstance(value, bool):
            raise InvalidParameterError(
                f"Parameter {name!r} type=boolean but value is {type(value).__name__}"
            )
        return "TRUE" if value else "FALSE"

    if ptype == "number":
        if isinstance(value, bool):  # bool is int subclass — exclude
            raise InvalidParameterError(
                f"Parameter {name!r} type=number received a boolean value"
            )
        if not isinstance(value, (int, float)):
            raise InvalidParameterError(
                f"Parameter {name!r} type=number but value is {type(value).__name__}"
            )
        if not math.isfinite(float(value)):
            raise InvalidParameterError(
                f"Parameter {name!r} type=number must be finite"
            )
        return repr(value)

    if ptype == "string":
        s = value if isinstance(value, str) else str(value)
        escaped = s.replace("'", "''")
        return f"'{escaped}'"

    if ptype == "date":
        if not isinstance(value, str) or not _ISO_DATE_RE.match(value):
            raise InvalidParameterError(
                f"Parameter {name!r} type=date must be ISO-8601"
            )
        escaped = value.replace("'", "''")
        return f"'{escaped}'"

    raise InvalidParameterError(
        f"Parameter {name!r} has unknown type {ptype!r}"
    )


def _normalize_params(
    parameters: Iterable[Mapping[str, Any]] | Mapping[str, Mapping[str, Any]] | None,
) -> dict[str, Mapping[str, Any]]:
    """
    Accept either an iterable of param dicts or a {name: param_dict} mapping.
    Returns {name: param_dict} limited to parameters whose name is a valid
    plain SQL identifier (invalid ones are silently dropped so the token
    substitution step can report them as unknown if referenced).
    """
    if parameters is None:
        return {}
    by_name: dict[str, Mapping[str, Any]] = {}
    if isinstance(parameters, Mapping):
        iterable = parameters.values()
    else:
        iterable = parameters
    for p in iterable:
        if not isinstance(p, Mapping):
            continue
        name = p.get("name")
        if not isinstance(name, str) or not _IDENT_RE.match(name):
            continue
        if len(name) > MAX_PARAM_TOKEN_LENGTH:
            continue
        by_name[name] = p
    return by_name


def substitute_param_tokens(
    sql: str,
    parameters: Iterable[Mapping[str, Any]]
    | Mapping[str, Mapping[str, Any]]
    | None,
) -> str:
    """
    Replace every `{{name}}` token in *sql* with the matching parameter's
    SQL literal. Raises UnknownParameterError when a referenced token has
    no matching parameter, and InvalidParameterError when a parameter is
    malformed or produces a value longer than MAX_SUBSTITUTED_SQL_LEN.
    """
    if not isinstance(sql, str):
        raise InvalidParameterError("sql must be a string")
    if "{{" not in sql:
        return sql

    by_name = _normalize_params(parameters)
    errors: list[Exception] = []

    def _repl(match: re.Match[str]) -> str:
        name = match.group(1)
        param = by_name.get(name)
        if param is None:
            errors.append(UnknownParameterError(f"Unknown parameter token: {{{{{name}}}}}"))
            return ""
        try:
            return _render_literal(param)
        except Exception as exc:  # noqa: BLE001 — re-raised below
            errors.append(exc)
            return ""

    replaced = _TOKEN_RE.sub(_repl, sql)

    if errors:
        # Surface the first error (deterministic).
        raise errors[0]

    if len(replaced) > MAX_SUBSTITUTED_SQL_LEN:
        raise InvalidParameterError(
            f"Substituted SQL exceeds {MAX_SUBSTITUTED_SQL_LEN} chars"
        )
    return replaced
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
python -m pytest tests/test_param_substitution.py -v
```

Expected: PASS (16 tests).

- [ ] **Step 5: Full backend smoke (no regressions)**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green vs. tip of `askdb-global-comp`.

- [ ] **Step 6: Commit**

```bash
git add backend/param_substitution.py backend/tests/test_param_substitution.py
git commit -m "feat(analyst-pro): param_substitution backend helper + pytest (Plan 4c T3)"
```

---

### T4 — Store slice: `analystProParameters` + CRUD

**Files:**
- Modify: `frontend/src/store.js`

**Goal:** add CRUD actions that mutate `analystProDashboard.parameters`. Validation via `parameterOps`. Every mutation pushes an `analystProHistory` snapshot.

- [ ] **Step 1: Locate the Plan 4b block**

Open `frontend/src/store.js`. Search for `applySetChangeAnalystPro` — the new Plan 4c block goes immediately below that action (and before `analystProHistory: null`).

- [ ] **Step 2: Add the import at the top of the file**

Near the existing `import { applySetChange } from './components/dashboard/freeform/lib/setOps';` line, add:

```js
import {
  validateParamName,
  coerceValue,
  validateAgainstDomain,
} from './components/dashboard/freeform/lib/parameterOps';
```

- [ ] **Step 3: Paste the slice block**

Add the following block immediately after `applySetChangeAnalystPro` and before `analystProHistory: null`:

```js
// Plan 4c: Parameters subsystem. Parameters live inside
// analystProDashboard.parameters so the existing save/load path carries
// them for free. Every mutation also pushes an undo snapshot.

addParameterAnalystPro: (param) => {
  const dash = get().analystProDashboard;
  if (!dash || !param || !param.id || !param.name) return;
  const existing = dash.parameters || [];
  const check = validateParamName(param.name, existing);
  if (!check.ok) return;
  const nextDash = { ...dash, parameters: [...existing, param] };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},

updateParameterAnalystPro: (paramId, patch) => {
  const dash = get().analystProDashboard;
  if (!dash || !paramId || !patch) return;
  const existing = dash.parameters || [];
  const target = existing.find((p) => p.id === paramId);
  if (!target) return;
  if (patch.name) {
    const check = validateParamName(patch.name, existing, paramId);
    if (!check.ok) return;
  }
  const nextParam = { ...target, ...patch };
  const next = existing.map((p) => (p.id === paramId ? nextParam : p));
  const nextDash = { ...dash, parameters: next };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},

deleteParameterAnalystPro: (paramId) => {
  const dash = get().analystProDashboard;
  if (!dash || !paramId) return;
  const existing = dash.parameters || [];
  const next = existing.filter((p) => p.id !== paramId);
  const nextDash = { ...dash, parameters: next };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},

setParameterValueAnalystPro: (paramId, rawValue) => {
  const dash = get().analystProDashboard;
  if (!dash || !paramId) return;
  const existing = dash.parameters || [];
  const target = existing.find((p) => p.id === paramId);
  if (!target) return;
  let coerced;
  try {
    coerced = coerceValue(target.type, rawValue);
  } catch {
    return;
  }
  const domainCheck = validateAgainstDomain(target, coerced);
  if (!domainCheck.ok) return;
  const nextParam = { ...target, value: coerced };
  const next = existing.map((p) => (p.id === paramId ? nextParam : p));
  const nextDash = { ...dash, parameters: next };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash);
},
```

- [ ] **Step 4: Lint**

```bash
cd frontend
npm run lint -- --max-warnings=0 src/store.js
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js
git commit -m "feat(analyst-pro): store slice — analystProParameters CRUD (Plan 4c T4)"
```

---

### T5 — `ParameterControl.jsx` per-parameter widget

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/ParameterControl.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ParameterControl.test.tsx`

**Goal:** single component that dispatches on `param.type` + `param.domain.kind` and renders the correct widget. Fires `setParameterValueAnalystPro(param.id, rawValue)` on every commit.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/dashboard/freeform/__tests__/ParameterControl.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import ParameterControl from '../panels/ParameterControl';
import { useStore } from '../../../../store';

function seed(parameters) {
  useStore.setState({
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters,
      sets: [],
      actions: [],
    },
    analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
  });
}

describe('ParameterControl', () => {
  beforeEach(() => {
    seed([]);
  });

  it('renders a <select> for a list domain and commits a new value on change', () => {
    const p = {
      id: 'p1', name: 'region', type: 'string',
      value: 'West',
      domain: { kind: 'list', values: ['East', 'West', 'North'] },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const select = screen.getByRole('combobox', { name: /region/i });
    fireEvent.change(select, { target: { value: 'East' } });
    expect(spy).toHaveBeenCalledWith('p1', 'East');
    spy.mockRestore();
  });

  it('renders a slider for a range domain and commits numeric values', () => {
    const p = {
      id: 'p2', name: 'threshold', type: 'number',
      value: 5,
      domain: { kind: 'range', min: 0, max: 10, step: 1 },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const slider = screen.getByRole('slider', { name: /threshold/i });
    fireEvent.change(slider, { target: { value: '7' } });
    // coerceValue stringifies internally — we pass the raw value; the store
    // slice does the coercion. Spy must receive the raw string.
    expect(spy).toHaveBeenCalledWith('p2', '7');
    spy.mockRestore();
  });

  it('renders a checkbox for a boolean parameter', () => {
    const p = {
      id: 'p3', name: 'active', type: 'boolean',
      value: false,
      domain: { kind: 'free' },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const cb = screen.getByRole('checkbox', { name: /active/i });
    fireEvent.click(cb);
    expect(spy).toHaveBeenCalledWith('p3', true);
    spy.mockRestore();
  });

  it('renders a date input for a date parameter', () => {
    const p = {
      id: 'p4', name: 'asof', type: 'date',
      value: '2026-04-16',
      domain: { kind: 'free' },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const input = screen.getByLabelText(/asof/i);
    expect(input).toHaveProperty('type', 'date');
    fireEvent.change(input, { target: { value: '2026-05-01' } });
    expect(spy).toHaveBeenCalledWith('p4', '2026-05-01');
    spy.mockRestore();
  });

  it('renders a text input for a free string parameter', () => {
    const p = {
      id: 'p5', name: 'label', type: 'string',
      value: 'hi',
      domain: { kind: 'free' },
      createdAt: '2026-04-16T00:00:00Z',
    };
    seed([p]);
    const spy = vi.spyOn(useStore.getState(), 'setParameterValueAnalystPro');
    render(<ParameterControl param={p} />);
    const input = screen.getByLabelText(/label/i);
    fireEvent.change(input, { target: { value: 'there' } });
    // Text input fires on every keystroke — we only care the value arrives.
    expect(spy).toHaveBeenLastCalledWith('p5', 'there');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npm run test:chart-ir -- ParameterControl
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/dashboard/freeform/panels/ParameterControl.jsx`:

```jsx
import React from 'react';
import { useStore } from '../../../../store';

/**
 * ParameterControl — per-parameter widget that commits value edits through
 * setParameterValueAnalystPro. Widget is chosen by param.domain.kind then
 * param.type. The store slice handles coercion + domain validation, so we
 * pass the raw DOM value up without intermediate coercion here.
 */
export default function ParameterControl({ param }) {
  const setValue = useStore((s) => s.setParameterValueAnalystPro);
  if (!param) return null;
  const label = param.name;
  const base = {
    padding: '4px 6px',
    fontSize: 12,
    background: 'var(--bg-input, #0b0b10)',
    color: 'inherit',
    border: '1px solid var(--border-default, #333)',
    borderRadius: 3,
    width: '100%',
  };

  if (param.domain.kind === 'list') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
        <span style={{ opacity: 0.7 }}>{label}</span>
        <select
          aria-label={label}
          value={String(param.value)}
          onChange={(e) => setValue(param.id, e.target.value)}
          style={base}
        >
          {param.domain.values.map((v) => (
            <option key={String(v)} value={String(v)}>{String(v)}</option>
          ))}
        </select>
      </label>
    );
  }

  if (param.domain.kind === 'range' && param.type === 'number') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
        <span style={{ opacity: 0.7 }}>
          {label} <span style={{ opacity: 0.7 }}>({String(param.value)})</span>
        </span>
        <input
          type="range"
          aria-label={label}
          min={param.domain.min}
          max={param.domain.max}
          step={param.domain.step}
          value={typeof param.value === 'number' ? param.value : Number(param.value) || 0}
          onChange={(e) => setValue(param.id, e.target.value)}
        />
      </label>
    );
  }

  if (param.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
        <input
          type="checkbox"
          aria-label={label}
          checked={!!param.value}
          onChange={(e) => setValue(param.id, e.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }

  if (param.type === 'date') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
        <span style={{ opacity: 0.7 }}>{label}</span>
        <input
          type="date"
          aria-label={label}
          value={typeof param.value === 'string' ? param.value.slice(0, 10) : ''}
          onChange={(e) => setValue(param.id, e.target.value)}
          style={base}
        />
      </label>
    );
  }

  // Fallback: free text for string / number free domains.
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <input
        type={param.type === 'number' ? 'number' : 'text'}
        aria-label={label}
        value={String(param.value ?? '')}
        onChange={(e) => setValue(param.id, e.target.value)}
        style={base}
      />
    </label>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
npm run test:chart-ir -- ParameterControl
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/ParameterControl.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ParameterControl.test.tsx
git commit -m "feat(analyst-pro): ParameterControl per-type widget (Plan 4c T5)"
```

---

### T6 — `ParametersPanel.jsx` left-rail panel

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/ParametersPanel.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ParametersPanel.test.tsx`

**Goal:** left-rail panel listing every parameter with its `ParameterControl` inline. A "+ New Parameter" form captures name / type / domain. Each row has Delete. Name & domain validated before create.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/dashboard/freeform/__tests__/ParametersPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

import ParametersPanel from '../panels/ParametersPanel';
import { useStore } from '../../../../store';

function seed(parameters = []) {
  useStore.setState({
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters,
      sets: [],
      actions: [],
    },
    analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
  });
}

const demoParam = {
  id: 'p1', name: 'region', type: 'string',
  value: 'West',
  domain: { kind: 'list', values: ['East', 'West'] },
  createdAt: '2026-04-16T00:00:00Z',
};

describe('ParametersPanel', () => {
  beforeEach(() => seed());

  it('renders the Parameters heading and empty-state copy', () => {
    render(<ParametersPanel />);
    expect(screen.getByRole('heading', { name: /parameters/i })).toBeTruthy();
    expect(screen.getByText(/no parameters yet/i)).toBeTruthy();
  });

  it('+ New Parameter opens the create form with name/type/domain fields', () => {
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new parameter/i }));
    expect(screen.getByPlaceholderText(/parameter name/i)).toBeTruthy();
    expect(screen.getByLabelText(/type/i)).toBeTruthy();
  });

  it('Create adds a new parameter via addParameterAnalystPro', () => {
    const spy = vi.spyOn(useStore.getState(), 'addParameterAnalystPro');
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new parameter/i }));
    fireEvent.change(screen.getByPlaceholderText(/parameter name/i), { target: { value: 'year' } });
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'number' } });
    // free domain by default
    fireEvent.change(screen.getByPlaceholderText(/initial value/i), { target: { value: '2026' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg).toMatchObject({ name: 'year', type: 'number', value: 2026 });
    expect(arg.id).toBeTruthy();
    expect(arg.createdAt).toBeTruthy();
    spy.mockRestore();
  });

  it('rejects duplicate names (case-insensitive)', () => {
    seed([demoParam]);
    const spy = vi.spyOn(useStore.getState(), 'addParameterAnalystPro');
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new parameter/i }));
    fireEvent.change(screen.getByPlaceholderText(/parameter name/i), { target: { value: 'REGION' } });
    fireEvent.change(screen.getByPlaceholderText(/initial value/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/i)).toBeTruthy();
    spy.mockRestore();
  });

  it('rejects invalid names', () => {
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new parameter/i }));
    fireEvent.change(screen.getByPlaceholderText(/parameter name/i), { target: { value: 'bad name' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(screen.getByText(/invalid name/i)).toBeTruthy();
  });

  it('lists existing parameters with a ParameterControl and Delete button', () => {
    seed([demoParam]);
    render(<ParametersPanel />);
    const row = screen.getByTestId('parameter-row-p1');
    expect(within(row).getByRole('combobox', { name: /region/i })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /delete/i })).toBeTruthy();
  });

  it('Delete calls deleteParameterAnalystPro after confirm', () => {
    seed([demoParam]);
    const spy = vi.spyOn(useStore.getState(), 'deleteParameterAnalystPro');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ParametersPanel />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(spy).toHaveBeenCalledWith('p1');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npm run test:chart-ir -- ParametersPanel
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/dashboard/freeform/panels/ParametersPanel.jsx`:

```jsx
import React, { useState } from 'react';
import { useStore } from '../../../../store';
import ParameterControl from './ParameterControl';
import { validateParamName, coerceValue } from '../lib/parameterOps';
import { generateZoneId } from '../lib/zoneTree';

const TYPE_OPTIONS = ['string', 'number', 'boolean', 'date'];

/**
 * ParametersPanel — left-rail panel for DashboardParameters. Create with
 * name / type / initial value (free domain). Delete with confirm. Each
 * row renders a ParameterControl for live value editing. Domain-limited
 * parameters (list, range) are created here with the free domain; list
 * and range editing is in the per-row edit affordance (future — Plan 5).
 *
 * Plan 4c scope: free-domain create path + per-row delete + live value
 * edit through ParameterControl. List + range domains are authorable via
 * the raw state (store action) and render correctly here; the create form
 * itself exposes only `free` to keep the surface small.
 */
export default function ParametersPanel() {
  const parameters = useStore((s) => s.analystProDashboard?.parameters || []);
  const addParam = useStore((s) => s.addParameterAnalystPro);
  const deleteParam = useStore((s) => s.deleteParameterAnalystPro);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('string');
  const [newInitial, setNewInitial] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setCreating(false);
    setNewName('');
    setNewType('string');
    setNewInitial('');
    setError('');
  };

  const submit = () => {
    const check = validateParamName(newName, parameters);
    if (!check.ok) {
      if (check.reason === 'duplicate') setError('A parameter with that name already exists');
      else if (check.reason === 'empty') setError('Name is required');
      else setError('Invalid name — use letters, digits, underscores');
      return;
    }
    let initial;
    try {
      initial = coerceValue(newType, newInitial === '' ? defaultForType(newType) : newInitial);
    } catch {
      setError(`Invalid initial value for type ${newType}`);
      return;
    }
    addParam({
      id: generateZoneId(),
      name: newName.trim(),
      type: newType,
      value: initial,
      domain: { kind: 'free' },
      createdAt: new Date().toISOString(),
    });
    reset();
  };

  const handleDelete = (paramId) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this parameter?')) return;
    deleteParam(paramId);
  };

  return (
    <aside
      aria-label="Parameters"
      style={{
        borderTop: '1px solid var(--border-default, #333)',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
          Parameters
        </h3>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              background: 'transparent',
              color: 'var(--accent, #4f7)',
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            + New Parameter
          </button>
        )}
      </div>

      {creating && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 6,
            border: '1px solid var(--border-default, #333)',
            borderRadius: 4,
          }}
        >
          <input
            type="text"
            placeholder="Parameter name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={inputStyle}
          />
          <label style={{ fontSize: 11, opacity: 0.7 }}>
            Type
            <select
              aria-label="Type"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              style={{ ...inputStyle, marginTop: 2 }}
            >
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <input
            type="text"
            placeholder="Initial value"
            value={newInitial}
            onChange={(e) => setNewInitial(e.target.value)}
            style={inputStyle}
          />
          {error && <div style={{ color: 'var(--danger, #f87171)', fontSize: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button type="button" onClick={reset} style={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} style={btnPrimary}>Create</button>
          </div>
        </div>
      )}

      {parameters.length === 0 && !creating && (
        <div style={{ fontSize: 11, opacity: 0.55, padding: '4px 2px' }}>No parameters yet</div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {parameters.map((p) => (
          <li
            key={p.id}
            data-testid={`parameter-row-${p.id}`}
            style={{
              padding: 6,
              borderRadius: 4,
              border: '1px solid var(--border-subtle, #222)',
              background: 'var(--bg-subtle, transparent)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <ParameterControl param={p} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                aria-label={`Delete ${p.name}`}
                style={{ ...btnGhost, color: 'var(--danger, #f87171)', borderColor: 'var(--danger, #f87171)' }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function defaultForType(t) {
  switch (t) {
    case 'number': return '0';
    case 'boolean': return 'false';
    case 'date': return new Date().toISOString().slice(0, 10);
    case 'string':
    default: return '';
  }
}

const inputStyle = {
  padding: 4,
  fontSize: 12,
  background: 'var(--bg-input, #0b0b10)',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
};

const btnGhost = {
  padding: '2px 8px',
  fontSize: 11,
  background: 'transparent',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
  borderRadius: 3,
  cursor: 'pointer',
};

const btnPrimary = {
  padding: '2px 10px',
  fontSize: 11,
  background: 'var(--accent, #4f7)',
  color: '#000',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  fontWeight: 600,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
npm run test:chart-ir -- ParametersPanel
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/ParametersPanel.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ParametersPanel.test.tsx
git commit -m "feat(analyst-pro): ParametersPanel — list/create/delete parameters (Plan 4c T6)"
```

---

### T7 — Mount `ParametersPanel` in `AnalystProLayout`

**Files:**
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

**Goal:** place `ParametersPanel` in the left rail, directly below `SetsPanel` (Plan 4b mount order: `ObjectLibraryPanel → LayoutTreePanel → SetsPanel → ParametersPanel`).

- [ ] **Step 1: Edit the layout**

Open `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`. Add to the imports block (next to `SetsPanel`):

```jsx
import ParametersPanel from '../freeform/panels/ParametersPanel';
```

Find the existing left-rail `<div>` (search for `data-testid="analyst-pro-left-rail"`). After `<SetsPanel />` and inside the same flex column, add:

```jsx
          <SetsPanel />
          <ParametersPanel />
```

So the final block reads:

```jsx
<div
  data-testid="analyst-pro-left-rail"
  style={{
    width: 240,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--chrome-bar-border, var(--border-default))',
    overflow: 'hidden',
  }}
>
  <ObjectLibraryPanel />
  <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
    <LayoutTreePanel />
  </div>
  <SetsPanel />
  <ParametersPanel />
</div>
```

- [ ] **Step 2: Lint**

```bash
cd frontend
npm run lint -- --max-warnings=0 src/components/dashboard/modes/AnalystProLayout.jsx
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): mount ParametersPanel in left rail (Plan 4c T7)"
```

---

### T8 — Wire `useActionRuntime` `case 'change-parameter'`

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ChangeParameterRuntime.integration.test.tsx`

**Goal:** replace the Plan 3 stub with a real call to `setParameterValueAnalystPro`. `op.parameterId` maps to a parameter id; `op.value` is the raw mark value (coercion happens inside the store slice).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/ChangeParameterRuntime.integration.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import { publish } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';

function Harness() {
  useActionRuntime();
  return null;
}

const baseDashboard = {
  id: 'd1',
  archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
  floatingLayer: [],
  worksheets: [],
  parameters: [{
    id: 'p1',
    name: 'region',
    type: 'string',
    value: 'East',
    domain: { kind: 'list', values: ['East', 'West', 'North'] },
    createdAt: '2026-04-16T00:00:00Z',
  }],
  sets: [],
  actions: [{
    id: 'a1',
    kind: 'change-parameter',
    name: 'SetRegion',
    enabled: true,
    sourceSheets: ['src'],
    trigger: 'select',
    targetParameterId: 'p1',
    fieldMapping: [{ source: 'Region', target: 'region' }],
  }],
};

describe('ChangeParameterRuntime integration', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: baseDashboard,
      analystProActionCascadeToken: 0,
      analystProActiveCascadeTargets: {},
    });
  });

  it('change-parameter action updates the parameter value', () => {
    render(<Harness />);
    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'West' },
        timestamp: Date.now(),
      });
    });
    const params = useStore.getState().analystProDashboard.parameters;
    expect(params[0].value).toBe('West');
  });

  it('change-parameter with out-of-domain value is rejected (no change)', () => {
    render(<Harness />);
    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'South' }, // not in list ['East','West','North']
        timestamp: Date.now(),
      });
    });
    const params = useStore.getState().analystProDashboard.parameters;
    expect(params[0].value).toBe('East');
  });

  it('change-parameter with unknown parameterId is a no-op', () => {
    useStore.setState({
      analystProDashboard: {
        ...baseDashboard,
        actions: [{
          ...baseDashboard.actions[0],
          targetParameterId: 'ghost',
        }],
      },
    });
    render(<Harness />);
    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'West' },
        timestamp: Date.now(),
      });
    });
    const params = useStore.getState().analystProDashboard.parameters;
    expect(params[0].value).toBe('East');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npm run test:chart-ir -- ChangeParameterRuntime
```

Expected: FAIL — param is unchanged because the runtime case is a no-op stub.

- [ ] **Step 3: Wire the runtime**

Open `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js`. Replace the existing `case 'change-parameter':` branch with:

```js
    case 'change-parameter': {
      if (op.value === undefined) break;
      store.setParameterValueAnalystPro(op.parameterId, op.value);
      break;
    }
```

Note: `setParameterValueAnalystPro` silently rejects when the parameter id is unknown, when coercion fails, or when the value violates the domain — this preserves existing value for the test "no-op on ghost id" and "no-op on out-of-domain".

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
npm run test:chart-ir -- ChangeParameterRuntime
npm run test:chart-ir -- ActionRuntime
```

Expected: PASS on both suites (Plan 3 + Plan 4a + Plan 4b ActionRuntime integration tests remain green).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js \
        frontend/src/components/dashboard/freeform/__tests__/ChangeParameterRuntime.integration.test.tsx
git commit -m "feat(analyst-pro): useActionRuntime wires change-parameter cascade (Plan 4c T8)"
```

---

### T9 — Backend `/queries/execute` accepts `parameters` + substitution + audit

**Files:**
- Modify: `backend/routers/query_routes.py`
- Create: `backend/tests/test_execute_parameters.py`

**Goal:** extend `ExecuteRequest` with `parameters: Optional[list[dict]]`; in `execute_sql`, substitute tokens BEFORE the existing `sql_filter_injector` / validator calls; emit an `parameters_applied` audit row. Adversarial tests assert the final wrapped SQL still goes through `SQLValidator`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_execute_parameters.py`:

```python
"""
Plan 4c T9 — verify /queries/execute substitutes {{tokens}} and still
hands the result to SQLValidator via the existing execute path.

Does NOT execute against a real DB — stubs the connector/engine to
capture the SQL that reaches execution time.
"""

from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client(monkeypatch):
    from auth import get_current_user

    def _user():
        return {"email": "demo@askdb.dev", "plan": "pro"}

    app.dependency_overrides[get_current_user] = _user

    from routers import query_routes
    monkeypatch.setattr(
        query_routes, "get_daily_usage",
        lambda email: {"unlimited": True, "remaining": 999, "daily_limit": 999, "plan": "pro"},
    )
    monkeypatch.setattr(
        query_routes, "check_connection_rate_limit", lambda email, conn_id: None,
    )
    monkeypatch.setattr(query_routes, "increment_query_stats", lambda *a, **k: None)
    monkeypatch.setattr(query_routes, "log_sql_edit", lambda *a, **k: None)

    yield TestClient(app)

    app.dependency_overrides.clear()


def _install_fake_connection(captured_sql: list):
    fake_conn = MagicMock()
    fake_conn.execute_query = MagicMock(return_value={
        "columns": ["a"], "rows": [[1]], "row_count": 1,
    })
    fake_engine = MagicMock()

    def _run(sql, question=""):
        captured_sql.append(sql)
        return {
            "sql": sql, "columns": ["a"], "rows": [[1]],
            "row_count": 1, "success": True, "error": None, "summary": "ok",
        }
    fake_engine.execute_sql = MagicMock(side_effect=_run)
    fake_entry = MagicMock()
    fake_entry.engine = fake_engine
    fake_entry.connector = fake_conn
    fake_entry.conn_id = "test-conn"
    fake_entry.db_type = "postgres"
    fake_entry.database_name = "test"
    app.state.connections = {"demo@askdb.dev": {"test-conn": fake_entry}}


def test_execute_substitutes_string_parameter(client):
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT * FROM sales WHERE region = {{region}}",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": [
                {"id": "p1", "name": "region", "type": "string", "value": "West"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    final_sql = captured[-1]
    assert "region = 'West'" in final_sql
    assert "{{region}}" not in final_sql


def test_execute_rejects_unknown_token(client):
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT {{ghost}} FROM t",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": [
                {"id": "p1", "name": "region", "type": "string", "value": "West"},
            ],
        },
    )
    assert resp.status_code == 400
    assert "unknown parameter" in resp.json()["detail"].lower()
    assert captured == []  # never reached execution


def test_execute_parameters_run_before_additional_filters(client):
    """The substitution pass runs FIRST so filter injection wraps the
    already-substituted SQL."""
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT * FROM sales WHERE year = {{year}}",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": [
                {"id": "p1", "name": "year", "type": "number", "value": 2026},
            ],
            "additional_filters": [
                {"field": "region", "op": "eq", "value": "West"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    final_sql = captured[-1]
    # Substituted SQL appears inside the filter injector wrapper.
    assert "year = 2026" in final_sql
    assert "_askdb_filtered" in final_sql
    assert '"region" = \'West\'' in final_sql


def test_execute_adversarial_value_is_quoted_and_validator_catches(client):
    """An adversarial string value cannot escape its literal position."""
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT * FROM t WHERE x = {{n}}",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": [
                {"id": "p1", "name": "n", "type": "string",
                 "value": "'; DROP TABLE users--"},
            ],
        },
    )
    # Validator either accepts the (now safely-quoted) SELECT OR rejects
    # it — what matters is the DROP never reaches the connector as a
    # separate statement.
    if captured:
        final_sql = captured[-1]
        assert "'''; DROP TABLE users--'" in final_sql
    # If validator rejected, we get a 4xx/5xx with no DB execution — also OK.


def test_execute_without_parameters_is_pass_through(client):
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT a FROM t",
            "question": "q",
            "conn_id": "test-conn",
        },
    )
    assert resp.status_code == 200, resp.text
    assert captured[-1].strip().startswith("SELECT a FROM t")


def test_execute_parameters_dict_form_accepted(client):
    """The client may send parameters as a dict {name: paramDict} for
    convenience; the route must accept both list and dict shapes."""
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT * FROM t WHERE x = {{n}}",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": {
                "n": {"id": "p1", "name": "n", "type": "number", "value": 5},
            },
        },
    )
    assert resp.status_code == 200, resp.text
    assert "x = 5" in captured[-1]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
python -m pytest tests/test_execute_parameters.py -v
```

Expected: FAIL — `parameters` field unknown or substitution not wired.

- [ ] **Step 3: Extend the Pydantic request model**

Open `backend/routers/query_routes.py`. Locate the `ExecuteRequest` class (around line 172). Add a new parameter field. Final form:

```python
class _DashboardParameterIn(BaseModel):
    id: Optional[str] = None
    name: str
    type: str
    value: object = None
    domain: Optional[dict] = None


class ExecuteRequest(BaseModel):
    sql: str
    question: str = ""
    conn_id: Optional[str] = None
    original_sql: Optional[str] = None  # AI-generated SQL before user edits
    # Plan 4a: optional filter predicates injected by Analyst Pro action cascade.
    additional_filters: Optional[list[_AdditionalFilter]] = None
    # Plan 4c: Analyst Pro parameter token map. Accepts either a list of
    # parameter dicts or a dict keyed by name.
    parameters: Optional[
        object  # Union[list[_DashboardParameterIn], dict[str, _DashboardParameterIn]]
    ] = None
```

Plain `object` is intentional — Pydantic's Union + dict-keyed-by-name wiring adds noise for no gain; `param_substitution._normalize_params` already handles both shapes and drops malformed entries.

- [ ] **Step 4: Wire the substitution call**

In `execute_sql`, IMMEDIATELY after the `email = user["email"]` line and BEFORE the existing `if req.additional_filters:` block, insert:

```python
    # Plan 4c: token substitution for Analyst Pro parameters. Runs before
    # filter injection + validator so the validator sees the final string.
    if req.parameters:
        from param_substitution import (
            substitute_param_tokens,
            UnknownParameterError,
            InvalidParameterError,
        )
        try:
            req.sql = substitute_param_tokens(req.sql, req.parameters)
        except UnknownParameterError as exc:
            raise HTTPException(status_code=400, detail=f"Unknown parameter token: {exc}")
        except InvalidParameterError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid parameter: {exc}")
        try:
            from audit_trail import _append_entry as _audit_append
            from datetime import datetime, timezone
            # Shape-normalise for audit — only record names, never values.
            if isinstance(req.parameters, dict):
                names = [
                    v.get("name") if isinstance(v, dict) else None
                    for v in req.parameters.values()
                ]
            else:
                names = [
                    (p.model_dump() if hasattr(p, "model_dump") else p).get("name")
                    for p in req.parameters
                ]
            _audit_append({
                "event": "parameters_applied",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "conn_id": req.conn_id or "",
                "user": email,
                "param_names": [n for n in names if n],
            })
        except Exception:
            pass
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend
python -m pytest tests/test_execute_parameters.py -v
```

Expected: PASS (6 tests).

- [ ] **Step 6: Full backend smoke**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green. No new failures vs. tip. In particular Plan 4a's `test_execute_additional_filters.py` must still pass — the substitution pass is additive and runs only when `parameters` is truthy.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/query_routes.py backend/tests/test_execute_parameters.py
git commit -m "feat(analyst-pro): /queries/execute parameter substitution + audit (Plan 4c T9)"
```

---

### T10 — `waterfall_router` optional `parameters` passthrough

**Files:**
- Modify: `backend/waterfall_router.py`

**Goal:** add an optional `parameters=None` kwarg to `WaterfallRouter.route`, `route_sync`, `_route_sync_impl`. Forwarded into `TierResult.metadata["parameters"]` so downstream consumers (LiveTier / agent run_sql / cached-query re-execution) can see the client's intent. Mirrors the Plan 4a `additional_filters` pattern. No behavioural change for callers that omit the kwarg.

- [ ] **Step 1: Extend `route`**

Open `backend/waterfall_router.py`. The `route` signature already carries `additional_filters: Optional[List[dict]] = None`. Add `parameters` right after it:

```python
    async def route(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
        additional_filters: Optional[List[dict]] = None,
        parameters: Optional[object] = None,
    ) -> TierResult:
```

Inside the function, wherever `result.metadata["additional_filters"] = additional_filters or []` appears (two locations — one on the hit branch, one in the final miss-return metadata dict), mirror it:

```python
            result.metadata["parameters"] = parameters or {}
```

And add the same key to the miss-branch metadata dict literal:

```python
            metadata={
                ...
                "additional_filters": additional_filters or [],
                "parameters": parameters or {},
            },
```

- [ ] **Step 2: Extend `route_sync` and `_route_sync_impl`**

Update both signatures and forward the new argument everywhere they invoke each other or `self.route`:

```python
    def route_sync(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
        additional_filters: Optional[List[dict]] = None,
        parameters: Optional[object] = None,
    ) -> TierResult:
        """Synchronous wrapper for route()."""
        import asyncio
        try:
            asyncio.get_running_loop()
            return self._route_sync_impl(
                question, schema_profile, conn_id, additional_filters, parameters,
            )
        except RuntimeError:
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(
                    self.route(
                        question, schema_profile, conn_id,
                        additional_filters, parameters,
                    ),
                )
            finally:
                loop.close()

    def _route_sync_impl(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
        additional_filters: Optional[List[dict]] = None,
        parameters: Optional[object] = None,
    ) -> TierResult:
```

Inside `_route_sync_impl`, at the two metadata-population sites, append:

```python
            result.metadata["parameters"] = parameters or {}
```

and update the miss-branch metadata dict to include `"parameters": parameters or {}`.

- [ ] **Step 3: Run existing waterfall tests**

```bash
cd backend
python -m pytest tests/ -k "waterfall" -v
```

Expected: all existing tests still green. This change is a pure additive kwarg — no new tests needed here.

- [ ] **Step 4: Commit**

```bash
git add backend/waterfall_router.py
git commit -m "feat(analyst-pro): waterfall_router parameters passthrough (Plan 4c T10)"
```

---

### T11 — Frontend `api.executeSQL` + `AnalystProWorksheetTile` parameter awareness

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`

**Goal:** extend `executeSQL` with a `parameters` arg (serialized as `parameters`). Extend `AnalystProWorksheetTile` so it watches `analystProDashboard.parameters` and re-runs the tile SQL whenever the parameter slice changes **and** the tile's SQL contains at least one `{{token}}`.

- [ ] **Step 1: Update `api.executeSQL`**

Open `frontend/src/api.js`. Locate `executeSQL` (around line 228) and replace it with:

```js
  executeSQL: (
    sql,
    question,
    connId = null,
    originalSql = null,
    additionalFilters = null,
    parameters = null,
  ) =>
    request("/queries/execute", {
      method: "POST",
      body: JSON.stringify({
        sql,
        question,
        conn_id: connId,
        original_sql: originalSql || undefined,
        additional_filters:
          Array.isArray(additionalFilters) && additionalFilters.length > 0
            ? additionalFilters
            : undefined,
        parameters:
          Array.isArray(parameters) && parameters.length > 0
            ? parameters
            : undefined,
      }),
    }),
```

- [ ] **Step 2: Update `AnalystProWorksheetTile.jsx`**

Open `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`. Replace the entire file body (keeping the same props + exports) with:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardTileCanvas from '../lib/DashboardTileCanvas';
import { api } from '../../../api';
import { useStore } from '../../../store';

const TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function hasTokens(sql) {
  if (typeof sql !== 'string' || sql.length === 0) return false;
  return sql.includes('{{') && TOKEN_RE.test(sql);
}

export default function AnalystProWorksheetTile({ tile, sheetId, onTileClick }) {
  const filters = useStore((s) => s.analystProSheetFilters[sheetId] || null);
  const parameters = useStore((s) => s.analystProDashboard?.parameters || null);
  const cascadeToken = useStore((s) => s.analystProActionCascadeToken);
  const markStatus = useStore((s) => s.markCascadeTargetStatus);
  const connId = useStore((s) => s.activeConnection?.conn_id || null);

  const [override, setOverride] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const requestSeqRef = useRef(0);

  const tileHasTokens = useMemo(() => hasTokens(tile?.sql), [tile?.sql]);

  useEffect(() => {
    const filtersActive = Array.isArray(filters) && filters.length > 0;
    const paramsActive = tileHasTokens && Array.isArray(parameters) && parameters.length > 0;
    if ((!filtersActive && !paramsActive) || !tile?.sql) {
      setOverride(null);
      setErrorMsg(null);
      return;
    }

    const seq = ++requestSeqRef.current;
    const tokenAtFire = cascadeToken;
    let cancelled = false;

    (async () => {
      try {
        const resp = await api.executeSQL(
          tile.sql,
          tile.question || '',
          connId,
          null,
          filtersActive ? filters : null,
          paramsActive ? parameters : null,
        );
        if (cancelled || seq !== requestSeqRef.current) return;
        setOverride({
          columns: Array.isArray(resp?.columns) ? resp.columns : [],
          rows: Array.isArray(resp?.rows) ? resp.rows : [],
          columnProfile: Array.isArray(resp?.columnProfile) ? resp.columnProfile : [],
        });
        setErrorMsg(null);
        markStatus(sheetId, 'done', tokenAtFire);
      } catch (err) {
        if (cancelled || seq !== requestSeqRef.current) return;
        setErrorMsg(err?.message || 'Tile re-query failed');
        markStatus(sheetId, 'error', tokenAtFire);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, parameters, tileHasTokens, sheetId, tile?.sql, tile?.question, connId]);

  return (
    <>
      <DashboardTileCanvas
        tile={tile}
        onTileClick={onTileClick}
        resultSetOverride={override}
      />
      {errorMsg ? (
        <div
          data-testid={`analyst-pro-worksheet-error-${sheetId}`}
          style={{
            position: 'absolute',
            bottom: 6, right: 6, fontSize: 10,
            color: 'var(--danger, #f87171)',
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 6px', borderRadius: 4,
            pointerEvents: 'none',
          }}
        >
          {errorMsg}
        </div>
      ) : null}
    </>
  );
}
```

Note: the wrapper only triggers on parameter changes when the tile SQL actually contains `{{…}}` tokens. That avoids a storm of no-op re-queries on tiles that don't reference parameters.

- [ ] **Step 3: Lint**

```bash
cd frontend
npm run lint -- --max-warnings=0 \
  src/api.js \
  src/components/dashboard/freeform/AnalystProWorksheetTile.jsx
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js \
        frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx
git commit -m "feat(analyst-pro): executeSQL + worksheet tile pass parameters (Plan 4c T11)"
```

---

### T12 — Persistence round-trip (migration preserve + storage whitelist)

**Files:**
- Modify: `backend/dashboard_migration.py`
- Create: `backend/tests/test_parameters_roundtrip.py`

**Goal:** mirror Plan 4b's `sets` preservation for `parameters`. `user_storage.update_dashboard` already whitelists `parameters` (see [user_storage.py:630](backend/user_storage.py)), so the only migration change is swapping the hard-coded `"parameters": []` for an `existing_parameters` preserve.

- [ ] **Step 1: Preserve input parameters in migration**

Open `backend/dashboard_migration.py`. Near the `existing_sets` guard (around line 337), append another guard:

```python
    # Preserve existing parameters if present; default to empty list.
    existing_parameters = legacy.get("parameters")
    if not isinstance(existing_parameters, list):
        existing_parameters = []
```

In the return dict, change `"parameters": []` to `"parameters": existing_parameters`:

```python
    return {
        "schemaVersion": "askdb/dashboard/v1",
        "id": str(dashboard_id),
        "name": name,
        "archetype": "analyst-pro",
        "size": {"mode": "automatic"},
        "tiledRoot": tiled_root,
        "floatingLayer": [],
        "worksheets": worksheets,
        "parameters": existing_parameters,
        "sets": existing_sets,
        "actions": existing_actions,
        "globalStyle": {},
    }
```

- [ ] **Step 2: Write the regression test**

Create `backend/tests/test_parameters_roundtrip.py`:

```python
"""
Plan 4c T12 — regression guard: `parameters` persists through the freeform
dashboard path (migration + user_storage whitelist).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from dashboard_migration import legacy_to_freeform_schema


def test_freeform_schema_includes_empty_parameters_by_default():
    out = legacy_to_freeform_schema({"id": "d1", "name": "D", "tiles": []})
    assert out["parameters"] == []


def test_freeform_schema_preserves_existing_parameters_when_present():
    existing = [{
        "id": "p1",
        "name": "region",
        "type": "string",
        "value": "West",
        "domain": {"kind": "free"},
        "createdAt": "2026-04-16T00:00:00Z",
    }]
    out = legacy_to_freeform_schema(
        {"id": "d1", "name": "D", "tiles": [], "parameters": existing},
    )
    assert out["parameters"] == existing


def test_freeform_schema_coerces_non_list_parameters_to_empty():
    out = legacy_to_freeform_schema(
        {"id": "d1", "name": "D", "tiles": [], "parameters": "not-a-list"},
    )
    assert out["parameters"] == []


@pytest.fixture
def isolated_user_dir(monkeypatch, tmp_path):
    import user_storage

    fake_root = tmp_path / "user_data"
    fake_root.mkdir()

    def _fake_user_dir(email: str) -> Path:
        d = fake_root / "testuser"
        d.mkdir(exist_ok=True)
        return d

    monkeypatch.setattr(user_storage, "_user_dir", _fake_user_dir)
    return fake_root


def test_update_dashboard_preserves_parameters_field(isolated_user_dir):
    import user_storage

    email = "demo@askdb.dev"
    udir = user_storage._user_dir(email)
    seed = [{
        "id": "d1",
        "name": "D",
        "archetype": "analyst-pro",
        "schemaVersion": "askdb/dashboard/v1",
        "tiledRoot": {"id": "root", "type": "container-vert", "w": 100000, "h": 100000, "children": []},
        "floatingLayer": [],
        "worksheets": [],
        "parameters": [],
        "actions": [],
        "sets": [],
    }]
    (udir / "dashboards.json").write_text(json.dumps(seed), encoding="utf-8")

    new_params = [{
        "id": "p1", "name": "region", "type": "string",
        "value": "West", "domain": {"kind": "free"},
        "createdAt": "2026-04-16T00:00:00Z",
    }]
    updated = user_storage.update_dashboard(
        email, "d1", {"parameters": new_params},
    )
    assert updated is not None
    assert updated["parameters"] == new_params

    reloaded = user_storage.load_dashboard(email, "d1")
    assert reloaded["parameters"] == new_params
```

- [ ] **Step 3: Run the test**

```bash
cd backend
python -m pytest tests/test_parameters_roundtrip.py -v
```

Expected: PASS (4 tests). If `_user_dir` monkeypatch doesn't stick (because `user_storage` caches a Path elsewhere), check the real symbol name and adjust the patch target — same pattern as Plan 4b T8.

- [ ] **Step 4: Full backend smoke**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green. Plan 4b's `test_sets_roundtrip.py` should still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add backend/dashboard_migration.py backend/tests/test_parameters_roundtrip.py
git commit -m "feat(analyst-pro): preserve parameters in legacy_to_freeform_schema + test (Plan 4c T12)"
```

---

### T13 — End-to-end integration test + smoke

**Files:**
- Create: `frontend/src/components/dashboard/freeform/__tests__/ParametersEndToEnd.integration.test.tsx`

**Goal:** prove the full chain:
1. User flips a `ParameterControl` widget → `analystProParameters` updates → subscribed `AnalystProWorksheetTile` (tile SQL contains `{{region}}`) calls `api.executeSQL` with the `parameters` body field.
2. A `ChangeParameterAction` fires via mark-event → parameter updates → downstream tile re-queries.

- [ ] **Step 1: Write the integration test**

Create `frontend/src/components/dashboard/freeform/__tests__/ParametersEndToEnd.integration.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, waitFor, screen } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import { publish } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';
import AnalystProWorksheetTile from '../AnalystProWorksheetTile';
import ParametersPanel from '../panels/ParametersPanel';

vi.mock('../../../../api', () => ({
  api: { executeSQL: vi.fn() },
}));

import { api } from '../../../../api';

function Harness({ tile, sheetId }) {
  useActionRuntime();
  return (
    <>
      <ParametersPanel />
      <AnalystProWorksheetTile tile={tile} sheetId={sheetId} />
    </>
  );
}

const baseDashboard = {
  id: 'd1',
  archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
  floatingLayer: [],
  worksheets: [],
  sets: [],
  parameters: [{
    id: 'p1',
    name: 'region',
    type: 'string',
    value: 'East',
    domain: { kind: 'list', values: ['East', 'West', 'North'] },
    createdAt: '2026-04-16T00:00:00Z',
  }],
  actions: [{
    id: 'a1',
    kind: 'change-parameter',
    name: 'PickRegion',
    enabled: true,
    sourceSheets: ['src'],
    trigger: 'select',
    targetParameterId: 'p1',
    fieldMapping: [{ source: 'Region', target: 'region' }],
  }],
};

const tile = {
  id: 'w1',
  title: 'Sales by Region',
  sql: 'SELECT region, total FROM sales WHERE region = {{region}}',
  question: 'q',
  columns: ['region', 'total'],
  rows: [['East', 10]],
};

describe('ParametersEndToEnd integration', () => {
  beforeEach(() => {
    api.executeSQL.mockReset();
    api.executeSQL.mockResolvedValue({
      columns: ['region', 'total'],
      rows: [['West', 42]],
    });
    useStore.setState({
      analystProDashboard: baseDashboard,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
      analystProActionCascadeToken: 0,
      analystProActiveCascadeTargets: {},
      activeConnection: { conn_id: 'c1' },
      analystProHistory: { past: [], present: null, future: [], maxEntries: 500 },
    });
  });

  afterEach(() => {
    useStore.setState({
      analystProDashboard: null,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
    });
  });

  it('widget change → tile re-queries with parameters body', async () => {
    render(<Harness tile={tile} sheetId="w1" />);

    // Flip the list dropdown from East → West.
    const select = screen.getByRole('combobox', { name: /region/i });
    fireEvent.change(select, { target: { value: 'West' } });

    await waitFor(() => {
      expect(api.executeSQL).toHaveBeenCalled();
    });

    const [sql, question, connId, originalSql, additionalFilters, parameters] =
      api.executeSQL.mock.calls[api.executeSQL.mock.calls.length - 1];
    expect(sql).toBe('SELECT region, total FROM sales WHERE region = {{region}}');
    expect(question).toBe('q');
    expect(connId).toBe('c1');
    expect(originalSql).toBeNull();
    expect(additionalFilters).toBeNull();
    expect(Array.isArray(parameters)).toBe(true);
    const regionParam = parameters.find((p) => p.name === 'region');
    expect(regionParam.value).toBe('West');
  });

  it('ChangeParameterAction via mark click → parameter updates → tile re-queries', async () => {
    render(<Harness tile={tile} sheetId="w1" />);

    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'North' },
        timestamp: Date.now(),
      });
    });

    // The runtime updates the parameter; AnalystProWorksheetTile's effect
    // observes the slice change and fires a re-query.
    await waitFor(() => {
      const params = useStore.getState().analystProDashboard.parameters;
      expect(params[0].value).toBe('North');
    });

    await waitFor(() => {
      const last = api.executeSQL.mock.calls[api.executeSQL.mock.calls.length - 1];
      const parameters = last[5];
      const regionParam = parameters.find((p) => p.name === 'region');
      expect(regionParam.value).toBe('North');
    });
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
cd frontend
npm run test:chart-ir -- ParametersEndToEnd
```

Expected: PASS (2 tests).

- [ ] **Step 3: Frontend full smoke**

```bash
cd frontend
npm run test:chart-ir
npm run lint
npm run build
```

Expected: all three green. Report the test-count delta vs. Plan 4b tip — expected additions:
- `parameterOps.test.ts` (≈25)
- `ParameterControl.test.tsx` (5)
- `ParametersPanel.test.tsx` (7)
- `ChangeParameterRuntime.integration.test.tsx` (3)
- `ParametersEndToEnd.integration.test.tsx` (2)

Known pre-existing chart-ir failures (from root CLAUDE.md "Known Test Debt") must remain unchanged — confirm the failure count is the same before and after.

- [ ] **Step 4: Backend full smoke**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green. New backend tests:
- `test_param_substitution.py` (16)
- `test_execute_parameters.py` (6)
- `test_parameters_roundtrip.py` (4)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/__tests__/ParametersEndToEnd.integration.test.tsx
git commit -m "test(analyst-pro): end-to-end parameter widget + ChangeParameterAction (Plan 4c T13)"
```

---

## Out of Scope (deferred)

- **List / range domain editors in `ParametersPanel`** — T6 creates parameters with `free` domain only. List / range authoring is Plan 5 (Domains Editor modal).
- **Worksheet SQL editor that autocompletes `{{…}}` tokens** — Plan 5.
- **Server-side parameter memoization** when the same `(sql, parameters)` tuple fires repeatedly — Plan 4d.
- **Per-parameter ACLs / read-only flag** — out of scope; every parameter is user-editable.
- **Parameter-driven Turbo-tier fast path** — requires twin query rewrite; Plan 4d.
- **Highlight visual dimming** — still deferred per Plan 4a note.

---

## Rollout

- Every new endpoint surface stays behind `settings.FEATURE_ANALYST_PRO` (existing gate).
- `ParametersPanel` only mounts inside `AnalystProLayout`, so other archetypes are unaffected.
- `executeSQL` defaults `parameters = null` → zero-diff for every non-Analyst-Pro caller.
- Default dashboard has `parameters: []`; legacy dashboards migrated through `legacy_to_freeform_schema` likewise inherit `[]`.

---

## Review Anchors

- **Spec compliance:** `analystProParameters` lives inside `analystProDashboard.parameters`; substitution runs BEFORE validator + filter injector; unknown tokens reject with HTTP 400; audit row written; persistence round-trips.
- **Code quality:** no `import anthropic` anywhere except `backend/anthropic_provider.py`; Vega-Lite only (no ECharts); actions follow `analystPro*` prefix/suffix convention; no `console.log`; no emoji in code.
- **Security invariants:** substituted SQL is still a SELECT going through the 6-layer `SQLValidator`; adversarial values render as quoted literals; parameter names regex-gated; substitution length capped; audit logs names only (never values).
- **Type consistency:** `ChangeParameterAction.targetParameterId` maps to `TargetOp.parameterId` via `actionExecutor.deriveTargetOps`; runtime calls `setParameterValueAnalystPro(op.parameterId, op.value)`.
