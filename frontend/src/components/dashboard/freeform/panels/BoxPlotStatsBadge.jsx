import React, { useState } from 'react';

export default function BoxPlotStatsBadge({ boxPlot }) {
  const [open, setOpen] = useState(false);
  if (!boxPlot || !boxPlot.envelope) return null;
  const { values, outliers = [] } = boxPlot.envelope;
  const iqr =
    values.q1 !== null && values.q3 !== null
      ? (values.q3 - values.q1).toFixed(3)
      : 'n/a';
  return (
    <div className="ap-stats-badge" onClick={() => setOpen((v) => !v)}>
      <span>Q1 {values.q1?.toFixed(3)}</span>
      <span>Med {values.median?.toFixed(3)}</span>
      <span>Q3 {values.q3?.toFixed(3)}</span>
      <span>IQR {iqr}</span>
      <span>Outliers {outliers.length}</span>
      {open && outliers.length > 0 && (
        <table className="ap-outlier-table">
          <tbody>
            {outliers.slice(0, 20).map((v, i) => (
              <tr key={i}><td>{v.toFixed(3)}</td></tr>
            ))}
            {outliers.length > 20 && (
              <tr><td>… {outliers.length - 20} more</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
