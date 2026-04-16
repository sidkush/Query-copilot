import { useRef, useCallback } from 'react';
import { useStore } from '../../../store';

/**
 * useTTS — SP-5d text-to-speech for agent narration.
 *
 * Uses Web Speech API SpeechSynthesis (free, offline). Optional upgrade
 * to OpenAI TTS via voiceConfig.ttsProvider (BYOK, server-side).
 *
 * Only activates in Stage/Pitch mode for cinematic demo narration.
 */

const SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window;

export default function useTTS() {
  const voiceConfig = useStore((s) => s.voiceConfig);
  const utteranceRef = useRef(null);

  const speak = useCallback((text) => {
    if (!SUPPORTED || !text) return;

    // Cancel any in-progress speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = voiceConfig.speed || 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.85;

    // Prefer a natural-sounding voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) =>
      v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Microsoft')
    );
    if (preferred) utterance.voice = preferred;

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [voiceConfig.speed]);

  const stop = useCallback(() => {
    if (SUPPORTED) window.speechSynthesis.cancel();
  }, []);

  return { speak, stop, supported: SUPPORTED };
}
