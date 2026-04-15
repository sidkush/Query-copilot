# Chart System Redesign — Sub-project D — Semantic Layer

**Date:** 2026-04-15
**Author:** Drafted autonomously via scheduled task `brainstorm-chart-sub-project-d-semantic-layer` invoking `superpowers:brainstorming` (no live user — sid23 absent for this run; assumptions tagged).
**Status:** Awaiting user review · spec self-reviewed inline
**Research base:** `docs/chart_systems_research.md` (§3.4 Power BI Q&A linguistic schema, §4.6 LookML semantic layer, §4.13 Looker Gemini, §6.9 semantic color assignment) · A spec · B spec · C spec · existing `chart-ir/semantic/` foundation
**Scope:** Sub-project D of four — the semantic layer. A=editor+dashboards, B=performance ceiling, C=user-authored chart types, **D=semantic layer.** This is the final sub-project. Completing it completes the four-part chart system redesign.

---

## 0. Pre-Read — State of the Foundation

### 0.1 What Already Exists

Sub-project D has a **shipped foundation layer** across frontend and backend:

**Frontend (`chart-ir/semantic/`):**

| File | What it does | Status |
|---|---|---|
| `types.ts` | `SemanticModel`, `Dimension`, `Measure`, `Metric`, `SemanticFieldRef` interfaces | Implemented + exported from `chart-ir/index.ts` |
| `validator.ts` | `validateSemanticModel()` — required fields, unique ids, dependency validation, cyclic metric detection via DFS | Implemented + 5 validator tests |
| `resolver.ts` | `resolveSemanticRef()` — dimension/measure/metric → concrete `FieldRef`. `compileSemanticSpec()` — walks encoding, resolves semantic refs, deduplicates calculate transforms | Implemented + 5 resolver/compiler tests |
| `__tests__/semantic/semantic.test.ts` | 10 test cases covering validator, resolver, compiler | All passing |

**Frontend (`components/editor/`):**

| File | What it does | Status |
|---|---|---|
| `SemanticFieldRail.jsx` | Accordion with Dimensions (blue pills), Measures (green pills), Metrics (gold pills). Draggable with `application/x-askdb-field` payload carrying semantic envelope. Model switcher dropdown. | Implemented |

**Backend:**

| File | What it does | Status |
|---|---|---|
| `chart_customization.py` | `list_semantic_models()`, `save_semantic_model()`, `delete_semantic_model()` — per-user CRUD with atomic writes, thread-safe locking | Implemented |
| `chart_customization_routes.py` | `/api/v1/semantic-models` CRUD endpoints | Implemented |

**Store (`store.js`):**
- `activeSemanticModel`, `availableSemanticModels`, `setActiveSemanticModel`, `setAvailableSemanticModels` slices

### 0.2 What Sub-project D Must Build On Top

The foundation gives us **the data model layer** — dimensions, measures, metrics, compiler, resolver, editor pills. What's missing is everything that makes the semantic layer *intelligent*:

1. **Linguistic model** — synonyms, phrasings, sample questions (Power BI Q&A parity)
2. **Persistent color map** — workspace-level semantic color assignments (Hex/Lightdash pattern)
3. **Teach-by-correction** — learn from user edits, propose synonym/color additions
4. **AI-assisted bootstrap** — auto-generate linguistic model + initial semantic model from schema profiling
5. **Agent integration** — inject all semantic context into NL-to-SQL prompt as cached context
6. **Governance** — versioning, changelog, audit trail
7. **Metric definitions UI** — extend SemanticFieldRail into a full metric editor (Cmd-K surfacing)
8. **Per-connection scoping** — migrate from per-user to per-connection storage

### 0.3 Why This Matters — The "Power BI Q&A Parity + Beyond" Framing

Power BI's Q&A success rests on its **linguistic schema** — a YAML layer on top of the semantic model that teaches the NL engine table synonyms, column aliases, verb-based relationship phrasings, and sample questions. Without it, Q&A is a mediocre keyword matcher. With it, Q&A understands "how many customers bought products last quarter" because it knows "bought" = verb phrasing linking customer dim → orders fact → product dim.

Looker's equivalent is LookML — dimensions, measures, dimension groups, and parameters form a curated semantic layer that Gemini's Conversational Analytics consumes.

**AskDB's advantage:** Both Power BI and Looker require human-authored semantic/linguistic metadata. AskDB's agent can **bootstrap** this automatically from schema profiling + query history analysis, then **refine** it from user corrections. The human only reviews and accepts — or teaches by correcting charts. This is the leap: from hand-maintained to AI-maintained-human-refined.

**AskDB's second advantage:** Persistent color map. When "Europe" is always blue across every chart in a workspace, the analyst builds spatial muscle memory. Hex and Lightdash pioneered this; Power BI and Tableau don't do it. AskDB ships it as a first-class feature wired into the IR compiler.

### 0.4 Scope Guardrails

**In scope for D:**
- Linguistic model: synonyms (table/column/value), phrasings (verb/attribute/name/adjective/preposition), sample questions
- Persistent color map: `(column, value) → hexColor`
- Teach-by-correction: detect chart edits, propose synonym/color/phrasing additions
- AI-assisted bootstrap: Haiku call on schema profile → draft linguistic model + sample questions
- Agent integration: cached context injection into system prompt
- Metric definitions: extend existing SemanticFieldRail into full editor with create/edit/delete
- Per-connection storage migration from `chart_customizations.json`
- Governance: version field, changelog, audit trail hooks
- Settings UI: tabbed editor for all semantic layer concerns

**Out of scope for D (Phase D+1 or later):**
- Multi-table join graph / relationship modeling (requires schema graph, not just flat tables)
- Row-level access policies
- Cube-style drill paths
- Unit / currency / timezone descriptors on dimensions
- Full LookML-style DSL with parser + IDE integration
- Collaborative editing (multi-user real-time, requires WebSocket infra)
- Marketplace for sharing semantic models across workspaces

---

## 1. Executive Summary

Sub-project D adds a **three-layer semantic intelligence system** to AskDB that makes the AI agent's NL-to-SQL understanding dramatically better without requiring the user to configure anything:

**Layer 1 — Linguistic Model (NL understanding).** Per-connection synonyms for tables, columns, and values; grammatical phrasings that encode relationships ("customers buy products"); and sample questions that seed the agent's prompt context. Bootstrapped automatically by a Haiku call on schema profile, refined by user corrections. Inspired by Power BI's linguistic schema but AI-generated rather than hand-authored.

**Layer 2 — Persistent Color Map (visual identity).** Per-connection `Map<(column, value), hexColor>` that the Vega-Lite compiler reads at chart render time. "Europe" is always `#4a8fe7` across every chart. Set manually via inspector/settings, or learned from teach-by-correction when users repeatedly assign the same color.

**Layer 3 — Teach-by-Correction (learning loop).** When a user edits an agent-generated chart (changes grouping, renames a series, reassigns a color), the system detects the delta, classifies it, and surfaces a non-blocking toast: "Remember 'state' as a synonym for 'region'?" or "Always use #4a8fe7 for Europe?" Accepted corrections flow into the linguistic model or color map, improving all future charts.

All three layers inject their data into the agent's system prompt as a single **prompt-cached context block** (free on subsequent requests within a session). The metric definitions from the existing foundation (dimensions, measures, metrics) are surfaced in the Cmd-K palette and a full settings editor. Per-connection storage under `.data/user_data/{hash}/semantic/{conn_id}/` with atomic writes, changelog, and audit trail integration.

**Five phases, ~5–7 weeks.** Phase D0 = storage migration + linguistic model types. Phase D1 = AI bootstrap + agent integration. Phase D2 = persistent color map + compiler integration. Phase D3 = teach-by-correction loop. Phase D4 = settings UI + metric editor + Cmd-K + polish.

---

## 2. Architecture Overview

### 2.1 Three-Layer Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Agent System Prompt                              │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐ │
│  │ Linguistic Model  │ │ Semantic Model   │ │ Color Map            │ │
│  │ ─ synonyms        │ │ ─ dimensions     │ │ ─ (col,val) → hex   │ │
│  │ ─ phrasings       │ │ ─ measures       │ │                      │ │
│  │ ─ sample Qs       │ │ ─ metrics        │ │                      │ │
│  └──────────────────┘ └──────────────────┘ └──────────────────────┘ │
│                    (injected as cached context block)                │
└─────────────────────────────────────────────────────────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   NL→SQL resolution      ChartSpec encoding       Vega-Lite scale
   (agent understands       (semantic refs →        (domain + range
    synonyms/phrasings)      concrete fields)        from color map)
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Teach-by-Correction Loop                          │
│  User edits chart → delta detected → correction classified →        │
│  toast surfaced → user accepts → linguistic model / color map       │
│  updated → future charts improved                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Storage Layout

```
.data/user_data/{sha256_hash}/semantic/{conn_id}/
  ├── linguistic.json      # synonyms, phrasings, sample questions
  ├── color_map.json       # persistent color assignments
  └── model.json           # dimensions, measures, metrics (migrated from chart_customizations.json)
```

All files use atomic write-then-rename (consistent with `user_storage.py` discipline). Thread-safe via per-path locking (same pattern as `chart_customization.py`).

**Migration:** On first access, if `chart_customizations.json` contains `semantic_models` entries, each model is read, matched to a connection by its `dataset` field, and written to the new per-connection path. The old entry is preserved (not deleted) for backward compat until the next major version.

### 2.3 Data Models

#### 2.3.1 LinguisticModel

```typescript
interface LinguisticModel {
  version: 1;
  conn_id: string;
  updated_at: string; // ISO 8601

  synonyms: {
    tables: Record<string, string[]>;
    // key = actual table name, value = alternative names
    // e.g. { "orders": ["sales", "transactions", "purchases"] }

    columns: Record<string, string[]>;
    // key = "table.column", value = alternative names
    // e.g. { "orders.created_at": ["order date", "purchase date"] }

    values: Record<string, string[]>;
    // key = "table.column:value", value = alternative names
    // e.g. { "orders.status:completed": ["done", "finished"] }
  };

  phrasings: Phrasing[];
  // Grammatical templates for NL understanding

  sampleQuestions: SampleQuestion[];
  // Per-table seed prompts

  changelog: ChangelogEntry[];
  // Append-only edit history
}

type PhrasingType = 'attribute' | 'verb' | 'name' | 'adjective' | 'preposition';

interface Phrasing {
  id: string;
  type: PhrasingType;
  template: string;
  // Human-readable template, e.g. "customers {buy|purchase} products"
  entities: string[];
  // Table names involved
  joinPath?: string[];
  // For verb phrasings: ordered list of tables forming the join path
  // e.g. ["customers", "orders", "products"]
  status: 'suggested' | 'accepted' | 'user_created';
}

interface SampleQuestion {
  id: string;
  table: string;
  question: string;
  status: 'suggested' | 'accepted' | 'user_created';
}

interface ChangelogEntry {
  ts: string; // ISO 8601
  action: 'bootstrap' | 'accept_suggestion' | 'user_edit' | 'teach_correction';
  target: string; // e.g. "synonym:tables:orders" or "phrasing:p-123"
  before?: unknown;
  after?: unknown;
}
```

#### 2.3.2 ColorMap

```typescript
interface ColorMap {
  version: 1;
  conn_id: string;
  updated_at: string;

  assignments: Record<string, string>;
  // key = "column_name:value", value = hex color
  // e.g. { "region:Europe": "#4a8fe7", "status:Active": "#22c55e" }

  changelog: ChangelogEntry[];
}
```

#### 2.3.3 SemanticModel (extended from existing)

The existing `SemanticModel` interface in `chart-ir/semantic/types.ts` is kept as-is. D adds:
- A `conn_id` field (for per-connection scoping)
- A `changelog` field
- A `status` field on each dimension/measure/metric: `'suggested' | 'accepted' | 'user_created'`

These additions are backward-compatible (all optional fields).

### 2.4 Backend Modules

| Module | New/Modified | Responsibility |
|---|---|---|
| `semantic_layer.py` | **New** | CRUD for LinguisticModel + ColorMap. Reads/writes per-connection JSON files. Atomic writes. Per-path locking. Hydration endpoint returns all three models in one response. |
| `semantic_bootstrap.py` | **New** | AI-assisted bootstrap: takes `SchemaProfile` + optional query history, calls Haiku to generate initial synonyms, phrasings, sample questions. Returns `LinguisticModel` with `status: 'suggested'` on all entries. |
| `chart_customization.py` | **Modified** | Semantic model storage migrated to per-connection path. Existing per-user storage preserved for backward compat. New `save_semantic_model_for_connection()` that writes to `semantic/{conn_id}/model.json`. |
| `chart_customization_routes.py` | **Modified** | New endpoints under `/api/v1/connections/{conn_id}/semantic/` for linguistic model, color map, and full hydration. Existing `/api/v1/semantic-models` preserved for backward compat. |
| `agent_engine.py` | **Modified** | System prompt builder reads semantic layer for active connection and injects as a `cache_control: {"type": "ephemeral"}` block. Synonyms formatted as compact lookup table. Phrasings as bullet list. Sample questions as numbered examples. |
| `audit_trail.py` | **Modified** | New event types: `semantic_bootstrap`, `semantic_edit`, `color_map_edit`, `teach_correction_accepted`, `teach_correction_dismissed`. |

### 2.5 Frontend Modules

| Module | New/Modified | Responsibility |
|---|---|---|
| `chart-ir/semantic/linguistic.ts` | **New** | TypeScript types for `LinguisticModel`, `Phrasing`, `SampleQuestion`. |
| `chart-ir/semantic/colorMap.ts` | **New** | TypeScript types for `ColorMap`. `resolveColor(colorMap, column, value): string | undefined` helper. |
| `chart-ir/compiler/toVegaLite.ts` | **Modified** | After encoding compilation, if active `ColorMap` has assignments for the `color` encoding's field, inject `scale: { domain: [...], range: [...] }` into the Vega-Lite spec. |
| `chart-ir/semantic/correctionDetector.ts` | **New** | `detectCorrections(before: ChartSpec, after: ChartSpec, model: SemanticModel, linguistic: LinguisticModel): CorrectionSuggestion[]`. Diffs two specs, classifies deltas into synonym/color/phrasing suggestions. |
| `components/editor/CorrectionToast.jsx` | **New** | Non-blocking toast shown after user edits a chart. Shows correction suggestion with Accept/Dismiss buttons. Auto-dismisses after 8s. |
| `components/editor/SemanticSettings.jsx` | **New** | Full-page settings panel (routed at `/semantic-settings` or modal from workspace settings). Five tabs: Synonyms, Phrasings, Sample Questions, Color Map, Metrics. Each tab is an editable table/list with add/edit/delete. |
| `components/editor/BootstrapReview.jsx` | **New** | Modal shown after AI bootstrap completes. Lists suggested synonyms, phrasings, sample questions grouped by table. Bulk Accept / Review Individual / Dismiss actions. |
| `components/editor/SemanticFieldRail.jsx` | **Modified** | Add "Edit model" link that opens SemanticSettings. Show suggestion badge count if unreviewed suggestions exist. |
| `store.js` | **Modified** | New slices: `linguisticModel`, `colorMap`, `semanticBootstrapStatus`, `correctionSuggestions`, `setLinguisticModel`, `setColorMap`, `addCorrectionSuggestion`, `dismissCorrectionSuggestion`. |
| `api.js` | **Modified** | New endpoints: `getSemanticLayer(connId)`, `saveLinguisticModel(connId, data)`, `saveColorMap(connId, data)`, `bootstrapSemantic(connId)`, `acceptCorrection(connId, correction)`. |

### 2.6 API Surface

```
GET    /api/v1/connections/{conn_id}/semantic
       → { linguistic: LinguisticModel, colorMap: ColorMap, model: SemanticModel }
       Single hydration endpoint. Returns all three. 404 if none exist yet.

POST   /api/v1/connections/{conn_id}/semantic/bootstrap
       → { linguistic: LinguisticModel, sampleModel: SemanticModel }
       Triggers AI bootstrap. Returns suggested models with status: 'suggested'.

PUT    /api/v1/connections/{conn_id}/semantic/linguistic
       Body: LinguisticModel
       → { linguistic: LinguisticModel }

PUT    /api/v1/connections/{conn_id}/semantic/color-map
       Body: ColorMap
       → { colorMap: ColorMap }

PUT    /api/v1/connections/{conn_id}/semantic/model
       Body: SemanticModel
       → { model: SemanticModel }

POST   /api/v1/connections/{conn_id}/semantic/corrections
       Body: { type: 'synonym'|'color'|'phrasing', payload: {...} }
       → { accepted: boolean }
       Accept a teach-by-correction suggestion.

GET    /api/v1/semantic-models  (preserved for backward compat)
PUT    /api/v1/semantic-models  (preserved for backward compat)
DELETE /api/v1/semantic-models/{id}  (preserved for backward compat)
```

---

## 3. Linguistic Model — Deep Design

### 3.1 Synonyms

Three synonym scopes, matching Power BI's linguistic schema:

**Table synonyms.** The most impactful for NL understanding. When a user says "show me customer data," the agent needs to know that "customer" maps to the `clients` table. Auto-bootstrapped from table names (split on `_`, singularize/pluralize, common abbreviations).

**Column synonyms.** "Revenue" might be stored as `total_amount`. "Order date" might be `created_at`. Auto-bootstrapped from column names + inferred from column type + sample values.

**Value synonyms.** "Active" customers might have `status = 'A'` in the database. "Completed" orders might be `state = 'CMPL'`. Bootstrapped from value frequency analysis during schema profiling (top N distinct values per categorical column).

**Format in agent prompt (compact, ~50-100 tokens per table):**

```
Tables: orders (aka sales, transactions) | customers (aka clients, accounts)
Columns: orders.created_at (aka order date) | customers.full_name (aka name)
Values: orders.status = 'completed' (aka done, finished) | = 'pending' (aka waiting)
```

### 3.2 Phrasings

Five phrasing types, adapted from Power BI's linguistic schema:

| Type | Template | Example | What it teaches the agent |
|---|---|---|---|
| **attribute** | `{entity} has {column}` | "customers have names" | Column belongs to table |
| **verb** | `{subject} {verb} {object}` | "customers buy products" | Join path between tables |
| **name** | `{entity} called {column}` | "customer named John" | Identity column for entity |
| **adjective** | `{adjective} {entity} where {condition}` | "expensive products where price > 100" | Derived boolean category |
| **preposition** | `{entity} in {column}` | "customers in region" | Spatial/categorical grouping |

**Verb phrasings are the most powerful.** They encode multi-table joins as natural language: "customers buy products" means `JOIN customers → orders → products`. The agent doesn't need to figure out the join path — the phrasing tells it.

**Fallback when FK analysis fails:** If `schema_intelligence.py` doesn't find a foreign key path between tables, the bootstrap omits `joinPath` from the phrasing. The agent falls back to its existing behavior: inferring join conditions from column names and types. The phrasing still helps by telling the agent *which* tables to join — just not *how*.

**Format in agent prompt (~20-30 tokens per phrasing):**

```
Relationships: customers buy/purchase products (via orders) | employees manage departments | orders ship to addresses
```

### 3.3 Sample Questions

Per-table NL questions that the agent keeps in its prompt context:

```
Example questions for this database:
- orders: "Total revenue by month", "Top 10 customers by order count", "Average order value by region"
- customers: "How many customers signed up last quarter?", "Customer distribution by country"
```

**Purpose:** These serve three roles:
1. **Few-shot priming** — the agent has concrete examples of the kinds of questions this schema answers
2. **Onboarding** — new users see these as suggested prompts in the BottomDock input
3. **Vocabulary seeding** — the questions use the synonym vocabulary, reinforcing the linguistic model

**Auto-generation:** Haiku call with schema profile → generate 5-10 questions per table, weighted toward tables with more columns and relationships. Questions should use synonym vocabulary (e.g., "customer revenue" not "clients.total_amount").

### 3.4 Bootstrap Pipeline

```
schema_intelligence.profile_connection()
  → SchemaProfile (tables, columns, types, row counts, indexes, FKs)
  → semantic_bootstrap.bootstrap_linguistic(schema_profile, query_history?)
    → Haiku API call with structured prompt:
        "Given this database schema, generate:
         1. Table synonyms (2-4 per table)
         2. Column synonyms (1-3 per column, focusing on non-obvious names)
         3. Value synonyms (for categorical columns with coded values)
         4. Phrasings (verb phrasings for FK relationships, attribute phrasings for key columns)
         5. Sample questions (5-10 per table, using natural vocabulary)"
    → Parse structured JSON response
    → Set all entries to status: 'suggested'
    → Return LinguisticModel draft
```

**Cost:** One Haiku call per connection, ~500-2000 input tokens (schema profile), ~500-1500 output tokens. At current Haiku pricing: ~$0.001-0.003 per bootstrap. Negligible.

**Optional query history enrichment:** If `query_memory.py` has stored queries for this connection, feed anonymized intent patterns to the bootstrap call. The LLM can infer which column names users actually reference and what vocabulary they use, making synonym suggestions more accurate.

---

## 4. Persistent Color Map — Deep Design

### 4.1 Data Model

```typescript
// Key format: "column_name:value"
// Examples: "region:Europe", "status:Active", "category:Electronics"
assignments: Record<string, string>
```

**Why `column_name:value` not `table.column:value`:** A value like "Europe" in the `region` column means the same thing whether it's in `orders.region` or `customers.region`. Column-level (not table-qualified) matching is intentional — it provides cross-table color consistency, which is the whole point.

**Conflict resolution:** If two tables have a `status` column with different semantics (order status vs. user status), the user can disambiguate by using `orders.status:Active` as the key. The resolver tries column-qualified match first, then falls back to unqualified.

### 4.2 Compiler Integration

In `toVegaLite.ts`, after the encoding is compiled:

```typescript
// Pseudo-code for color map injection
if (spec.encoding.color && colorMap) {
  const colorField = spec.encoding.color.field;
  const matchingAssignments = Object.entries(colorMap.assignments)
    .filter(([key]) => {
      const [col] = key.split(':');
      return col === colorField || col.includes('.' + colorField);
    });

  if (matchingAssignments.length > 0) {
    spec.encoding.color.scale = {
      domain: matchingAssignments.map(([key]) => key.split(':')[1]),
      range: matchingAssignments.map(([, hex]) => hex),
    };
  }
}
```

**Unassigned values:** Values not in the color map get assigned from the active theme's categorical palette (Tableau 10 by default). Assigned values always take priority.

### 4.3 UI Surfaces

**Inspector color picker (on-object editing).** When user clicks a color swatch in the legend or series:
- Standard color picker appears
- Below the picker: checkbox "Apply to all charts in this workspace"
- If checked: writes to color map (persistent). If unchecked: writes to per-chart spec (local override).

**Settings → Color Map tab.** Table view:

```
| Column   | Value          | Color   | Actions     |
|----------|----------------|---------|-------------|
| region   | Europe         | #4a8fe7 | [edit] [×]  |
| region   | North America  | #2dbf71 | [edit] [×]  |
| region   | Asia           | #e0b862 | [edit] [×]  |
| status   | Active         | #22c55e | [edit] [×]  |
| + Add color assignment                              |
```

**Teach-by-correction.** After user changes a series color in the inspector and doesn't check "Apply to all":
- If same value has been colored to the same hex 3+ times across different charts → surface toast: "Always use #4a8fe7 for Europe?"
- Accept → writes to color map

---

## 5. Teach-by-Correction — Deep Design

### 5.1 Correction Detection

When a user modifies a chart spec (via on-object editing, Marks card, inspector, or agent), `correctionDetector.ts` runs a diff:

```typescript
function detectCorrections(
  before: ChartSpec,
  after: ChartSpec,
  model: SemanticModel,
  linguistic: LinguisticModel,
): CorrectionSuggestion[]
```

**Detectable correction types:**

| User action | Delta pattern | Suggestion |
|---|---|---|
| Changed X-axis field from `state` to `region` | `encoding.x.field` changed | "Remember 'state' as synonym for 'region'?" |
| Changed color of "Europe" series to #4a8fe7 | `encoding.color.scale.range` changed for specific domain value | "Always use #4a8fe7 for Europe?" |
| Changed aggregation from `count` to `sum` on `revenue` | `encoding.y.aggregate` changed | "Default aggregate for 'revenue' is sum?" (updates measure definition) |
| Replaced agent-generated `GROUP BY state` with `GROUP BY region` | Full field replacement | "Add 'state' as synonym for column 'region'?" |
| Added a filter the agent didn't include | `transform` gained a filter entry | "Add sample question: 'Revenue by region excluding [value]'?" |

### 5.2 Toast UX

```
┌──────────────────────────────────────────────────────────┐
│ 💡 Remember "state" as a synonym for "region"?           │
│    Future charts will understand both terms.              │
│                                                          │
│  [Accept]  [Dismiss]                        ━━━━━━━━━━━  │
│                                             (8s timeout)  │
└──────────────────────────────────────────────────────────┘
```

- Non-blocking: doesn't interrupt workflow
- Stacks: multiple corrections queue, shown one at a time
- Auto-dismiss after 8 seconds (configurable)
- Accept = immediate write to linguistic model / color map + changelog entry
- Dismiss = no-op, suggestion discarded
- Never re-suggest a dismissed correction for the same (field, value) pair within a session

### 5.3 Learning Feedback Loop

```
User edits chart
  → correctionDetector runs diff
  → suggestions generated
  → toast shown
  → user accepts/dismisses
  → if accepted:
      → linguistic model / color map updated
      → agent prompt cache invalidated (next request rebuilds cached context)
      → audit trail logged
      → behavior_engine records correction pattern
```

The behavior engine integration is key: `behavior_engine.py` already builds `term_map` from query history. Teach-by-correction extends this by recording *visual* corrections, not just query corrections. Over time, the system learns both the NL vocabulary and the visual vocabulary of each workspace.

---

## 6. Agent Integration — Deep Design

### 6.1 Prompt Injection Strategy

The semantic layer injects a **single cached context block** into the agent's system prompt, between the schema context and the conversation history:

```
[SYSTEM PROMPT]
You are AskDB's data analysis agent...

[SCHEMA CONTEXT — already cached]
Tables: orders (12 columns, ~1.2M rows), customers (8 columns, ~50K rows)...

[SEMANTIC LAYER — new cached block]
=== Workspace Semantic Context ===

Synonyms:
  Tables: orders (aka sales, transactions) | customers (aka clients, buyers)
  Columns: orders.created_at (aka order date) | orders.total_amount (aka revenue, sales amount)
  Values: orders.status:completed (aka done, finished) | orders.status:pending (aka waiting)

Relationships:
  customers buy/purchase products (via orders)
  employees manage/lead departments
  orders ship to addresses (via shipping)

Metrics:
  ARPU = revenue / users (format: $,.2f)
  Gross Margin = (revenue - cost) / revenue (format: .1%)

Color assignments:
  region:Europe=#4a8fe7 | region:North America=#2dbf71 | status:Active=#22c55e

Example questions:
  1. Total revenue by month
  2. Top 10 customers by order count
  3. Customer distribution by country
=== End Semantic Context ===

[CONVERSATION HISTORY]
```

**When no semantic layer exists:** If a connection has no semantic data (no bootstrap run, no user-created models), the semantic context block is simply omitted from the prompt. The agent functions exactly as it does today — no regression.

### 6.2 Caching Economics

Anthropic prompt caching charges for the first request that caches a block, then serves subsequent reads for free (within the TTL). The semantic context block is ~200-500 tokens for a typical workspace. At Haiku pricing with prompt caching:
- First request: ~$0.0003 to cache
- Subsequent requests: free
- TTL: 5 minutes (Anthropic default), refreshed on each use

The semantic block is appended to the existing schema context cache block, so they share one cache slot. Total cached context per session: schema (~500-2000 tokens) + semantic (~200-500 tokens) = ~700-2500 tokens.

### 6.3 Agent Behavioral Changes

With the semantic layer injected, the agent:

1. **Resolves synonyms transparently.** "Show me customer purchases last month" → agent knows "customers" = `clients` table, "purchases" = `orders` table, and uses the verb phrasing to construct the correct JOIN.

2. **Uses metric definitions.** "What's our ARPU by region?" → agent sees `ARPU = revenue / users` metric, generates `SELECT region, SUM(revenue) / COUNT(DISTINCT user_id) AS arpu FROM ...`.

3. **Applies color map.** When generating chart specs, agent includes color assignments: `encoding.color.scale = { domain: ['Europe', ...], range: ['#4a8fe7', ...] }`.

4. **Suggests sample questions.** When asked "what can I ask?", agent returns the sample questions from the linguistic model.

5. **Records corrections.** When the agent tool `suggest_chart` emits a spec and the user edits it, the correction loop feeds back into the semantic layer.

---

## 7. Metric Editor — Deep Design

### 7.1 Extending SemanticFieldRail

The existing SemanticFieldRail shows dimensions/measures/metrics as pill groups. D extends this with:

1. **Inline add button** at the bottom of each group: "+ Add dimension" / "+ Add measure" / "+ Add metric"
2. **Edit-on-click**: clicking a pill opens a popover form with id, label, field (dropdown from schema columns), aggregate (for measures), formula + dependencies (for metrics), format, description
3. **Delete**: right-click pill → "Remove from model"
4. **Suggestion badges**: pills with `status: 'suggested'` have an amber dot; clicking shows accept/dismiss

### 7.2 Cmd-K Integration

Metrics are surfaced in the Cmd-K command palette:

```
> ARPU                        metric · revenue / users · $,.2f
> Total Revenue               measure · sum(revenue) · $,.0f
> Region                      dimension · region_name · nominal
```

Selecting a metric/measure/dimension from Cmd-K drops it into the active encoding channel (whichever channel has focus, or Y by default for measures, X for dimensions).

### 7.3 Metric Definitions as Reusable Assets

A metric like `ARPU = revenue / users` is usable in three contexts:
1. **Chart editor** — drag from SemanticFieldRail, or select from Cmd-K
2. **Agent conversation** — "What's our ARPU?" triggers the metric definition
3. **Dashboard tiles** — any tile can reference a metric by id; the compiler resolves it

This is the Looker LookML pattern: define once, use everywhere. AskDB's advantage is that the agent can *suggest* metric definitions from observed query patterns.

---

## 8. Governance

### 8.1 Versioning

Each JSON file has a `version: 1` field. Future schema changes bump this version. The loader checks version and applies migrations if needed (same pattern as `dashboard_migration.py`).

### 8.2 Changelog

Every file includes a `changelog: ChangelogEntry[]` array. Entries are append-only. Each records: timestamp, action type, target identifier, before/after values.

**Capped at 500 entries per file.** Oldest entries are pruned when the cap is reached. Full history available in the audit trail.

### 8.3 Audit Trail Integration

All semantic layer changes are logged to `audit_trail.py` with these event types:

| Event | Trigger |
|---|---|
| `semantic_bootstrap` | AI bootstrap completes |
| `semantic_suggestion_accepted` | User accepts a bootstrapped suggestion |
| `semantic_suggestion_dismissed` | User dismisses a suggestion |
| `linguistic_edit` | User manually edits synonym/phrasing/sample question |
| `color_map_edit` | User manually edits color assignment |
| `metric_edit` | User creates/updates/deletes a metric |
| `teach_correction_accepted` | User accepts a teach-by-correction suggestion |
| `teach_correction_dismissed` | User dismisses a teach-by-correction suggestion |

### 8.4 Access Control

Phase D: connection owner (the user who created the connection) has full edit rights. All other users on the same account see the semantic layer as read-only.

Phase D+1 (when workspace sharing ships): workspace members get role-based access (viewer / editor / admin).

---

## 9. Phased Implementation Plan

### Phase D0 — Storage Migration + Linguistic Model Types (~1 week)

- Create `semantic_layer.py` with CRUD for linguistic model, color map, and per-connection semantic model
- Migrate existing `chart_customizations.json` semantic models to per-connection storage
- Add `linguistic.ts` and `colorMap.ts` type definitions to `chart-ir/semantic/`
- Add new API endpoints under `/api/v1/connections/{conn_id}/semantic/`
- Add Zustand slices for linguistic model + color map
- Write validator for LinguisticModel (same pattern as existing `validateSemanticModel`)
- 15-20 new tests (storage CRUD, migration, validation)

### Phase D1 — AI Bootstrap + Agent Integration (~1.5 weeks)

- Create `semantic_bootstrap.py` — Haiku-powered bootstrap from SchemaProfile
- Wire bootstrap trigger: after `profile_connection()` completes, offer bootstrap
- Add `/api/v1/connections/{conn_id}/semantic/bootstrap` endpoint
- Modify `agent_engine.py` to inject semantic context into system prompt as cached block
- Create `BootstrapReview.jsx` — modal for reviewing and accepting suggestions
- Wire bootstrap into connection flow (after successful connect → "Generate semantic layer?")
- 10-15 new tests (bootstrap output validation, agent prompt injection, mock Haiku responses)

### Phase D2 — Persistent Color Map + Compiler Integration (~1 week)

- Create `chart-ir/semantic/colorMap.ts` with `resolveColor()` helper
- Modify `toVegaLite.ts` to inject color map scales into Vega-Lite specs
- Add color map awareness to inspector color picker (on-object editing)
- Add "Apply to all charts" checkbox in color picker
- Add Color Map tab in SemanticSettings
- 10-12 new tests (color resolution, compiler injection, conflict resolution)

### Phase D3 — Teach-by-Correction Loop (~1.5 weeks)

- Create `chart-ir/semantic/correctionDetector.ts`
- Create `CorrectionToast.jsx` — non-blocking toast with accept/dismiss
- Wire correction detection into chart editor's spec-change handler
- Integrate accepted corrections into linguistic model / color map writes
- Add audit trail events for corrections
- Wire into behavior engine for correction pattern tracking
- 12-15 new tests (delta detection, suggestion classification, toast lifecycle, feedback loop)

### Phase D4 — Settings UI + Metric Editor + Cmd-K + Polish (~1.5 weeks)

- Create `SemanticSettings.jsx` — full tabbed editor (Synonyms, Phrasings, Sample Questions, Color Map, Metrics)
- Extend SemanticFieldRail with inline add/edit/delete
- Add metrics to Cmd-K command palette
- Add suggestion badge count on SemanticFieldRail header
- Route at `/semantic-settings` or modal from workspace settings gear
- Polish: empty states, loading states, error handling, keyboard navigation
- Update CLAUDE.md with new modules, routes, and data paths
- 8-10 new tests (settings UI interactions, Cmd-K integration)

### Test Budget Summary

| Phase | New tests | Cumulative |
|---|---|---|
| D0 | 15-20 | 15-20 |
| D1 | 10-15 | 25-35 |
| D2 | 10-12 | 35-47 |
| D3 | 12-15 | 47-62 |
| D4 | 8-10 | 55-72 |

**Total: ~55-72 new tests** across TypeScript (Vitest) and Python (pytest).

---

## 10. Competitive Positioning

| Capability | Power BI Q&A | Looker LookML | AskDB (after D) |
|---|---|---|---|
| Synonym management | Manual YAML editing or teach-Q&A UI | Manual LookML `label` / `alias` | **AI-bootstrapped + teach-by-correction** |
| Phrasings / relationships | Manual YAML verb/attribute/name phrasings | LookML `relationship` + `sql_on` in Explores | **AI-generated from FK analysis + user refinement** |
| Sample questions | Not formalized | Not formalized | **Auto-generated, shown as BottomDock suggestions** |
| Persistent color map | Not available | Not available (Hex / Lightdash have it) | **First-class feature, wired into IR compiler** |
| Metric definitions | DAX measures (hand-authored, powerful) | LookML measures (hand-authored, powerful) | **AI-suggested + hand-refinable, reusable across charts/agent/Cmd-K** |
| Learning from corrections | Teach-Q&A workflow (limited to synonyms) | Not available | **Full loop: field renames, color assignments, aggregation defaults** |
| Authoring effort | High (semantic model author maintains YAML) | High (LookML developer maintains model) | **Low (AI bootstraps, user reviews)** |

**Key differentiator:** AskDB is the first BI tool where the semantic layer is **AI-maintained and human-refined** rather than human-maintained. The agent generates it, the user corrects it, and the corrections make the agent smarter. This is the flywheel that no competitor has.

---

## 11. Risk Register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Bootstrap quality — Haiku generates low-quality synonyms/phrasings for obscure schemas | Suggestions always require human review. Bootstrap prompt includes schema profile WITH sample values. Fallback: user creates from scratch via settings UI. |
| 2 | Color map conflicts — same column name in multiple tables with different semantics | Resolver supports table-qualified keys (`orders.status:Active`) as override. Conflict detection in settings UI. |
| 3 | Teach-by-correction noise — too many toasts annoy user | Rate limit: max 2 toasts per minute. Auto-dismiss at 8s. Session-scoped dedup (never re-suggest dismissed correction). Per-workspace disable toggle. |
| 4 | Prompt cache size — semantic context too large for heavily annotated schemas | Cap: 800 tokens for semantic block. If exceeded, prioritize: synonyms (most NL impact) > phrasings > metrics > sample questions > color map. |
| 5 | Migration from chart_customizations.json — data loss during migration | Preserve old file. Migration is copy, not move. Verify by reading both old and new paths. |
| 6 | Performance — loading three JSON files per connection on hydration | Single endpoint returns all three. Files are small (~1-10KB each). Cached in memory after first load per session. |
| 7 | Stale linguistic model — schema changes after bootstrap | Wire schema hash change detection (existing in `schema_intelligence.py`) to re-trigger bootstrap suggestion: "Schema changed. Update semantic layer?" |

---

## 12. Autonomous Design Assumptions

These decisions were made autonomously (no live user) during this scheduled task. Tagged for review:

| # | Decision | Rationale | Review needed? |
|---|---|---|---|
| A1 | Per-connection scoping (not per-user) for all semantic data | Synonyms and phrasings are schema-specific. Different connections have different schemas. | Low — this is clearly correct |
| A2 | Three separate files (linguistic, color_map, model) not one monolith | Separation of concerns. Different edit frequencies. Different audit needs. | Low — modular is better |
| A3 | Haiku for bootstrap (not Sonnet) | Cost-effective (~$0.002/bootstrap). Synonym/phrasing generation doesn't need Sonnet-class reasoning. | Low — can always upgrade |
| A4 | 800-token cap on semantic prompt context | Balances comprehensiveness with prompt efficiency. Haiku context window is 200K — not a constraint. Priority order ensures most impactful data fits. | Medium — may need tuning |
| A5 | Toast-based teach-by-correction (not modal/sidebar) | Non-blocking UX. User shouldn't be interrupted. 8s auto-dismiss prevents toast fatigue. | Medium — UX preference |
| A6 | Changelog capped at 500 entries per file | Balances audit needs with file size. Full history in audit_trail.py. | Low — conservative cap |
| A7 | No multi-user governance in D (deferred to D+1) | Workspace sharing doesn't exist yet. Building governance for a single-user system is premature. | Low — correct deferral |
| A8 | Color map uses column-level keys (not table-qualified) by default | Cross-table consistency is the whole point of semantic color. Table-qualified override available for conflicts. | Medium — edge case handling |
