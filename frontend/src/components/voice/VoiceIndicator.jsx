import { useMemo } from 'react';
import { motion as Motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

const BAR_HEIGHTS = [14, 18, 12, 20, 16];

export default function VoiceIndicator({ isListening, isSpeaking, interimTranscript }) {
  const barHeights = useMemo(() => BAR_HEIGHTS, []);

  if (!isListening && !isSpeaking) return null;

  return (
    <Motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-2 px-3 py-2"
      style={{
        borderRadius: TOKENS.radius.md,
        background: isListening ? `${TOKENS.danger}10` : `${TOKENS.accent}10`,
      }}
    >
      <div className="flex items-center gap-0.5">
        {barHeights.map((h, i) => (
          <Motion.div
            key={i}
            style={{
              width: 3, borderRadius: 1,
              background: isListening ? TOKENS.danger : TOKENS.accent,
            }}
            animate={{
              height: isListening || isSpeaking ? [4, h, 4] : [4, 4, 4],
            }}
            transition={{ duration: 0.4 + i * 0.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <span className="text-xs" style={{ color: TOKENS.text.muted }}>
        {isSpeaking ? 'Speaking...' : isListening ? 'Listening...' : ''}
      </span>
      {interimTranscript && (
        <span className="text-xs italic flex-1" style={{ color: TOKENS.text.muted }}>
          {interimTranscript}
        </span>
      )}
    </Motion.div>
  );
}
