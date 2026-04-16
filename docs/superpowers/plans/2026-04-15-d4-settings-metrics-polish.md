# Sub-project D Phase D4 — Settings UI + Metric Editor + Cmd-K + Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-facing UI for managing the semantic layer: a tabbed settings editor for synonyms/phrasings/questions/colors/metrics, Cmd-K metric palette integration, SemanticFieldRail suggestion badges, and final polish.

**Architecture:** New `SemanticSettings.jsx` page with 5 tabs. Each tab wraps an editable table/list component. Reuses existing `ColorMapEditor` (D2) for the Color Map tab. Metrics surface in the existing `CommandPalette.jsx` via a command generator that reads from the semantic model. SemanticFieldRail gains inline "+" buttons and amber suggestion badges.

**Tech Stack:** React (page + tab components), Zustand (store reads), existing `CommandPalette` command injection, existing `api.js` endpoints.

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md`](../specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md) §7, §Phase D4.

**Depends on:** D0-D3 completed.

---

## File Structure

### New frontend files
```
frontend/src/
  components/editor/SemanticSettings.jsx            # 5-tab settings page
  components/editor/tabs/SynonymsTab.jsx            # Editable synonym table
  components/editor/tabs/PhrasingsTab.jsx           # Editable phrasings list
  components/editor/tabs/SampleQuestionsTab.jsx     # Editable questions list
  components/editor/tabs/MetricsTab.jsx             # Metric create/edit/delete
  pages/SemanticSettingsPage.jsx                    # Route wrapper
```

### Modified frontend files
```
frontend/src/
  components/editor/SemanticFieldRail.jsx           # +inline add, suggestion badges
  components/dashboard/CommandPalette.jsx            # +metric commands from semantic model
  App.jsx                                           # +/semantic-settings route
```

---

## Task 1: SemanticSettings tabbed shell + SynonymsTab

**Files:**
- Create: `frontend/src/components/editor/SemanticSettings.jsx`
- Create: `frontend/src/components/editor/tabs/SynonymsTab.jsx`
- Create: `frontend/src/pages/SemanticSettingsPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create `SemanticSettings.jsx`**

A tabbed container with 5 tabs. Each tab lazy-loads its content component.

```jsx
import { useState } from 'react';
import useStore from '../../store';
import SynonymsTab from './tabs/SynonymsTab';
import PhrasingsTab from './tabs/PhrasingsTab';
import SampleQuestionsTab from './tabs/SampleQuestionsTab';
import ColorMapEditor from './ColorMapEditor';
import MetricsTab from './tabs/MetricsTab';

const TABS = [
  { id: 'synonyms', label: 'Synonyms' },
  { id: 'phrasings', label: 'Phrasings' },
  { id: 'questions', label: 'Sample Questions' },
  { id: 'colors', label: 'Color Map' },
  { id: 'metrics', label: 'Metrics' },
];

export default function SemanticSettings({ connId }) {
  const [activeTab, setActiveTab] = useState('synonyms');
  const linguisticModel = useStore((s) => s.linguisticModel);
  const colorMap = useStore((s) => s.colorMap);
  const activeSemanticModel = useStore((s) => s.activeSemanticModel);
  const setLinguisticModel = useStore((s) => s.setLinguisticModel);
  const setColorMap = useStore((s) => s.setColorMap);
  const setActiveSemanticModel = useStore((s) => s.setActiveSemanticModel);

  return (
    <div data-testid="semantic-settings" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Semantic Layer Settings</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Manage how AskDB understands your data — synonyms, relationships, colors, and metrics.
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.1))', marginBottom: 20 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--text-primary, #e2e8f0)' : 'var(--text-muted, #64748b)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'synonyms' && (
        <SynonymsTab connId={connId} linguistic={linguisticModel} onUpdate={setLinguisticModel} />
      )}
      {activeTab === 'phrasings' && (
        <PhrasingsTab connId={connId} linguistic={linguisticModel} onUpdate={setLinguisticModel} />
      )}
      {activeTab === 'questions' && (
        <SampleQuestionsTab connId={connId} linguistic={linguisticModel} onUpdate={setLinguisticModel} />
      )}
      {activeTab === 'colors' && (
        <ColorMapEditor connId={connId} colorMap={colorMap} onUpdate={setColorMap} />
      )}
      {activeTab === 'metrics' && (
        <MetricsTab connId={connId} model={activeSemanticModel} onUpdate={setActiveSemanticModel} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `SynonymsTab.jsx`**

Editable table for table + column + value synonyms. Three sub-sections.

```jsx
import { useState, useCallback } from 'react';
import { api } from '../../../api';

export default function SynonymsTab({ connId, linguistic, onUpdate }) {
  const synonyms = linguistic?.synonyms || { tables: {}, columns: {}, values: {} };

  const save = useCallback(async (updated) => {
    const next = {
      ...linguistic,
      synonyms: updated,
      updated_at: new Date().toISOString(),
    };
    try {
      const resp = await api.saveLinguisticModel(connId, next);
      onUpdate(resp?.linguistic || next);
    } catch (err) {
      console.warn('Failed to save synonyms:', err);
    }
  }, [connId, linguistic, onUpdate]);

  return (
    <div>
      <SynonymSection
        title="Table Synonyms"
        subtitle="Alternative names for your database tables"
        data={synonyms.tables || {}}
        keyLabel="Table"
        onChange={(tables) => save({ ...synonyms, tables })}
      />
      <SynonymSection
        title="Column Synonyms"
        subtitle="Alternative names for columns (format: table.column)"
        data={synonyms.columns || {}}
        keyLabel="Column"
        onChange={(columns) => save({ ...synonyms, columns })}
      />
      <SynonymSection
        title="Value Synonyms"
        subtitle="Alternative names for coded values (format: table.column:value)"
        data={synonyms.values || {}}
        keyLabel="Value"
        onChange={(values) => save({ ...synonyms, values })}
      />
    </div>
  );
}

function SynonymSection({ title, subtitle, data, keyLabel, onChange }) {
  const [newKey, setNewKey] = useState('');
  const [newSyns, setNewSyns] = useState('');

  const handleAdd = () => {
    if (!newKey || !newSyns) return;
    const syns = newSyns.split(',').map((s) => s.trim()).filter(Boolean);
    onChange({ ...data, [newKey]: [...(data[newKey] || []), ...syns] });
    setNewKey('');
    setNewSyns('');
  };

  const handleDelete = (key) => {
    const next = { ...data };
    delete next[key];
    onChange(next);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={sectionTitleStyle}>{title}</h3>
      <p style={subtitleStyle}>{subtitle}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <th style={thStyle}>{keyLabel}</th>
            <th style={thStyle}>Synonyms</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data).map(([key, syns]) => (
            <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={tdStyle}><code>{key}</code></td>
              <td style={tdStyle}>{Array.isArray(syns) ? syns.join(', ') : String(syns)}</td>
              <td style={tdStyle}>
                <button onClick={() => handleDelete(key)} style={deleteBtn}>Remove</button>
              </td>
            </tr>
          ))}
          <tr>
            <td style={tdStyle}>
              <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder={keyLabel.toLowerCase()} style={inputStyle} />
            </td>
            <td style={tdStyle}>
              <input value={newSyns} onChange={(e) => setNewSyns(e.target.value)} placeholder="comma-separated synonyms" style={inputStyle}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }} />
            </td>
            <td style={tdStyle}>
              <button onClick={handleAdd} disabled={!newKey || !newSyns} style={addBtn}>Add</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const sectionTitleStyle = { fontSize: 14, fontWeight: 600, marginBottom: 4 };
const subtitleStyle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 };
const thStyle = { textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '6px 8px' };
const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'inherit', width: '100%' };
const deleteBtn = { background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 };
const addBtn = { padding: '4px 12px', borderRadius: 6, fontSize: 12, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' };
```

- [ ] **Step 3: Create `SemanticSettingsPage.jsx`**

```jsx
import useStore from '../store';
import SemanticSettings from '../components/editor/SemanticSettings';

export default function SemanticSettingsPage() {
  const activeConnId = useStore((s) => s.activeConnId);

  if (!activeConnId) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
        Connect to a database first to configure the semantic layer.
      </div>
    );
  }

  return <SemanticSettings connId={activeConnId} />;
}
```

- [ ] **Step 4: Add route in `App.jsx`**

Read `App.jsx`, find the protected route section (with `AppLayout`), add:
```jsx
<Route path="/semantic-settings" element={<SemanticSettingsPage />} />
```

Import: `import SemanticSettingsPage from './pages/SemanticSettingsPage';`

If routes are lazy-loaded, use the lazy pattern. If direct imports, use direct import.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/SemanticSettings.jsx frontend/src/components/editor/tabs/SynonymsTab.jsx frontend/src/pages/SemanticSettingsPage.jsx frontend/src/App.jsx && git commit -m "feat(d4): SemanticSettings tabbed page + SynonymsTab + /semantic-settings route"
```

---

## Task 2: PhrasingsTab + SampleQuestionsTab + MetricsTab

**Files:**
- Create: `frontend/src/components/editor/tabs/PhrasingsTab.jsx`
- Create: `frontend/src/components/editor/tabs/SampleQuestionsTab.jsx`
- Create: `frontend/src/components/editor/tabs/MetricsTab.jsx`

- [ ] **Step 1: Create `PhrasingsTab.jsx`**

Editable list of phrasings. Each row shows type badge + template + entities + status badge. Add/delete buttons.

Structure: table with columns [Type, Template, Entities, Status, Actions]. Add row at bottom with dropdowns for type + text inputs for template/entities.

- [ ] **Step 2: Create `SampleQuestionsTab.jsx`**

Editable list of sample questions. Each row shows table + question + status badge. Add/delete.

Simpler than phrasings — just table + question + status columns.

- [ ] **Step 3: Create `MetricsTab.jsx`**

Metric create/edit/delete. Each row shows label + formula + dependencies + format. Inline editing via popovers or expanding row.

More complex: formula input, dependency multi-select from existing measures, format string input. Keep it simple — inline form with text inputs.

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/tabs/PhrasingsTab.jsx frontend/src/components/editor/tabs/SampleQuestionsTab.jsx frontend/src/components/editor/tabs/MetricsTab.jsx && git commit -m "feat(d4): PhrasingsTab + SampleQuestionsTab + MetricsTab for SemanticSettings"
```

---

## Task 3: Metrics in Cmd-K command palette

**Files:**
- Modify: `frontend/src/components/dashboard/CommandPalette.jsx` (or wherever commands are assembled)

- [ ] **Step 1: Find where commands are built**

Read the component that opens CommandPalette (likely `DashboardHeader.jsx` or parent) to find where the `commands` array is assembled. Add a section that reads metrics from the semantic model store.

- [ ] **Step 2: Add metric commands**

```javascript
// In the command builder, after existing command categories:
const semanticModel = useStore((s) => s.activeSemanticModel);
const metricCommands = (semanticModel?.metrics || []).map((m) => ({
  label: m.label || m.id,
  kind: 'metric',
  hint: `${m.formula} · ${m.format || ''}`.trim(),
  action: () => {
    // Drop metric into active encoding channel
    // Use the same dispatch as SemanticFieldRail drag-drop
    const spec = useStore.getState().chartEditor.currentSpec;
    if (spec) {
      // Apply metric to Y channel by default
      useStore.getState().setChartEditorSpec({
        ...spec,
        encoding: {
          ...spec.encoding,
          y: { field: `metric:${m.id}`, type: 'quantitative', title: m.label },
        },
      });
    }
  },
}));
```

Merge `metricCommands` into the `commands` array passed to `<CommandPalette>`.

Also add dimension/measure commands:
```javascript
const dimCommands = (semanticModel?.dimensions || []).map((d) => ({
  label: d.label || d.id,
  kind: 'dimension',
  hint: `${d.field} · ${d.semanticType}`,
  action: () => { /* drop into X channel */ },
}));
const measureCommands = (semanticModel?.measures || []).map((m) => ({
  label: m.label || m.id,
  kind: 'measure',
  hint: `${m.aggregate}(${m.field}) · ${m.format || ''}`.trim(),
  action: () => { /* drop into Y channel */ },
}));
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/dashboard/CommandPalette.jsx frontend/src/components/dashboard/DashboardHeader.jsx && git commit -m "feat(d4): surface metrics + dimensions + measures in Cmd-K command palette"
```

---

## Task 4: SemanticFieldRail — suggestion badges + inline add

**Files:**
- Modify: `frontend/src/components/editor/SemanticFieldRail.jsx`

- [ ] **Step 1: Add suggestion badge count**

Count entries with `status: 'suggested'` across dimensions + measures + metrics. Show an amber badge next to the rail header:

```jsx
const suggestedCount = [
  ...(model?.dimensions || []),
  ...(model?.measures || []),
  ...(model?.metrics || []),
].filter((e) => e.status === 'suggested').length;
```

Render badge near the rail title:
```jsx
{suggestedCount > 0 && (
  <span style={{
    background: '#f59e0b', color: '#000', fontSize: 10, fontWeight: 700,
    padding: '1px 6px', borderRadius: 10, marginLeft: 6,
  }}>
    {suggestedCount}
  </span>
)}
```

- [ ] **Step 2: Add "Edit model" link**

At the bottom of the rail, add a link to `/semantic-settings`:
```jsx
<a href="/semantic-settings" style={{ fontSize: 11, color: '#3b82f6', marginTop: 8, display: 'block' }}>
  Edit semantic model →
</a>
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/SemanticFieldRail.jsx && git commit -m "feat(d4): SemanticFieldRail suggestion badges + edit model link"
```

---

## Task 5: Phase D4 checkpoint + final tag

- [ ] **Step 1: Run all semantic tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/semantic/ 2>&1 | tail -10
```

- [ ] **Step 2: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 3: Run all backend semantic tests**

```bash
cd "QueryCopilot V1/backend" && python -m pytest tests/test_semantic_layer.py tests/test_semantic_bootstrap.py -v 2>&1 | tail -10
```

- [ ] **Step 4: Tag**

```bash
cd "QueryCopilot V1" && git tag d4-semantic-layer-v1
```

- [ ] **Step 5: Final commit note**

```bash
cd "QueryCopilot V1" && git commit --allow-empty -m "milestone: Sub-project D (semantic layer) complete — linguistic model, color map, teach-by-correction, settings UI, metrics, Cmd-K"
```
