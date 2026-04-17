import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { TOKENS } from './tokens';
import { BreathingDot } from './motion';

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

  // Portal target — document.body so the overlay never reserves layout space
  // in the dashboard flex column. Guard for SSR / tests with no document.
  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  const overlay = (
    <AnimatePresence>
      {hasContent && (
        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Voice transcript"
          style={{
            position: 'fixed',
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
            className="premium-liquid-glass"
            style={{
              borderRadius: isStage ? 18 : 11,
              padding: isStage ? '12px 24px' : '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 32px var(--shadow-deep)',
            }}
          >
            {/* Listening indicator — breathing dot (replaces ad-hoc pulse).
                Larger size in Stage mode for audience visibility. */}
            {voiceListening && (
              <BreathingDot color="#ef4444" size={isStage ? 10 : 7} />
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

  // createPortal so the overlay lives outside the dashboard's flex column
  // and never reserves layout space in the shell.
  return portalTarget ? createPortal(overlay, portalTarget) : overlay;
}
