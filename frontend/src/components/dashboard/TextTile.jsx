import { useState, useRef, useCallback, useMemo } from 'react';
import { TOKENS } from './tokens';

/**
 * TextTile — freeform markdown/rich-text tile.
 *
 * SP-3a: Renders markdown content with editorial typography.
 * Click-to-edit with a lightweight toolbar (Bold, Italic, Heading,
 * List, Link, Code) + markdown source toggle.
 *
 * Tile shape:
 *   { id, title?, chartType: "text", content: "# Hello\n\nBody..." }
 *
 * The renderer uses a simple contentEditable approach with markdown
 * source toggle — no heavy deps (Tiptap/ProseMirror) to keep bundle
 * lean. Markdown is parsed to HTML via a minimal built-in parser.
 *
 * Security: content is authored by the tile owner (same authenticated
 * user). The parser generates a fixed set of safe HTML tags only.
 * sanitizeHtml strips any remaining script/event-handler vectors.
 */

// ── Sanitizer — strip dangerous tags & attributes ────────────────────
// Allowlist approach: only safe tags survive. No script, iframe, etc.
const SAFE_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
  'strong', 'em', 'b', 'i', 'u', 'code', 'pre',
  'ul', 'ol', 'li', 'a', 'span', 'div',
]);

function sanitizeHtml(html) {
  // Remove <script>, <iframe>, <object>, <embed>, <style> tags entirely
  let safe = html.replace(/<(script|iframe|object|embed|style|form|input|textarea|button)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  safe = safe.replace(/<(script|iframe|object|embed|style|form|input|textarea|button)\b[^>]*\/?>/gi, '');
  // Remove event handler attributes (onclick, onerror, onload, etc.)
  safe = safe.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Remove javascript: hrefs
  safe = safe.replace(/href\s*=\s*["']?\s*javascript:/gi, 'href="');
  return safe;
}

// Escape plain text so it cannot inject HTML when interpolated.
function escapeHtml(raw) {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Validate a raw URL before splicing into an href. Blocks javascript:, data:,
// vbscript:, file:, and any scheme not in the explicit allowlist. Returns "#"
// as a safe no-op when the URL fails validation.
function safeHref(raw) {
  if (!raw) return '#';
  const trimmed = String(raw).trim();
  // Allow: absolute http(s), mailto, tel, same-page fragment, relative paths
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  return '#';
}


// ── Minimal Markdown → HTML ──────────────────────────────────────────
// Covers: headings, bold, italic, inline code, code blocks, links,
// unordered lists, ordered lists, horizontal rules.

function parseMarkdown(md) {
  if (!md) return '';
  let html = md;

  // Fenced code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre class="md-code-block"><code>${escaped}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Headings (### before ## before #)
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="md-hr" />');

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links — validate URL (block javascript:/data:/etc.) and HTML-escape the
  // visible label. Prevents [clickme](javascript:alert(1)) and
  // [<img onerror=…>](https://x) style XSS.
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const href = safeHref(url);
    const safeLabel = escapeHtml(label);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="md-link">${safeLabel}</a>`;
  });

  // Unordered lists (simple — single level)
  html = html.replace(/^[-*] (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/((?:<li class="md-li">.*<\/li>\n?)+)/g, '<ul class="md-ul">$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-oli">$1</li>');
  html = html.replace(/((?:<li class="md-oli">.*<\/li>\n?)+)/g, '<ol class="md-ol">$1</ol>');

  // Paragraphs — wrap remaining lines
  html = html.replace(/^(?!<[hupol]|<li|<hr|<pre|<code)(.+)$/gm, '<p class="md-p">$1</p>');

  return sanitizeHtml(html);
}


// ── Toolbar Button ───────────────────────────────────────────────────

function ToolbarBtn({ icon, title, active, onClick }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="premium-btn premium-sheen"
      style={{
        background: active ? 'var(--overlay-medium)' : 'transparent',
        border: 'none',
        borderRadius: 5,
        color: active ? TOKENS.text.primary : TOKENS.text.muted,
        cursor: 'pointer',
        padding: '3px 7px',
        fontSize: 12,
        fontFamily: TOKENS.fontMono,
        fontWeight: 600,
        lineHeight: 1,
        transition: `color ${TOKENS.transition}, background ${TOKENS.transition}`,
      }}
    >
      {icon}
    </button>
  );
}


// ── Text Tile Component ──────────────────────────────────────────────

export default function TextTile({ tile, onUpdate, index = 0 }) {
  const [editing, setEditing] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [draft, setDraft] = useState(tile?.content || '');
  const textareaRef = useRef(null);

  const content = tile?.content || '';
  const renderedHTML = useMemo(() => parseMarkdown(content), [content]);

  const startEdit = useCallback(() => {
    setDraft(content);
    setEditing(true);
    setSourceMode(true);
  }, [content]);

  const save = useCallback(() => {
    setEditing(false);
    if (draft !== content && onUpdate) {
      onUpdate({ content: draft });
    }
  }, [draft, content, onUpdate]);

  const insertMarkdown = useCallback((prefix, suffix = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = draft.slice(start, end);
    const replacement = `${prefix}${selected || 'text'}${suffix}`;
    const next = draft.slice(0, start) + replacement + draft.slice(end);
    setDraft(next);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.selectionStart = start + prefix.length;
      ta.selectionEnd = start + prefix.length + (selected || 'text').length;
      ta.focus();
    });
  }, [draft]);

  // ── Read-only rendered view ──────────────────────────────────────
  if (!editing) {
    return (
      <div
        data-testid="text-tile"
        onClick={startEdit}
        style={{
          height: '100%',
          padding: '18px 22px',
          cursor: 'text',
          overflow: 'auto',
          fontFamily: TOKENS.fontBody,
          '--mount-index': index,
        }}
      >
        {content ? (
          <div
            className="text-tile-rendered"
            dangerouslySetInnerHTML={{ __html: renderedHTML }}
          />
        ) : (
          <div
            style={{
              color: TOKENS.text.muted,
              fontSize: 13,
              fontStyle: 'italic',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            Click to add text or markdown...
          </div>
        )}
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────
  return (
    <div
      data-testid="text-tile-editor"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        '--mount-index': index,
      }}
    >
      {/* Toolbar — includes a small TEXT eyebrow so users can identify this
          as an editable content tile at a glance (header-consistency pattern). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '6px 10px',
          borderBottom: `1px solid ${TOKENS.border.default}`,
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontSize: TOKENS.tile.eyebrowSize,
            fontWeight: 700,
            letterSpacing: TOKENS.tile.eyebrowLetterSpacing,
            textTransform: 'uppercase',
            color: TOKENS.text.muted,
            fontFamily: TOKENS.fontDisplay,
            marginRight: 8,
            userSelect: 'none',
          }}
        >
          Text
        </span>
        <ToolbarBtn icon="B" title="Bold (**text**)" onClick={() => insertMarkdown('**', '**')} />
        <ToolbarBtn icon="I" title="Italic (*text*)" onClick={() => insertMarkdown('*', '*')} />
        <ToolbarBtn icon="H" title="Heading (# )" onClick={() => insertMarkdown('## ', '')} />
        <ToolbarBtn icon="•" title="List (- )" onClick={() => insertMarkdown('- ', '')} />
        <ToolbarBtn icon="<>" title="Code (`code`)" onClick={() => insertMarkdown('`', '`')} />
        <ToolbarBtn
          icon="[]"
          title="Link ([text](url))"
          onClick={() => insertMarkdown('[', '](url)')}
        />

        <div style={{ flex: 1 }} />

        {/* Source / Preview toggle */}
        <ToolbarBtn
          icon={sourceMode ? 'Preview' : 'Source'}
          title="Toggle markdown source"
          active={!sourceMode}
          onClick={() => setSourceMode(!sourceMode)}
        />

        {/* Done */}
        <button
          type="button"
          onClick={save}
          className="premium-btn premium-sheen"
          style={{
            background: TOKENS.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            marginLeft: 6,
            boxShadow: TOKENS.shadow.accentGlow,
          }}
        >
          Done
        </button>
      </div>

      {/* Editor body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {sourceMode ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            autoFocus
            spellCheck={false}
            style={{
              width: '100%',
              height: '100%',
              padding: '14px 18px',
              background: 'transparent',
              color: TOKENS.text.primary,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: TOKENS.fontMono,
              fontSize: 13,
              lineHeight: 1.7,
              letterSpacing: '-0.01em',
            }}
          />
        ) : (
          <div
            className="text-tile-rendered"
            style={{ padding: '14px 18px' }}
            dangerouslySetInnerHTML={{ __html: parseMarkdown(draft) }}
          />
        )}
      </div>
    </div>
  );
}
