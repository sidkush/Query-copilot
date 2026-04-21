import React from 'react';
import { evaluateCalc, evaluateCalcOnSource } from '../../../../api';

/**
 * CalcResultPreview — Plan 8d T7b.
 *
 * Two tiers, stacked side-by-side:
 *
 *   1. "In <table>" — evaluates the formula against the LIVE database
 *      via /calcs/evaluate-on-source. Aggregates (COUNTD, SUM, AVG…)
 *      collapse to the true DB-wide scalar (169M distinct ride_ids, not
 *      10). Per-row formulas return up to 10 representative values.
 *
 *   2. "For selected row" — single-row in-memory evaluation against the
 *      highlighted sample row, so the user can click a row below and see
 *      the per-row formula result change.
 *
 * Sample rows below remain for column-shape familiarity; they are NOT the
 * source of truth for aggregates anymore.
 */
export function CalcResultPreview({
  formula,
  row,
  schemaRef,
  connId,
  selectedRowIdx = 0,
  debounceMs = 350,
}) {
  const [live, setLive] = React.useState(null);
  const [single, setSingle] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const timerRef = React.useRef(null);

  const rowKey = React.useMemo(() => JSON.stringify(row), [row]);
  const schemaKey = React.useMemo(() => JSON.stringify(schemaRef), [schemaRef]);

  React.useEffect(() => {
    if (!formula) {
      setLive(null);
      setSingle(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      const singleP = evaluateCalc({ formula, row, schema_ref: schemaRef });
      const liveP = connId
        ? evaluateCalcOnSource({ formula, conn_id: connId, schema_ref: schemaRef })
        : Promise.resolve(null);
      /* Run both in parallel. Fail-open: if the live query 4xxs (rate
         limit, validator rejection) we still show the per-row result
         rather than a blocking error. */
      Promise.allSettled([singleP, liveP]).then(([singleRes, liveRes]) => {
        if (singleRes.status === 'fulfilled') setSingle(singleRes.value);
        else setSingle(null);
        if (liveRes.status === 'fulfilled') setLive(liveRes.value);
        else setLive(null);
        const firstErr =
          singleRes.status === 'rejected' ? singleRes.reason?.message : null;
        setError(
          singleRes.status === 'rejected' && liveRes.status === 'rejected'
            ? firstErr
            : null,
        );
        setLoading(false);
      });
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, rowKey, schemaKey, connId, debounceMs]);

  if (!formula) {
    return (
      <div className="calc-result-preview calc-result-preview--empty">
        Type a formula to see its value.
      </div>
    );
  }
  if (error && !single && !live) {
    return (
      <div role="alert" className="calc-result-preview calc-result-preview--error">
        {error}
      </div>
    );
  }
  if (loading && !single && !live) {
    return <div className="calc-result-preview calc-result-preview--loading">Evaluating…</div>;
  }

  return (
    <div className="calc-result-preview" aria-live="polite">
      {live ? <LiveTier result={live} /> : null}
      {single ? <SingleTier result={single} rowIdx={selectedRowIdx} /> : null}
    </div>
  );
}

function LiveTier({ result }) {
  const { value, type, table, is_aggregate: isAggregate, result_count: resultCount } = result;
  const label = isAggregate
    ? `In ${table}`
    : `In ${table} · ${resultCount} sample value${resultCount === 1 ? '' : 's'}`;
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

/* Group digits with locale grouping so 84565639 renders as 84,565,639 —
   matches BigQuery/Postgres console output and reads at a glance. Strings,
   dates, and booleans fall through untouched. */
function formatScalar(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return v.toLocaleString();
  return String(v);
}

function formatSeries(arr) {
  if (arr.length === 0) return '—';
  const preview = arr.slice(0, 4).map(formatScalar).join(', ');
  const more = arr.length > 4 ? ` · +${arr.length - 4} more` : '';
  return `${preview}${more}`;
}
