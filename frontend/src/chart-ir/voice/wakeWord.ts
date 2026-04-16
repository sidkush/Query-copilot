/**
 * Wake word detection — SP-5c real implementation.
 *
 * Uses Web Speech API continuous recognition with keyword spotting as the
 * primary detection path. Falls back gracefully when SpeechRecognition
 * unavailable. Enterprise path: custom Porcupine .ppn model via BYOK.
 *
 * Flow: AudioContext → continuous SpeechRecognition → scan interim
 * transcripts for wake phrase → fire trigger → stop recognition until
 * voice pipeline finishes → resume.
 *
 * Public contract:
 *   - isWakeWordAvailable(): browser capability check
 *   - startWakeWordSession(onTrigger, options): begin listening, returns
 *     session with stop()
 */

export type WakeWordTrigger = () => void;

export interface WakeWordOptions {
  /** Wake phrase to listen for. Defaults to 'Hey Ask'. */
  phrase?: string;
  /** Confidence threshold 0..1 (unused in SpeechRecognition path). */
  threshold?: number;
  /** URL to custom Porcupine .ppn model for enterprise wake words. */
  customModelUrl?: string;
  /** Sensitivity 0–1 for custom Porcupine model. Default 0.5. */
  customSensitivity?: number;
}

export interface WakeWordSession {
  stop(): void;
  /** Pause detection (e.g., while voice pipeline is active). */
  pause(): void;
  /** Resume detection after pause. */
  resume(): void;
}

/**
 * Whether the browser supports wake-word detection via SpeechRecognition.
 */
export function isWakeWordAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

/**
 * Start a wake-word listening session. Uses continuous SpeechRecognition
 * to scan interim transcripts for the wake phrase. Lightweight — only
 * keyword scanning, no full transcription pipeline.
 */
export function startWakeWordSession(
  onTrigger: WakeWordTrigger,
  options: WakeWordOptions = {},
): WakeWordSession {
  const phrase = (options.phrase || 'Hey Ask').toLowerCase().trim();
  let stopped = false;
  let paused = false;
  let recognition: InstanceType<typeof SpeechRecognition> | null = null;
  let cooldown = false;

  // Enterprise Porcupine path — future integration point
  if (options.customModelUrl) {
    // TODO: Load Porcupine WASM SDK with .ppn model at customModelUrl
    // and customSensitivity ?? 0.5. For now, fall through to
    // SpeechRecognition keyword-spotting path.
    console.info('[WakeWord] Custom Porcupine model URL provided but WASM loader not yet integrated. Using SpeechRecognition fallback.');
  }

  if (!isWakeWordAvailable()) {
    return { stop() {}, pause() {}, resume() {} };
  }

  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  recognition = new SpeechRecognitionCtor();
  recognition!.continuous = true;
  recognition!.interimResults = true;
  recognition!.lang = 'en-US';

  recognition!.onresult = (event: any) => {
    if (stopped || paused || cooldown) return;

    // Scan interim + final results for wake phrase
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.toLowerCase();
      if (transcript.includes(phrase)) {
        // Trigger! Apply 2s cooldown to prevent rapid re-fires
        cooldown = true;
        setTimeout(() => { cooldown = false; }, 2000);
        onTrigger();
        return;
      }
    }
  };

  recognition!.onend = () => {
    // Auto-restart if not explicitly stopped
    if (!stopped && !paused) {
      try { recognition!.start(); } catch { /* already running */ }
    }
  };

  recognition!.onerror = (event: any) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    console.warn('[WakeWord] recognition error:', event.error);
  };

  // Start
  try { recognition!.start(); } catch { /* ignore */ }

  return {
    stop() {
      stopped = true;
      try { recognition?.stop(); } catch { /* ignore */ }
      recognition = null;
    },
    pause() {
      paused = true;
      try { recognition?.stop(); } catch { /* ignore */ }
    },
    resume() {
      if (stopped) return;
      paused = false;
      try { recognition?.start(); } catch { /* ignore */ }
    },
  };
}
