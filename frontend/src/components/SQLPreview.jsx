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

export default function SQLPreview({ sql: sqlCode, onApprove, onReject, onEdit: _onEdit, loading, onCopySQL, connId }) {
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
    <div className="chat-artifact">
      <div className="chat-artifact__header">
        <span className="chat-artifact__label">
          <span className="eyebrow-dot" aria-hidden="true" />
          SQL
          <span style={{ opacity: 0.4 }}>·</span>
          <span>Generated</span>
        </span>
        {preview && (
          <span className="chat-artifact__stat">
            {preview.estimated_rows != null && <>~{preview.estimated_rows.toLocaleString()} rows</>}
            {preview.column_count != null && <> · {preview.column_count} cols</>}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {copied && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] chip-blink" style={{ color: 'var(--status-success)' }}>
              Copied
            </span>
          )}
          <button
            onClick={() => setFormatted(!formatted)}
            aria-label={formatted ? "Show raw SQL" : "Format SQL"}
            aria-pressed={formatted}
            className="ease-spring cursor-pointer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '0.35rem 0.7rem',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 9999,
              color: formatted ? 'var(--accent)' : 'var(--text-secondary)',
              background: formatted ? 'var(--accent-glow)' : 'var(--overlay-faint)',
              border: `1px solid ${formatted ? 'rgba(37, 99, 235, 0.25)' : 'var(--border-default)'}`,
              transition: 'background 300ms cubic-bezier(0.32, 0.72, 0, 1), color 300ms cubic-bezier(0.32, 0.72, 0, 1), border-color 300ms cubic-bezier(0.32, 0.72, 0, 1), transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            {formatted ? 'Raw' : 'Format'}
          </button>
          <button
            onClick={handleCopySQL}
            aria-label="Copy SQL to clipboard"
            className="ease-spring cursor-pointer flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9999,
              color: 'var(--text-secondary)',
              background: 'var(--overlay-faint)',
              border: '1px solid var(--border-default)',
              transition: 'background 300ms cubic-bezier(0.32, 0.72, 0, 1), color 300ms cubic-bezier(0.32, 0.72, 0, 1), transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          </button>
        </div>
      </div>

      {editing ? (
        <textarea
          value={editedSQL}
          onChange={(e) => setEditedSQL(e.target.value)}
          className="w-full font-mono text-sm p-4 min-h-[120px] focus:outline-none resize-y border-none"
          style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}
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

      <div className="chat-artifact__footer">
        <button
          onClick={() => onApprove(editing ? editedSQL : sqlCode, sqlCode)}
          disabled={loading}
          aria-label={loading ? "Query is running" : "Run query"}
          className="group inline-flex items-center gap-2 pl-5 pr-1.5 py-1.5 rounded-full text-sm font-semibold ease-spring cursor-pointer disabled:opacity-60"
          style={{
            background: '#10b981',
            color: '#fff',
            border: 'none',
            boxShadow: '0 8px 24px -10px rgba(16, 185, 129, 0.55), 0 1px 0 rgba(255,255,255,0.18) inset',
          }}
        >
          {loading ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <span>Running…</span>
            </>
          ) : (
            <>
              <span>Run query</span>
              <span
                className="flex items-center justify-center w-7 h-7 rounded-full ease-spring transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-[1px]"
                style={{ background: 'rgba(255,255,255,0.2)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 3l14 9-14 9V3z" />
                </svg>
              </span>
            </>
          )}
        </button>
        <button
          onClick={() => { setEditing(!editing); setEditedSQL(sqlCode); }}
          aria-label={editing ? "Cancel editing SQL" : "Edit SQL"}
          className="ease-spring cursor-pointer"
          style={{
            padding: '0.5rem 1rem',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 9999,
            background: 'var(--overlay-faint)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            transition: 'background 300ms cubic-bezier(0.32, 0.72, 0, 1), transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {editing ? 'Cancel edit' : 'Edit SQL'}
        </button>
        <button
          onClick={onReject}
          aria-label="Reject generated SQL"
          className="ease-spring cursor-pointer"
          style={{
            padding: '0.5rem 1rem',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 9999,
            background: 'transparent',
            color: 'var(--text-muted)',
            border: 'none',
            transition: 'color 300ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--status-danger)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          Reject
        </button>
        <span className="chat-artifact__stat ml-auto">Review before executing</span>
      </div>
    </div>
  );
}
