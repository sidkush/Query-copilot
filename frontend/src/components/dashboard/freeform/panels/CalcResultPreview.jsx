import React from 'react';
import { evaluateCalc } from '../../../../api';

export function CalcResultPreview({ formula, row, schemaRef, debounceMs = 300 }) {
  const [state, setState] = React.useState({ value: null, type: null, error: null, loading: false });
  const timerRef = React.useRef(null);

  // Stable deps: hash row/schemaRef once so the dep array stays primitive.
  const rowKey = React.useMemo(() => JSON.stringify(row), [row]);
  const schemaKey = React.useMemo(() => JSON.stringify(schemaRef), [schemaRef]);

  React.useEffect(() => {
    if (!formula) {
      setState({ value: null, type: null, error: null, loading: false });
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setState((s) => ({ ...s, loading: true }));
      evaluateCalc({ formula, row, schema_ref: schemaRef })
        .then((res) => setState({ value: res.value, type: res.type, error: null, loading: false }))
        .catch((err) => setState({ value: null, type: null, error: err.message, loading: false }));
    }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // row/schemaRef are intentionally tracked via their hashed keys above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, rowKey, schemaKey, debounceMs]);

  if (state.error) {
    return <div role="alert" className="calc-result-preview calc-result-preview--error">{state.error}</div>;
  }
  if (state.loading) {
    return <div className="calc-result-preview calc-result-preview--loading">Evaluating…</div>;
  }
  if (state.value === null) {
    return <div className="calc-result-preview calc-result-preview--empty">Type a formula to see its value.</div>;
  }
  return (
    <div className="calc-result-preview">
      <div className="calc-result-preview__value">{String(state.value)}</div>
      <div className="calc-result-preview__type">{state.type}</div>
    </div>
  );
}
