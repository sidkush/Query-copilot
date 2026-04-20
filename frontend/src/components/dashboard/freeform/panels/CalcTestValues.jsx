import React from 'react';
import { fetchSampleRows } from '../../../../api';

/**
 * CalcTestValues — Plan 8d T6.
 *
 * Sample-row grid shown inside the calc editor to preview a calculated
 * field against live values. Fetches up to 10 rows from the connection's
 * first table via the read-only /queries/sample endpoint, then lets the
 * user pick which row is fed to the single-row evaluator (Plan 8d T7).
 *
 * Props:
 *   connId          — active connection id (string, required).
 *   selectedRowIdx  — currently selected row index (number, default 0).
 *   onSelectRow     — callback(rowIdx: number) fired on row click.
 */
export function CalcTestValues({ connId, selectedRowIdx = 0, onSelectRow }) {
  const [state, setState] = React.useState({
    loading: true,
    columns: [],
    rows: [],
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    setState({ loading: true, columns: [], rows: [], error: null });
    fetchSampleRows(connId, { limit: 10 })
      .then((res) => {
        if (cancelled) return;
        setState({
          loading: false,
          columns: res.columns ?? [],
          rows: res.rows ?? [],
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, columns: [], rows: [], error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [connId]);

  if (state.loading) {
    return (
      <div className="calc-test-values calc-test-values--loading">
        Loading sample rows…
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="calc-test-values calc-test-values--error">
        Error: {state.error}
      </div>
    );
  }
  if (state.rows.length === 0) {
    return (
      <div className="calc-test-values calc-test-values--empty">
        No sample rows available.
      </div>
    );
  }

  return (
    <div className="calc-test-values" role="grid" aria-label="Sample rows">
      <div className="calc-test-values__header" role="row">
        <span className="calc-test-values__idx">#</span>
        {state.columns.map((c) => (
          <span
            key={c}
            className="calc-test-values__col"
            role="columnheader"
          >
            {c}
          </span>
        ))}
      </div>
      {state.rows.map((row, i) => (
        <div
          key={i}
          role="row"
          aria-selected={i === selectedRowIdx}
          className={`calc-test-values__row ${i === selectedRowIdx ? 'is-selected' : ''}`}
          onClick={() => onSelectRow && onSelectRow(i)}
        >
          <span className="calc-test-values__idx">{i + 1}</span>
          {state.columns.map((c) => (
            <span
              key={c}
              className="calc-test-values__cell"
              role="gridcell"
            >
              {String(row[c] ?? '')}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export default CalcTestValues;
