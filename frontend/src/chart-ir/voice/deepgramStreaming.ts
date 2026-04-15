/**
 * deepgramStreaming — Deepgram streaming voice provider.
 *
 * Tier: deepgram. BYOK — user supplies their Deepgram API key, backend
 * mints an ephemeral token via POST /api/v1/voice/session, and this
 * adapter opens a Deepgram WebSocket with that token.
 *
 * Protocol:
 *   1. start() mints ephemeral token via mintEphemeralToken('deepgram').
 *   2. Opens WebSocket to wss://api.deepgram.com/v1/listen with the
 *      token as a query param.
 *   3. Captures mic audio via MediaStream and sends raw PCM chunks.
 *   4. Receives JSON transcript messages, emits VoiceTranscript events.
 *   5. stop() closes the WebSocket and releases the mic.
 */
import type {
  TranscriptListener,
  VoiceProvider,
  VoiceProviderOptions,
  VoiceTranscript,
} from './voiceProvider';
import { registerVoiceProvider } from './voiceProvider';
import { mintEphemeralToken } from './ephemeralToken';

const DEEPGRAM_WS_BASE = 'wss://api.deepgram.com/v1/listen';
const SAMPLE_RATE = 16000;

class DeepgramStreamingProvider implements VoiceProvider {
  public readonly tier = 'deepgram' as const;
  private listeners = new Set<TranscriptListener>();
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private running = false;
  private options: VoiceProviderOptions;

  constructor(options: VoiceProviderOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.running) return;

    // Mint ephemeral token via the backend.
    let token: string;
    if (this.options.ephemeralToken) {
      token = this.options.ephemeralToken;
    } else {
      const res = await mintEphemeralToken('deepgram');
      token = res.token;
    }

    const lang = this.options.language || 'en-US';
    const wsUrl =
      `${DEEPGRAM_WS_BASE}?` +
      `token=${encodeURIComponent(token)}&` +
      `encoding=linear16&sample_rate=${SAMPLE_RATE}&channels=1&` +
      `model=nova-3&language=${encodeURIComponent(lang)}&` +
      `punctuate=true&interim_results=true`;

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type !== 'Results') return;
        const alt = msg.channel?.alternatives?.[0];
        if (!alt) return;
        const transcript: VoiceTranscript = {
          text: alt.transcript || '',
          isFinal: msg.is_final ?? false,
          confidence: alt.confidence,
          utteranceId: msg.start?.toString(),
        };
        if (transcript.text) {
          for (const l of this.listeners) {
            try { l(transcript); } catch { /* swallow */ }
          }
        }
      } catch {
        // Non-JSON messages (keepalive pings) — ignore.
      }
    };

    this.ws.onerror = () => {
      this.stop();
    };

    this.ws.onclose = () => {
      this.running = false;
    };

    // Wait for WS open before starting mic.
    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error('No WebSocket'));
      this.ws.onopen = () => resolve();
      setTimeout(() => reject(new Error('Deepgram WebSocket timeout')), 10000);
    });

    // Capture mic audio.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: SAMPLE_RATE, channelCount: 1 },
    });
    this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (ev: AudioProcessingEvent) => {
      if (!this.running || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const float32 = ev.inputBuffer.getChannelData(0);
      // Convert float32 to int16 PCM for Deepgram's linear16 encoding.
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const v = float32[i];
        if (v === undefined) continue;
        const s = Math.max(-1, Math.min(1, v));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.ws.send(int16.buffer);
    };
    source.connect(this.processor);
    this.processor.connect(this.context.destination);
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.processor?.disconnect();
    this.context?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send close frame — Deepgram responds with final transcript.
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      this.ws.close();
    }
    this.processor = null;
    this.context = null;
    this.stream = null;
    this.ws = null;
  }

  onTranscript(listener: TranscriptListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

registerVoiceProvider('deepgram', (options) => new DeepgramStreamingProvider(options));

export { DeepgramStreamingProvider };
