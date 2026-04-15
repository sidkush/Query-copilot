import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerVoiceProvider,
  availableVoiceTiers,
  createVoiceProvider,
  getVoiceProviderFactory,
  type VoiceTier,
  type VoiceProvider,
  type VoiceProviderOptions,
} from '../../voice/voiceProvider';

// Import stubs module for side-effects (registers stub providers).
import '../../voice/stubs';

describe('voice registry', () => {
  it('exposes the three built-in tiers after importing stubs', () => {
    const tiers = availableVoiceTiers();
    expect(tiers).toContain('whisper-local');
    expect(tiers).toContain('deepgram');
    expect(tiers).toContain('openai-realtime');
  });

  it('returns a factory for each registered tier', () => {
    for (const tier of ['whisper-local', 'deepgram', 'openai-realtime'] as VoiceTier[]) {
      expect(getVoiceProviderFactory(tier)).toBeTypeOf('function');
    }
  });

  it('createVoiceProvider returns an instance matching the requested tier', () => {
    const provider = createVoiceProvider({ tier: 'whisper-local' });
    expect(provider.tier).toBe('whisper-local');
  });

  it('throws when creating a provider for an unregistered tier', () => {
    expect(() => createVoiceProvider({ tier: 'fake-tier' as VoiceTier })).toThrow(
      /No voice provider registered/,
    );
  });
});

describe('stub voice provider', () => {
  let provider: VoiceProvider;

  beforeEach(() => {
    provider = createVoiceProvider({ tier: 'whisper-local' } as VoiceProviderOptions);
  });

  it('start() + stop() do not throw', async () => {
    await expect(provider.start()).resolves.toBeUndefined();
    await expect(provider.stop()).resolves.toBeUndefined();
  });

  it('onTranscript subscribes and unsubscribes', async () => {
    const listener = vi.fn();
    const unsubscribe = provider.onTranscript(listener);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});

describe('custom provider registration', () => {
  it('registerVoiceProvider lets callers override a tier', () => {
    class DummyProvider implements VoiceProvider {
      public readonly tier: VoiceTier = 'deepgram';
      async start(): Promise<void> {}
      async stop(): Promise<void> {}
      onTranscript(): () => void {
        return () => {};
      }
    }
    registerVoiceProvider('deepgram', () => new DummyProvider());
    const provider = createVoiceProvider({ tier: 'deepgram' });
    expect(provider).toBeInstanceOf(DummyProvider);
    // Restore the stub to keep the test-global registry clean for
    // the next test file.
    import('../../voice/stubs');
  });
});
