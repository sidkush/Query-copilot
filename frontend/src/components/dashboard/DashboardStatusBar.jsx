import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { BreathingDot } from './motion';
import { TOKENS } from './tokens';

const T = TOKENS.statusBar;

/**
 * DashboardStatusBar — SP-1 shell chrome, fixed bottom.
 *
 * Sections:
 *   Left:   connection dot + DB type + database name
 *   Center: row count · query time · tier badge (separated by hairline dividers)
 *   Right:  "Voice: off" placeholder + grayed mic icon (SP-5 activates)
 *
 * All data values rendered in JetBrains Mono 11px.
 */

const Divider = () => (
  <span
    aria-hidden="true"
    style={{
      width: 1,
      height: 14,
      background: T.divider,
      flexShrink: 0,
      margin: '0 10px',
    }}
  />
);

const DataValue = ({ children, muted, mono = true }) => (
  <span
    style={{
      fontFamily: mono ? TOKENS.fontMono : T.font,
      fontSize: T.fontSize,
      color: muted ? T.label : T.value,
      fontWeight: 500,
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
      // Tabular figures — stable column width for mono digits
      fontVariantNumeric: 'tabular-nums',
    }}
  >
    {children}
  </span>
);

/** Voice mode label map */
const VOICE_MODE_LABELS = { ptt: 'PTT', wakeword: 'Wake Word', hotmic: 'Hot Mic' };
/** STT provider display labels */
const STT_LABELS = { browser: 'Browser', whisper: 'Whisper local', deepgram: 'Deepgram', openai: 'OpenAI' };

export default function DashboardStatusBar({
  connectionStatus = 'disconnected', // 'connected' | 'disconnected' | 'reconnecting'
  dbType,
  databaseName,
  rowCount,
  queryTimeMs,
  tier,          // 'schema' | 'memory' | 'turbo' | 'live' | null
  cached = false,
  // SP-5: voice pipeline
  voiceSupported = false,
  voiceListening = false,
  voiceTranscribing = false,
  onVoiceToggle,
  onVoiceModeMenu,      // right-click / long-press opens mode selector
}) {
  const voiceMode = useStore((s) => s.voiceMode);
  const voiceActive = useStore((s) => s.voiceActive);
  const voiceConfig = useStore((s) => s.voiceConfig);
  const voiceTranscript = useStore((s) => s.voiceTranscript);
  const wakeWordActive = useStore((s) => s.wakeWordActive);
  const dotColor =
    connectionStatus === 'connected' ? T.connected :
    connectionStatus === 'reconnecting' ? T.reconnecting :
    T.disconnected;

  const tierLabel = (() => {
    switch (tier) {
      case 'schema': return 'Schema';
      case 'memory': return 'Memory';
      case 'turbo':  return 'Turbo (DuckDB twin)';
      case 'live':   return 'Live';
      default:       return null;
    }
  })();

  return (
    <div
      data-testid="dashboard-status-bar"
      style={{
        height: T.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: T.bg,
        borderTop: `1px solid ${T.border}`,
        flexShrink: 0,
      }}
    >
      {/* ═══ LEFT: Connection ═══ */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
        aria-label={`Connection: ${connectionStatus}`}
      >
        {/* Breathing status dot — connected = success green, else warning/danger */}
        <BreathingDot
          color={dotColor}
          size={T.dotSize}
          glow={connectionStatus === 'connected'}
        />
        {dbType && <DataValue>{dbType}</DataValue>}
        {dbType && databaseName && (
          <span style={{ color: T.label, fontSize: T.fontSize }}>·</span>
        )}
        {databaseName && <DataValue>{databaseName}</DataValue>}
      </div>

      {/* ═══ CENTER: Metrics ═══ */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {rowCount != null && (
          <>
            <DataValue>
              {typeof rowCount === 'number' ? rowCount.toLocaleString() : rowCount} rows
            </DataValue>
            <span style={{ fontFamily: T.font, fontSize: T.fontSize, color: T.label, marginLeft: 4 }}>
              · {cached ? 'cached' : 'live'}
            </span>
          </>
        )}

        {queryTimeMs != null && (
          <>
            <Divider />
            <DataValue muted>Query:</DataValue>
            <DataValue>&nbsp;{queryTimeMs} ms</DataValue>
          </>
        )}

        {tierLabel && (
          <>
            <Divider />
            <DataValue muted>Tier:</DataValue>
            <DataValue>&nbsp;{tierLabel}</DataValue>
          </>
        )}
      </div>

      {/* ═══ RIGHT: Voice controls (SP-5) ═══ */}
      <div
        role="status"
        aria-live="polite"
        style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
      >
        {/* Interim transcript preview */}
        <AnimatePresence>
          {voiceTranscript && (
            <Motion.span
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 0.7, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              style={{
                fontFamily: T.font,
                fontSize: T.fontSize,
                color: T.value,
                fontStyle: 'italic',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {voiceTranscript}
            </Motion.span>
          )}
        </AnimatePresence>

        <Divider />

        {/* Voice label: "Voice: Whisper local · PTT" or "Voice: off" */}
        <DataValue muted>
          Voice: {voiceActive
            ? `${STT_LABELS[voiceConfig.sttProvider] || voiceConfig.sttProvider} · ${VOICE_MODE_LABELS[voiceMode] || voiceMode}`
            : 'off'}
        </DataValue>

        {/* Wake word ear icon — visible when wake-word detector is active */}
        {wakeWordActive && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" aria-label="Wake word active">
            <path d="M2 12a10 10 0 0 1 10-10" /><path d="M2 12a6 6 0 0 1 6-6" /><path d="M2 12a2 2 0 0 1 2-2" />
          </svg>
        )}

        {/* Mic button — 3 states: idle, listening (green pulse), transcribing (animated bars) */}
        <Motion.button
          onClick={onVoiceToggle}
          onContextMenu={(e) => { e.preventDefault(); onVoiceModeMenu?.(e); }}
          whileTap={{ scale: 0.88 }}
          disabled={!voiceSupported}
          title={
            !voiceSupported ? 'Voice not supported in this browser' :
            voiceListening ? 'Stop listening' :
            `Start voice (${VOICE_MODE_LABELS[voiceMode]})`
          }
          aria-label={
            voiceListening
              ? 'Listening, click to stop'
              : voiceTranscribing
                ? 'Processing speech'
                : 'Start voice mode'
          }
          aria-pressed={voiceListening}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: 'none',
            cursor: voiceSupported ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: voiceListening
              ? 'rgba(239,68,68,0.2)'
              : voiceTranscribing
                ? 'rgba(6,182,212,0.15)'
                : 'transparent',
            position: 'relative',
            padding: 0,
          }}
        >
          {/* Mic SVG */}
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke={
              voiceListening ? '#ef4444' :
              voiceTranscribing ? '#06b6d4' :
              voiceSupported ? T.value : T.label
            }
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: voiceSupported ? 1 : 0.4 }}
          >
            <rect x="9" y="1" width="6" height="11" rx="3" />
            <path d="M19 10a7 7 0 01-14 0" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>

          {/* Listening indicator — perpetual breathing dot replaces ad-hoc pulse ring */}
          {voiceListening && (
            <span
              role="status"
              aria-live="polite"
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                pointerEvents: 'none',
              }}
            >
              <BreathingDot color="#ef4444" size={8} />
            </span>
          )}

          {/* Animated bars when transcribing */}
          {voiceTranscribing && !voiceListening && (
            <div style={{ position: 'absolute', bottom: -1, display: 'flex', gap: 1 }}>
              {[3, 5, 3, 4].map((h, i) => (
                <Motion.div
                  key={i}
                  style={{ width: 1.5, borderRadius: 1, background: '#06b6d4' }}
                  animate={{ height: [2, h, 2] }}
                  transition={{ duration: 0.35 + i * 0.08, repeat: Infinity, ease: 'easeInOut' }}
                />
              ))}
            </div>
          )}
        </Motion.button>
      </div>
    </div>
  );
}
