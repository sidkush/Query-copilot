import React from 'react';
import { evaluateCalc } from '../../../../api';

/**
 * CalcResultPreview — Plan 8d T7.
 *
 * Shows two complementary views of the calc result:
 *   1. "Over N sample rows" — when `rows.length > 1`, runs the formula over
 *      the full sample via the multi-row evaluator. Aggregates (COUNTD,
 *      SUM, AVG…) collapse to a single scalar; per-row formulas return an
 *      array of N values and we render a one-line summary ("10 values: a,
 *      b, c, …, j").
 *   2. "For selected row" — classic single-row evaluation against the
 *      highlighted sample row, preserved so the user can pick a row and
 *      see the per-row value change.
 *
 * Props:
 *   formula         — calc formula text
 *   row             — the highlighted sample row ({col: value})
 *   rows            — the full sample set (optional)
 *   schemaRef       — {col: type} schema hints for the parser
 *   selectedRowIdx  — index into `rows` for the per-row label
 *   debounceMs      — defaults to 300ms
 */
export function CalcResultPreview({
  formula,
  row,
  rows,
  schemaRef,
  selectedRowIdx = 0,
  debounceMs = 300,
}) {
  const [sample, setSample] = React.useState(null);
  const [single, setSingle] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const timerRef = React.useRef(null);

  const rowKey = React.useMemo(() => JSON.stringify(row), [row]);
  const rowsKey = React.useMemo(() => JSON.stringify(rows), [rows]);
  const schemaKey = React.useMemo(() => JSON.stringify(schemaRef), [schemaRef]);

  React.useEffect(() => {
    if (!formula) {
      setSample(null);
      setSingle(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      const hasSample = Array.isArray(rows) && rows.length > 1;
      const singleP = evaluateCalc({ formula, row, schema_ref: schemaRef });
      const sampleP = hasSample
        ? evaluateCalc({ formula, row, rows, schema_ref: schemaRef })
        : Promise.resolve(null);
      Promise.all([singleP, sampleP])
        .then(([singleRes, sampleRes]) => {
          setSingle(singleRes);
          setSample(sampleRes);
          setError(null);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // row/rows/schemaRef tracked via hashed keys above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, rowKey, rowsKey, schemaKey, debounceMs]);

  if (!formula) {
    return (
      <div className="calc-result-preview calc-result-preview--empty">
        Type a formula to see its value.
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="calc-result-preview calc-result-preview--error">
        {error}
      </div>
    );
  }
  if (loading && !sample && !single) {
    return <div className="calc-result-preview calc-result-preview--loading">Evaluating…</div>;
  }

  /* Render the two tiers. Sample-level sits on top (it's the one users
     expect when they type COUNTD([ride_id])); per-row sits below as a
     debugging aid. If no multi-row sample is available we fall back to
     per-row only. */
  return (
    <div className="calc-result-preview" aria-live="polite">
      {sample ? <SampleTier result={sample} /> : null}
      {single ? <SingleTier result={single} rowIdx={selectedRowIdx} /> : null}
    </div>
  );
}

function SampleTier({ result }) {
  const { value, type, row_count: rowCount, is_aggregate: isAggregate } = result;
  const label = isAggregate
    ? `Aggregate · ${rowCount} sample rows`
    : `Per row · ${rowCount} sample rows`;
  const display = Array.isArray(value) ? formatSeries(value) : formatScalar(value);
  return (
    <div className="calc-result-preview__tier">
      <div className="calc-result-preview__tier-label">{label}</div>
      <div className="calc-result-preview__value">{display}</div>
      <div className="calc-result-preview__type">{type}</div>
    </div>
  );
}

function SingleTier({ result, rowIdx }) {
  return (
    <div className="calc-result-preview__tier calc-result-preview__tier--single">
      <div className="calc-result-preview__tier-label">
        For selected row · row {rowIdx + 1}
      </div>
      <div className="calc-result-preview__value calc-result-preview__value--single">
        {formatScalar(result.value)}
      </div>
      <div className="calc-result-preview__type">{result.type ?? '—'}</div>
    </div>
  );
}

function formatScalar(v) {
  if (v === null || v === undefined) return '—';
  return String(v);
}

function formatSeries(arr) {
  if (arr.length === 0) return '—';
  const preview = arr.slice(0, 4).map(formatScalar).join(', ');
  const more = arr.length > 4 ? ` · +${arr.length - 4} more` : '';
  return `${preview}${more}`;
}
