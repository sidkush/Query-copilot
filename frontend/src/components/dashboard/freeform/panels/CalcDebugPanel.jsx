import React from 'react';
import { evaluateCalc } from '../../../../api';

export function CalcDebugPanel({ formula, row, schemaRef, selectedRowIdx = 0 }) {
  const [state, setState] = React.useState({ trace: null, error: null, loading: false });

  // Stable deps: hash row/schemaRef once so the effect's dep array stays
  // primitive (rather than re-stringifying inside the array, which both
  // hides the deps from the linter and recomputes on every render).
  const rowKey = React.useMemo(() => JSON.stringify(row), [row]);
  const schemaKey = React.useMemo(() => JSON.stringify(schemaRef), [schemaRef]);

  React.useEffect(() => {
    if (!formula) {
      setState({ trace: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    evaluateCalc({ formula, row, schema_ref: schemaRef, trace: true })
      .then((res) => { if (!cancelled) setState({ trace: res.trace, error: null, loading: false }); })
      .catch((err) => { if (!cancelled) setState({ trace: null, error: err.message, loading: false }); });
    return () => { cancelled = true; };
    // row/schemaRef are intentionally tracked via their hashed keys above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, rowKey, schemaKey]);

  if (!formula) return <div className="calc-debug-panel calc-debug-panel--empty">No formula to trace.</div>;
  if (state.error) return <div role="alert" className="calc-debug-panel calc-debug-panel--error">{state.error}</div>;
  if (state.loading || !state.trace) return <div className="calc-debug-panel calc-debug-panel--loading">Tracing…</div>;

  return (
    <div className="calc-debug-panel" aria-label="AST evaluation trace">
      <div className="calc-debug-panel__header">
        Trace · row {selectedRowIdx + 1}
      </div>
      <ol className="calc-debug-panel__list">
        {state.trace.nodes.map((n, i) => (
          <li key={i} className="calc-debug-panel__node">
            <code className="calc-debug-panel__label">{n.label}</code>
            <span className="calc-debug-panel__eq">=</span>
            <code className="calc-debug-panel__value">{String(n.value)}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}
