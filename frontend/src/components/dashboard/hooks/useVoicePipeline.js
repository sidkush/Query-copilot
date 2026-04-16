import { useRef, useCallback, useEffect } from 'react';
import { useStore } from '../../../store';
import { isWakeWordAvailable, startWakeWordSession } from '../../../chart-ir/voice/wakeWord';

/**
 * useVoicePipeline — SP-5a: dashboard voice capture → STT → agent routing.
 *
 * Manages microphone access, Web Speech API recognition, silence detection,
 * and auto-submit of final transcripts to the agent panel input.
 *
 * Supports PTT (push-to-talk) as default mode. Wake-word and hot-mic modes
 * are wired in SP-5b/5c.
 */

const SUPPORTED = typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

export default function useVoicePipeline({ onTranscript } = {}) {
  const voiceMode = useStore((s) => s.voiceMode);
  const voiceListening = useStore((s) => s.voiceListening);
  const voiceConfig = useStore((s) => s.voiceConfig);
  const setVoiceListening = useStore((s) => s.setVoiceListening);
  const setVoiceTranscribing = useStore((s) => s.setVoiceTranscribing);
  const setVoiceTranscript = useStore((s) => s.setVoiceTranscript);
  const setVoiceFinalTranscript = useStore((s) => s.setVoiceFinalTranscript);
  const setVoiceActive = useStore((s) => s.setVoiceActive);

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const wakeWordSessionRef = useRef(null);
  const setWakeWordActive = useStore((s) => s.setWakeWordActive);

  // Create SpeechRecognition instance (lazy)
  const getRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current;
    if (!SUPPORTED) return null;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        setVoiceTranscript(interim);
        setVoiceTranscribing(true);
        // Reset silence timer on new speech
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          // Silence detected — finalize
        }, voiceConfig.silenceDelayMs || 1200);
      }

      if (final) {
        setVoiceTranscript('');
        setVoiceTranscribing(false);
        setVoiceFinalTranscript(final.trim());
        onTranscript?.(final.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      console.warn('[VoicePipeline] recognition error:', event.error);
      stopListening();
    };

    recognition.onend = () => {
      const currentMode = useStore.getState().voiceMode;
      if (currentMode === 'hotmic' && useStore.getState().voiceActive) {
        // Hot mic: auto-restart on natural end
        try { recognition.start(); } catch { /* already running */ }
      } else {
        setVoiceListening(false);
        setVoiceActive(false);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [voiceMode, voiceConfig.silenceDelayMs, onTranscript, setVoiceListening, setVoiceTranscribing, setVoiceTranscript, setVoiceFinalTranscript, setVoiceActive]);

  const startListening = useCallback(() => {
    const recognition = getRecognition();
    if (!recognition) return;
    try {
      recognition.start();
      setVoiceListening(true);
      setVoiceActive(true);
      setVoiceTranscript('');
    } catch (e) {
      // Already started — ignore DOMException
      if (e.name !== 'InvalidStateError') throw e;
    }
  }, [getRecognition, setVoiceListening, setVoiceActive, setVoiceTranscript]);

  const stopListening = useCallback(() => {
    clearTimeout(silenceTimerRef.current);
    const recognition = recognitionRef.current;
    if (recognition) {
      try { recognition.stop(); } catch { /* ignore */ }
    }
    setVoiceListening(false);
    setVoiceTranscribing(false);
    setVoiceActive(false);
  }, [setVoiceListening, setVoiceTranscribing, setVoiceActive]);

  const toggleListening = useCallback(() => {
    if (voiceListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [voiceListening, startListening, stopListening]);

  // Wake word session management — active when mode is 'wakeword' and not currently listening
  useEffect(() => {
    if (voiceMode !== 'wakeword' || !isWakeWordAvailable()) {
      // Tear down any existing session
      wakeWordSessionRef.current?.stop();
      wakeWordSessionRef.current = null;
      setWakeWordActive(false);
      return;
    }

    const wakePhrase = useStore.getState().voiceConfig.wakePhrase || 'Hey Ask';
    const session = startWakeWordSession(
      () => {
        // Wake word detected — pause detector and start voice capture
        session.pause();
        startListening();
      },
      { phrase: wakePhrase },
    );
    wakeWordSessionRef.current = session;
    setWakeWordActive(true);

    return () => {
      session.stop();
      setWakeWordActive(false);
    };
  }, [voiceMode, startListening, setWakeWordActive]);

  // When listening stops in wakeword mode, resume detector
  useEffect(() => {
    if (voiceMode === 'wakeword' && !voiceListening && wakeWordSessionRef.current) {
      wakeWordSessionRef.current.resume();
    }
  }, [voiceMode, voiceListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
      wakeWordSessionRef.current?.stop();
      wakeWordSessionRef.current = null;
    };
  }, []);

  return {
    supported: SUPPORTED,
    listening: voiceListening,
    startListening,
    stopListening,
    toggleListening,
  };
}
