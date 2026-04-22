import remarkGfm from 'remark-gfm';
import { TOKENS } from '../components/dashboard/tokens';

export const FONT_BODY = "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif";
export const FONT_DISPLAY = "'Outfit', system-ui, sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
export const REMARK_PLUGINS = [remarkGfm];

const TOKEN_PATTERNS = [
  { match: /\b(INCLUDE|KEEP|GOOD|HIGH|VALID|PASS|VERIFIED|SUCCESS|EXCELLENT)\b/, kind: 'success' },
  { match: /\b(EXCLUDE|DROP|SKIP|REMOVE|REJECT|LOW)\b/, kind: 'muted' },
  { match: /\b(HANDLE NULL|HANDLE|WARN|REVIEW|MEDIUM|CHECK|PARTIAL|OPTIONAL)\b/, kind: 'warning' },
  { match: /\b(FAIL|ERROR|INVALID|MISSING|BLOCKED)\b/, kind: 'danger' },
];
const CHIP_STYLES = {
  success: { bg: 'rgba(34,197,94,0.12)', fg: '#22c55e', border: 'rgba(34,197,94,0.32)' },
  muted: { bg: 'rgba(148,163,184,0.10)', fg: 'var(--text-muted)', border: 'rgba(148,163,184,0.22)' },
  warning: { bg: 'rgba(245,158,11,0.12)', fg: '#f59e0b', border: 'rgba(245,158,11,0.32)' },
  danger: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444', border: 'rgba(239,68,68,0.32)' },
};

function getCellText(children) {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(c => (typeof c === 'string' ? c : '')).join('');
  return '';
}

function tokenizeCellContent(children) {
  const text = getCellText(children);
  if (text.length === 0) return children;
  for (const { match, kind } of TOKEN_PATTERNS) {
    const m = text.match(match);
    if (!m) continue;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    const styles = CHIP_STYLES[kind];
    return (
      <>
        {before}
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '1px 8px', borderRadius: 9999,
          fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase',
          background: styles.bg, color: styles.fg,
          border: `1px solid ${styles.border}`,
          fontFamily: FONT_DISPLAY,
          whiteSpace: 'nowrap',
        }}>{m[0]}</span>
        {after}
      </>
    );
  }
  return children;
}

function isNumericCell(children) {
  const text = getCellText(children).trim();
  return text.length > 0 && /^-?[\d,.\s%$()]+$/.test(text);
}

/**
 * Premium markdown component map, theme-aware via CSS variables.
 *
 * `density` controls type scale + spacing rhythm:
 *   - "compact" (default) — agent panel; tight cells & smaller headings
 *   - "comfortable" — chat page; larger body, looser spacing, hero-grade headings
 */
export function createMarkdownComponents(density = 'compact') {
  const isComfy = density === 'comfortable';
  // Compact (agent panel) tightens 0.5-1px across the board for intimate feel.
  // Comfortable (chat page) expands for editorial rhythm.
  const sizeBody = isComfy ? 15 : 12.5;
  const sizeLi = isComfy ? 14.5 : 12;
  const sizeH1 = isComfy ? 24 : 15;
  const sizeH2 = isComfy ? 18 : 13;
  const sizeH3 = isComfy ? 10 : 9;
  const padPara = isComfy ? 12 : 7;
  const lineHeightBody = isComfy ? 1.75 : 1.55;

  return {
    h1: ({ children }) => (
      <div style={{
        fontSize: sizeH1, fontWeight: 800, color: TOKENS.text.primary,
        marginTop: isComfy ? 18 : 12, marginBottom: isComfy ? 12 : 8,
        fontFamily: FONT_DISPLAY, letterSpacing: '-0.025em', lineHeight: 1.15,
      }}>{children}</div>
    ),
    h2: ({ children }) => (
      <div className="chat-md-h2" style={{
        fontSize: sizeH2, fontWeight: 700,
        marginTop: isComfy ? 22 : 14, marginBottom: isComfy ? 10 : 6,
        fontFamily: FONT_DISPLAY, letterSpacing: '-0.018em', lineHeight: 1.25,
        paddingBottom: isComfy ? 10 : 6,
        display: 'flex', alignItems: 'baseline', gap: 10,
      }}>
        {children}
      </div>
    ),
    h3: ({ children }) => (
      <div className="chat-md-h3" style={{
        fontSize: sizeH3, fontWeight: 700,
        marginTop: isComfy ? 16 : 10, marginBottom: isComfy ? 8 : 4,
        fontFamily: FONT_DISPLAY,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        display: 'inline-flex', alignItems: 'center', gap: 7,
      }}>
        {children}
      </div>
    ),
    p: ({ children }) => (
      <div style={{
        marginBottom: padPara,
        fontSize: sizeBody,
        lineHeight: lineHeightBody,
        fontFamily: FONT_BODY,
        letterSpacing: isComfy ? '-0.01em' : '-0.005em',
        color: TOKENS.text.primary,
      }}>{children}</div>
    ),
    strong: ({ children }) => <span style={{ fontWeight: 700, color: TOKENS.text.primary }}>{children}</span>,
    em: ({ children }) => <span style={{ fontStyle: 'italic', color: TOKENS.text.secondary }}>{children}</span>,
    del: ({ children }) => <span style={{ textDecoration: 'line-through', color: TOKENS.text.muted, opacity: 0.7 }}>{children}</span>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer" style={{
        color: TOKENS.accent, textDecoration: 'none',
        borderBottom: '1px solid rgba(37,99,235,0.32)',
        paddingBottom: 1,
        transition: 'border-color 280ms cubic-bezier(0.32,0.72,0,1)',
      }}>{children}</a>
    ),
    ul: ({ children }) => (
      <ul style={{
        paddingLeft: 0, margin: `${isComfy ? 12 : 8}px 0`,
        listStyle: 'none',
        display: 'flex', flexDirection: 'column',
        gap: isComfy ? 6 : 4,
      }}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol style={{
        paddingLeft: 22, margin: `${isComfy ? 12 : 8}px 0`,
        display: 'flex', flexDirection: 'column',
        gap: isComfy ? 6 : 4,
      }}>{children}</ol>
    ),
    li: ({ children }) => (
      <li className="chat-md-li" style={{
        fontSize: sizeLi,
        fontFamily: FONT_BODY,
        lineHeight: 1.6,
        position: 'relative',
        paddingLeft: 18,
        letterSpacing: '-0.005em',
      }}>
        <span className="chat-md-li-dot" aria-hidden="true" style={{
          position: 'absolute', left: 4, top: isComfy ? 11 : 10,
          width: 4, height: 4, borderRadius: '50%',
        }} />
        {children}
      </li>
    ),
    hr: () => (
      <div style={{
        height: 1, margin: `${isComfy ? 22 : 14}px 0`,
        background: `linear-gradient(90deg, transparent, ${TOKENS.border.default}, transparent)`,
        border: 'none',
      }} />
    ),
    blockquote: ({ children }) => (
      <div className="chat-md-blockquote" style={{
        margin: `${isComfy ? 14 : 10}px 0`,
        padding: isComfy ? '14px 18px' : '10px 14px',
        borderRadius: 12,
        fontFamily: FONT_BODY,
        fontSize: isComfy ? 13.5 : 12.5,
        lineHeight: 1.65,
        fontStyle: 'italic',
      }}>{children}</div>
    ),
    code: ({ inline, children }) => {
      if (inline === false) {
        return (
          <code className="chat-md-code-fence" style={{
            display: 'block', whiteSpace: 'pre',
            fontFamily: FONT_MONO, fontSize: 11.5,
            lineHeight: 1.55,
          }}>{children}</code>
        );
      }
      return (
        <span className="chat-md-inline-code" style={{
          fontSize: isComfy ? 12 : 11,
          padding: '2px 7px', borderRadius: 6,
          fontFamily: FONT_MONO,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}>{children}</span>
      );
    },
    pre: ({ children }) => (
      <div className="chat-md-pre" style={{
        margin: `${isComfy ? 14 : 10}px 0`,
        padding: isComfy ? '14px 16px' : '12px 14px',
        borderRadius: 12,
        overflowX: 'auto',
        fontFamily: FONT_MONO, fontSize: 11.5,
        lineHeight: 1.6,
      }}>{children}</div>
    ),
    table: ({ children }) => (
      <div className="agent-table-shell">
        <div className="agent-table-scroll">
          <table className="agent-table">{children}</table>
        </div>
      </div>
    ),
    thead: ({ children }) => <thead className="agent-table-head">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="agent-table-row">{children}</tr>,
    th: ({ children }) => <th>{children}</th>,
    td: ({ children }) => {
      const numeric = isNumericCell(children);
      const tokenized = tokenizeCellContent(children);
      return <td data-numeric={numeric || undefined}>{tokenized}</td>;
    },
  };
}

/** Default compact-density component map (agent panel). */
export const MD_COMPONENTS = createMarkdownComponents('compact');
/** Comfortable-density component map (chat page). */
export const MD_COMPONENTS_COMFY = createMarkdownComponents('comfortable');

/** Quick check: does this string look like structured markdown worth rendering? */
export function looksLikeRichMarkdown(content) {
  if (typeof content !== 'string') return false;
  if (content.length > 120) return true;
  if (content.includes('\n')) return true;
  // Headings, tables, lists, code fences, blockquotes
  return /(^|\n)\s*(#{1,6} |\||[-*+] |\d+\.\s|>\s|```)/.test(content);
}
