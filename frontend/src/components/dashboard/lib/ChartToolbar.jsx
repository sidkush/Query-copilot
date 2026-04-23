import { useState, useCallback } from "react";

function rowsToCSV(columns, rows) {
  const headers = columns.join(",");
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const body = rows
    .map((r) =>
      Array.isArray(r)
        ? r.map(escape).join(",")
        : columns.map((c) => escape(r?.[c])).join(","),
    )
    .join("\n");
  return `${headers}\n${body}`;
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(s) {
  return (s || "chart")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "chart";
}

/**
 * ChartToolbar — action row below chat result charts.
 *
 * Actions (mirrors dashboard tile freedom):
 *   - PNG      → Vega view.toImageURL('png', 2)
 *   - SVG      → Vega view.toImageURL('svg')
 *   - CSV      → rows serialized
 *   - Edit     → callback (navigate to full editor)
 *
 * Silent-fail: if the Vega view isn't attached yet (chart still mounting),
 * the PNG/SVG buttons show a brief "Preparing…" state rather than firing.
 */
export default function ChartToolbar({
  view,
  columns = [],
  rows = [],
  title = "chart",
  onEdit,
  stats,
}) {
  const [pending, setPending] = useState(null);
  const base = slugify(title);

  const handleImage = useCallback(
    async (format) => {
      if (!view) {
        setPending("wait");
        setTimeout(() => setPending(null), 900);
        return;
      }
      setPending(format);
      try {
        const url = await view.toImageURL(format, format === "png" ? 2 : 1);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        console.warn("Chart export failed:", err);
      } finally {
        setPending(null);
      }
    },
    [view, base],
  );

  const handleCSV = useCallback(() => {
    if (!columns.length || !rows.length) return;
    setPending("csv");
    try {
      downloadBlob(`${base}.csv`, rowsToCSV(columns, rows), "text/csv");
    } finally {
      setTimeout(() => setPending(null), 400);
    }
  }, [base, columns, rows]);

  return (
    <div className="chat-chart-toolbar" role="toolbar" aria-label="Chart actions">
      <span className="chat-chart-toolbar__label">
        {stats || "Chart"}
      </span>

      <button
        type="button"
        className="chat-chart-action"
        onClick={handleCSV}
        disabled={!rows.length}
        title="Download data as CSV"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
          <path d="M5 21h14" />
        </svg>
        {pending === "csv" ? "Saved" : "CSV"}
      </button>

      <button
        type="button"
        className="chat-chart-action"
        onClick={() => handleImage("png")}
        title="Download chart as PNG (2x)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 15l5-5 4 4 3-3 6 6" />
          <circle cx="8.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
        {pending === "png" ? "..." : pending === "wait" ? "Wait" : "PNG"}
      </button>

      <button
        type="button"
        className="chat-chart-action"
        onClick={() => handleImage("svg")}
        title="Download chart as SVG"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V5a1 1 0 011-1h3" />
          <path d="M20 7V5a1 1 0 00-1-1h-3" />
          <path d="M4 17v2a1 1 0 001 1h3" />
          <path d="M20 17v2a1 1 0 01-1 1h-3" />
          <path d="M9 12h1m2 0h1m2 0h1" />
        </svg>
        {pending === "svg" ? "..." : "SVG"}
      </button>

      {onEdit && (
        <button
          type="button"
          className="chat-chart-action chat-chart-action--primary"
          onClick={onEdit}
          title="Open in chart editor"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Edit
        </button>
      )}
    </div>
  );
}
