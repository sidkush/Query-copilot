import { useEffect, useRef } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { TOKENS } from './tokens';

/**
 * VoiceTranscriptOverlay — SP-5d floating transcription display.
 *
 * Appears near the bottom of the dashboard (above status bar) showing:
 *  - Interim transcript in lighter opacity (live partial recognition)
 *  - Final transcript in full opacity, fades after agent acknowledges
 *
 * In Stage/Pitch mode: centered, larger text for audience visibility.
 * In other modes: right-aligned near status bar, compact.
 */

const T = TOKENS.statusBar;

export default function VoiceTranscriptOverlay({ archetype = 'workbench' }) {
  const voiceTranscript = useStore((s) => s.voiceTranscript);
  const voiceFinalTranscript = useStore((s) => s.voiceFinalTranscript);
  const voiceListening = useStore((s) => s.voiceListening);
  const setVoiceFinalTranscript = useStore((s) => s.setVoiceFinalTranscript);
  const fadeTimerRef = useRef(null);

  const isStage = archetype === 'pitch' || archetype === 'story';
  const hasContent = voiceTranscript || voiceFinalTranscript;

  // Auto-fade final transcript after 3s
  useEffect(() => {
    if (!voiceFinalTranscript) return;
    clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      setVoiceFinalTranscript('');
    }, 3000);
    return () => clearTimeout(fadeTimerRef.current);
  }, [voiceFinalTranscript, setVoiceFinalTranscript]);

  return (
    <AnimatePresence>
      {hasContent && (
        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'absolute',
            bottom: isStage ? 80 : 40,
            left: isStage ? '50%' : 'auto',
            right: isStage ? 'auto' : 16,
            transform: isStage ? 'translateX(-50%)' : 'none',
            zIndex: 50,
            maxWidth: isStage ? '70%' : 360,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(12,12,20,0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(63,63,70,0.4)',
              borderRadius: isStage ? 16 : 10,
              padding: isStage ? '12px 24px' : '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {/* Listening indicator dot */}
            {voiceListening && (
              <Motion.span
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#ef4444',
                  flexShrink: 0,
                }}
              />
            )}

            <div style={{ minWidth: 0 }}>
              {/* Interim (partial) transcript — lighter */}
              {voiceTranscript && (
                <span
                  style={{
                    fontFamily: isStage ? TOKENS.fontDisplay : TOKENS.fontBody,
                    fontSize: isStage ? 18 : 12,
                    color: TOKENS.text.muted,
                    fontStyle: 'italic',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {voiceTranscript}
                </span>
              )}

              {/* Final transcript — full opacity */}
              {voiceFinalTranscript && !voiceTranscript && (
                <Motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    fontFamily: isStage ? TOKENS.fontDisplay : TOKENS.fontBody,
                    fontSize: isStage ? 20 : 12,
                    fontWeight: isStage ? 500 : 400,
                    color: TOKENS.text.primary,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {voiceFinalTranscript}
                </Motion.span>
              )}
            </div>
          </div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}
