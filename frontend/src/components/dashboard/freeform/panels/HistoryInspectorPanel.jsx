// frontend/src/components/dashboard/freeform/panels/HistoryInspectorPanel.jsx
import { useMemo } from 'react';
import { useStore } from '../../../../store';
import { diffDashboardZones } from '../lib/historyDiff';

const MAX_ROWS = 50;

function formatRelative(ms) {
  const delta = Math.max(0, Date.now() - ms);
  const s = Math.floor(delta / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function HistoryInspectorPanel() {
  const open = useStore((s) => s.analystProHistoryPanelOpen);
  const history = useStore((s) => s.analystProHistory);
  const toggle = useStore((s) => s.toggleHistoryPanelAnalystPro);
  const jump = useStore((s) => s.jumpToHistoryAnalystPro);

  const rows = useMemo(() => {
    if (!history) return [];
    const visible = history.past.slice(0, MAX_ROWS);
    return visible.map((entry, i) => {
      const prev = history.past[i + 1]?.snapshot ?? null;
      const diff = diffDashboardZones(prev, entry.snapshot);
      return { index: i, entry, diff };
    });
  }, [history]);

  if (!open) return null;

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="History inspector"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderBottom: '1px solid var(--chrome-bar-border, var(--border-default))',
        maxHeight: 360,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-default)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <span>HISTORY</span>
        <button
          type="button"
          onClick={() => toggle()}
          aria-label="Close history inspector"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ overflow: 'auto', flex: '1 1 auto' }}>
        {history?.present && (
          <div
            data-testid="history-present"
            style={{
              padding: '6px 12px',
              background: 'var(--accent)',
              color: '#fff',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700 }}>{history.present.operation}</div>
            <div style={{ opacity: 0.85, fontSize: 10 }}>(now)</div>
          </div>
        )}
        {rows.map(({ index, entry, diff }) => (
          <button
            key={`${entry.timestamp}-${index}`}
            type="button"
            data-testid={`history-row-${index}`}
            onClick={() => jump(index)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 12px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle, var(--border-default))',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700 }}>{entry.operation}</div>
            <div style={{ opacity: 0.7, fontSize: 10, display: 'flex', gap: 8 }}>
              <span>{formatRelative(entry.timestamp)}</span>
              <span>+{diff.added.length}</span>
              <span>-{diff.removed.length}</span>
              <span>~{diff.modified.length}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
