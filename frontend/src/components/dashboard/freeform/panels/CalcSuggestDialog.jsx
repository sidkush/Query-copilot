import React from 'react';
import { suggestCalc } from '../../../../api';

/**
 * Plan 8d T11 — LLM "Suggest with AI" sub-dialog.
 *
 * Renders a modal that collects an NL description, posts it to
 * `/api/v1/calcs/suggest`, and surfaces the returned formula, explanation,
 * and confidence. On Accept, propagates the full response (including
 * `is_generative_ai_web_authoring`) to the parent via `onAccept`.
 *
 * Props:
 *   schemaRef      — { columnName: dataType } grounding hints for the LLM.
 *   parameters     — [{ name, dataType }] — user-authored parameters.
 *   sets           — [{ name }] — user-authored sets.
 *   existingCalcs  — [{ name, formula }] — known calcs for deduping.
 *   onAccept(res)  — called when user accepts the suggestion.
 *   onClose()      — called when user cancels.
 */
export function CalcSuggestDialog({
  schemaRef,
  parameters,
  sets,
  existingCalcs,
  onAccept,
  onClose,
}) {
  const [description, setDescription] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await suggestCalc({
        description,
        schema_ref: schemaRef,
        parameters,
        sets,
        existing_calcs: existingCalcs,
      });
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="calc-suggest-title"
      className="calc-suggest-dialog"
    >
      <h2 id="calc-suggest-title">Suggest calculation with AI</h2>
      <label htmlFor="calc-suggest-desc">Description</label>
      <textarea
        id="calc-suggest-desc"
        aria-label="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. average sales per customer, year-over-year growth, top 10 by margin"
        maxLength={1000}
      />
      <div className="calc-suggest-dialog__actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={loading || !description.trim()}
        >
          Suggest
        </button>
      </div>
      {error && (
        <div role="alert" className="calc-suggest-dialog__error">
          {error}
        </div>
      )}
      {result && (
        <div className="calc-suggest-dialog__result">
          <pre className="calc-suggest-dialog__formula">{result.formula}</pre>
          <p>{result.explanation}</p>
          <div>Confidence: {Math.round((result.confidence ?? 0) * 100)}%</div>
          <button type="button" onClick={() => onAccept(result)}>
            Accept
          </button>
          <button type="button" onClick={() => setResult(null)}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
