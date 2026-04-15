/**
 * Stub voice providers — Phase 3 scaffolding.
 *
 * Each adapter exports a factory that satisfies the VoiceProvider contract
 * without touching a real vendor SDK or WebSocket. The stubs are useful
 * for:
 *
 *   - Wiring the editor BottomDock mic button + AgentPanel end-to-end.
 *   - Exercising the tier-selection flow in tests.
 *   - Providing a deterministic harness the follow-up "real vendor" tasks
 *     can swap in without touching the editor code.
 *
 * TODO(b3.1): replace stubs with real vendor integrations:
 *   - whisperLocal: download whisper.cpp WASM on first use, run inference
 *     in a Web Worker, emit final transcripts on silence detection.
 *   - deepgramStreaming: open a Deepgram WebSocket with the ephemeral
 *     token, pipe MediaStream chunks, handle partial + final transcripts.
 *   - openaiRealtime: same flow for the OpenAI Realtime API.
 */
import type {
  TranscriptListener,
  VoiceProvider,
  VoiceProviderOptions,
  VoiceTier,
} from './voiceProvider';
import { registerVoiceProvider } from './voiceProvider';

class StubVoiceProvider implements VoiceProvider {
  public readonly tier: VoiceTier;
  private listeners = new Set<TranscriptListener>();
  private started = false;

  constructor(tier: VoiceTier, private readonly options: VoiceProviderOptions) {
    this.tier = tier;
    void this.options;
  }

  async start(): Promise<void> {
    this.started = true;
    // Emit a synthetic transcript after a tick so tests can assert the flow.
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => {
        if (!this.started) return;
        for (const l of this.listeners) {
          try {
            l({
              text: '',
              isFinal: false,
              utteranceId: 'stub',
            });
          } catch {
            // swallow listener errors
          }
        }
      });
    }
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  onTranscript(listener: TranscriptListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

// Register all three tiers with the same stub implementation. The real
// adapters will replace these by re-calling registerVoiceProvider with a
// richer factory (last write wins in the registry).

registerVoiceProvider('whisper-local', (options) => new StubVoiceProvider('whisper-local', options));
registerVoiceProvider('deepgram', (options) => new StubVoiceProvider('deepgram', options));
registerVoiceProvider('openai-realtime', (options) => new StubVoiceProvider('openai-realtime', options));

export { StubVoiceProvider };
