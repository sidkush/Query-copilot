/**
 * openaiRealtime — OpenAI Realtime API voice provider.
 *
 * Tier: openai-realtime. BYOK — user supplies OpenAI API key, backend
 * mints an ephemeral token, this adapter opens the OpenAI Realtime
 * WebSocket with that token.
 *
 * Protocol:
 *   1. start() mints ephemeral token via mintEphemeralToken('openai-realtime').
 *   2. Opens WebSocket to wss://api.openai.com/v1/realtime with the token
 *      in the Authorization header (via protocol subprotocol workaround
 *      since browser WebSocket doesn't support custom headers).
 *   3. Sends `session.update` to configure input_audio_transcription.
 *   4. Captures mic audio and sends as base64-encoded PCM via
 *      `input_audio_buffer.append`.
 *   5. Receives `conversation.item.input_audio_transcription.completed`
 *      events and emits VoiceTranscript.
 *   6. stop() sends `input_audio_buffer.clear` and closes.
 */
import type {
  TranscriptListener,
  VoiceProvider,
  VoiceProviderOptions,
  VoiceTranscript,
} from './voiceProvider';
import { registerVoiceProvider } from './voiceProvider';
import { mintEphemeralToken } from './ephemeralToken';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const SAMPLE_RATE = 24000; // OpenAI Realtime expects 24kHz
const MODEL = 'gpt-4o-realtime-preview';

class OpenAIRealtimeProvider implements VoiceProvider {
  public readonly tier = 'openai-realtime' as const;
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

    let token: string;
    if (this.options.ephemeralToken) {
      token = this.options.ephemeralToken;
    } else {
      const res = await mintEphemeralToken('openai-realtime');
      token = res.token;
    }

    // Browser WebSocket doesn't support custom headers. Pass the token
    // via the Sec-WebSocket-Protocol header trick: the server reads the
    // subprotocol as a bearer token.
    const wsUrl = `${OPENAI_REALTIME_URL}?model=${MODEL}`;
    this.ws = new WebSocket(wsUrl, [
      'realtime',
      `openai-insecure-api-key.${token}`,
    ]);

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          const transcript: VoiceTranscript = {
            text: msg.transcript || '',
            isFinal: true,
            utteranceId: msg.item_id,
          };
          if (transcript.text) {
            for (const l of this.listeners) {
              try { l(transcript); } catch { /* swallow */ }
            }
          }
        }
        // Interim partial transcripts from server-side VAD.
        if (msg.type === 'input_audio_buffer.speech_started') {
          for (const l of this.listeners) {
            try { l({ text: '', isFinal: false, utteranceId: 'speech' }); } catch { /* swallow */ }
          }
        }
      } catch {
        // Non-JSON keepalive — ignore.
      }
    };

    this.ws.onerror = () => {
      this.stop();
    };
    this.ws.onclose = () => {
      this.running = false;
    };

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error('No WebSocket'));
      this.ws.onopen = () => {
        // Configure the session for input audio transcription.
        this.ws!.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad' },
          },
        }));
        resolve();
      };
      setTimeout(() => reject(new Error('OpenAI Realtime WebSocket timeout')), 10000);
    });

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: SAMPLE_RATE, channelCount: 1 },
    });
    this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (ev: AudioProcessingEvent) => {
      if (!this.running || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const float32 = ev.inputBuffer.getChannelData(0);
      // Convert to int16 PCM then base64 for the Realtime API.
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const v = float32[i];
        if (v === undefined) continue;
        const s = Math.max(-1, Math.min(1, v));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const b64 = arrayBufferToBase64(int16.buffer);
      this.ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: b64,
      }));
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
      this.ws.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

registerVoiceProvider('openai-realtime', (options) => new OpenAIRealtimeProvider(options));

export { OpenAIRealtimeProvider };
