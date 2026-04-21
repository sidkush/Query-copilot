import React, { useState } from 'react';

/**
 * Plan 9c — Best-model badge for a forecast. Click to expand to a table
 * of all 8 candidate fits sorted by AIC.
 */
export default function ForecastStatsBadge({ fit }) {
  const [expanded, setExpanded] = useState(false);
  if (!fit) return null;
  const best = fit.best_model;
  const candidates = fit.model_candidates ?? [];
  return (
    <span className="forecast-stats-badge">
      <button type="button" onClick={() => setExpanded((v) => !v)}>
        {best.kind} · AIC {best.aic.toFixed(2)} · RMSE {best.rmse.toFixed(3)}
      </button>
      {expanded && (
        <table>
          <thead>
            <tr><th>Kind</th><th>AIC</th><th>RMSE</th><th>MAE</th><th>MAPE</th></tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => (
              <tr key={i} className={c.kind === best.kind ? 'best' : ''}>
                <td>{c.kind}</td>
                <td>{Number.isFinite(c.aic) ? c.aic.toFixed(2) : '—'}</td>
                <td>{Number.isFinite(c.rmse) ? c.rmse.toFixed(3) : '—'}</td>
                <td>{Number.isFinite(c.mae) ? c.mae.toFixed(3) : '—'}</td>
                <td>{Number.isFinite(c.mape) ? c.mape.toFixed(2) + '%' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </span>
  );
}
