import { useState } from 'react';

export default function ClusterStatsBadge({ result }) {
  const [open, setOpen] = useState(false);
  if (!result) return null;
  const sorted = [...(result.candidates || [])].sort((a, b) => b.ch_score - a.ch_score);
  return (
    <div className="cluster-stats-badge">
      <button type="button" onClick={() => setOpen((o) => !o)}>
        k={result.optimal_k} • CH {result.calinski_harabasz_score.toFixed(1)} • F {result.f_statistic.toFixed(2)}
      </button>
      {open && (
        <table>
          <thead><tr><th>k</th><th>CH</th><th>Inertia</th></tr></thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.k}>
                <td>{c.k}</td>
                <td>{c.ch_score.toFixed(2)}</td>
                <td>{c.inertia.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
