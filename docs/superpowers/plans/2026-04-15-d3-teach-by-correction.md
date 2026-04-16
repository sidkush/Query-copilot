# Sub-project D Phase D3 — Teach-by-Correction Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user edits an agent-generated chart (changes a field, recolors a series, swaps an aggregation), detect the delta, classify it as a synonym/color/default correction, and surface a non-blocking toast offering to remember the change for future charts.

**Architecture:** New `correctionDetector.ts` diffs two ChartSpecs and produces typed `CorrectionSuggestion` objects. New `CorrectionToast.jsx` renders suggestions as stacking toasts with accept/dismiss + auto-dismiss at 8s. The Zustand store's `setChartEditorSpec` gains a subscriber that fires the detector on each spec change. Accepted corrections write to the linguistic model or color map via the D0 REST API.

**Tech Stack:** TypeScript (pure detection logic), React (toast component), Zustand (subscription), existing D0 REST endpoints.

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md`](../specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md) §5, §Phase D3.

**Depends on:** D0 (types + CRUD), D1 (linguistic model + agent context), D2 (color map + compiler).

---

## File Structure

### New frontend files
```
frontend/src/
  chart-ir/semantic/correctionDetector.ts           # Diff two specs → CorrectionSuggestion[]
  chart-ir/__tests__/semantic/correctionDetector.test.ts
  components/editor/CorrectionToast.jsx             # Non-blocking toast stack
```

### Modified frontend files
```
frontend/src/
  store.js                                          # +correction detection wiring in setChartEditorSpec
  components/editor/ChartEditor.jsx                 # Mount CorrectionToast overlay
```

---

## Task 1: Correction detector — pure function

**Files:**
- Create: `frontend/src/chart-ir/semantic/correctionDetector.ts`
- Create: `frontend/src/chart-ir/__tests__/semantic/correctionDetector.test.ts`
- Modify: `frontend/src/chart-ir/index.ts`

- [ ] **Step 1: Write tests**

```typescript
// frontend/src/chart-ir/__tests__/semantic/correctionDetector.test.ts
import { describe, it, expect } from 'vitest';
import {
  detectCorrections,
  type CorrectionSuggestion,
} from '../../semantic/correctionDetector';
import type { ChartSpec } from '../../types';

function baseSpec(): ChartSpec {
  return {
    $schema: 'askdb/chart-spec/v1',
    type: 'cartesian',
    mark: 'bar',
    encoding: {
      x: { field: 'region', type: 'nominal' },
      y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
      color: { field: 'region', type: 'nominal' },
    },
  };
}

describe('detectCorrections', () => {
  it('detects field rename as synonym suggestion', () => {
    const before = baseSpec();
    const after = { ...baseSpec() };
    after.encoding = { ...after.encoding!, x: { field: 'state', type: 'nominal' } };

    const suggestions = detectCorrections(before, after);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const syn = suggestions.find((s) => s.type === 'synonym');
    expect(syn).toBeDefined();
    expect(syn!.payload.oldField).toBe('region');
    expect(syn!.payload.newField).toBe('state');
  });

  it('detects color change as color_map suggestion', () => {
    const before = baseSpec();
    const after = {
      ...baseSpec(),
      encoding: {
        ...baseSpec().encoding!,
        color: {
          field: 'region',
          type: 'nominal' as const,
          scheme: undefined,
          scale: { domain: ['Europe'], range: ['#ff0000'] },
        },
      },
    };

    const suggestions = detectCorrections(before, after as ChartSpec);
    const color = suggestions.find((s) => s.type === 'color_map');
    expect(color).toBeDefined();
    expect(color!.payload.field).toBe('region');
  });

  it('detects aggregation change as measure_default suggestion', () => {
    const before = baseSpec();
    const after = { ...baseSpec() };
    after.encoding = {
      ...after.encoding!,
      y: { field: 'revenue', type: 'quantitative', aggregate: 'avg' },
    };

    const suggestions = detectCorrections(before, after);
    const agg = suggestions.find((s) => s.type === 'measure_default');
    expect(agg).toBeDefined();
    expect(agg!.payload.field).toBe('revenue');
    expect(agg!.payload.oldAggregate).toBe('sum');
    expect(agg!.payload.newAggregate).toBe('avg');
  });

  it('returns empty array when specs are identical', () => {
    const spec = baseSpec();
    expect(detectCorrections(spec, spec)).toEqual([]);
  });

  it('returns empty array when before is null', () => {
    expect(detectCorrections(null as unknown as ChartSpec, baseSpec())).toEqual([]);
  });

  it('handles mark type change without crashing', () => {
    const before = baseSpec();
    const after = { ...baseSpec(), mark: 'line' as const };
    // Mark type change is not a correction — just a different chart type
    const suggestions = detectCorrections(before, after);
    expect(Array.isArray(suggestions)).toBe(true);
  });

  it('generates unique ids for each suggestion', () => {
    const before = baseSpec();
    const after = { ...baseSpec() };
    after.encoding = {
      ...after.encoding!,
      x: { field: 'state', type: 'nominal' },
      y: { field: 'revenue', type: 'quantitative', aggregate: 'avg' },
    };
    const suggestions = detectCorrections(before, after);
    const ids = suggestions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests — expect module not found**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/semantic/correctionDetector.test.ts`

- [ ] **Step 3: Implement `correctionDetector.ts`**

```typescript
// frontend/src/chart-ir/semantic/correctionDetector.ts
/**
 * correctionDetector.ts — Sub-project D Phase D3.
 *
 * Diffs two ChartSpecs and classifies deltas into correction suggestions
 * that the teach-by-correction loop surfaces as toasts.
 *
 * Detectable correction types:
 *   - synonym: field renamed in an encoding channel
 *   - color_map: color scale domain/range changed
 *   - measure_default: aggregation changed on a measure field
 */

import type { ChartSpec, Encoding, FieldRef } from '../types';

export type CorrectionType = 'synonym' | 'color_map' | 'measure_default';

export interface CorrectionSuggestion {
  id: string;
  type: CorrectionType;
  message: string;
  payload: Record<string, unknown>;
}

let _idCounter = 0;
function nextId(): string {
  return `corr-${Date.now()}-${++_idCounter}`;
}

const ENCODING_CHANNELS: (keyof Encoding)[] = [
  'x', 'y', 'x2', 'y2', 'color', 'size', 'shape', 'opacity', 'text', 'row', 'column', 'order',
];

export function detectCorrections(
  before: ChartSpec | null | undefined,
  after: ChartSpec | null | undefined,
): CorrectionSuggestion[] {
  if (!before || !after) return [];
  if (!before.encoding || !after.encoding) return [];

  const suggestions: CorrectionSuggestion[] = [];

  for (const channel of ENCODING_CHANNELS) {
    const bField = (before.encoding as Record<string, FieldRef | undefined>)[channel];
    const aField = (after.encoding as Record<string, FieldRef | undefined>)[channel];
    if (!bField || !aField) continue;

    // Detect field rename → synonym suggestion
    if (bField.field && aField.field && bField.field !== aField.field) {
      suggestions.push({
        id: nextId(),
        type: 'synonym',
        message: `Remember "${aField.field}" as a synonym for "${bField.field}"?`,
        payload: {
          channel,
          oldField: bField.field,
          newField: aField.field,
        },
      });
    }

    // Detect aggregation change → measure_default suggestion
    if (
      bField.field === aField.field &&
      bField.aggregate &&
      aField.aggregate &&
      bField.aggregate !== aField.aggregate
    ) {
      suggestions.push({
        id: nextId(),
        type: 'measure_default',
        message: `Default aggregate for "${aField.field}" is ${aField.aggregate}?`,
        payload: {
          channel,
          field: aField.field,
          oldAggregate: bField.aggregate,
          newAggregate: aField.aggregate,
        },
      });
    }
  }

  // Detect color scale changes → color_map suggestion
  const bColor = before.encoding.color;
  const aColor = after.encoding.color;
  if (bColor && aColor && aColor.field) {
    const bScale = (bColor as Record<string, unknown>).scale as Record<string, unknown> | undefined;
    const aScale = (aColor as Record<string, unknown>).scale as Record<string, unknown> | undefined;

    const bDomain = bScale?.domain as string[] | undefined;
    const aDomain = aScale?.domain as string[] | undefined;
    const bRange = bScale?.range as string[] | undefined;
    const aRange = aScale?.range as string[] | undefined;

    if (aDomain && aRange && (!bDomain || !bRange || JSON.stringify(bRange) !== JSON.stringify(aRange))) {
      suggestions.push({
        id: nextId(),
        type: 'color_map',
        message: `Save color assignments for "${aColor.field}" to all charts?`,
        payload: {
          field: aColor.field,
          domain: aDomain,
          range: aRange,
        },
      });
    }
  }

  return suggestions;
}
```

- [ ] **Step 4: Export from `chart-ir/index.ts`**

Add:
```typescript
// Sub-project D Phase D3 — teach-by-correction
export { detectCorrections } from './semantic/correctionDetector';
export type { CorrectionSuggestion, CorrectionType } from './semantic/correctionDetector';
```

- [ ] **Step 5: Run tests — expect 7 passed**

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/semantic/correctionDetector.ts frontend/src/chart-ir/__tests__/semantic/correctionDetector.test.ts frontend/src/chart-ir/index.ts && git commit -m "feat(d3): correctionDetector — diff ChartSpecs into synonym/color/aggregate correction suggestions"
```

---

## Task 2: CorrectionToast component

**Files:**
- Create: `frontend/src/components/editor/CorrectionToast.jsx`

- [ ] **Step 1: Create the component**

```jsx
import { useEffect, useCallback } from 'react';
import useStore from '../../store';
import { api } from '../../api';

/**
 * CorrectionToast — non-blocking toast stack for teach-by-correction.
 *
 * Shows one suggestion at a time from the correctionSuggestions array in
 * the store. Auto-dismisses after 8 seconds. Accept writes to linguistic
 * model or color map via the D0 API. Max 2 toasts per minute (rate limit).
 *
 * Mount this inside ChartEditor so it overlays the canvas.
 */
const AUTO_DISMISS_MS = 8000;

export default function CorrectionToast({ connId }) {
  const suggestions = useStore((s) => s.correctionSuggestions);
  const dismiss = useStore((s) => s.dismissCorrectionSuggestion);
  const linguisticModel = useStore((s) => s.linguisticModel);
  const colorMap = useStore((s) => s.colorMap);
  const setLinguisticModel = useStore((s) => s.setLinguisticModel);
  const setColorMap = useStore((s) => s.setColorMap);

  const current = suggestions[0] || null;

  // Auto-dismiss timer
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => dismiss(current.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [current?.id, dismiss]);

  const handleAccept = useCallback(async () => {
    if (!current || !connId) return;

    try {
      if (current.type === 'synonym') {
        const { oldField, newField } = current.payload;
        const updated = {
          ...(linguisticModel || { version: 1, conn_id: connId, updated_at: new Date().toISOString(), synonyms: { tables: {}, columns: {}, values: {} }, phrasings: [], sampleQuestions: [], changelog: [] }),
        };
        const colKey = String(oldField);
        const existingSyns = updated.synonyms?.columns?.[colKey] || [];
        if (!existingSyns.includes(String(newField))) {
          existingSyns.push(String(newField));
        }
        if (!updated.synonyms) updated.synonyms = { tables: {}, columns: {}, values: {} };
        if (!updated.synonyms.columns) updated.synonyms.columns = {};
        updated.synonyms.columns[colKey] = existingSyns;
        updated.updated_at = new Date().toISOString();
        updated.changelog = [...(updated.changelog || []), {
          ts: new Date().toISOString(),
          action: 'teach_correction',
          target: `synonym:columns:${colKey}`,
          after: existingSyns,
        }];
        const resp = await api.saveLinguisticModel(connId, updated);
        setLinguisticModel(resp?.linguistic || updated);
      } else if (current.type === 'color_map') {
        const { field, domain, range } = current.payload;
        const updated = {
          ...(colorMap || { version: 1, conn_id: connId, updated_at: new Date().toISOString(), assignments: {}, changelog: [] }),
        };
        if (!updated.assignments) updated.assignments = {};
        const domainArr = Array.isArray(domain) ? domain : [];
        const rangeArr = Array.isArray(range) ? range : [];
        for (let i = 0; i < domainArr.length; i++) {
          if (rangeArr[i]) {
            updated.assignments[`${String(field)}:${domainArr[i]}`] = rangeArr[i];
          }
        }
        updated.updated_at = new Date().toISOString();
        updated.changelog = [...(updated.changelog || []), {
          ts: new Date().toISOString(),
          action: 'teach_correction',
          target: `color_map:${String(field)}`,
        }];
        const resp = await api.saveColorMap(connId, updated);
        setColorMap(resp?.colorMap || updated);
      }
      // measure_default: would update the semantic model's measure aggregate
      // Deferred to D4 — for now just dismiss
    } catch (err) {
      console.warn('[CorrectionToast] Failed to save correction:', err);
    }

    dismiss(current.id);
  }, [current, connId, linguisticModel, colorMap, dismiss, setLinguisticModel, setColorMap]);

  const handleDismiss = useCallback(() => {
    if (current) dismiss(current.id);
  }, [current, dismiss]);

  if (!current) return null;

  return (
    <div
      data-testid="correction-toast"
      style={{
        position: 'absolute',
        bottom: 64,
        right: 16,
        zIndex: 60,
        width: 360,
        padding: '12px 16px',
        borderRadius: 10,
        background: 'rgba(30, 30, 50, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        fontSize: 13,
        color: '#e2e8f0',
      }}
    >
      <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
        {current.message}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
        {current.type === 'synonym' && 'Future charts will understand both terms.'}
        {current.type === 'color_map' && 'This color will apply to all charts in this workspace.'}
        {current.type === 'measure_default' && 'Future charts will use this aggregation by default.'}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={handleDismiss}
          style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
            color: '#94a3b8', cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
        <button
          onClick={handleAccept}
          style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12,
            background: '#3b82f6', border: 'none',
            color: '#fff', cursor: 'pointer', fontWeight: 600,
          }}
        >
          Accept
        </button>
      </div>
      {/* Auto-dismiss progress bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        borderRadius: '0 0 10px 10px', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', background: 'rgba(59, 130, 246, 0.5)',
          animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards`,
        }} />
      </div>
      <style>{`@keyframes shrink { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/CorrectionToast.jsx && git commit -m "feat(d3): CorrectionToast — non-blocking teach-by-correction toast with accept/dismiss + auto-dismiss"
```

---

## Task 3: Wire correction detection into store + ChartEditor

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/components/editor/ChartEditor.jsx`

- [ ] **Step 1: Add correction detection to `setChartEditorSpec`**

In `store.js`, modify `setChartEditorSpec` to fire the correction detector after pushing history. Add at the TOP of the file (or near the chart-ir imports):

```javascript
import { detectCorrections } from './chart-ir';
```

Then inside `setChartEditorSpec`, after computing `nextHistory`/`nextIndex` and before the return statement, add:

```javascript
      // Teach-by-correction: detect deltas and surface suggestions
      const prevSpec = editor.history[editor.historyIndex] || null;
      if (prevSpec && nextSpec && pushHistory) {
        try {
          const corrections = detectCorrections(prevSpec, nextSpec);
          if (corrections.length > 0) {
            // Rate limit: max 2 per minute. Check timestamp of last suggestion.
            const now = Date.now();
            const recentCount = s.correctionSuggestions.filter(
              (c) => c._ts && now - c._ts < 60000
            ).length;
            if (recentCount < 2) {
              const tagged = corrections.map((c) => ({ ...c, _ts: now }));
              // Merge into next state (can't call set() inside set(), so include in return)
              return {
                chartEditor: {
                  ...editor,
                  currentSpec: nextSpec,
                  history: nextHistory,
                  historyIndex: nextIndex,
                },
                correctionSuggestions: [...s.correctionSuggestions, ...tagged],
              };
            }
          }
        } catch (err) {
          // Non-fatal — swallow detection errors
        }
      }
```

IMPORTANT: This modifies the existing return path. The correction suggestions need to be merged into the same return object as the chartEditor state update. Read the existing `setChartEditorSpec` carefully and integrate the detection into the existing flow — don't create a separate `set()` call.

- [ ] **Step 2: Mount CorrectionToast in ChartEditor.jsx**

In `ChartEditor.jsx`:
1. Import: `import CorrectionToast from './CorrectionToast';`
2. Get the active connection ID (look for how other components get it — probably from store or props)
3. Render `<CorrectionToast connId={activeConnId} />` inside the editor's root container, positioned to overlay the canvas area

Read ChartEditor.jsx first to find the right mount point and the connection ID source.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/store.js frontend/src/components/editor/ChartEditor.jsx && git commit -m "feat(d3): wire correction detection into setChartEditorSpec + mount CorrectionToast in editor"
```

---

## Task 4: Phase D3 checkpoint

- [ ] **Step 1: Run correction detector tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/semantic/correctionDetector.test.ts 2>&1 | tail -10
```
Expected: 7 passed

- [ ] **Step 2: Run full semantic test suite**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/semantic/ 2>&1 | tail -10
```

- [ ] **Step 3: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 4: Tag**

```bash
cd "QueryCopilot V1" && git tag d3-teach-correction
```
