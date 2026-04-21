import React, { useState } from 'react';

/**
 * Plan 9b T8 — Trend-line stats badge.
 *
 * Renders a compact summary (R², p-value, N) that expands into a full
 * stats table (equation + SSE/RMSE + coefficients). Used by chart
 * tiles that host a saved trend line to surface fit quality inline.
 */
export default function TrendStatsBadge({ fit }) {
  const [expanded, setExpanded] = useState(false);
  if (!fit?.result) return null;
  const r = fit.result;

  return (
    <div className="trend-stats-badge">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        title={r.equation}
        style={{
          fontSize: 11,
          padding: '2px 6px',
          borderRadius: 3,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
        }}
      >
        R²={r.r_squared.toFixed(2)} · p={r.p_value.toExponential(1)} · N={r.predictions.length}
      </button>
      {expanded && (
        <table className="trend-stats-table" style={{ fontSize: 11, marginTop: 4 }}>
          <tbody>
            <tr>
              <th>Equation</th>
              <td>
                <code>{r.equation}</code>
              </td>
            </tr>
            <tr>
              <th>R²</th>
              <td>{r.r_squared.toFixed(6)}</td>
            </tr>
            <tr>
              <th>p-value</th>
              <td>{r.p_value.toExponential(3)}</td>
            </tr>
            <tr>
              <th>SSE</th>
              <td>{r.sse.toExponential(3)}</td>
            </tr>
            <tr>
              <th>RMSE</th>
              <td>{r.rmse.toExponential(3)}</td>
            </tr>
            {r.coefficients.map((c, i) => (
              <tr key={i}>
                <th>c{i}</th>
                <td>{c.toExponential(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
