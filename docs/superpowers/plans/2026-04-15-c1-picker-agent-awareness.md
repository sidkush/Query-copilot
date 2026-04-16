# Sub-project C Phase C1 — Picker Integration + Agent Awareness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make user-authored chart types visible everywhere — the CustomTypePicker UI, the Show Me recommender, and the AI agent's `suggest_chart` tool. After C1, the agent can say "I see you have a custom Waterfall chart registered. Let me use that."

**Architecture:** Implement `CustomTypePicker.jsx` (4 existing tests to pass), extend `showMe.ts` to score user types alongside built-ins, add `_build_chart_type_context()` to `agent_engine.py` for system prompt injection, and extend `_tool_suggest_chart_spec()` to consider user types.

**Tech Stack:** React (CustomTypePicker), TypeScript (showMe recommender extension), Python (agent engine).

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-c-design.md`](../specs/2026-04-15-chart-system-sub-project-c-design.md) §7, §Phase C1.

**Depends on:** C0 (composer UI), C foundation (userTypes registry + backend CRUD).

---

## File Structure

### New frontend files
```
frontend/src/
  components/editor/CustomTypePicker.jsx    # Implement to pass 4 existing tests
```

### Modified frontend files
```
frontend/src/
  chart-ir/recommender/showMe.ts           # +user type scoring
```

### Modified backend files
```
backend/
  agent_engine.py                          # +_build_chart_type_context() + extend suggest_chart
```

---

## Task 1: Implement `CustomTypePicker.jsx` — pass existing tests

**Files:**
- Create: `frontend/src/components/editor/CustomTypePicker.jsx`

The test scaffold at `chart-ir/__tests__/editor/customTypePicker.test.tsx` already defines 4 tests. The component must pass them all.

- [ ] **Step 1: Read the existing tests**

Read `frontend/src/chart-ir/__tests__/editor/customTypePicker.test.tsx` fully to understand what the tests expect:

1. `fetches chart types from api.listChartTypes on mount and lists them by category` — expects `data-testid="custom-type-item-org:waterfall"` and `data-testid="custom-type-group-Org"`
2. `opens the param form when a type is clicked` — expects `data-testid="custom-type-param-form"`, `custom-type-param-categoryField`, `custom-type-param-valueField`
3. `submits the form and dispatches an instantiated spec via onSpecChange` — fires change events on param inputs, clicks `custom-type-param-submit`, expects `onSpecChange` called with a ChartSpec where encoding.x.field === 'region'
4. `renders a column dropdown for field params when columnProfile is supplied` — expects a `<SELECT>` element for field params with column options

The test mocks `api.listChartTypes` to return `{ chart_types: [SAMPLE_TYPE] }`. The component receives props: `onSpecChange(spec)` and optional `columnProfile`.

- [ ] **Step 2: Implement the component**

The component:
1. On mount, calls `api.listChartTypes()` and hydrates `globalUserChartTypeRegistry`
2. Lists types grouped by category (section headers with `data-testid="custom-type-group-{category}"`)
3. Each type is a clickable item (`data-testid="custom-type-item-{id}"`)
4. Clicking a type opens a parameter form (`data-testid="custom-type-param-form"`)
5. Each field parameter renders as an input or select (if `columnProfile` provided → `<select>` with column options; otherwise `<input type="text">`)
6. Each param element has `data-testid="custom-type-param-{paramName}"`
7. Submit button (`data-testid="custom-type-param-submit"`) instantiates the type via `globalUserChartTypeRegistry.instantiate(typeId, params)` and calls `onSpecChange(spec)`

Import `globalUserChartTypeRegistry` from `../../chart-ir` and `api` from `../../api`.

- [ ] **Step 3: Run existing tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/editor/customTypePicker.test.tsx
```
Expected: 4 passed

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/CustomTypePicker.jsx && git commit -m "feat(c1): implement CustomTypePicker — pass 4 existing test-scaffold tests"
```

---

## Task 2: Extend Show Me recommender with user types

**Files:**
- Modify: `frontend/src/chart-ir/recommender/showMe.ts`
- Modify: `frontend/src/chart-ir/__tests__/showMe.test.ts`

- [ ] **Step 1: Write test for user type recommendations**

Add to `showMe.test.ts`:

```typescript
import { globalUserChartTypeRegistry } from '../index';

describe('recommendCharts with user types', () => {
  beforeEach(() => {
    globalUserChartTypeRegistry.clear();
  });

  it('includes matching user types in recommendations', () => {
    globalUserChartTypeRegistry.register({
      id: 'user:waterfall',
      name: 'Revenue Waterfall',
      category: 'Custom',
      schemaVersion: 1,
      parameters: [
        { name: 'category', kind: 'field', semanticType: 'nominal' },
        { name: 'amount', kind: 'field', semanticType: 'quantitative' },
      ],
      specTemplate: {
        $schema: 'askdb/chart-spec/v1',
        type: 'cartesian',
        mark: 'bar',
        encoding: {
          x: { field: '${category}', type: 'nominal' },
          y: { field: '${amount}', type: 'quantitative', aggregate: 'sum' },
        },
      },
    });

    const shape = {
      dimensions: [{ name: 'region', semanticType: 'nominal', cardinality: 5 }],
      measures: [{ name: 'revenue', semanticType: 'quantitative' }],
      hasDate: false,
      hasGeo: false,
      rowCount: 100,
    };

    const recs = recommendCharts(shape);
    const userRec = recs.find((r) => r.id === 'user:waterfall');
    expect(userRec).toBeDefined();
    expect(userRec!.label).toBe('Revenue Waterfall');
  });

  it('does not include user types that do not match data shape', () => {
    globalUserChartTypeRegistry.register({
      id: 'user:geo-only',
      name: 'Geo Chart',
      category: 'Custom',
      schemaVersion: 1,
      parameters: [
        { name: 'location', kind: 'field', semanticType: 'geographic' },
        { name: 'amount', kind: 'field', semanticType: 'quantitative' },
      ],
      specTemplate: {
        $schema: 'askdb/chart-spec/v1',
        type: 'cartesian',
        mark: 'point',
        encoding: {
          x: { field: '${location}', type: 'nominal' },
          y: { field: '${amount}', type: 'quantitative' },
        },
      },
    });

    const shape = {
      dimensions: [{ name: 'category', semanticType: 'nominal', cardinality: 5 }],
      measures: [{ name: 'revenue', semanticType: 'quantitative' }],
      hasDate: false,
      hasGeo: false,
      rowCount: 100,
    };

    const recs = recommendCharts(shape);
    expect(recs.find((r) => r.id === 'user:geo-only')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Extend `recommendCharts` in `showMe.ts`**

After computing built-in recommendations, iterate `globalUserChartTypeRegistry.list()`. For each user type:
1. Check if all `field`-kind parameters have a matching column in the result shape (semantic type match)
2. If all match, create a recommendation entry with `source: 'user-type'`
3. Score lower than built-ins (user types are suggestions, not defaults)

Import `globalUserChartTypeRegistry` from the index.

- [ ] **Step 3: Run tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/showMe.test.ts
```

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/recommender/showMe.ts frontend/src/chart-ir/__tests__/showMe.test.ts && git commit -m "feat(c1): extend Show Me recommender to score user-authored chart types against column profiles"
```

---

## Task 3: Agent system prompt injection for custom chart types

**Files:**
- Modify: `backend/agent_engine.py`

- [ ] **Step 1: Add `_build_chart_type_context` method**

Similar to D1's `_build_semantic_context`, but reads user-authored chart types:

```python
def _build_chart_type_context(self) -> str:
    """Inject user's custom chart types into the agent's system prompt."""
    try:
        from chart_customization import list_chart_types
        types = list_chart_types(self.email)
        if not types:
            return ""

        lines = ["\n\n=== Available Custom Chart Types ===\n"]
        lines.append(
            "The user has custom chart types installed. Consider them alongside "
            "built-in types when suggesting charts.\n"
        )
        for t in types[:20]:
            params = ", ".join(
                f"{p.get('name', '?')} ({p.get('semanticType', p.get('kind', '?'))})"
                for p in t.get('parameters', [])
            )
            lines.append(f"- {t.get('id', '?')} — \"{t.get('name', '?')}\": {params}")

        lines.append(
            "\nWhen the data shape matches a custom type's parameters, prefer it "
            "over a generic built-in if the type name/category aligns with the question context."
        )
        lines.append("=== End Custom Chart Types ===")

        block = "\n".join(lines)
        if len(block) > 1500:
            block = block[:1500] + "\n... (truncated)\n=== End Custom Chart Types ==="
        return block
    except Exception as exc:
        _logger.debug("_build_chart_type_context failed (non-fatal): %s", exc)
        return ""
```

- [ ] **Step 2: Wire into `_run_inner()` after the semantic context block**

Find the semantic context injection (added in D1):
```python
        semantic_context = self._build_semantic_context()
        if semantic_context:
            system_prompt += semantic_context
```

Add immediately after:
```python
        # ── Custom chart types context (Sub-project C Phase C1) ──
        chart_type_context = self._build_chart_type_context()
        if chart_type_context:
            system_prompt += chart_type_context
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add backend/agent_engine.py && git commit -m "feat(c1): inject custom chart types into agent system prompt — agent sees user-authored types"
```

---

## Task 4: Phase C1 checkpoint

- [ ] **Step 1: Run CustomTypePicker tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/editor/customTypePicker.test.tsx 2>&1 | tail -10
```
Expected: 4 passed

- [ ] **Step 2: Run Show Me tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/showMe.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Run userTypes foundation tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/userTypes/ 2>&1 | tail -10
```

- [ ] **Step 4: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 5: Tag**

```bash
cd "QueryCopilot V1" && git tag c1-picker-agent
```
