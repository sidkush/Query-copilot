import React from 'react';
import { evaluateCalc } from '../../../../api';

export function CalcDebugPanel({ formula, row, schemaRef }) {
  const [state, setState] = React.useState({ trace: null, error: null, loading: false });

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
  }, [formula, JSON.stringify(row), JSON.stringify(schemaRef)]);

  if (!formula) return <div className="calc-debug-panel calc-debug-panel--empty">No formula to trace.</div>;
  if (state.error) return <div role="alert" className="calc-debug-panel calc-debug-panel--error">{state.error}</div>;
  if (state.loading || !state.trace) return <div className="calc-debug-panel calc-debug-panel--loading">Tracing…</div>;

  return (
    <ol className="calc-debug-panel" aria-label="AST evaluation trace">
      {state.trace.nodes.map((n, i) => (
        <li key={i} className="calc-debug-panel__node">
          <code className="calc-debug-panel__label">{n.label}</code>
          <span className="calc-debug-panel__eq">=</span>
          <code className="calc-debug-panel__value">{String(n.value)}</code>
        </li>
      ))}
    </ol>
  );
}
