/**
 * W2 Task 3 — extended-thinking renderer.
 *
 * Surfaces Anthropic `thinking_delta` blocks as a collapsible "Thinking…"
 * section. Default collapsed so the main answer stays prominent. Consecutive
 * `thinking_delta` steps are coalesced upstream in `AgentStepRenderer`.
 */
import { useState } from 'react';
import { TOKENS } from '../dashboard/tokens';

export default function ThinkingStreamStep({ step, isStreaming = false }) {
  const [open, setOpen] = useState(false);
  const content = step?.content || '';
  if (!content && !isStreaming) return null;
  return (
    <div
      style={{
        padding: '4px 12px',
        fontSize: 12,
        color: TOKENS.text.muted,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          color: TOKENS.text.muted,
          cursor: 'pointer',
          fontSize: 12,
          fontStyle: 'italic',
          padding: 0,
        }}
        aria-expanded={open}
      >
        {open ? '▼' : '▶'} Thinking{isStreaming ? '…' : ''}
      </button>
      {open && (
        <pre
          style={{
            marginTop: 4,
            padding: '6px 8px',
            borderLeft: `2px solid ${TOKENS.border?.subtle || '#444'}`,
            background: 'transparent',
            color: TOKENS.text.muted,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            opacity: 0.85,
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}
