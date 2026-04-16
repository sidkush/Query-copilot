# Sub-project C Phase C0 — Spec Template Composer UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual UI for creating new chart types from composable IR primitives — users define parameters, drag them to encoding channels, pick a mark type, preview with mock data, and save as a `UserChartType` entry in the registry.

**Architecture:** New `SpecTemplateComposer.jsx` page component reuses the existing `MarksCard` and `ChannelSlot` in "template mode" — instead of real database columns, the rails show user-defined parameters as draggable pills. A parameter editor form creates `UserChartTypeParam` entries. `SpecTemplatePreview.jsx` auto-generates mock data from parameter semantic types and renders via the existing `VegaRenderer`. Saving calls the existing `/api/v1/chart-types` POST endpoint (from the C foundation).

**Tech Stack:** React (composer UI), existing MarksCard/ChannelSlot components, existing `instantiateUserChartType` + `VegaRenderer`, existing backend CRUD.

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-c-design.md`](../specs/2026-04-15-chart-system-sub-project-c-design.md) §2.2, §Phase C0.

**Depends on:** C foundation (userTypes/types.ts, schema.ts, instantiate.ts, registry.ts — all implemented).

---

## File Structure

### New frontend files
```
frontend/src/
  components/editor/SpecTemplateComposer.jsx     # Main composer — param editor + encoding tray + mark picker
  components/editor/SpecTemplatePreview.jsx       # Mock data + VegaRenderer preview
  components/editor/ParameterEditor.jsx           # Form for defining UserChartTypeParam entries
  pages/ChartTypeComposerPage.jsx                 # Route wrapper
```

### Modified frontend files
```
frontend/src/
  App.jsx                                        # +/chart-types/new route
```

---

## Task 1: ParameterEditor component

**Files:**
- Create: `frontend/src/components/editor/ParameterEditor.jsx`

- [ ] **Step 1: Create the component**

A form for defining and managing `UserChartTypeParam` entries. Each parameter has: name, kind (field/aggregate/literal/number/boolean), semanticType (for field kind), required (boolean), default value.

```jsx
import { useState, useCallback } from 'react';

/**
 * ParameterEditor — form for defining chart type parameters.
 *
 * Parameters become ${placeholder} values in the spec template.
 * When a user instantiates the chart type, they fill in the params
 * (e.g. pick which column maps to each parameter).
 *
 * Props:
 *   - parameters: UserChartTypeParam[] — current list
 *   - onChange: (params: UserChartTypeParam[]) => void
 */

const KINDS = [
  { value: 'field', label: 'Field (column reference)' },
  { value: 'aggregate', label: 'Aggregate (sum, avg, ...)' },
  { value: 'literal', label: 'Literal (text value)' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean (true/false)' },
];

const SEMANTIC_TYPES = [
  { value: 'nominal', label: 'Nominal (categorical)' },
  { value: 'ordinal', label: 'Ordinal (ordered)' },
  { value: 'quantitative', label: 'Quantitative (numeric)' },
  { value: 'temporal', label: 'Temporal (date/time)' },
  { value: 'geographic', label: 'Geographic' },
];

export default function ParameterEditor({ parameters = [], onChange }) {
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState('field');
  const [newSemType, setNewSemType] = useState('quantitative');

  const handleAdd = useCallback(() => {
    if (!newName.trim()) return;
    const param = {
      name: newName.trim(),
      kind: newKind,
      required: true,
      ...(newKind === 'field' ? { semanticType: newSemType } : {}),
    };
    onChange([...parameters, param]);
    setNewName('');
  }, [newName, newKind, newSemType, parameters, onChange]);

  const handleRemove = useCallback((index) => {
    onChange(parameters.filter((_, i) => i !== index));
  }, [parameters, onChange]);

  return (
    <div data-testid="parameter-editor">
      <h3 style={sectionTitle}>Parameters</h3>
      <p style={subtitle}>Define the inputs users provide when using this chart type.</p>

      {/* Existing parameters */}
      {parameters.map((p, i) => (
        <div key={i} style={paramRow}>
          <code style={paramName}>${'{'}${p.name}{'}'}</code>
          <span style={paramKind}>{p.kind}</span>
          {p.semanticType && <span style={paramSemType}>{p.semanticType}</span>}
          <button onClick={() => handleRemove(i)} style={removeBtn}>×</button>
        </div>
      ))}

      {/* Add new parameter */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="parameterName"
          style={inputStyle}
          data-testid="param-name-input"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <select value={newKind} onChange={(e) => setNewKind(e.target.value)} style={selectStyle}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        {newKind === 'field' && (
          <select value={newSemType} onChange={(e) => setNewSemType(e.target.value)} style={selectStyle}>
            {SEMANTIC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
        <button onClick={handleAdd} disabled={!newName.trim()} style={addBtn} data-testid="param-add-btn">
          + Add
        </button>
      </div>
    </div>
  );
}

const sectionTitle = { fontSize: 14, fontWeight: 600, marginBottom: 4 };
const subtitle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 };
const paramRow = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 };
const paramName = { fontSize: 12, background: 'rgba(59,130,246,0.15)', padding: '2px 8px', borderRadius: 4, color: '#60a5fa' };
const paramKind = { fontSize: 11, color: 'var(--text-muted)' };
const paramSemType = { fontSize: 11, color: '#a78bfa' };
const removeBtn = { background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14 };
const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'inherit', width: 160 };
const selectStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'inherit' };
const addBtn = { padding: '4px 12px', borderRadius: 6, fontSize: 12, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' };
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/ParameterEditor.jsx && git commit -m "feat(c0): ParameterEditor — form for defining UserChartType parameters"
```

---

## Task 2: SpecTemplatePreview component

**Files:**
- Create: `frontend/src/components/editor/SpecTemplatePreview.jsx`

- [ ] **Step 1: Create the component**

Takes a `UserChartType` definition + generates mock data from the parameter semantic types + instantiates the template + renders via VegaRenderer.

```jsx
import { useMemo } from 'react';
import VegaRenderer from './renderers/VegaRenderer';
import { instantiateUserChartType } from '../../chart-ir';

/**
 * SpecTemplatePreview — live preview of a user-authored chart type.
 *
 * Auto-generates mock data from parameter definitions, instantiates
 * the spec template with mock field names, and renders via VegaRenderer.
 *
 * Props:
 *   - chartType: UserChartType (partial — may be under construction)
 *   - width/height: preview dimensions
 */

const MOCK_GENERATORS = {
  nominal: () => ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'],
  ordinal: () => ['Low', 'Medium', 'High', 'Critical'],
  quantitative: () => Array.from({ length: 20 }, () => Math.round(Math.random() * 1000)),
  temporal: () => Array.from({ length: 20 }, (_, i) => {
    const d = new Date(2026, 0, 1);
    d.setDate(d.getDate() + i * 7);
    return d.toISOString().slice(0, 10);
  }),
  geographic: () => ['United States', 'Germany', 'Japan', 'Brazil', 'India'],
};

function generateMockParams(parameters) {
  const params = {};
  for (const p of parameters) {
    if (p.kind === 'field') {
      params[p.name] = `mock_${p.name}`;
    } else if (p.kind === 'aggregate') {
      params[p.name] = p.default || 'sum';
    } else if (p.kind === 'number') {
      params[p.name] = p.default ?? 10;
    } else if (p.kind === 'boolean') {
      params[p.name] = p.default ?? true;
    } else {
      params[p.name] = p.default ?? p.name;
    }
  }
  return params;
}

function generateMockData(parameters) {
  const fieldParams = parameters.filter((p) => p.kind === 'field');
  if (fieldParams.length === 0) return { columns: [], rows: [] };

  const columns = fieldParams.map((p) => `mock_${p.name}`);
  const generators = fieldParams.map(
    (p) => (MOCK_GENERATORS[p.semanticType] || MOCK_GENERATORS.nominal)()
  );

  const rowCount = Math.min(...generators.map((g) => g.length));
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push(columns.map((_, ci) => generators[ci][i]));
  }

  return { columns, rows };
}

export default function SpecTemplatePreview({ chartType }) {
  const { spec, resultSet, error } = useMemo(() => {
    if (!chartType?.specTemplate || !chartType?.parameters) {
      return { spec: null, resultSet: null, error: 'Define parameters and encoding first' };
    }
    try {
      const mockParams = generateMockParams(chartType.parameters);
      const instantiated = instantiateUserChartType(chartType, mockParams);
      const mockData = generateMockData(chartType.parameters);
      return { spec: instantiated, resultSet: mockData, error: null };
    } catch (err) {
      return { spec: null, resultSet: null, error: err.message || String(err) };
    }
  }, [chartType]);

  if (error) {
    return (
      <div data-testid="template-preview-error" style={{
        padding: 24, textAlign: 'center', color: 'var(--text-muted)',
        fontSize: 13, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {error}
      </div>
    );
  }

  return (
    <div data-testid="template-preview" style={{ height: '100%' }}>
      <VegaRenderer spec={spec} resultSet={resultSet} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/SpecTemplatePreview.jsx && git commit -m "feat(c0): SpecTemplatePreview — mock data generation + live VegaRenderer preview for chart type templates"
```

---

## Task 3: SpecTemplateComposer — main composer page

**Files:**
- Create: `frontend/src/components/editor/SpecTemplateComposer.jsx`

- [ ] **Step 1: Create the composer**

The main page combining: metadata form (name, description, category), parameter editor, mark type picker, encoding channel assignment (simplified MarksCard-like UI), and live preview.

The composer maintains a draft `UserChartType` in local state. When the user assigns parameters to channels, the `specTemplate` is built dynamically. The preview re-renders on every change.

Key sections:
1. **Metadata bar** — name, description, category inputs
2. **Left panel** — ParameterEditor (define params) + mark type dropdown
3. **Center** — Encoding assignment: for each channel (X, Y, Color, Size), a dropdown of available parameters
4. **Right** — SpecTemplatePreview

The encoding assignment is simpler than the full MarksCard drag-drop — just dropdowns that map parameter names to channels. This is because in template mode you're assigning abstract parameters, not real data columns.

When the user picks `myRevenue` for Y channel, the specTemplate gets:
```json
{ "encoding": { "y": { "field": "${myRevenue}", "type": "quantitative" } } }
```

Save button calls `api.saveChartType(userChartType)` which POSTs to `/api/v1/chart-types`.

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/SpecTemplateComposer.jsx && git commit -m "feat(c0): SpecTemplateComposer — visual UI for building chart type templates from IR primitives"
```

---

## Task 4: Route + page wrapper

**Files:**
- Create: `frontend/src/pages/ChartTypeComposerPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create page wrapper**

```jsx
import SpecTemplateComposer from '../components/editor/SpecTemplateComposer';

export default function ChartTypeComposerPage() {
  return <SpecTemplateComposer />;
}
```

- [ ] **Step 2: Add route in App.jsx**

Add `/chart-types/new` as a protected route with AppLayout:
```jsx
<Route path="/chart-types/new" element={<ChartTypeComposerPage />} />
```

Lazy import: `const ChartTypeComposerPage = lazy(() => import('./pages/ChartTypeComposerPage'));`

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/pages/ChartTypeComposerPage.jsx frontend/src/App.jsx && git commit -m "feat(c0): /chart-types/new route for Spec Template Composer"
```

---

## Task 5: Phase C0 checkpoint

- [ ] **Step 1: Run existing userTypes tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/userTypes/ 2>&1 | tail -10
```
Expected: 21 passed (existing foundation tests still green)

- [ ] **Step 2: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 3: Tag**

```bash
cd "QueryCopilot V1" && git tag c0-composer
```
