import React from 'react';

/**
 * Phase L — ResultPreview. Renders first N rows of streaming query as preview table.
 * Props: preview: { query_id, columns: [str], rows: [[any]], total_so_far: number, final: bool }
 */
export default function ResultPreview({ preview }) {
  if (!preview) return null;
  const { columns = [], rows = [], total_so_far = 0, final = false } = preview;
  return (
    <div className={`result-preview ${final ? 'result-preview--final' : 'result-preview--streaming'}`}>
      <div className="result-preview__header">
        <span className="result-preview__badge">{final ? 'Result' : 'Preview'}</span>
        <span className="result-preview__counter">
          {total_so_far.toLocaleString()} {total_so_far === 1 ? 'row' : 'rows'}{!final && ' …'}
        </span>
      </div>
      {rows.length > 0 && (
        <table className="result-preview__table">
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell == null ? '—' : String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
