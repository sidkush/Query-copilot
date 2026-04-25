/**
 * W2 Task 2 — incremental synthesis renderer.
 *
 * Renders the accumulated `message_delta` text for a single synthesis turn
 * with a soft cursor while still streaming. Consecutive `message_delta`
 * steps are coalesced upstream in `AgentStepRenderer` so this component
 * receives the full string in one prop.
 */
import { TOKENS } from '../dashboard/tokens';
import ReactMarkdown from 'react-markdown';
import { MD_COMPONENTS, REMARK_PLUGINS, FONT_BODY } from '../../lib/agentMarkdown';

export default function SynthesisStreamingStep({ step, isStreaming = false }) {
  const content = step?.content || '';
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: TOKENS.radius.sm,
        background: 'transparent',
        color: TOKENS.text.primary,
        fontFamily: FONT_BODY,
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
      }}
    >
      <ReactMarkdown components={MD_COMPONENTS} remarkPlugins={REMARK_PLUGINS}>
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 7,
            height: 14,
            marginLeft: 2,
            verticalAlign: 'text-bottom',
            background: TOKENS.text.muted,
            opacity: 0.55,
            animation: 'askdb-cursor-blink 1s steps(2, start) infinite',
          }}
        />
      )}
      <style>{`
        @keyframes askdb-cursor-blink { to { visibility: hidden; } }
      `}</style>
    </div>
  );
}
