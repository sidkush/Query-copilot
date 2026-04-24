import { useState } from 'react';
import { TOKENS } from '../dashboard/tokens';
import { api } from '../../api';

const DANGER = TOKENS.danger; // 'var(--status-danger)'

export default function ToolErrorCascadeCard({ chatId, step, onResolved }) {
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState(false);

  const handle = async (choice) => {
    if (submitting || resolved) return;
    setSubmitting(true);
    try {
      await api.agentRespond(chatId, choice);
      setResolved(true);
      if (onResolved) onResolved(choice);
    } finally {
      setSubmitting(false);
    }
  };

  const consecutiveErrors = step?.tool_input?.consecutive_errors ?? 3;

  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: TOKENS.radius.md,
      background: `color-mix(in oklab, ${DANGER} 6%, transparent)`,
      border: `1px solid color-mix(in oklab, ${DANGER} 35%, transparent)`,
      marginBottom: 8,
    }}>
      <div style={{
        fontWeight: 600,
        color: DANGER,
        marginBottom: 6,
        fontSize: 13,
        letterSpacing: '-0.005em',
      }}>
        {consecutiveErrors} consecutive query errors
      </div>
      <div style={{
        fontSize: 12.5,
        color: TOKENS.text.secondary,
        marginBottom: 10,
        lineHeight: 1.55,
      }}>
        The agent has failed {consecutiveErrors} SQL calls in a row. Pick how to proceed:
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => handle('retry')}
          disabled={submitting || resolved}
          style={{
            padding: '6px 12px',
            borderRadius: TOKENS.radius.sm,
            fontSize: 12,
            fontWeight: 500,
            border: `1px solid color-mix(in oklab, ${DANGER} 40%, transparent)`,
            background: `color-mix(in oklab, ${DANGER} 10%, transparent)`,
            color: DANGER,
            cursor: submitting || resolved ? 'not-allowed' : 'pointer',
            opacity: submitting || resolved ? 0.5 : 1,
            transition: TOKENS.transition,
          }}
        >
          Retry
        </button>
        <button
          onClick={() => handle('change_approach')}
          disabled={submitting || resolved}
          style={{
            padding: '6px 12px',
            borderRadius: TOKENS.radius.sm,
            fontSize: 12,
            fontWeight: 500,
            border: `1px solid ${TOKENS.border.default}`,
            background: 'transparent',
            color: TOKENS.text.secondary,
            cursor: submitting || resolved ? 'not-allowed' : 'pointer',
            opacity: submitting || resolved ? 0.5 : 1,
            transition: TOKENS.transition,
          }}
        >
          Change approach
        </button>
        <button
          onClick={() => handle('summarize')}
          disabled={submitting || resolved}
          style={{
            padding: '6px 12px',
            borderRadius: TOKENS.radius.sm,
            fontSize: 12,
            fontWeight: 500,
            border: `1px solid ${TOKENS.border.default}`,
            background: 'transparent',
            color: TOKENS.text.secondary,
            cursor: submitting || resolved ? 'not-allowed' : 'pointer',
            opacity: submitting || resolved ? 0.5 : 1,
            transition: TOKENS.transition,
          }}
        >
          Summarize with what I have
        </button>
      </div>
      {resolved && (
        <div style={{
          fontSize: 12,
          color: TOKENS.text.muted,
          marginTop: 8,
          fontStyle: 'italic',
        }}>
          Choice recorded — resuming.
        </div>
      )}
    </div>
  );
}
