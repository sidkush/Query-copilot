/**
 * DashboardIntentStep — TSS2 T12.
 *
 * Single free-text textarea + "Build dashboard" button. Replaces the
 * 5-step SemanticTagWizard in the default SaveDashboardDialog flow.
 * The collected intent is forwarded verbatim as `user_intent` to the
 * backend's autogen-all-presets endpoint, where the predictive
 * intelligence layer interprets it without forcing the user to
 * categorize columns by hand.
 *
 * Controlled component: parent owns the `value` + `onChange` state,
 * and `onSubmit(trimmed)` fires when the CTA is clicked.
 */
import React from 'react';

export default function DashboardIntentStep({ value, onChange, onSubmit }) {
  return (
    <div className="dashboard-intent-step">
      <label className="dashboard-intent-label" htmlFor="dashboard-intent-textarea">
        What should this dashboard show?
      </label>
      <textarea
        id="dashboard-intent-textarea"
        data-testid="dashboard-intent-textarea"
        className="dashboard-intent-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Monthly bike ride counts, top 10 stations, weekday vs weekend breakdown"
        rows={3}
      />
      <button
        type="button"
        data-testid="dashboard-intent-submit"
        className="dashboard-intent-submit"
        onClick={() => onSubmit((value || '').trim())}
      >
        Build dashboard
      </button>
    </div>
  );
}
