import { motion as Motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

export default function VoiceButton({ isListening, onToggle, supported, size = 'md' }) {
  if (!supported) return null;
  const sizes = { sm: 28, md: 36, lg: 44 };
  const s = sizes[size] || sizes.md;

  return (
    <Motion.button
      onClick={onToggle}
      whileTap={{ scale: 0.92 }}
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: s, height: s,
        background: isListening ? TOKENS.danger : `${TOKENS.text.primary}10`,
        color: isListening ? '#fff' : TOKENS.text.primary,
        border: 'none', cursor: 'pointer',
      }}
      title={isListening ? 'Stop listening' : 'Start voice mode'}
    >
      <svg width={s * 0.45} height={s * 0.45} viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 8 1z" />
        <path d="M3.5 7.5a.5.5 0 0 1 1 0 3.5 3.5 0 0 0 7 0 .5.5 0 0 1 1 0 4.5 4.5 0 0 1-4 4.473V14h2a.5.5 0 0 1 0 1H5.5a.5.5 0 0 1 0-1h2v-2.027A4.5 4.5 0 0 1 3.5 7.5z" />
      </svg>
      {isListening && (
        <Motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: `2px solid ${TOKENS.danger}` }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </Motion.button>
  );
}
