// frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx
// Plan 10a T8 — layer-aware format editor.
// Renders a property grid showing the resolved value + winning layer for
// each editable StyleProp. Edits write at the currently selected layer
// (via setFormatRuleAnalystPro); Reset clears the override at that layer
// only (via clearFormatRuleAnalystPro). Precedence: Mark > Field >
// Worksheet > DS > Workbook (see Build_Tableau.md §XIV.1).
import React, { useMemo } from 'react';

import { useStore } from '../../../../store';
import { FormatResolver } from '../lib/formatResolver';
import { StyleProp } from '../lib/formattingTypes';
import styles from './FormatInspectorPanel.module.css';

const EDITABLE_PROPS = [
  { prop: StyleProp.Color, label: 'Color', input: 'color' },
  { prop: StyleProp.BackgroundColor, label: 'Background', input: 'color' },
  { prop: StyleProp.FontSize, label: 'Font size', input: 'number' },
  { prop: StyleProp.FontWeight, label: 'Font weight', input: 'text' },
];

export default function FormatInspectorPanel({ selector, context }) {
  const rules = useStore((s) => s.analystProFormatRules);
  const setRule = useStore((s) => s.setFormatRuleAnalystPro);
  const clearRule = useStore((s) => s.clearFormatRuleAnalystPro);
  const resolver = useMemo(() => new FormatResolver(rules), [rules]);

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        Format — <strong>{describeSelector(selector)}</strong>
      </header>
      <table className={styles.grid}>
        <thead>
          <tr>
            <th>Property</th>
            <th>Resolved</th>
            <th>Source</th>
            <th>Override</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {EDITABLE_PROPS.map(({ prop, label, input }) => {
            const found = resolver.resolveWithSource(
              context.markId, context.fieldId, context.sheetId, context.dsId, prop,
            );
            const idBase = `fmt-${prop}`.replace(/[^a-z0-9-]/gi, '');
            return (
              <tr key={prop}>
                <td>{label}</td>
                <td data-testid={`${idBase}-value`}>{found ? String(found.value) : '—'}</td>
                <td data-testid={`${idBase}-source`}>{found ? found.layer : '—'}</td>
                <td>
                  <input
                    data-testid={`${idBase}-input`}
                    type={input}
                    onChange={(e) => setRule(
                      selector,
                      prop,
                      input === 'number' ? Number(e.target.value) : e.target.value,
                    )}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    data-testid={`${idBase}-reset`}
                    onClick={() => clearRule(selector, prop)}
                  >
                    Reset
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function describeSelector(s) {
  if (s.kind === 'workbook') return 'Workbook';
  if (s.kind === 'ds') return `Data source · ${s.dsId}`;
  if (s.kind === 'sheet') return `Worksheet · ${s.sheetId}`;
  if (s.kind === 'field') return `Field · ${s.fieldId}`;
  if (s.kind === 'mark') return `Mark · ${s.markId}`;
  return 'Unknown';
}
