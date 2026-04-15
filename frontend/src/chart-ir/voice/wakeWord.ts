/**
 * Wake word detection — Phase 3 scaffolding.
 *
 * Real implementation (Phase 5 per A spec §12 Phase 5) will use
 * openWakeWord browser models trained on the workspace's custom phrase
 * ('Hey Vega' default). Phase 3 ships the interface so the BottomDock
 * mic button can wire it up without blocking on the ONNX model work.
 *
 * Public contract:
 *   - start(onTrigger): begin listening for the wake word. Calls
 *     `onTrigger` each time the word fires. Returns a stop function.
 *   - isAvailable(): true if openWakeWord or WebRTC audio capture is
 *     usable in the current browser. Stub returns false until the ONNX
 *     model + audio worklet plumbing lands.
 */

export type WakeWordTrigger = () => void;

export interface WakeWordOptions {
  /** Wake phrase the model is trained on. Defaults to 'Hey Vega'. */
  phrase?: string;
  /** Confidence threshold 0..1 to fire the trigger. */
  threshold?: number;
}

export interface WakeWordSession {
  stop(): void;
}

/**
 * Whether the browser can run openWakeWord. Phase 3 stub returns false;
 * Phase 5 upgrades to a real capability check (WebAudio AudioWorklet +
 * ONNX runtime web availability).
 */
export function isWakeWordAvailable(): boolean {
  return false;
}

/**
 * Start a wake-word listening session. Phase 3 stub: no-op that returns
 * a session whose stop() is a no-op. The Phase 5 implementation will
 * replace this with a real audio worklet + ONNX inference loop.
 */
export function startWakeWordSession(
  onTrigger: WakeWordTrigger,
  options: WakeWordOptions = {},
): WakeWordSession {
  void onTrigger;
  void options;
  return {
    stop() {
      // no-op stub
    },
  };
}
