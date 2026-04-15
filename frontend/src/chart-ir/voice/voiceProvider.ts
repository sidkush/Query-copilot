/**
 * Voice provider abstraction — hybrid tiered infrastructure per A spec §5.2.
 *
 * Three tiers, BYOK where required:
 *
 *   - whisper-local   : whisper.cpp WASM running in-browser. Free, private,
 *                       slower (~2-3s end-of-utterance latency). Lazy-loaded
 *                       on first use after a permission prompt.
 *   - deepgram        : Deepgram streaming WebSocket. Requires BYOK key
 *                       stored per user (Fernet-encrypted backend-side);
 *                       frontend mints an ephemeral token via POST
 *                       /api/v1/voice/session before connecting.
 *   - openai-realtime : OpenAI Realtime API. Same BYOK + ephemeral token
 *                       flow as Deepgram. Highest quality, adds latency
 *                       budget for LLM round-trips.
 *
 * Phase 3 ships the abstraction + stub adapters. Real vendor integration
 * (whisper.cpp WASM download, Deepgram WebSocket, OpenAI Realtime WS) is
 * scaffolded inside each adapter file and marked with TODO(b3.x) for
 * follow-up sessions.
 */

export type VoiceTier = 'whisper-local' | 'deepgram' | 'openai-realtime';

export interface VoiceTranscript {
  text: string;
  isFinal: boolean;
  /** Optional confidence score 0..1 from the provider. */
  confidence?: number;
  /** Optional utterance UUID the provider assigns. */
  utteranceId?: string;
}

export type TranscriptListener = (t: VoiceTranscript) => void;

export interface VoiceProviderOptions {
  tier: VoiceTier;
  /** Ephemeral token returned by POST /api/v1/voice/session. */
  ephemeralToken?: string;
  /** Optional BCP-47 locale hint ('en-US', 'es-ES', ...). */
  language?: string;
}

export interface VoiceProvider {
  readonly tier: VoiceTier;

  /** Begin capturing. Resolves when the stream is established. */
  start(): Promise<void>;

  /** Stop capturing + tear down the stream. */
  stop(): Promise<void>;

  /** Subscribe to transcripts. Returns an unsubscribe fn. */
  onTranscript(listener: TranscriptListener): () => void;
}

export interface VoiceProviderFactory {
  (options: VoiceProviderOptions): VoiceProvider;
}

/**
 * Tier registry — maps a tier id to its factory. Populated at import time
 * by each adapter module calling `registerVoiceProvider`. The registry
 * stays a plain object so consumers can inspect which tiers are
 * available (e.g. whisper-local is unavailable until the WASM bundle
 * has been fetched + initialized).
 */
const registry: Partial<Record<VoiceTier, VoiceProviderFactory>> = {};

export function registerVoiceProvider(tier: VoiceTier, factory: VoiceProviderFactory): void {
  registry[tier] = factory;
}

export function getVoiceProviderFactory(tier: VoiceTier): VoiceProviderFactory | undefined {
  return registry[tier];
}

export function availableVoiceTiers(): VoiceTier[] {
  return Object.keys(registry) as VoiceTier[];
}

export function createVoiceProvider(options: VoiceProviderOptions): VoiceProvider {
  const factory = registry[options.tier];
  if (!factory) {
    throw new Error(
      `No voice provider registered for tier '${options.tier}'. ` +
        `Available: ${availableVoiceTiers().join(', ') || '(none)'}`,
    );
  }
  return factory(options);
}
