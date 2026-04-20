// Plan 9a T10 — ReferenceLineDialog.
//
// Tableau-style editor for a single ReferenceLineSpec. Opened by the Analytics
// sidebar (T9) via `openReferenceLineDialogAnalystPro({ sheetId, kind, preset })`.
// On Save, dispatches `addReferenceLineAnalystPro(sheetId, spec)` — the real
// store action, no duplicated mutation — and closes the dialog.
//
// Wiring pattern mirrors CalcEditorDialog (Plan 8d T11): FloatingLayer renders
// the component conditionally from the `analystProReferenceLineDialog` slice.
//
// Spec fields: axis, aggregation, value, percentile, scope, label, custom_label,
// line_style, color, show_marker. See `docs/superpowers/plans/2026-04-20-analyst-pro-
// plan-9a-reference-lines-totals.md` §Task 10 Step 3.

import React, { useState } from 'react';
import { useStore } from '../../../../store';

export default function ReferenceLineDialog() {
  const dialog = useStore((s) => s.analystProReferenceLineDialog);
  const openDialog = useStore((s) => s.openReferenceLineDialogAnalystPro);
  const add = useStore((s) => s.addReferenceLineAnalystPro);

  const [form, setForm] = useState(() => ({
    axis: 'y',
    aggregation: dialog?.preset?.aggregation ?? 'mean',
    value: null,
    percentile: null,
    scope: 'entire',
    label: 'computation',
    custom_label: '',
    line_style: 'solid',
    color: '#4C78A8',
    show_marker: true,
  }));

  if (!dialog) return null;

  const close = () => openDialog?.(null);

  const set = (k) => (e) => setForm((f) => ({
    ...f,
    [k]: e.target.type === 'checkbox'
      ? e.target.checked
      : e.target.type === 'number'
      ? (e.target.value === '' ? null : Number(e.target.value))
      : e.target.value,
  }));

  const onSave = () => {
    add?.(dialog.sheetId, form);
    close();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reference line editor"
      className="rl-dialog"
    >
      <label>Axis
        <select aria-label="Axis" value={form.axis} onChange={set('axis')}>
          <option value="x">X</option>
          <option value="y">Y</option>
        </select>
      </label>

      <label>Aggregation
        <select
          aria-label="Aggregation"
          value={form.aggregation}
          onChange={set('aggregation')}
        >
          {['constant', 'mean', 'median', 'sum', 'min', 'max', 'percentile'].map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>

      {form.aggregation === 'constant' && (
        <label>Value
          <input
            type="number"
            aria-label="Value"
            value={form.value ?? ''}
            onChange={set('value')}
          />
        </label>
      )}

      {form.aggregation === 'percentile' && (
        <label>Percentile
          <input
            type="number"
            min={1}
            max={99}
            aria-label="Percentile"
            value={form.percentile ?? ''}
            onChange={set('percentile')}
          />
        </label>
      )}

      <label>Scope
        <select aria-label="Scope" value={form.scope} onChange={set('scope')}>
          <option value="entire">Entire Table</option>
          <option value="pane">Per Pane</option>
          <option value="cell">Per Cell</option>
        </select>
      </label>

      <label>Label
        <select aria-label="Label" value={form.label} onChange={set('label')}>
          <option value="value">Value</option>
          <option value="computation">Computation</option>
          <option value="custom">Custom</option>
          <option value="none">None</option>
        </select>
      </label>

      {form.label === 'custom' && (
        <label>Custom label
          <input
            aria-label="Custom label"
            value={form.custom_label}
            onChange={set('custom_label')}
          />
        </label>
      )}

      <label>Line style
        <select
          aria-label="Line style"
          value={form.line_style}
          onChange={set('line_style')}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>

      <label>Color
        <input
          type="color"
          aria-label="Color"
          value={form.color}
          onChange={set('color')}
        />
      </label>

      <label>Show marker
        <input
          type="checkbox"
          aria-label="Show marker"
          checked={form.show_marker}
          onChange={set('show_marker')}
        />
      </label>

      <div className="rl-dialog__actions">
        <button type="button" onClick={close}>Cancel</button>
        <button type="button" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
