/**
 * SemanticTagWizard — TSS W3-A.
 *
 * Five-step horizontal wizard that maps the connection's schema profile
 * into semantic tags the autogen pipeline uses for its first-pass layout.
 *
 * Steps:
 *   1. Primary date       (columns with semantic_type='temporal' or dtype
 *                          starting with date/timestamp)
 *   2. Revenue metric     (columns with role='measure') + aggregation pill
 *                          (SUM | AVG | COUNT)
 *   3. Primary dimension  (columns with role='dimension' that are NOT
 *                          temporal)
 *   4. Entity name        (string columns with cardinality > 10, or all
 *                          strings when cardinality is unknown)
 *   5. Time grain         (radio: day | week | month | quarter)
 *
 * Each step supports **Skip**. Closing via Esc or the close button
 * short-circuits to `onComplete({})` so the autogen still runs on pure
 * heuristics. Accumulated `tags` are passed to `onComplete` on final
 * Next.
 *
 * Accessibility:
 *   - `role="dialog" aria-modal="true"` on backdrop.
 *   - Step heading has `aria-live="polite"` so step transitions announce.
 *   - First focusable element receives focus on step change.
 *   - Esc closes (skip-all).
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import './SemanticTagWizard.css';
import {
  flattenSchemaColumns,
  isTemporalColumn,
  isMeasureColumn,
  isDimensionColumn,
  isStringColumn,
} from './lib/columnClassify';

const STEP_KEYS = ['primaryDate', 'revenueMetric', 'primaryDimension', 'entityName', 'timeGrain'];

const TIME_GRAINS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
];

const AGGREGATIONS = ['SUM', 'AVG', 'COUNT'];

function filterForStep(stepIdx, columns) {
  if (stepIdx === 0) return columns.filter(isTemporalColumn);
  // Step 1: revenue metric — any measure. Role inferred from `type` when
  // the backend doesn't emit `role` (which is always the case today for
  // /schema-profile; see lib/columnClassify.ts).
  if (stepIdx === 1) return columns.filter(isMeasureColumn);
  // Step 2: primary dimension — any non-temporal dimension.
  if (stepIdx === 2)
    return columns.filter((c) => isDimensionColumn(c) && !isTemporalColumn(c));
  // Step 3: entity name — string columns; if cardinality is known keep only
  // the high-cardinality ones (avoid a 2-value boolean posing as an entity).
  if (stepIdx === 3) {
    return columns.filter((c) => {
      if (!isStringColumn(c)) return false;
      const card = c.cardinality ?? c.distinct_count;
      if (card == null) return true;
      return Number(card) > 10;
    });
  }
  return [];
}

const STEP_COPY = [
  {
    heading: 'Which column tracks when things happened?',
    hint: 'We use this as the primary date axis for time-series tiles.',
  },
  {
    heading: 'What metric should we feature?',
    hint: 'Your headline number. Pick the column and how to aggregate it.',
  },
  {
    heading: 'What do you slice by most often?',
    hint: 'Categorical breakdowns — region, team, product line, etc.',
  },
  {
    heading: 'Which column names the thing being measured?',
    hint: 'Used when a tile needs to label a specific row (customer name, SKU, etc.).',
  },
  {
    heading: 'Preferred time grain',
    hint: 'The default bucket size for new time-series tiles.',
  },
];

export default function SemanticTagWizard({
  open,
  onClose,
  dashboardId,
  connId,
  schemaProfile,
  onComplete,
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [tags, setTags] = useState({});
  const [query, setQuery] = useState('');
  const [aggregation, setAggregation] = useState('SUM');
  // Per-step "Show all fields" toggle — the user may want to override the
  // heuristic classifier (e.g. pick `ride_id` as an entity even though the
  // wizard's entity picker normally hides it).
  const [showAll, setShowAll] = useState(false);

  const panelRef = useRef(null);
  const searchInputRef = useRef(null);
  const previousFocusRef = useRef(null);

  const columns = useMemo(() => flattenSchemaColumns(schemaProfile), [schemaProfile]);

  // Reset wizard state whenever a new session opens. We kick the state
  // resets into a microtask so the effect body stays free of synchronous
  // setState calls (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      queueMicrotask(() => {
        setStepIdx(0);
        setTags({});
        setQuery('');
        setAggregation('SUM');
      });
    } else {
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus(); } catch { /* ignore */ }
      }
    }
  }, [open]);

  // Focus the search input whenever the step advances. We route the
  // `setQuery('')` reset through the same microtask to avoid triggering
  // the lint rule on synchronous setState.
  useEffect(() => {
    if (!open) return undefined;
    queueMicrotask(() => {
      setQuery('');
      setShowAll(false);
    });
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, stepIdx]);

  // Esc closes with empty tags (pure heuristics fallback).
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onComplete?.({});
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, onComplete]);

  if (!open) return null;

  const isLast = stepIdx === STEP_KEYS.length - 1;
  const currentKey = STEP_KEYS[stepIdx];
  const copy = STEP_COPY[stepIdx];

  // When `showAll` is on, bypass the step's type heuristic and expose every
  // column in the connection. The step still applies the text filter. This
  // is the user's escape hatch when the heuristic misses their mental model
  // for a given field.
  const filtered =
    stepIdx < 4 ? (showAll ? columns : filterForStep(stepIdx, columns)) : [];
  // A separate pre-computed count so the toggle label can tell the user how
  // many extra columns they'll see if they flip it on.
  const heuristicCount = stepIdx < 4 ? filterForStep(stepIdx, columns).length : 0;
  const totalColumnCount = columns.length;
  const visibleOptions = filtered.filter((c) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const name = String(c.name || '').toLowerCase();
    const table = String(c.table || '').toLowerCase();
    const type = String(c.type || c.dtype || '').toLowerCase();
    return name.includes(q) || table.includes(q) || type.includes(q);
  });

  const currentSelection = tags[currentKey];
  const selectedColumnName =
    currentKey === 'revenueMetric'
      ? currentSelection?.column
      : typeof currentSelection === 'string'
        ? currentSelection
        : currentSelection?.column || currentSelection?.value || null;

  const canProceed = stepIdx < 4
    ? Boolean(selectedColumnName)
    : Boolean(tags.timeGrain);

  const goBack = () => setStepIdx((i) => Math.max(0, i - 1));

  const pickColumn = (col) => {
    if (stepIdx === 1) {
      setTags((t) => ({ ...t, revenueMetric: { column: col.name, agg: aggregation } }));
    } else {
      setTags((t) => ({ ...t, [currentKey]: col.name }));
    }
  };

  const pickGrain = (value) => setTags((t) => ({ ...t, timeGrain: value }));

  const advance = (nextTags) => {
    if (isLast) {
      onComplete?.(nextTags);
      onClose?.();
    } else {
      setStepIdx((i) => i + 1);
    }
  };

  const handleSkip = () => {
    // Drop whatever we may have picked for this step on skip, then advance.
    setTags((t) => {
      const next = { ...t };
      delete next[currentKey];
      advance(next);
      return next;
    });
  };

  const handleNext = () => {
    if (!canProceed) return;
    advance(tags);
  };

  const handleClose = () => {
    onComplete?.({});
    onClose?.();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) handleClose();
  };

  // When aggregation flips on step 2, keep the already-picked column but
  // update its agg so the tag payload stays in sync.
  const updateAggregation = (agg) => {
    setAggregation(agg);
    if (tags.revenueMetric?.column) {
      setTags((t) => ({ ...t, revenueMetric: { ...t.revenueMetric, agg } }));
    }
  };

  return (
    <div
      className="tss-wizard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tss-wizard-heading"
      data-testid="semantic-tag-wizard"
      data-dashboard-id={dashboardId || ''}
      data-conn-id={connId || ''}
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className="tss-wizard-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tss-wizard-header">
          <span className="tss-wizard-step-count">
            Step {stepIdx + 1} of {STEP_KEYS.length}
          </span>
          <button
            type="button"
            className="tss-wizard-close"
            onClick={handleClose}
            aria-label="Close wizard and skip remaining questions"
            data-testid="semantic-wizard-close"
          >
            ×
          </button>
        </div>

        <h2
          id="tss-wizard-heading"
          className="tss-wizard-heading"
          aria-live="polite"
        >
          {copy.heading}
        </h2>
        <p className="tss-wizard-hint">{copy.hint}</p>

        {stepIdx < 4 ? (
          <>
            <input
              ref={searchInputRef}
              className="tss-wizard-search"
              type="text"
              placeholder="Filter columns…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-testid={`semantic-wizard-search-${stepIdx}`}
            />
            <div className="tss-wizard-list-toolbar">
              <span className="tss-wizard-list-meta">
                {showAll
                  ? `Showing all ${totalColumnCount} columns`
                  : `${heuristicCount} match${heuristicCount === 1 ? '' : 'es'} · ${totalColumnCount} total`}
              </span>
              <button
                type="button"
                className="tss-wizard-show-all"
                aria-pressed={showAll}
                onClick={() => setShowAll((v) => !v)}
                data-testid="semantic-wizard-show-all"
              >
                {showAll ? 'Suggested only' : 'Show all fields'}
              </button>
            </div>
            {visibleOptions.length === 0 ? (
              <div className="tss-wizard-empty" data-testid="semantic-wizard-empty">
                No columns matched. Skip, try “Show all fields”, or broaden your search.
              </div>
            ) : (
              <ul
                className="tss-wizard-options"
                role="listbox"
                data-testid={`semantic-wizard-options-${stepIdx}`}
              >
                {visibleOptions.map((col) => {
                  const isSelected = selectedColumnName === col.name;
                  // Unique option id disambiguates same column name across
                  // multiple tables in a connection (the autogen still binds
                  // on `col.name`; this id is UX-only).
                  const optionId = col.table ? `${col.table}.${col.name}` : col.name;
                  return (
                    <li key={optionId}>
                      <button
                        type="button"
                        className="tss-wizard-option"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => pickColumn(col)}
                        data-testid={`semantic-wizard-option-${optionId}`}
                        data-column={col.name}
                        data-table={col.table || ''}
                      >
                        <span>
                          {col.table ? (
                            <span className="tss-wizard-option-meta">{col.table}.</span>
                          ) : null}
                          {col.name}
                        </span>
                        <span className="tss-wizard-option-meta">
                          {col.dtype || col.type || col.semantic_type || ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {stepIdx === 1 && (
              <div className="tss-wizard-agg-row" role="group" aria-label="Aggregation">
                <span className="tss-wizard-agg-label">Aggregation</span>
                {AGGREGATIONS.map((agg) => (
                  <button
                    key={agg}
                    type="button"
                    className="tss-wizard-agg-pill"
                    aria-pressed={aggregation === agg}
                    onClick={() => updateAggregation(agg)}
                    data-testid={`semantic-wizard-agg-${agg}`}
                  >
                    {agg}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="tss-wizard-radio-group" role="radiogroup" aria-label="Time grain">
            {TIME_GRAINS.map((g) => {
              const checked = tags.timeGrain === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  className="tss-wizard-radio"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => pickGrain(g.value)}
                  data-testid={`semantic-wizard-grain-${g.value}`}
                >
                  <span className="tss-wizard-radio-dot" />
                  <span>{g.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="tss-wizard-dots" aria-hidden="true">
          {STEP_KEYS.map((key, idx) => (
            <span
              key={key}
              className="tss-wizard-dot"
              data-active={idx === stepIdx}
              data-done={idx < stepIdx}
            />
          ))}
        </div>

        <div className="tss-wizard-footer">
          <button
            type="button"
            className="tss-wizard-btn tss-wizard-btn-ghost"
            onClick={handleSkip}
            data-testid="semantic-wizard-skip"
          >
            Skip
          </button>
          <div className="tss-wizard-btn-group">
            <button
              type="button"
              className="tss-wizard-btn tss-wizard-btn-ghost"
              onClick={goBack}
              disabled={stepIdx === 0}
              data-testid="semantic-wizard-back"
            >
              Back
            </button>
            <button
              type="button"
              className="tss-wizard-btn tss-wizard-btn-primary"
              onClick={handleNext}
              disabled={!canProceed}
              data-testid="semantic-wizard-next"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
