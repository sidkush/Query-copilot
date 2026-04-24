import React from 'react';

/**
 * Phase K+L — Plan-first artifact with slot streaming + cancel/revise controls.
 * Props:
 *   plan: { plan_id, ctes: [{name, description, sql, rowcount_hint?, completed?, rowcount?}], fallback, registry_hits }
 *   onCancel: () => void
 *   onRevise: () => void
 *   cancellable: boolean
 */
export default function PlanArtifact({ plan, onCancel, onRevise, cancellable = false }) {
  if (!plan) return null;
  if (plan.fallback) {
    return (
      <div className="plan-artifact plan-artifact--fallback">
        <div className="plan-artifact__header">
          <span className="plan-artifact__badge plan-artifact__badge--fallback">Free-form plan</span>
          <span className="plan-artifact__id">{plan.plan_id}</span>
          {cancellable && onCancel && (
            <button className="plan-artifact__cancel" onClick={onCancel} type="button">Cancel</button>
          )}
        </div>
        <div className="plan-artifact__body">Registry miss — agent will plan ad-hoc against schema.</div>
      </div>
    );
  }
  return (
    <div className="plan-artifact">
      <div className="plan-artifact__header">
        <span className="plan-artifact__badge">Plan</span>
        <span className="plan-artifact__id">{plan.plan_id}</span>
        {plan.registry_hits?.length > 0 && (
          <span className="plan-artifact__hits">Using: {plan.registry_hits.join(', ')}</span>
        )}
        <div className="plan-artifact__controls">
          {onRevise && (
            <button className="plan-artifact__revise" onClick={onRevise} type="button">Revise</button>
          )}
          {cancellable && onCancel && (
            <button className="plan-artifact__cancel" onClick={onCancel} type="button">Cancel</button>
          )}
        </div>
      </div>
      <ol className="plan-artifact__ctes">
        {plan.ctes.map((cte, i) => {
          const state = cte.completed ? 'done' : (cte.rowcount != null ? 'running' : 'pending');
          return (
            <li key={cte.name} className={`plan-artifact__cte plan-artifact__cte--${state}`}>
              <div className="plan-artifact__cte-head">
                <span className="plan-artifact__cte-num">{i + 1}</span>
                <span className="plan-artifact__cte-name">{cte.name}</span>
                {cte.rowcount != null && (
                  <span className="plan-artifact__cte-rows">{cte.rowcount.toLocaleString()} rows</span>
                )}
                {cte.rowcount == null && cte.rowcount_hint != null && (
                  <span className="plan-artifact__cte-rows plan-artifact__cte-rows--hint">
                    ~{cte.rowcount_hint.toLocaleString()} rows
                  </span>
                )}
              </div>
              <div className="plan-artifact__cte-desc">{cte.description}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
