// Typed-Seeking-Spring W3-B — per-slot contextual edit popover.
//
// Renders a 320px floating panel anchored under the slot that the user
// clicked. Content is kind-aware (KPI / chart / table / narrative) and
// offers quick field + aggregation changes, a Filter row, and an
// "Advanced…" escape hatch that opens the full ChartEditor drawer.
//
// Positioning uses plain getBoundingClientRect — we intentionally do
// NOT take a runtime dependency on @floating-ui here even though it's
// installed, because the popover does not need flip/shift logic for
// its 320px-wide canvas fit.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { getSlotDescriptor } from './modes/presets/slots.ts';
import {
  flattenSchemaColumns,
  isMeasureColumn,
  isDimensionColumn,
} from './lib/columnClassify';
import './SlotEditPopover.css';

const AGG_OPTIONS = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'COUNT_DISTINCT'];
const RANK_OPTIONS = [5, 10, 20];
const FILTER_OPS = ['eq', 'in', 'gt', 'lt'];

/**
 * @typedef {object} SlotEditPopoverProps
 * @property {boolean} open
 * @property {() => void} onClose
 * @property {string} presetId
 * @property {string} slotId
 * @property {HTMLElement | null} anchorEl
 * @property {import('./freeform/lib/types').TileBinding} [binding]
 * @property {{ columns: Array<{ name: string; dtype: string; role: string; semantic_type: string }> }} [schemaProfile]
 */

/**
 * @param {SlotEditPopoverProps} props
 */
export default function SlotEditPopover({
  open,
  onClose,
  presetId,
  slotId,
  anchorEl,
  binding,
  schemaProfile,
}) {
  const setSlotBinding = useStore((s) => s.setSlotBinding);
  const openAdvancedEditor = useStore((s) => s.openAdvancedEditor);

  const descriptor = getSlotDescriptor(presetId, slotId);
  const kind = descriptor?.kind ?? binding?.kind ?? 'kpi';
  const popoverRef = useRef(null);

  // ── form state ────────────────────────────────────────────────
  const [measure, setMeasure] = useState(binding?.measure?.column ?? '');
  const [agg, setAgg] = useState(binding?.measure?.agg ?? 'SUM');
  const [dimension, setDimension] = useState(binding?.dimension ?? '');
  const [timeGrain, setTimeGrain] = useState('month');
  const [rankLimit, setRankLimit] = useState(
    typeof binding?.rankLimit === 'number' ? binding.rankLimit : 5
  );
  const [filterEnabled, setFilterEnabled] = useState(Boolean(binding?.filter));
  const [filterCol, setFilterCol] = useState(binding?.filter?.column ?? '');
  const [filterOp, setFilterOp] = useState(
    (binding?.filter?.op && FILTER_OPS.includes(binding.filter.op)) ? binding.filter.op : 'eq'
  );
  const [filterVal, setFilterVal] = useState(
    binding?.filter?.value != null ? String(binding.filter.value) : ''
  );
  const [narrative, setNarrative] = useState(
    binding?.renderedMarkdown ?? binding?.markdownTemplate ?? ''
  );
  const [pinCopy, setPinCopy] = useState(Boolean(binding?.isUserPinned));

  // Reset local state when we open against a new slot. Guarded by `open`;
  // only fires on dialog open transition, not every render.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setMeasure(binding?.measure?.column ?? '');
    setAgg(binding?.measure?.agg ?? 'SUM');
    setDimension(binding?.dimension ?? '');
    setTimeGrain('month');
    setRankLimit(typeof binding?.rankLimit === 'number' ? binding.rankLimit : 5);
    setFilterEnabled(Boolean(binding?.filter));
    setFilterCol(binding?.filter?.column ?? '');
    setFilterOp(binding?.filter?.op ?? 'eq');
    setFilterVal(binding?.filter?.value != null ? String(binding.filter.value) : '');
    setNarrative(binding?.renderedMarkdown ?? binding?.markdownTemplate ?? '');
    setPinCopy(Boolean(binding?.isUserPinned));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, slotId, binding]);

  // ── columns from schema profile ──────────────────────────────
  // Use the shared column classifier so we accept both the backend's
  // { tables: [{columns}] } shape and the legacy { columns: [...] } flat
  // shape, AND infer `role` from SQL type when the backend omits it
  // (which it does for every production schema-profile response today).
  const allColumns = useMemo(
    () => flattenSchemaColumns(schemaProfile),
    [schemaProfile]
  );
  const measureColumns = useMemo(
    () => allColumns.filter(isMeasureColumn),
    [allColumns]
  );
  const dimensionColumns = useMemo(
    () => allColumns.filter(isDimensionColumn),
    [allColumns]
  );

  // ── positioning ──────────────────────────────────────────────
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const top = Math.min(
      rect.bottom + 6,
      (typeof window !== 'undefined' ? window.innerHeight : 800) - 260
    );
    const left = Math.min(
      rect.left,
      (typeof window !== 'undefined' ? window.innerWidth : 1200) - 332
    );
    // Position synced to DOM measurement; runs on open/anchor change only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [open, anchorEl]);

  // ── outside click + Escape ───────────────────────────────────
  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        anchorEl &&
        !anchorEl.contains(e.target)
      ) {
        onClose();
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorEl]);

  const handleSave = useCallback(() => {
    const patch = { kind, isUserPinned: pinCopy };
    if (kind === 'kpi') {
      if (measure) patch.measure = { column: measure, agg };
      if (filterEnabled && filterCol) {
        patch.filter = { column: filterCol, op: filterOp, value: filterVal };
      } else {
        patch.filter = undefined;
      }
    } else if (kind === 'chart') {
      if (measure) patch.measure = { column: measure, agg };
      if (dimension) patch.dimension = dimension;
      patch.timeGrain = timeGrain;
    } else if (kind === 'table') {
      if (measure) patch.measure = { column: measure, agg };
      patch.rankLimit = rankLimit;
    } else if (kind === 'narrative') {
      patch.markdownTemplate = narrative;
      patch.renderedMarkdown = narrative;
    }
    setSlotBinding(presetId, slotId, patch);
    onClose();
  }, [
    kind, measure, agg, dimension, timeGrain, rankLimit,
    filterEnabled, filterCol, filterOp, filterVal,
    narrative, pinCopy, setSlotBinding, presetId, slotId, onClose,
  ]);

  const handleAdvanced = useCallback(() => {
    const currentBinding = {
      slotId,
      kind,
      ...(binding ?? {}),
      ...(measure ? { measure: { column: measure, agg } } : {}),
      ...(dimension ? { dimension } : {}),
    };
    openAdvancedEditor(slotId, currentBinding);
    onClose();
  }, [slotId, kind, binding, measure, agg, dimension, openAdvancedEditor, onClose]);

  const handleRegenerate = useCallback(() => {
    // TODO(TSS W4): wire to backend LLM regenerate endpoint. For now
    // it's a no-op stub so the button renders + tests exercise the
    // disabled state.
  }, []);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      data-testid="slot-edit-popover"
      data-slot-kind={kind}
      role="dialog"
      aria-modal="false"
      aria-label={descriptor?.label ? `Edit ${descriptor.label}` : 'Edit slot'}
      className="slot-edit-popover"
      style={{ top: position.top, left: position.left }}
    >
      <div className="slot-edit-popover__header">
        <div className="slot-edit-popover__title">
          {descriptor?.label ?? slotId}
        </div>
        {descriptor?.hint ? (
          <div className="slot-edit-popover__hint">{descriptor.hint}</div>
        ) : null}
      </div>

      {/* ── KPI variant ──────────────────────────────────────── */}
      {kind === 'kpi' && (
        <>
          <div className="slot-edit-popover__row">
            <label className="slot-edit-popover__label" htmlFor={`sep-measure-${slotId}`}>
              Measure
            </label>
            <input
              id={`sep-measure-${slotId}`}
              data-testid="slot-edit-measure"
              className="slot-edit-popover__input"
              list={`sep-measure-list-${slotId}`}
              value={measure}
              onChange={(e) => setMeasure(e.target.value)}
              placeholder="Pick a measure…"
            />
            <datalist id={`sep-measure-list-${slotId}`}>
              {measureColumns.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="slot-edit-popover__row">
            <label className="slot-edit-popover__label" htmlFor={`sep-agg-${slotId}`}>
              Aggregation
            </label>
            <select
              id={`sep-agg-${slotId}`}
              data-testid="slot-edit-agg"
              className="slot-edit-popover__select"
              value={agg}
              onChange={(e) => setAgg(e.target.value)}
            >
              {AGG_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="slot-edit-popover__row">
            <label className="slot-edit-popover__toggle">
              <input
                type="checkbox"
                data-testid="slot-edit-filter-toggle"
                checked={filterEnabled}
                onChange={(e) => setFilterEnabled(e.target.checked)}
              />
              Apply filter
            </label>
            {filterEnabled && (
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  className="slot-edit-popover__input"
                  style={{ flex: 2 }}
                  placeholder="column"
                  value={filterCol}
                  onChange={(e) => setFilterCol(e.target.value)}
                />
                <select
                  className="slot-edit-popover__select"
                  style={{ flex: 1 }}
                  value={filterOp}
                  onChange={(e) => setFilterOp(e.target.value)}
                >
                  {FILTER_OPS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <input
                  className="slot-edit-popover__input"
                  style={{ flex: 2 }}
                  placeholder="value"
                  value={filterVal}
                  onChange={(e) => setFilterVal(e.target.value)}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Chart variant ───────────────────────────────────── */}
      {kind === 'chart' && (
        <>
          <div className="slot-edit-popover__row">
            <label className="slot-edit-popover__label" htmlFor={`sep-chart-measure-${slotId}`}>
              Measure
            </label>
            <input
              id={`sep-chart-measure-${slotId}`}
              data-testid="slot-edit-measure"
              className="slot-edit-popover__input"
              list={`sep-chart-measure-list-${slotId}`}
              value={measure}
              onChange={(e) => setMeasure(e.target.value)}
              placeholder="Pick a measure…"
            />
            <datalist id={`sep-chart-measure-list-${slotId}`}>
              {measureColumns.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="slot-edit-popover__row">
            <label className="slot-edit-popover__label" htmlFor={`sep-chart-dim-${slotId}`}>
              Dimension
            </label>
            <input
              id={`sep-chart-dim-${slotId}`}
              data-testid="slot-edit-dimension"
              className="slot-edit-popover__input"
              list={`sep-chart-dim-list-${slotId}`}
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              placeholder="Pick a dimension…"
            />
            <datalist id={`sep-chart-dim-list-${slotId}`}>
              {dimensionColumns.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </div>
          {['line', 'area', 'stream'].includes(descriptor?.chartType ?? '') && (
            <div className="slot-edit-popover__row">
              <label className="slot-edit-popover__label" htmlFor={`sep-grain-${slotId}`}>
                Time grain
              </label>
              <select
                id={`sep-grain-${slotId}`}
                data-testid="slot-edit-time-grain"
                className="slot-edit-popover__select"
                value={timeGrain}
                onChange={(e) => setTimeGrain(e.target.value)}
              >
                <option value="day">day</option>
                <option value="week">week</option>
                <option value="month">month</option>
                <option value="quarter">quarter</option>
              </select>
            </div>
          )}
        </>
      )}

      {/* ── Table variant ───────────────────────────────────── */}
      {kind === 'table' && (
        <>
          <div className="slot-edit-popover__row">
            <label className="slot-edit-popover__label" htmlFor={`sep-table-measure-${slotId}`}>
              Order-by measure
            </label>
            <input
              id={`sep-table-measure-${slotId}`}
              data-testid="slot-edit-measure"
              className="slot-edit-popover__input"
              list={`sep-table-measure-list-${slotId}`}
              value={measure}
              onChange={(e) => setMeasure(e.target.value)}
              placeholder="Pick a measure…"
            />
            <datalist id={`sep-table-measure-list-${slotId}`}>
              {measureColumns.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="slot-edit-popover__row">
            <label className="slot-edit-popover__label" htmlFor={`sep-rank-${slotId}`}>
              Rank limit
            </label>
            <select
              id={`sep-rank-${slotId}`}
              data-testid="slot-edit-rank-limit"
              className="slot-edit-popover__select"
              value={rankLimit}
              onChange={(e) => setRankLimit(Number(e.target.value))}
            >
              {RANK_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* ── Narrative variant ──────────────────────────────── */}
      {kind === 'narrative' && (
        <>
          <div className="slot-edit-popover__row">
            <label className="slot-edit-popover__label" htmlFor={`sep-narr-${slotId}`}>
              Markdown
            </label>
            <textarea
              id={`sep-narr-${slotId}`}
              data-testid="slot-edit-narrative"
              className="slot-edit-popover__textarea"
              rows={4}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
            />
          </div>
          <div className="slot-edit-popover__row">
            <label className="slot-edit-popover__toggle">
              <input
                type="checkbox"
                data-testid="slot-edit-pin"
                checked={pinCopy}
                onChange={(e) => setPinCopy(e.target.checked)}
              />
              Pin this copy
            </label>
            <button
              type="button"
              data-testid="slot-edit-regenerate"
              className="slot-edit-popover__btn slot-edit-popover__btn--ghost"
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
              onClick={handleRegenerate}
            >
              Regenerate with LLM
            </button>
          </div>
        </>
      )}

      {/* ── Footer actions ────────────────────────────────── */}
      <div className="slot-edit-popover__footer">
        <button
          type="button"
          data-testid="slot-edit-cancel"
          className="slot-edit-popover__btn slot-edit-popover__btn--ghost"
          onClick={onClose}
        >
          Cancel
        </button>
        {kind !== 'narrative' && (
          <button
            type="button"
            data-testid="slot-edit-advanced"
            className="slot-edit-popover__btn"
            onClick={handleAdvanced}
          >
            Advanced…
          </button>
        )}
        <button
          type="button"
          data-testid="slot-edit-save"
          className="slot-edit-popover__btn slot-edit-popover__btn--primary"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}
