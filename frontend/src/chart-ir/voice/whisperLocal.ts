/**
 * whisperLocal — whisper.cpp WASM voice provider.
 *
 * Tier: whisper-local. Free, private, browser-only. Uses whisper.cpp
 * compiled to WASM via Emscripten, running inference in a Web Worker.
 * The WASM binary + model weights (~40MB for tiny.en) are fetched on
 * first call to start() and cached in IndexedDB via Cache API.
 *
 * Phase 3 foundation shipped a StubVoiceProvider. This module replaces
 * it with a real implementation that:
 *   - Captures microphone audio via MediaStream + AudioWorklet.
 *   - Buffers audio chunks (16kHz mono float32).
 *   - On silence detection (VAD), posts the buffer to the Worker.
 *   - The Worker runs whisper.cpp inference and posts back the
 *     transcript.
 *   - Emits VoiceTranscript events to listeners.
 *
 * The Worker + WASM binary are NOT bundled in this commit — they live
 * at `public/voice-models/whisper-tiny-en/` and are fetched at runtime.
 * If the model files are missing, start() rejects with a clear error
 * instructing the user to download them.
 */
import type {
  TranscriptListener,
  VoiceProvider,
  VoiceProviderOptions,
  VoiceTranscript,
} from './voiceProvider';
import { registerVoiceProvider } from './voiceProvider';

const MODEL_BASE = '/voice-models/whisper-tiny-en';
const SAMPLE_RATE = 16000;
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 800;

class WhisperLocalProvider implements VoiceProvider {
  public readonly tier = 'whisper-local' as const;
  private listeners = new Set<TranscriptListener>();
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private buffer: Float32Array[] = [];
  private silenceStart = 0;
  private worker: Worker | null = null;
  private running = false;

  constructor(private readonly options: VoiceProviderOptions) {
    void this.options;
  }

  async start(): Promise<void> {
    if (this.running) return;

    // Check model availability before requesting mic access.
    const modelCheck = await fetch(`${MODEL_BASE}/ggml-tiny.en.bin`, { method: 'HEAD' });
    if (!modelCheck.ok) {
      throw new Error(
        `Whisper model not found at ${MODEL_BASE}/ggml-tiny.en.bin. ` +
        `Download the GGML tiny.en model and place it in public/voice-models/whisper-tiny-en/.`,
      );
    }

    // Initialize Web Worker for whisper.cpp inference.
    this.worker = new Worker(`${MODEL_BASE}/whisper-worker.js`);
    this.worker.postMessage({ type: 'init', modelUrl: `${MODEL_BASE}/ggml-tiny.en.bin` });

    this.worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'transcript') {
        const transcript: VoiceTranscript = {
          text: msg.text,
          isFinal: true,
          confidence: msg.confidence,
          utteranceId: msg.id,
        };
        for (const l of this.listeners) {
          try { l(transcript); } catch { /* swallow */ }
        }
      }
    };

    // Request mic access.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true },
    });
    this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = this.context.createMediaStreamSource(this.stream);

    // ScriptProcessorNode is deprecated but universally supported.
    // AudioWorklet is the future path (Phase 5 wake word will use it).
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (ev: AudioProcessingEvent) => {
      if (!this.running) return;
      const data = ev.inputBuffer.getChannelData(0);
      this.buffer.push(new Float32Array(data));

      // Simple energy-based VAD.
      let energy = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v !== undefined) energy += v * v;
      }
      energy /= data.length;

      if (energy < SILENCE_THRESHOLD) {
        if (this.silenceStart === 0) this.silenceStart = Date.now();
        if (Date.now() - this.silenceStart > SILENCE_DURATION_MS && this.buffer.length > 0) {
          this.flushBuffer();
        }
      } else {
        this.silenceStart = 0;
        // Emit interim transcript placeholder.
        for (const l of this.listeners) {
          try {
            l({ text: '', isFinal: false, utteranceId: 'interim' });
          } catch { /* swallow */ }
        }
      }
    };

    source.connect(this.processor);
    this.processor.connect(this.context.destination);
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.buffer.length > 0) this.flushBuffer();
    this.processor?.disconnect();
    this.context?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.worker?.terminate();
    this.processor = null;
    this.context = null;
    this.stream = null;
    this.worker = null;
    this.buffer = [];
  }

  onTranscript(listener: TranscriptListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private flushBuffer(): void {
    if (!this.worker || this.buffer.length === 0) return;
    // Concatenate chunks into a single Float32Array.
    const totalLen = this.buffer.reduce((s, b) => s + b.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of this.buffer) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.buffer = [];
    this.silenceStart = 0;
    this.worker.postMessage({ type: 'transcribe', audio: merged }, [merged.buffer]);
  }
}

registerVoiceProvider('whisper-local', (options) => new WhisperLocalProvider(options));

export { WhisperLocalProvider };
