# Sub-project D Phase D0 — Storage Migration + Linguistic Model Types

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate semantic model storage from per-user to per-connection paths, add linguistic model + color map CRUD with types, validators, and REST endpoints — the foundation for AI bootstrap, persistent colors, and teach-by-correction in later phases.

**Architecture:** New backend module `semantic_layer.py` handles per-connection storage under `.data/user_data/{hash}/semantic/{conn_id}/`. Three files per connection: `linguistic.json`, `color_map.json`, `model.json`. Frontend gains TypeScript types for `LinguisticModel` and `ColorMap` in `chart-ir/semantic/`. New API surface under `/api/v1/connections/{conn_id}/semantic/`. Existing per-user storage preserved for backward compat.

**Tech Stack:** Python (pathlib, json, threading), TypeScript (chart-ir types), FastAPI (REST endpoints), Vitest (frontend tests), pytest (backend tests).

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md`](../specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md) §2.2–§2.4, §Phase D0.

---

## File Structure

### New backend files
```
backend/
  semantic_layer.py                      # Per-connection CRUD for linguistic, color_map, semantic model
  tests/
    test_semantic_layer.py               # Storage CRUD + migration + validation tests
```

### Modified backend files
```
backend/
  routers/chart_customization_routes.py  # +per-connection semantic endpoints
  chart_customization.py                 # +migration helper from per-user to per-connection
```

### New frontend files
```
frontend/src/
  chart-ir/semantic/linguistic.ts        # LinguisticModel, Phrasing, SampleQuestion types
  chart-ir/semantic/colorMap.ts          # ColorMap type + resolveColor() helper
  chart-ir/__tests__/semantic/linguistic.test.ts
  chart-ir/__tests__/semantic/colorMap.test.ts
```

### Modified frontend files
```
frontend/src/
  chart-ir/semantic/types.ts             # +conn_id, changelog, status fields (backward compat)
  chart-ir/index.ts                      # +exports for linguistic + colorMap
  store.js                               # +linguisticModel, colorMap slices
  api.js                                 # +semantic layer API functions
```

---

## Task 1: Frontend linguistic model types

**Files:**
- Create: `frontend/src/chart-ir/semantic/linguistic.ts`
- Create: `frontend/src/chart-ir/__tests__/semantic/linguistic.test.ts`
- Modify: `frontend/src/chart-ir/index.ts`

- [ ] **Step 1: Write tests**

```typescript
// frontend/src/chart-ir/__tests__/semantic/linguistic.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateLinguisticModel,
  type LinguisticModel,
  type Phrasing,
} from '../../semantic/linguistic';

function sampleModel(): LinguisticModel {
  return {
    version: 1,
    conn_id: 'pg-main',
    updated_at: '2026-04-15T12:00:00Z',
    synonyms: {
      tables: { orders: ['sales', 'transactions'] },
      columns: { 'orders.created_at': ['order date'] },
      values: { 'orders.status:completed': ['done', 'finished'] },
    },
    phrasings: [
      {
        id: 'p-1',
        type: 'verb',
        template: 'customers buy products',
        entities: ['customers', 'products'],
        joinPath: ['customers', 'orders', 'products'],
        status: 'suggested',
      },
    ],
    sampleQuestions: [
      { id: 'q-1', table: 'orders', question: 'Total revenue by month', status: 'suggested' },
    ],
    changelog: [],
  };
}

describe('validateLinguisticModel', () => {
  it('accepts a well-formed model', () => {
    const result = validateLinguisticModel(sampleModel());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing version', () => {
    const m = { ...sampleModel(), version: undefined as unknown as 1 };
    const result = validateLinguisticModel(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /version/.test(e))).toBe(true);
  });

  it('rejects missing conn_id', () => {
    const m = { ...sampleModel(), conn_id: '' };
    const result = validateLinguisticModel(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /conn_id/.test(e))).toBe(true);
  });

  it('rejects non-object synonyms', () => {
    const m = { ...sampleModel(), synonyms: null as unknown as LinguisticModel['synonyms'] };
    const result = validateLinguisticModel(m);
    expect(result.valid).toBe(false);
  });

  it('rejects phrasing with unknown type', () => {
    const m = sampleModel();
    m.phrasings = [{
      id: 'p-bad',
      type: 'unknown' as Phrasing['type'],
      template: 'bad',
      entities: [],
      status: 'suggested',
    }];
    const result = validateLinguisticModel(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /phrasing.*type/.test(e))).toBe(true);
  });

  it('rejects duplicate phrasing ids', () => {
    const m = sampleModel();
    m.phrasings.push({ ...m.phrasings[0]! });
    const result = validateLinguisticModel(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /duplicate/i.test(e))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect module not found**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/semantic/linguistic.test.ts`

- [ ] **Step 3: Implement `linguistic.ts`**

```typescript
// frontend/src/chart-ir/semantic/linguistic.ts
/**
 * Sub-project D — Linguistic Model types + validator.
 *
 * The linguistic model stores per-connection synonyms, phrasings, and
 * sample questions that teach the agent natural language vocabulary for
 * the connected database schema.
 */

export type PhrasingType = 'attribute' | 'verb' | 'name' | 'adjective' | 'preposition';
export type SuggestionStatus = 'suggested' | 'accepted' | 'user_created';

export interface Phrasing {
  id: string;
  type: PhrasingType;
  template: string;
  entities: string[];
  joinPath?: string[];
  status: SuggestionStatus;
}

export interface SampleQuestion {
  id: string;
  table: string;
  question: string;
  status: SuggestionStatus;
}

export interface ChangelogEntry {
  ts: string;
  action: 'bootstrap' | 'accept_suggestion' | 'user_edit' | 'teach_correction';
  target: string;
  before?: unknown;
  after?: unknown;
}

export interface LinguisticSynonyms {
  tables: Record<string, string[]>;
  columns: Record<string, string[]>;
  values: Record<string, string[]>;
}

export interface LinguisticModel {
  version: 1;
  conn_id: string;
  updated_at: string;
  synonyms: LinguisticSynonyms;
  phrasings: Phrasing[];
  sampleQuestions: SampleQuestion[];
  changelog: ChangelogEntry[];
}

const VALID_PHRASING_TYPES = new Set<string>([
  'attribute', 'verb', 'name', 'adjective', 'preposition',
]);

export interface LinguisticValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLinguisticModel(model: unknown): LinguisticValidationResult {
  const errors: string[] = [];
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    return { valid: false, errors: ['LinguisticModel must be a plain object'] };
  }
  const m = model as Partial<LinguisticModel>;

  if (m.version !== 1) errors.push(`version must be 1, got ${String(m.version)}`);
  if (typeof m.conn_id !== 'string' || !m.conn_id) errors.push('Missing or empty conn_id');
  if (typeof m.updated_at !== 'string' || !m.updated_at) errors.push('Missing updated_at');

  if (!m.synonyms || typeof m.synonyms !== 'object') {
    errors.push('synonyms must be an object with tables, columns, values');
  } else {
    if (typeof m.synonyms.tables !== 'object') errors.push('synonyms.tables must be an object');
    if (typeof m.synonyms.columns !== 'object') errors.push('synonyms.columns must be an object');
    if (typeof m.synonyms.values !== 'object') errors.push('synonyms.values must be an object');
  }

  if (!Array.isArray(m.phrasings)) {
    errors.push('phrasings must be an array');
  } else {
    const phrasingIds = new Set<string>();
    for (let i = 0; i < m.phrasings.length; i++) {
      const p = m.phrasings[i] as Partial<Phrasing>;
      if (typeof p?.id !== 'string' || !p.id) {
        errors.push(`phrasings[${i}].id must be a non-empty string`);
      } else {
        if (phrasingIds.has(p.id)) errors.push(`Duplicate phrasing id: ${p.id}`);
        phrasingIds.add(p.id);
      }
      if (typeof p?.type !== 'string' || !VALID_PHRASING_TYPES.has(p.type)) {
        errors.push(`phrasings[${i}].type must be one of ${[...VALID_PHRASING_TYPES].join(', ')}`);
      }
      if (typeof p?.template !== 'string' || !p.template) {
        errors.push(`phrasings[${i}].template must be a non-empty string`);
      }
    }
  }

  if (!Array.isArray(m.sampleQuestions)) {
    errors.push('sampleQuestions must be an array');
  }

  if (!Array.isArray(m.changelog)) {
    errors.push('changelog must be an array');
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Export from `chart-ir/index.ts`**

Add:
```typescript
// Sub-project D Phase D0 — Linguistic model
export { validateLinguisticModel } from './semantic/linguistic';
export type {
  LinguisticModel,
  LinguisticSynonyms,
  LinguisticValidationResult,
  Phrasing,
  PhrasingType,
  SampleQuestion,
  SuggestionStatus,
  ChangelogEntry,
} from './semantic/linguistic';
```

- [ ] **Step 5: Run tests — expect 6 passed**

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/semantic/linguistic.ts frontend/src/chart-ir/__tests__/semantic/linguistic.test.ts frontend/src/chart-ir/index.ts && git commit -m "feat(d0): LinguisticModel types + validator for synonyms, phrasings, sample questions"
```

---

## Task 2: Frontend color map types + resolver

**Files:**
- Create: `frontend/src/chart-ir/semantic/colorMap.ts`
- Create: `frontend/src/chart-ir/__tests__/semantic/colorMap.test.ts`
- Modify: `frontend/src/chart-ir/index.ts`

- [ ] **Step 1: Write tests**

```typescript
// frontend/src/chart-ir/__tests__/semantic/colorMap.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveColor,
  validateColorMap,
  type ColorMap,
} from '../../semantic/colorMap';

function sampleColorMap(): ColorMap {
  return {
    version: 1,
    conn_id: 'pg-main',
    updated_at: '2026-04-15T12:00:00Z',
    assignments: {
      'region:Europe': '#4a8fe7',
      'region:North America': '#2dbf71',
      'status:Active': '#22c55e',
      'orders.status:Pending': '#f59e0b',
    },
    changelog: [],
  };
}

describe('resolveColor', () => {
  it('returns hex for exact column:value match', () => {
    expect(resolveColor(sampleColorMap(), 'region', 'Europe')).toBe('#4a8fe7');
  });

  it('returns undefined for unassigned value', () => {
    expect(resolveColor(sampleColorMap(), 'region', 'Antarctica')).toBeUndefined();
  });

  it('prefers table-qualified match over unqualified', () => {
    // "orders.status:Pending" should win over "status:Pending" if both existed
    expect(resolveColor(sampleColorMap(), 'status', 'Pending', 'orders')).toBe('#f59e0b');
  });

  it('falls back to unqualified match when no table-qualified match', () => {
    expect(resolveColor(sampleColorMap(), 'status', 'Active')).toBe('#22c55e');
  });

  it('returns undefined for empty assignments', () => {
    const empty: ColorMap = { ...sampleColorMap(), assignments: {} };
    expect(resolveColor(empty, 'region', 'Europe')).toBeUndefined();
  });
});

describe('validateColorMap', () => {
  it('accepts a well-formed color map', () => {
    const result = validateColorMap(sampleColorMap());
    expect(result.valid).toBe(true);
  });

  it('rejects missing conn_id', () => {
    const m = { ...sampleColorMap(), conn_id: '' };
    const result = validateColorMap(m);
    expect(result.valid).toBe(false);
  });

  it('rejects non-hex color values', () => {
    const m = sampleColorMap();
    m.assignments['bad:key'] = 'not-a-hex';
    const result = validateColorMap(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /hex/.test(e))).toBe(true);
  });

  it('rejects assignment keys without colon separator', () => {
    const m = sampleColorMap();
    m.assignments['noColonKey'] = '#ff0000';
    const result = validateColorMap(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /format/.test(e))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect module not found**

- [ ] **Step 3: Implement `colorMap.ts`**

```typescript
// frontend/src/chart-ir/semantic/colorMap.ts
/**
 * Sub-project D — ColorMap types + resolver.
 *
 * Persistent per-connection color assignments: (column, value) → hex.
 * The Vega-Lite compiler reads these to inject scale.domain + scale.range
 * so "Europe" is always #4a8fe7 across every chart.
 */

import type { ChangelogEntry } from './linguistic';

export interface ColorMap {
  version: 1;
  conn_id: string;
  updated_at: string;
  /** Key format: "column:value" or "table.column:value" */
  assignments: Record<string, string>;
  changelog: ChangelogEntry[];
}

export interface ColorMapValidationResult {
  valid: boolean;
  errors: string[];
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
const KEY_RE = /^[^:]+:.+$/; // must have at least one colon

export function validateColorMap(map: unknown): ColorMapValidationResult {
  const errors: string[] = [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return { valid: false, errors: ['ColorMap must be a plain object'] };
  }
  const m = map as Partial<ColorMap>;

  if (m.version !== 1) errors.push(`version must be 1, got ${String(m.version)}`);
  if (typeof m.conn_id !== 'string' || !m.conn_id) errors.push('Missing or empty conn_id');
  if (typeof m.updated_at !== 'string' || !m.updated_at) errors.push('Missing updated_at');

  if (!m.assignments || typeof m.assignments !== 'object') {
    errors.push('assignments must be an object');
  } else {
    for (const [key, value] of Object.entries(m.assignments)) {
      if (!KEY_RE.test(key)) {
        errors.push(`Assignment key "${key}" must be in "column:value" format`);
      }
      if (typeof value !== 'string' || !HEX_RE.test(value)) {
        errors.push(`Assignment "${key}" has invalid hex color: "${String(value)}"`);
      }
    }
  }

  if (!Array.isArray(m.changelog)) {
    errors.push('changelog must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Resolve a color for (column, value) from the color map.
 *
 * Lookup priority:
 *   1. Table-qualified: "{table}.{column}:{value}" (if tableName provided)
 *   2. Unqualified: "{column}:{value}"
 *
 * Returns undefined if no assignment exists.
 */
export function resolveColor(
  map: ColorMap,
  column: string,
  value: string,
  tableName?: string,
): string | undefined {
  if (tableName) {
    const qualified = map.assignments[`${tableName}.${column}:${value}`];
    if (qualified) return qualified;
  }
  return map.assignments[`${column}:${value}`];
}

/**
 * Build Vega-Lite scale domain + range arrays from a color map
 * for a given color-encoding field.
 */
export function buildColorScale(
  map: ColorMap,
  fieldName: string,
): { domain: string[]; range: string[] } | null {
  const domain: string[] = [];
  const range: string[] = [];

  for (const [key, hex] of Object.entries(map.assignments)) {
    const colonIdx = key.lastIndexOf(':');
    if (colonIdx < 0) continue;
    const col = key.slice(0, colonIdx);
    const val = key.slice(colonIdx + 1);
    // Match unqualified ("region") or qualified ("orders.region")
    if (col === fieldName || col.endsWith('.' + fieldName)) {
      domain.push(val);
      range.push(hex);
    }
  }

  return domain.length > 0 ? { domain, range } : null;
}
```

- [ ] **Step 4: Export from `chart-ir/index.ts`**

Add:
```typescript
// Sub-project D Phase D0 — Color map
export { resolveColor, validateColorMap, buildColorScale } from './semantic/colorMap';
export type { ColorMap, ColorMapValidationResult } from './semantic/colorMap';
```

- [ ] **Step 5: Run tests — expect 9 passed**

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/semantic/colorMap.ts frontend/src/chart-ir/__tests__/semantic/colorMap.test.ts frontend/src/chart-ir/index.ts && git commit -m "feat(d0): ColorMap types + resolveColor + buildColorScale + validator"
```

---

## Task 3: Backend `semantic_layer.py` — per-connection CRUD

**Files:**
- Create: `backend/semantic_layer.py`
- Create: `backend/tests/test_semantic_layer.py`

- [ ] **Step 1: Write tests**

15 tests covering:
- `test_save_and_load_linguistic_model` — round-trip
- `test_save_and_load_color_map` — round-trip
- `test_save_and_load_semantic_model` — round-trip
- `test_load_returns_none_when_not_exists` — for each of the 3 file types
- `test_hydrate_returns_all_three` — single call returns linguistic + color_map + model
- `test_atomic_write_survives_read_during_write` — concurrent read doesn't see partial write
- `test_delete_linguistic_model` — delete + confirm gone
- `test_migration_from_chart_customizations` — seed old-format data, run migration, verify new-format
- `test_per_connection_isolation` — two conn_ids don't interfere
- `test_storage_path_uses_user_hash_and_conn_id` — verify path structure
- `test_invalid_model_rejected` — save invalid JSON → raises ValueError

All tests use `tmp_path` fixture to override the storage root.

- [ ] **Step 2: Run tests — expect failures**

- [ ] **Step 3: Implement `semantic_layer.py`**

Module with functions:
- `save_linguistic(email, conn_id, data)` — validate + atomic write to `semantic/{conn_id}/linguistic.json`
- `load_linguistic(email, conn_id)` → dict | None
- `save_color_map(email, conn_id, data)` — validate + atomic write
- `load_color_map(email, conn_id)` → dict | None
- `save_semantic_model(email, conn_id, data)` — validate + atomic write to `semantic/{conn_id}/model.json`
- `load_semantic_model(email, conn_id)` → dict | None
- `hydrate(email, conn_id)` → `{linguistic, color_map, model}` (each may be None)
- `delete_linguistic(email, conn_id)` → bool
- `migrate_from_chart_customizations(email, conn_id, model_id)` — reads from old per-user storage, writes to new per-connection path

Storage root: `_semantic_dir(email, conn_id)` → `Path(f".data/user_data/{sha_prefix(email)}/semantic/{conn_id}")`

Use the same `sha_prefix` function as `user_storage.py`. Atomic writes via write-then-rename. Per-path locking via `threading.Lock` keyed by `(email, conn_id)`.

- [ ] **Step 4: Run tests — expect 15 passed**

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add backend/semantic_layer.py backend/tests/test_semantic_layer.py && git commit -m "feat(d0): semantic_layer.py — per-connection CRUD for linguistic model, color map, semantic model"
```

---

## Task 4: Backend REST endpoints for per-connection semantic layer

**Files:**
- Modify: `backend/routers/chart_customization_routes.py`

- [ ] **Step 1: Add new endpoints**

Add to `chart_customization_routes.py`:

```python
# ─── Per-connection semantic layer (Sub-project D Phase D0) ──────
from semantic_layer import (
    hydrate as semantic_hydrate,
    save_linguistic,
    load_linguistic,
    save_color_map,
    load_color_map,
    save_semantic_model as save_semantic_model_conn,
    load_semantic_model as load_semantic_model_conn,
)

@router.get("/connections/{conn_id}/semantic")
async def get_semantic_layer(conn_id: str, user: dict = Depends(get_current_user)):
    email = _require_email(user)
    data = semantic_hydrate(email, conn_id)
    return data

@router.put("/connections/{conn_id}/semantic/linguistic")
async def put_linguistic(conn_id: str, body: dict, user: dict = Depends(get_current_user)):
    email = _require_email(user)
    try:
        saved = save_linguistic(email, conn_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"linguistic": saved}

@router.put("/connections/{conn_id}/semantic/color-map")
async def put_color_map(conn_id: str, body: dict, user: dict = Depends(get_current_user)):
    email = _require_email(user)
    try:
        saved = save_color_map(email, conn_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"colorMap": saved}

@router.put("/connections/{conn_id}/semantic/model")
async def put_semantic_model_conn(conn_id: str, body: dict, user: dict = Depends(get_current_user)):
    email = _require_email(user)
    try:
        saved = save_semantic_model_conn(email, conn_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"model": saved}
```

- [ ] **Step 2: Run existing tests to verify no regressions**

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add backend/routers/chart_customization_routes.py && git commit -m "feat(d0): per-connection semantic REST endpoints under /connections/{conn_id}/semantic/"
```

---

## Task 5: Frontend store + API wiring

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add Zustand slices**

Add to `store.js`:
```javascript
linguisticModel: null,
colorMap: null,
semanticBootstrapStatus: 'idle',  // idle | loading | done | error
correctionSuggestions: [],
setLinguisticModel: (m) => set({ linguisticModel: m }),
setColorMap: (m) => set({ colorMap: m }),
setSemanticBootstrapStatus: (s) => set({ semanticBootstrapStatus: s }),
addCorrectionSuggestion: (s) => set((state) => ({
  correctionSuggestions: [...state.correctionSuggestions, s],
})),
dismissCorrectionSuggestion: (id) => set((state) => ({
  correctionSuggestions: state.correctionSuggestions.filter((s) => s.id !== id),
})),
```

- [ ] **Step 2: Add API functions**

Add to `api.js`:
```javascript
getSemanticLayer: (connId) => api.get(`/connections/${connId}/semantic`),
saveLinguisticModel: (connId, data) => api.put(`/connections/${connId}/semantic/linguistic`, data),
saveColorMap: (connId, data) => api.put(`/connections/${connId}/semantic/color-map`, data),
saveSemanticModelConn: (connId, data) => api.put(`/connections/${connId}/semantic/model`, data),
bootstrapSemantic: (connId) => api.post(`/connections/${connId}/semantic/bootstrap`),
acceptCorrection: (connId, correction) => api.post(`/connections/${connId}/semantic/corrections`, correction),
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/store.js frontend/src/api.js && git commit -m "feat(d0): Zustand slices + API functions for semantic layer"
```

---

## Task 6: Extend SemanticModel types with status + conn_id

**Files:**
- Modify: `frontend/src/chart-ir/semantic/types.ts`

- [ ] **Step 1: Add optional backward-compat fields**

Add to `Dimension`, `Measure`, `Metric` interfaces:
```typescript
status?: 'suggested' | 'accepted' | 'user_created';
```

Add to `SemanticModel` interface:
```typescript
conn_id?: string;
changelog?: ChangelogEntry[];
```

Import `ChangelogEntry` from `./linguistic`.

These are all optional fields — existing code that doesn't set them continues to work.

- [ ] **Step 2: Run existing semantic tests to verify no breakage**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/semantic/`

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/semantic/types.ts && git commit -m "feat(d0): extend SemanticModel with optional conn_id, changelog, status fields"
```

---

## Task 7: Phase D0 checkpoint

- [ ] **Step 1: Run full backend test suite**

```bash
cd "QueryCopilot V1/backend" && python -m pytest tests/test_semantic_layer.py -v
```
Expected: 15 passed

- [ ] **Step 2: Run full frontend semantic tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/semantic/
```
Expected: all pass (existing 10 + new linguistic 6 + new colorMap 9 = 25)

- [ ] **Step 3: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 4: Tag checkpoint**

```bash
cd "QueryCopilot V1" && git tag d0-semantic-types
```

---

## Phases D1–D4 (Task-Level Outlines)

### Phase D1 — AI Bootstrap + Agent Integration (~1.5 weeks)

**Task D1.1:** `semantic_bootstrap.py` — Haiku-powered bootstrap
- Takes SchemaProfile + optional query history
- Calls Haiku with structured prompt to generate synonyms, phrasings, sample questions
- Returns LinguisticModel with all entries `status: 'suggested'`
- 5 tests (mock Haiku response, output validation, empty schema handling)

**Task D1.2:** `POST /api/v1/connections/{conn_id}/semantic/bootstrap` endpoint
- Calls `semantic_bootstrap.bootstrap_linguistic(schema_profile, query_history)`
- Returns suggested LinguisticModel + SemanticModel draft
- 3 adversarial tests

**Task D1.3:** Agent system prompt injection
- Modify `agent_engine.py` `_build_system_prompt` to inject semantic context block
- Read linguistic model + semantic model + color map for active connection
- Format as compact cached context (~200-500 tokens)
- 3 tests (with/without semantic data, prompt size cap at 800 tokens)

**Task D1.4:** `BootstrapReview.jsx` — modal for reviewing suggestions
- Lists suggested synonyms, phrasings, sample questions grouped by table
- Bulk Accept / Review Individual / Dismiss actions
- Wired into connection flow (after successful connect → "Generate semantic layer?")

**Task D1.5:** Phase D1 checkpoint, tag `d1-bootstrap`

### Phase D2 — Persistent Color Map + Compiler Integration (~1 week)

**Task D2.1:** Wire `buildColorScale()` into `toVegaLite.ts`
- After encoding compilation, if active ColorMap has assignments for the color field, inject `scale: { domain, range }` into the VL spec
- 3 tests (color map applied, unassigned values passthrough, empty map no-op)

**Task D2.2:** Inspector color picker — "Apply to all charts" checkbox
- Modify on-object color editing to offer persistent (color map) vs local (per-chart) option
- Accept writes to color map via API

**Task D2.3:** Color Map tab in future SemanticSettings (stubbed — full settings UI in D4)

**Task D2.4:** Phase D2 checkpoint, tag `d2-color-map`

### Phase D3 — Teach-by-Correction Loop (~1.5 weeks)

**Task D3.1:** `chart-ir/semantic/correctionDetector.ts`
- `detectCorrections(before, after, model, linguistic) → CorrectionSuggestion[]`
- Detects: field renames (→ synonym), color changes (→ color map), aggregation changes (→ measure default)
- 6 tests per correction type

**Task D3.2:** `CorrectionToast.jsx` — non-blocking toast
- Accept/Dismiss buttons, 8s auto-dismiss, stacks, session-scoped dedup
- Max 2 toasts per minute rate limit

**Task D3.3:** Wire correction detection into chart editor spec-change handler
- On spec patch, run detector, surface toast if suggestions found
- Accepted corrections write to linguistic model / color map via API

**Task D3.4:** Audit trail integration — new event types for corrections

**Task D3.5:** Phase D3 checkpoint, tag `d3-teach-correction`

### Phase D4 — Settings UI + Metric Editor + Cmd-K + Polish (~1.5 weeks)

**Task D4.1:** `SemanticSettings.jsx` — full tabbed editor
- 5 tabs: Synonyms, Phrasings, Sample Questions, Color Map, Metrics
- Each tab is an editable table with add/edit/delete

**Task D4.2:** Extend SemanticFieldRail with inline add/edit/delete + suggestion badges

**Task D4.3:** Metrics in Cmd-K command palette

**Task D4.4:** Route at `/semantic-settings` + link from workspace settings

**Task D4.5:** Polish — empty states, loading states, keyboard nav

**Task D4.6:** Update CLAUDE.md with new modules

**Task D4.7:** Phase D4 checkpoint, tag `d4-semantic-layer-v1`
