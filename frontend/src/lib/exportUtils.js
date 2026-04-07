/**
 * Client-side data export utilities for dashboard tiles.
 */

function escapeCsv(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return (name || 'data').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Download tile data as CSV.
 */
export function downloadCSV(columns, rows, title) {
  if (!columns?.length || !rows?.length) return;
  const csv = [
    columns.join(','),
    ...rows.map(r => columns.map(c => escapeCsv(r[c])).join(',')),
  ].join('\n');
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `${sanitizeFilename(title)}.csv`
  );
}

/**
 * Download tile data as JSON.
 */
export function downloadJSON(columns, rows, title) {
  if (!columns?.length || !rows?.length) return;
  const data = rows.map(r => {
    const obj = {};
    for (const c of columns) obj[c] = r[c] ?? null;
    return obj;
  });
  triggerDownload(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
    `${sanitizeFilename(title)}.json`
  );
}
