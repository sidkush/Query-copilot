import { useState } from 'react';
import { TOKENS } from '../dashboard/tokens';
import { api } from '../../api';

const WARN = TOKENS.warning ?? 'var(--status-warning)';

export default function SchemaMismatchCard({ chatId, step, onResolved }) {
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState(false);

  const handle = async (choice) => {
    if (submitting || resolved) return;
    setSubmitting(true);
    try {
      await api.agentRespond(chatId, choice, step?.tool_input?.park_id ?? null);
      setResolved(true);
      if (onResolved) onResolved(choice);
    } finally {
      setSubmitting(false);
    }
  };

  const canonical = step?.tool_input?.canonical ?? 'entity';
  const proxy = step?.tool_input?.proxy_suggestion;
  const text = step?.content ?? '';

  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: TOKENS.radius.md,
      background: `color-mix(in oklab, ${WARN} 6%, transparent)`,
      border: `1px solid color-mix(in oklab, ${WARN} 35%, transparent)`,
      marginBottom: 8,
    }}>
      <div style={{
        fontWeight: 600,
        color: WARN,
        marginBottom: 6,
        fontSize: 13,
        letterSpacing: '-0.005em',
      }}>
        Schema mismatch: no per-{canonical} identifier
      </div>
      <div style={{
        fontSize: 12.5,
        color: TOKENS.text.secondary,
        marginBottom: 10,
        lineHeight: 1.55,
      }}>
        {text}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => handle('station_proxy')}
          disabled={submitting || resolved || !proxy}
          title={proxy ? `Proxy: ${proxy}` : 'No proxy column available'}
          style={{
            padding: '6px 12px',
            borderRadius: TOKENS.radius.sm,
            fontSize: 12,
            fontWeight: 500,
            border: `1px solid color-mix(in oklab, ${WARN} 40%, transparent)`,
            background: `color-mix(in oklab, ${WARN} 10%, transparent)`,
            color: WARN,
            cursor: submitting || resolved || !proxy ? 'not-allowed' : 'pointer',
            opacity: submitting || resolved || !proxy ? 0.5 : 1,
            transition: TOKENS.transition,
          }}
        >
          {proxy ? `Use ${proxy}` : 'Use proxy'}
        </button>
        <button
          onClick={() => handle('abort')}
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
          Abort
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
