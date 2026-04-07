import { useState, useEffect } from "react";
import { api } from "../api";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import sql from "react-syntax-highlighter/dist/esm/languages/hljs/sql";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";

SyntaxHighlighter.registerLanguage("sql", sql);

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "JOIN", "ON", "GROUP BY", "ORDER BY",
  "HAVING", "LIMIT", "UNION", "INSERT", "UPDATE", "DELETE", "AND",
  "OR", "NOT", "IN", "AS", "LEFT", "RIGHT", "INNER", "OUTER",
  "CROSS", "FULL", "CASE", "WHEN", "THEN", "ELSE", "END",
  "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "BETWEEN",
  "LIKE", "IS", "NULL", "EXISTS", "WITH", "SET", "VALUES", "INTO",
  "CREATE", "ALTER", "DROP", "TABLE", "INDEX", "VIEW",
];

// Clauses that should start on a new line
const NEWLINE_CLAUSES = [
  "SELECT", "FROM", "WHERE",
  "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN",
  "CROSS JOIN", "FULL JOIN", "FULL OUTER JOIN",
  "LEFT OUTER JOIN", "RIGHT OUTER JOIN",
  "JOIN",
  "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "UNION",
];

function formatSQL(sqlStr) {
  if (!sqlStr) return sqlStr;

  // Uppercase all SQL keywords (word-boundary matching)
  // Sort keywords longest-first so multi-word keywords match before single-word ones
  const sortedKeywords = [...SQL_KEYWORDS].sort((a, b) => b.length - a.length);
  let result = sqlStr;

  for (const kw of sortedKeywords) {
    // Use word-boundary regex; escape any special regex chars in keyword
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(pattern, kw);
  }

  // Add newlines before major clauses
  // Sort longest-first to match multi-word clauses before single-word ones
  const sortedClauses = [...NEWLINE_CLAUSES].sort((a, b) => b.length - a.length);
  for (const clause of sortedClauses) {
    const escaped = clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Add newline before the clause (but not if it's at the very start)
    const pattern = new RegExp(`(?<!^)\\s+(?=${escaped}\\b)`, "gi");
    result = result.replace(pattern, "\n");
  }

  // Clean up: remove leading/trailing whitespace on each line, collapse blank lines
  result = result
    .split("\n")
    .map((line) => line.trim())
    .filter((line, idx, arr) => !(line === "" && idx > 0 && arr[idx - 1] === ""))
    .join("\n")
    .trim();

  return result;
}

export default function SQLPreview({ sql: sqlCode, onApprove, onReject, onEdit, loading, onCopySQL, connId }) {
  const [editing, setEditing] = useState(false);
  const [editedSQL, setEditedSQL] = useState(sqlCode);
  const [copied, setCopied] = useState(false);
  const [formatted, setFormatted] = useState(false);
  const [preview, setPreview] = useState(null);

  // Auto-run dry-run preview when SQL appears
  useEffect(() => {
    if (!sqlCode) return;
    let cancelled = false;
    api.previewSQL(sqlCode, connId).then(res => {
      if (!cancelled && !res.error) setPreview(res);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sqlCode, connId]);

  const handleCopySQL = async () => {
    try {
      await navigator.clipboard.writeText(editing ? editedSQL : sqlCode);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = editing ? editedSQL : sqlCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (onCopySQL) onCopySQL();
    setTimeout(() => setCopied(false), 1500);
  };

  const displaySQL = formatted && !editing ? formatSQL(sqlCode) : sqlCode;

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 border-b border-slate-800">
        <span className="text-sm font-semibold text-slate-300">Generated SQL</span>
        <div className="flex items-center gap-2">
          {copied && (
            <span className="text-xs text-emerald-400 font-medium animate-pulse">Copied!</span>
          )}
          <button
            onClick={() => setFormatted(!formatted)}
            aria-label={formatted ? "Show raw SQL" : "Format SQL"}
            className={`flex items-center justify-center px-2.5 h-8 rounded-lg text-xs font-medium backdrop-blur-sm border transition-colors duration-200 cursor-pointer ${
              formatted
                ? "text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20"
                : "text-slate-400 hover:text-slate-200 bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
            }`}
          >
            {formatted ? "Raw" : "Format"}
          </button>
          <button
            onClick={handleCopySQL}
            aria-label="Copy SQL to clipboard"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-200 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] hover:bg-white/[0.06] transition-colors duration-200 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          </button>
          <span className="text-xs text-slate-500">Review before executing</span>
          {preview && (
            <span className="text-xs text-cyan-400 font-medium ml-1">
              {preview.estimated_rows != null ? `~${preview.estimated_rows.toLocaleString()} rows` : ''}
              {preview.column_count ? `${preview.estimated_rows != null ? ', ' : ''}${preview.column_count} cols` : ''}
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={editedSQL}
          onChange={(e) => setEditedSQL(e.target.value)}
          className="w-full bg-slate-950 text-emerald-400 font-mono text-sm p-4 min-h-[120px] focus:outline-none resize-y border-none"
          spellCheck={false}
        />
      ) : (
        <SyntaxHighlighter
          language="sql"
          style={atomOneDark}
          customStyle={{ margin: 0, padding: "16px", background: "transparent", fontSize: "13px" }}
          wrapLongLines
        >
          {displaySQL}
        </SyntaxHighlighter>
      )}

      <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-900/50 border-t border-slate-800">
        <button
          onClick={() => onApprove(editing ? editedSQL : sqlCode, sqlCode)}
          disabled={loading}
          aria-label={loading ? "Query is running" : "Run query"}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors duration-200 cursor-pointer"
        >
          {loading && (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {loading ? "Running..." : "Run Query"}
        </button>
        <button
          onClick={() => { setEditing(!editing); setEditedSQL(sqlCode); }}
          aria-label={editing ? "Cancel editing SQL" : "Edit SQL"}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm rounded-lg transition-colors duration-200 cursor-pointer"
        >
          {editing ? "Cancel Edit" : "Edit SQL"}
        </button>
        <button
          onClick={onReject}
          aria-label="Reject generated SQL"
          className="px-4 py-2 text-slate-500 hover:text-red-400 text-sm rounded-lg transition-colors duration-200 cursor-pointer"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
