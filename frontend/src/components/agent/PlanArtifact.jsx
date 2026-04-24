import React from 'react';

/**
 * Phase K — Plan-first artifact. Rendered before any SQL runs.
 * Props:
 *   plan: { plan_id, ctes: [{name, description, sql, rowcount_hint?}], fallback, registry_hits }
 */
export default function PlanArtifact({ plan }) {
  if (!plan) return null;
  if (plan.fallback) {
    return (
      <div className="plan-artifact plan-artifact--fallback">
        <div className="plan-artifact__header">
          <span className="plan-artifact__badge plan-artifact__badge--fallback">Free-form plan</span>
          <span className="plan-artifact__id">{plan.plan_id}</span>
        </div>
        <div className="plan-artifact__body">
          Registry miss — agent will plan ad-hoc against schema. Expect longer response time.
        </div>
      </div>
    );
  }

  return (
    <div className="plan-artifact">
      <div className="plan-artifact__header">
        <span className="plan-artifact__badge">Plan</span>
        <span className="plan-artifact__id">{plan.plan_id}</span>
        {plan.registry_hits?.length > 0 && (
          <span className="plan-artifact__hits">
            Using: {plan.registry_hits.join(', ')}
          </span>
        )}
      </div>
      <ol className="plan-artifact__ctes">
        {plan.ctes.map((cte, i) => (
          <li key={cte.name} className="plan-artifact__cte">
            <div className="plan-artifact__cte-head">
              <span className="plan-artifact__cte-num">{i + 1}</span>
              <span className="plan-artifact__cte-name">{cte.name}</span>
              {cte.rowcount_hint != null && (
                <span className="plan-artifact__cte-rows">~{cte.rowcount_hint} rows</span>
              )}
            </div>
            <div className="plan-artifact__cte-desc">{cte.description}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
