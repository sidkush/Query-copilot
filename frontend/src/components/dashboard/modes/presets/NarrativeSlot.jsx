// TSS Wave 2-B — <NarrativeSlot>, a thin wrapper around <Slot> that
// always renders narrative-kind slots. It coerces the value to a string
// + sanitises it before dropping into DOM, reusing the same
// minimal-markdown parser as TextTile. No heavy deps.
//
// Accepts an `as` prop so the layout can pick <p>, <h1>, <div>, etc. -
// lets the layout keep its bespoke semantic element while routing the
// body text through the sanitiser.

import Slot from './Slot.jsx';

const SAFE_TAG_STRIP = /<(script|iframe|object|embed|style|form|input|textarea|button)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SAFE_TAG_STRIP_VOID = /<(script|iframe|object|embed|style|form|input|textarea|button)\b[^>]*\/?>/gi;
const EVENT_HANDLER_STRIP = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const JS_HREF_STRIP = /href\s*=\s*["']?\s*javascript:/gi;

/**
 * Strip the tag / attribute vectors TextTile's sanitiser blocks.
 * Mirrors backend/TextTile.jsx :: sanitizeHtml so both surfaces share
 * the same allowlist without cross-imports. Narratives originate from
 * Claude via preset_autogen.py (backend sanitisation still applies)
 * and user edits flow through this function before touching the DOM.
 */
export function sanitizeNarrativeHtml(html) {
  if (!html) return '';
  let safe = String(html).replace(SAFE_TAG_STRIP, '');
  safe = safe.replace(SAFE_TAG_STRIP_VOID, '');
  safe = safe.replace(EVENT_HANDLER_STRIP, '');
  safe = safe.replace(JS_HREF_STRIP, 'href="');
  return safe;
}

/**
 * Minimal markdown-to-HTML - bold, italic, line breaks.
 * Intentionally no external markdown dep; narratives in the wireframes
 * use at most a few ** bold ** runs.
 */
export function renderNarrativeMarkdown(md) {
  if (!md) return '';
  let html = String(md);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  html = html.replace(/\n{2,}/g, '<br /><br />');
  html = html.replace(/\n/g, '<br />');
  return sanitizeNarrativeHtml(html);
}

/**
 * Render a narrative slot. If a binding provides renderedMarkdown the
 * wrapper paints it through the sanitiser; otherwise the descriptor
 * fallback string (plain text with line-breaks) is rendered.
 *
 * The `as` prop picks the outer HTML element; defaults to <div>.
 */
export default function NarrativeSlot({
  id,
  presetId,
  slotProps,
  as: Tag = 'div',
  className,
  fallbackRender,
}) {
  return (
    <Slot id={id} presetId={presetId} {...slotProps}>
      {({ value, state }) => {
        const text = typeof value === 'string' ? value : '';
        if (state === 'fallback' && typeof fallbackRender === 'function') {
          return <Tag className={className}>{fallbackRender(text)}</Tag>;
        }
        const sanitized = renderNarrativeMarkdown(text);
        // eslint-disable-next-line react/no-danger
        const htmlProp = { __html: sanitized };
        return <Tag className={className} dangerouslySetInnerHTML={htmlProp} />;
      }}
    </Slot>
  );
}
