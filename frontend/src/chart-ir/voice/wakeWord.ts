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
  /**
   * URL to a custom Porcupine keyword model (.ppn file) for enterprise wake words.
   *
   * Custom wake words require a Porcupine BYOK license. The .ppn model file is
   * generated via Picovoice Console (https://console.picovoice.ai). Enterprise
   * customers upload their model to workspace settings, which stores the URL here
   * and passes it through to the wake-word session at runtime. When provided, this
   * model takes precedence over the default openWakeWord phrase-based detection.
   */
  customModelUrl?: string;
  /**
   * Detection sensitivity (0–1) for the custom Porcupine keyword model.
   * Higher values increase recall at the cost of more false positives.
   * Defaults to 0.5 when not specified.
   */
  customSensitivity?: number;
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
 *
 * When `options.customModelUrl` is provided the Phase 5 implementation will
 * fetch the Porcupine .ppn model from that URL and initialise the Picovoice
 * Web SDK instead of the default openWakeWord path. `customSensitivity`
 * (default 0.5) controls the detection threshold for that model.
 */
export function startWakeWordSession(
  onTrigger: WakeWordTrigger,
  options: WakeWordOptions = {},
): WakeWordSession {
  void onTrigger;
  void options;
  // Phase 5 note: if options.customModelUrl is set, load Porcupine SDK with
  // that .ppn model file and options.customSensitivity ?? 0.5.
  // Otherwise fall through to openWakeWord ONNX path with options.phrase /
  // options.threshold.
  return {
    stop() {
      // no-op stub
    },
  };
}
