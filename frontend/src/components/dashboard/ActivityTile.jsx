import { useEffect, useRef, useMemo } from 'react';
import { TOKENS } from './tokens';

/**
 * ActivityTile — chronological event feed tile.
 *
 * SP-3a: Wireframe 5 reference — "Recent Activity" feed with
 * color-coded event dots, person name, action, entity, timestamp.
 *
 * Tile shape:
 *   {
 *     id, chartType: "activity",
 *     events: [
 *       { type: "won", person: "Sarah K.", action: "closed", entity: "Acme Renewal", timestamp: "..." },
 *       { type: "lost", person: "Marcus T.", action: "lost", entity: "Globex Deal", timestamp: "..." },
 *       ...
 *     ]
 *   }
 *
 * Event types: won, lost, moved, created, note, refresh, annotation, alert
 */

// ── Event type config ────────────────────────────────────────────────

const EVENT_CONFIG = {
  won:        { dot: '#22c55e', icon: 'W', label: 'Won' },
  lost:       { dot: '#ef4444', icon: 'L', label: 'Lost' },
  moved:      { dot: '#71717a', icon: '→', label: 'Moved' },
  created:    { dot: '#3b82f6', icon: '+', label: 'Created' },
  note:       { dot: '#f59e0b', icon: 'N', label: 'Note' },
  refresh:    { dot: '#06b6d4', icon: '↻', label: 'Refreshed' },
  annotation: { dot: '#a78bfa', icon: 'A', label: 'Annotated' },
  alert:      { dot: '#ef4444', icon: '!', label: 'Alert' },
  default:    { dot: '#64748b', icon: '•', label: 'Event' },
};

function getEventConfig(type) {
  return EVENT_CONFIG[type] || EVENT_CONFIG.default;
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}


export default function ActivityTile({ tile }) {
  const scrollRef = useRef(null);
  const rawEvents = tile?.events;

  // Sort newest first
  const sorted = useMemo(() => {
    const events = rawEvents || [];
    return [...events].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
  }, [rawEvents]);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [sorted.length]);

  if (sorted.length === 0) {
    return (
      <div
        data-testid="activity-tile"
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: TOKENS.text.muted,
          fontSize: 12,
          fontStyle: 'italic',
          fontFamily: TOKENS.fontBody,
          padding: 20,
        }}
      >
        No recent activity
      </div>
    );
  }

  return (
    <div
      data-testid="activity-tile"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: TOKENS.fontBody,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 18px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: TOKENS.text.muted,
            fontFamily: TOKENS.fontDisplay,
          }}
        >
          Recent Activity
        </span>
        <span
          style={{
            fontSize: 10,
            color: TOKENS.text.muted,
            fontFamily: TOKENS.fontMono,
            padding: '1px 6px',
            borderRadius: 9999,
            background: TOKENS.bg.surface,
          }}
        >
          {sorted.length}
        </span>
      </div>

      {/* Event list */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '0 14px 14px',
        }}
      >
        {sorted.map((event, i) => {
          const cfg = getEventConfig(event.type);
          return (
            <div
              key={event.id || `evt-${i}`}
              data-testid={`activity-event-${i}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 4px',
                borderBottom: i < sorted.length - 1
                  ? '1px solid rgba(255,255,255,0.04)'
                  : 'none',
              }}
            >
              {/* Color-coded dot */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: `color-mix(in oklab, ${cfg.dot} 20%, transparent)`,
                  border: `1.5px solid ${cfg.dot}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 800,
                  color: cfg.dot,
                  flexShrink: 0,
                  marginTop: 1,
                  fontFamily: TOKENS.fontDisplay,
                }}
              >
                {cfg.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: TOKENS.text.secondary }}>
                  <span style={{ fontWeight: 650, color: TOKENS.text.primary }}>
                    {event.person || 'System'}
                  </span>
                  {' '}
                  <span>{event.action || cfg.label}</span>
                  {event.entity && (
                    <>
                      {' '}
                      <span style={{ fontWeight: 600, color: TOKENS.text.primary }}>
                        {event.entity}
                      </span>
                    </>
                  )}
                </div>
                {event.detail && (
                  <div style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 2, lineHeight: 1.4 }}>
                    {event.detail}
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <span
                style={{
                  fontSize: 10,
                  color: TOKENS.text.muted,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  fontFamily: TOKENS.fontMono,
                  marginTop: 2,
                }}
              >
                {relativeTime(event.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
