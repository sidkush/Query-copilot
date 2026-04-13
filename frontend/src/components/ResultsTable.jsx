import { useState, useRef } from "react";

const EXPORT_FORMATS = [
  { key: "csv", label: "CSV", ext: ".csv" },
  { key: "json", label: "JSON", ext: ".json" },
  { key: "md", label: "Markdown", ext: ".md" },
  { key: "tsv", label: "TSV", ext: ".tsv" },
  { key: "txt", label: "Text", ext: ".txt" },
];

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

function generateExport(columns, rows, format) {
  switch (format) {
    case "csv": {
      const header = columns.join(",");
      const body = rows.map((r) => columns.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      return { content: header + "\n" + body, mime: "text/csv" };
    }
    case "json": {
      return { content: JSON.stringify(rows, null, 2), mime: "application/json" };
    }
    case "md": {
      const header = "| " + columns.join(" | ") + " |";
      const sep = "| " + columns.map(() => "---").join(" | ") + " |";
      const body = rows.map((r) => "| " + columns.map((c) => String(r[c] ?? "")).join(" | ") + " |").join("\n");
      return { content: header + "\n" + sep + "\n" + body, mime: "text/markdown" };
    }
    case "tsv": {
      const header = columns.join("\t");
      const body = rows.map((r) => columns.map((c) => String(r[c] ?? "")).join("\t")).join("\n");
      return { content: header + "\n" + body, mime: "text/tab-separated-values" };
    }
    case "txt": {
      const widths = columns.map((col) => {
        const vals = [col, ...rows.map((r) => String(r[col] ?? ""))];
        return Math.min(30, Math.max(...vals.map((v) => v.length)));
      });
      const header = columns.map((c, i) => c.padEnd(widths[i])).join("  ");
      const sep = widths.map((w) => "-".repeat(w)).join("  ");
      const body = rows.map((r) => columns.map((c, i) => String(r[c] ?? "").padEnd(widths[i])).join("  ")).join("\n");
      return { content: header + "\n" + sep + "\n" + body, mime: "text/plain" };
    }
    default:
      return { content: "", mime: "text/plain" };
  }
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isNumericValue(val) {
  if (typeof val === "number") return true;
  if (typeof val === "string" && val.trim() !== "" && !isNaN(Number(val))) return true;
  return false;
}

export default function ResultsTable({ columns, rows }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [showExport, setShowExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const exportRef = useRef(null);

  const sorted = [...rows].sort((a, b) => {
    if (!sortCol) return 0;
    const aVal = a[sortCol] ?? "";
    const bVal = b[sortCol] ?? "";
    const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
    return sortAsc ? cmp : -cmp;
  });

  const paged = sorted.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(rows.length / perPage);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
    setPage(0);
  };

  const handleExport = (format) => {
    const fmt = EXPORT_FORMATS.find((f) => f.key === format);
    const { content, mime } = generateExport(columns, rows, format);
    downloadFile(content, `query_results${fmt.ext}`, mime);
    setShowExport(false);
  };

  const handlePerPageChange = (value) => {
    setPerPage(value);
    setPage(0);
  };

  const handleCopyToClipboard = () => {
    const header = columns.join("\t");
    const body = paged.map((r) => columns.map((c) => String(r[c] ?? "")).join("\t")).join("\n");
    navigator.clipboard.writeText(header + "\n" + body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Empty state
  if (rows.length === 0) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center" role="alert">
          <svg className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
          </svg>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No results found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Try refining your query or adjusting filters</p>
        </div>
      </div>
    );
  }

  // Page buttons for pagination
  const pageButtons = [];
  if (totalPages > 1) {
    const maxVisible = 5;
    let start = Math.max(0, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible);
    if (end - start < maxVisible) start = Math.max(0, end - maxVisible);
    for (let i = start; i < end; i++) pageButtons.push(i);
  }

  return (
    <div className="chat-artifact" role="region" aria-label={`Query results: ${rows.length} row${rows.length !== 1 ? "s" : ""}, ${columns.length} column${columns.length !== 1 ? "s" : ""}`}>
      {/* Header bar */}
      <div className="chat-artifact__header">
        <span className="chat-artifact__label">
          <span className="eyebrow-dot" aria-hidden="true" />
          Data
          <span style={{ opacity: 0.4 }}>·</span>
          <span>Table</span>
        </span>
        <span className="chat-artifact__stat">
          {rows.length.toLocaleString()} row{rows.length !== 1 ? 's' : ''} · {columns.length} col{columns.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Copy to clipboard */}
          <button
            onClick={handleCopyToClipboard}
            className="ease-spring cursor-pointer inline-flex items-center gap-1.5"
            style={{
              padding: '0.35rem 0.85rem',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 9999,
              color: 'var(--text-secondary)',
              background: 'var(--overlay-faint)',
              border: '1px solid var(--border-default)',
              transition: 'background 300ms cubic-bezier(0.32, 0.72, 0, 1), color 300ms cubic-bezier(0.32, 0.72, 0, 1), transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
            aria-label="Copy visible table data to clipboard"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3" style={{ color: 'var(--status-success)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span style={{ color: 'var(--status-success)' }}>Copied</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
                Copy
              </>
            )}
          </button>

          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setShowExport(!showExport)}
              className="ease-spring cursor-pointer inline-flex items-center gap-1.5"
              style={{
                padding: '0.35rem 0.85rem',
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 9999,
                color: 'var(--accent)',
                background: 'var(--accent-glow)',
                border: '1px solid rgba(37, 99, 235, 0.22)',
                transition: 'background 300ms cubic-bezier(0.32, 0.72, 0, 1), transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              aria-expanded={showExport}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Export
              <svg className="w-2.5 h-2.5 ease-spring transition-transform duration-300" style={{ transform: showExport ? 'rotate(180deg)' : 'rotate(0)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-2 rounded-2xl shadow-2xl z-50 overflow-hidden min-w-[160px] py-1.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hover)', boxShadow: '0 24px 60px -16px rgba(0,0,0,0.45)' }}>
                {EXPORT_FORMATS.map((fmt) => (
                  <button
                    key={fmt.key}
                    onClick={() => handleExport(fmt.key)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs ease-spring cursor-pointer"
                    style={{
                      color: 'var(--text-primary)',
                      background: 'transparent',
                      border: 'none',
                      transition: 'background 200ms cubic-bezier(0.32, 0.72, 0, 1)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span className="font-mono w-10 text-right" style={{ color: 'var(--text-muted)' }}>{fmt.ext}</span>
                    <span>{fmt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left" role="table" aria-label="Query results">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              {columns.map((col) => {
                const isSorted = sortCol === col;
                const ariaSortValue = isSorted ? (sortAsc ? "ascending" : "descending") : "none";
                return (
                  <th
                    key={col}
                    role="columnheader"
                    onClick={() => handleSort(col)}
                    aria-sort={ariaSortValue}
                    className={`sticky top-0 z-10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors duration-200 whitespace-nowrap select-none backdrop-blur-sm ${
                      isSorted ? "text-blue-400 border-b-2 border-blue-500" : ""
                    }`}
                    style={{ background: 'var(--bg-base)', color: isSorted ? undefined : 'var(--text-muted)' }}
                  >
                    <button
                      className="flex items-center gap-1 bg-transparent border-none p-0 font-semibold uppercase tracking-wider text-inherit cursor-pointer"
                      aria-label={`Sort by ${col}`}
                      aria-pressed={isSorted}
                    >
                      {col}
                      {isSorted ? (
                        <span className="text-blue-400">{sortAsc ? "\u2191" : "\u2193"}</span>
                      ) : (
                        <svg className="w-3 h-3" style={{ color: 'var(--border-default)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                        </svg>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i} className="transition-colors duration-150"
                style={{ borderBottom: '1px solid var(--overlay-subtle)', background: i % 2 === 1 ? 'var(--overlay-faint)' : undefined }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--overlay-subtle)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 1 ? 'var(--overlay-faint)' : 'transparent'; }}
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className={`px-4 py-2.5 whitespace-nowrap max-w-[300px] truncate ${
                      isNumericValue(row[col]) ? "tabular-nums text-right font-mono text-[13px]" : ""
                    }`}
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-default)' }}>
        {/* Rows per page selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="rows-per-page" className="text-[11px] font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Rows per page</label>
          <select
            id="rows-per-page"
            value={perPage}
            onChange={(e) => handlePerPageChange(Number(e.target.value))}
            className="text-xs rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none focus:border-blue-500/40 transition-colors duration-200 appearance-none"
            style={{ color: 'var(--text-primary)', background: 'var(--overlay-faint)', border: '1px solid var(--overlay-light)' }}
            aria-label="Rows per page"
          >
            {ROWS_PER_PAGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>{opt}</option>
            ))}
          </select>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-30 transition-colors duration-200 cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Prev
            </button>
            <div className="flex items-center gap-1">
              {pageButtons.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`min-w-[32px] h-8 text-xs font-medium rounded-lg transition-colors duration-200 cursor-pointer ${
                    p === page
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                      : ""
                  }`}
                  style={p !== page ? { color: 'var(--text-muted)' } : undefined}
                >
                  {p + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-30 transition-colors duration-200 cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              Next
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
