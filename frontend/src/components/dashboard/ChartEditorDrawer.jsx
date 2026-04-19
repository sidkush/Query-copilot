// Typed-Seeking-Spring W3-B — advanced-editor drawer.
//
// Right-side slide-in panel at 70vw that hosts the existing full
// ChartEditor (data rail + canvas + inspector) for Tableau-grade
// control. Wraps the editor in a minimal header with Close + Save
// actions; Save translates the final ChartSpec encodings back to a
// TileBinding patch.
//
// Mapping is intentionally conservative — only `measure`, `dimension`,
// and `filter` are round-tripped. Any other spec details (marks,
// scales, transforms) remain in the local drawer state so power users
// get full fidelity while the binding stays clean.

import { useCallback, useEffect, useRef, useState } from 'react';
import ChartEditor from '../editor/ChartEditor';
import { getSlotDescriptor } from './modes/presets/slots.ts';
import { useStore } from '../../store';
import './ChartEditorDrawer.css';

/**
 * @typedef {object} ChartEditorDrawerProps
 * @property {boolean} open
 * @property {() => void} onClose
 * @property {string} slotId
 * @property {import('./freeform/lib/types').TileBinding} binding
 * @property {(patch: Partial<import('./freeform/lib/types').TileBinding>) => void} onSave
 */

/** Build a minimal ChartSpec from a TileBinding. */
function bindingToSpec(binding) {
  const measure = binding?.measure?.column;
  const agg = binding?.measure?.agg;
  const dimension = binding?.dimension;
  const encoding = {};
  if (dimension) {
    encoding.x = { field: dimension, type: 'nominal' };
  }
  if (measure) {
    encoding.y = {
      field: measure,
      type: 'quantitative',
      ...(agg ? { aggregate: String(agg).toLowerCase() } : {}),
    };
  }
  return {
    $schema: 'askdb/chart-spec/v1',
    type: 'cartesian',
    mark: 'bar',
    encoding,
  };
}

/** Map a ChartSpec's encoding back into a TileBinding patch. */
function specToBindingPatch(spec, kind) {
  /** @type {Partial<import('./freeform/lib/types').TileBinding>} */
  const patch = { kind };
  const enc = spec?.encoding ?? {};
  const y = enc.y;
  if (y && y.field) {
    const aggLower = typeof y.aggregate === 'string' ? y.aggregate.toUpperCase() : undefined;
    const safeAgg = aggLower && ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'COUNT_DISTINCT'].includes(aggLower)
      ? aggLower
      : 'SUM';
    patch.measure = { column: y.field, agg: safeAgg };
  }
  const dimChannel = enc.x?.field ? enc.x : enc.color?.field ? enc.color : null;
  if (dimChannel?.field) {
    patch.dimension = dimChannel.field;
  }
  return patch;
}

/**
 * @param {ChartEditorDrawerProps} props
 */
export default function ChartEditorDrawer({
  open,
  onClose,
  slotId,
  binding,
  onSave,
}) {
  const presetId = useStore((s) => s.analystProDashboard?.activePresetId) ?? '';
  const descriptor = getSlotDescriptor(presetId, slotId);
  const drawerRef = useRef(null);

  const [spec, setSpec] = useState(() => bindingToSpec(binding));

  // Reset the local spec whenever we open against a different slot.
  useEffect(() => {
    if (open) setSpec(bindingToSpec(binding));
  }, [open, slotId, binding]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSpecChange = useCallback((next) => {
    setSpec(next);
  }, []);

  const handleSave = useCallback(() => {
    const kind = binding?.kind ?? descriptor?.kind ?? 'chart';
    const patch = specToBindingPatch(spec, kind);
    onSave(patch);
    onClose();
  }, [spec, binding, descriptor, onSave, onClose]);

  if (!open) return null;

  const title = descriptor?.label ? `Edit: ${descriptor.label}` : 'Edit slot';

  return (
    <>
      <div
        data-testid="chart-editor-drawer-backdrop"
        className="chart-editor-drawer__backdrop"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        data-testid="chart-editor-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="chart-editor-drawer"
      >
        <div className="chart-editor-drawer__header">
          <h2 className="chart-editor-drawer__title">{title}</h2>
          <div className="chart-editor-drawer__actions">
            <button
              type="button"
              data-testid="chart-editor-drawer-save"
              className="chart-editor-drawer__btn chart-editor-drawer__btn--primary"
              onClick={handleSave}
            >
              Save
            </button>
            <button
              type="button"
              data-testid="chart-editor-drawer-close"
              aria-label="Close advanced editor"
              className="chart-editor-drawer__btn chart-editor-drawer__btn--close"
              onClick={onClose}
            >
              {'\u00d7'}
            </button>
          </div>
        </div>
        <div className="chart-editor-drawer__body">
          <ChartEditor
            spec={spec}
            mode="pro"
            surface="dashboard-tile"
            onSpecChange={handleSpecChange}
          />
        </div>
      </div>
    </>
  );
}
