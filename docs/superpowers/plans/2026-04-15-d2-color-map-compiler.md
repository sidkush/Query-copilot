# Sub-project D Phase D2 — Persistent Color Map + Compiler Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the persistent color map into the Vega-Lite compiler so "Europe" is always `#4a8fe7` across every chart, and add a color map editor in the workspace settings.

**Architecture:** `compileToVegaLite()` gains an optional `colorMap` parameter. When a `color` encoding exists and the color map has matching assignments, the compiler injects `scale: { domain: [...], range: [...] }` into the Vega-Lite output. The `EditorCanvas` reads the active color map from the Zustand store and passes it to the compiler. A new `ColorMapEditor.jsx` provides a table-style editor for managing assignments.

**Tech Stack:** TypeScript (compiler extension), React (editor component), existing `buildColorScale()` from D0.

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md`](../specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md) §4, §Phase D2.

**Depends on:** D0 (`colorMap.ts` types + `buildColorScale()` + backend CRUD) — completed.

---

## File Structure

### Modified frontend files
```
frontend/src/
  chart-ir/compiler/toVegaLite.ts        # +colorMap param → inject scale domain/range
  chart-ir/__tests__/toVegaLite.test.ts   # +color map injection tests
  components/editor/EditorCanvas.jsx      # Pass colorMap from store to compiler
  components/editor/renderers/VegaRenderer.tsx  # Accept + forward colorMap prop
```

### New frontend files
```
frontend/src/
  components/editor/ColorMapEditor.jsx    # Table editor for color assignments
```

---

## Task 1: Compiler color map integration

**Files:**
- Modify: `frontend/src/chart-ir/compiler/toVegaLite.ts`
- Modify: `frontend/src/chart-ir/__tests__/toVegaLite.test.ts`

- [ ] **Step 1: Write tests for color map injection**

Add to the existing `toVegaLite.test.ts`:

```typescript
import { buildColorScale, type ColorMap } from '../semantic/colorMap';

const TEST_COLOR_MAP: ColorMap = {
  version: 1,
  conn_id: 'test',
  updated_at: '2026-04-15T00:00:00Z',
  assignments: {
    'region:Europe': '#4a8fe7',
    'region:North America': '#2dbf71',
    'region:Asia': '#e0b862',
  },
  changelog: [],
};

describe('compileToVegaLite with colorMap', () => {
  it('injects scale domain + range when color field matches color map', () => {
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'month', type: 'temporal' },
        y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
        color: { field: 'region', type: 'nominal' },
      },
    };
    const vl = compileToVegaLite(spec, TEST_COLOR_MAP);
    expect(vl.encoding?.color?.scale).toBeDefined();
    expect(vl.encoding?.color?.scale?.domain).toEqual(['Europe', 'North America', 'Asia']);
    expect(vl.encoding?.color?.scale?.range).toEqual(['#4a8fe7', '#2dbf71', '#e0b862']);
  });

  it('preserves existing scheme when no color map matches', () => {
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'line',
      encoding: {
        x: { field: 'month', type: 'temporal' },
        y: { field: 'revenue', type: 'quantitative' },
        color: { field: 'category', type: 'nominal', scheme: 'tableau10' },
      },
    };
    const vl = compileToVegaLite(spec, TEST_COLOR_MAP);
    expect(vl.encoding?.color?.scale?.scheme).toBe('tableau10');
    expect(vl.encoding?.color?.scale?.domain).toBeUndefined();
  });

  it('works without a color map (backward compat)', () => {
    const vl = compileToVegaLite(SIMPLE_BAR);
    expect(vl.mark).toBe('bar');
    // No error, no scale injection
  });

  it('does not inject scale when spec has no color encoding', () => {
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'value', type: 'quantitative' },
      },
    };
    const vl = compileToVegaLite(spec, TEST_COLOR_MAP);
    expect(vl.encoding?.color).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect failures (signature doesn't accept colorMap yet)**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/toVegaLite.test.ts`

- [ ] **Step 3: Extend `compileToVegaLite` to accept optional colorMap**

In `toVegaLite.ts`:

1. Add import at top:
```typescript
import { buildColorScale, type ColorMap } from '../semantic/colorMap';
```

2. Change the function signature:
```typescript
export function compileToVegaLite(spec: ChartSpec, colorMap?: ColorMap): VegaLiteSpec {
```

3. Pass colorMap through to `compileInner`:
```typescript
const inner = compileInner(spec, colorMap);
```

4. Update `compileInner` signature:
```typescript
function compileInner(spec: ChartSpec, colorMap?: ColorMap): VegaLiteSpec {
```

5. After the encoding compilation block (`if (spec.encoding) out.encoding = compileEncoding(spec.encoding);`), add color map injection:
```typescript
  // Persistent color map injection (Sub-project D Phase D2)
  if (colorMap && out.encoding?.color?.field) {
    const colorField = out.encoding.color.field;
    const scale = buildColorScale(colorMap, colorField);
    if (scale) {
      out.encoding.color = {
        ...out.encoding.color,
        scale: { ...out.encoding.color.scale, ...scale },
      };
    }
  }
```

6. Pass colorMap recursively in layer/facet/concat:
```typescript
  if (spec.layer) {
    out.layer = spec.layer.map((s) => compileInner(s, colorMap));
    return out;
  }
  // ... same for facet.spec, hconcat, vconcat
```

- [ ] **Step 4: Run tests — expect all pass (existing + 4 new)**

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/compiler/toVegaLite.ts frontend/src/chart-ir/__tests__/toVegaLite.test.ts && git commit -m "feat(d2): inject persistent color map into Vega-Lite compiler — 'Europe' always blue"
```

---

## Task 2: Thread colorMap through EditorCanvas → VegaRenderer

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.jsx`
- Modify: `frontend/src/components/editor/renderers/VegaRenderer.tsx`

- [ ] **Step 1: Read EditorCanvas.jsx to find where VegaRenderer is mounted**

EditorCanvas dispatches to renderers based on the IR router. Find where `compileToVegaLite` is called (likely inside VegaRenderer itself) and where the color map can be threaded through.

- [ ] **Step 2: Add colorMap from store to EditorCanvas**

In `EditorCanvas.jsx`, read the colorMap from the Zustand store:
```javascript
const colorMap = useStore((s) => s.colorMap);
```

Pass it as a prop to whichever component eventually reaches VegaRenderer:
```jsx
<VegaRenderer spec={spec} resultSet={resultSet} strategy={strategy} colorMap={colorMap} ... />
```

- [ ] **Step 3: Accept colorMap in VegaRenderer**

In `VegaRenderer.tsx`:

1. Add `colorMap` to `VegaRendererProps`:
```typescript
import type { ColorMap } from '../../../chart-ir/semantic/colorMap';

export interface VegaRendererProps {
  // ...existing props...
  colorMap?: ColorMap;
}
```

2. Pass `colorMap` to `compileToVegaLite`:
```typescript
const compiled = useMemo(() => {
  try {
    if (spec.type !== 'cartesian') {
      return { ok: false as const, error: `...` };
    }
    const vl = compileToVegaLite(spec, colorMap);
    return { ok: true as const, vl };
  } catch (err) {
    return { ok: false as const, error: ... };
  }
}, [spec, colorMap]);
```

Add `colorMap` to the useMemo dependency array.

- [ ] **Step 4: Verify compilation**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/ 2>&1 | tail -10`

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/EditorCanvas.jsx frontend/src/components/editor/renderers/VegaRenderer.tsx && git commit -m "feat(d2): thread colorMap from store through EditorCanvas → VegaRenderer → compiler"
```

---

## Task 3: ColorMapEditor component

**Files:**
- Create: `frontend/src/components/editor/ColorMapEditor.jsx`

- [ ] **Step 1: Create the component**

A table-style editor for managing persistent color assignments. Each row = one assignment. Supports add, edit color, delete.

```jsx
import { useState, useCallback } from 'react';
import useStore from '../../store';
import { api } from '../../api';

/**
 * ColorMapEditor — table editor for persistent color assignments.
 *
 * Props:
 *   - connId: string — active connection ID
 *   - colorMap: ColorMap | null — from store
 *   - onUpdate: (updated) => void — called after save
 */
export default function ColorMapEditor({ connId, colorMap, onUpdate }) {
  const assignments = colorMap?.assignments || {};
  const [newColumn, setNewColumn] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [saving, setSaving] = useState(false);

  const entries = Object.entries(assignments).map(([key, hex]) => {
    const colonIdx = key.lastIndexOf(':');
    return {
      key,
      column: key.slice(0, colonIdx),
      value: key.slice(colonIdx + 1),
      color: hex,
    };
  });

  const handleDelete = useCallback(async (key) => {
    if (!colorMap) return;
    const updated = {
      ...colorMap,
      assignments: { ...colorMap.assignments },
      updated_at: new Date().toISOString(),
    };
    delete updated.assignments[key];
    setSaving(true);
    try {
      await api.saveColorMap(connId, updated);
      onUpdate(updated);
    } finally {
      setSaving(false);
    }
  }, [colorMap, connId, onUpdate]);

  const handleAdd = useCallback(async () => {
    if (!newColumn || !newValue || !newColor) return;
    const key = `${newColumn}:${newValue}`;
    const updated = {
      ...(colorMap || { version: 1, conn_id: connId, changelog: [] }),
      assignments: { ...(colorMap?.assignments || {}), [key]: newColor },
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    try {
      await api.saveColorMap(connId, updated);
      onUpdate(updated);
      setNewColumn('');
      setNewValue('');
      setNewColor('#3b82f6');
    } finally {
      setSaving(false);
    }
  }, [colorMap, connId, newColumn, newValue, newColor, onUpdate]);

  const handleColorChange = useCallback(async (key, hex) => {
    if (!colorMap) return;
    const updated = {
      ...colorMap,
      assignments: { ...colorMap.assignments, [key]: hex },
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    try {
      await api.saveColorMap(connId, updated);
      onUpdate(updated);
    } finally {
      setSaving(false);
    }
  }, [colorMap, connId, onUpdate]);

  return (
    <div data-testid="color-map-editor" style={{ fontSize: 13 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
        Persistent Color Assignments
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Values assigned here will use the same color across every chart in this workspace.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.1))' }}>
            <th style={thStyle}>Column</th>
            <th style={thStyle}>Value</th>
            <th style={thStyle}>Color</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={tdStyle}>{e.column}</td>
              <td style={tdStyle}>{e.value}</td>
              <td style={tdStyle}>
                <input
                  type="color"
                  value={e.color}
                  onChange={(ev) => handleColorChange(e.key, ev.target.value)}
                  style={{ width: 32, height: 24, border: 'none', background: 'none', cursor: 'pointer' }}
                />
                <code style={{ fontSize: 11, marginLeft: 4 }}>{e.color}</code>
              </td>
              <td style={tdStyle}>
                <button
                  onClick={() => handleDelete(e.key)}
                  disabled={saving}
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td style={tdStyle}>
              <input
                value={newColumn}
                onChange={(e) => setNewColumn(e.target.value)}
                placeholder="column"
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="value"
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                style={{ width: 32, height: 24, border: 'none', background: 'none', cursor: 'pointer' }}
              />
            </td>
            <td style={tdStyle}>
              <button
                onClick={handleAdd}
                disabled={saving || !newColumn || !newValue}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12,
                  background: '#3b82f6', color: '#fff', border: 'none',
                  cursor: 'pointer', opacity: (!newColumn || !newValue) ? 0.5 : 1,
                }}
              >
                Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const thStyle = { textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '6px 8px' };
const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'inherit', width: '100%' };
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/ColorMapEditor.jsx && git commit -m "feat(d2): ColorMapEditor — table-style editor for persistent color assignments"
```

---

## Task 4: Phase D2 checkpoint

- [ ] **Step 1: Run compiler tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/toVegaLite.test.ts 2>&1 | tail -10
```
Expected: all pass including 4 new color map tests

- [ ] **Step 2: Run full semantic tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/semantic/ 2>&1 | tail -10
```
Expected: 29 passed

- [ ] **Step 3: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 4: Tag**

```bash
cd "QueryCopilot V1" && git tag d2-color-map
```
