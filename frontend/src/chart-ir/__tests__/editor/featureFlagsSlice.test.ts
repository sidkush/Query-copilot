import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../store';

describe('featureFlags store slice', () => {
  beforeEach(() => {
    useStore.setState({
      featureFlags: { NEW_CHART_EDITOR_ENABLED: false },
      featureFlagsLoaded: false,
    });
  });

  it('defaults NEW_CHART_EDITOR_ENABLED to false + featureFlagsLoaded to false', () => {
    const state = useStore.getState();
    expect(state.featureFlags.NEW_CHART_EDITOR_ENABLED).toBe(false);
    expect(state.featureFlagsLoaded).toBe(false);
  });

  it('setFeatureFlags merges the incoming flags into the slice and marks loaded', () => {
    useStore.getState().setFeatureFlags({ NEW_CHART_EDITOR_ENABLED: true });
    const state = useStore.getState();
    expect(state.featureFlags.NEW_CHART_EDITOR_ENABLED).toBe(true);
    expect(state.featureFlagsLoaded).toBe(true);
  });

  it('setFeatureFlags ignores null/undefined payloads', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useStore.getState().setFeatureFlags(null as any);
    const state = useStore.getState();
    expect(state.featureFlags.NEW_CHART_EDITOR_ENABLED).toBe(false);
    expect(state.featureFlagsLoaded).toBe(true);
  });

  it('setFeatureFlags preserves other keys on a partial update', () => {
    useStore.getState().setFeatureFlags({ NEW_CHART_EDITOR_ENABLED: true });
    useStore
      .getState()
      .setFeatureFlags({ OTHER_FLAG_FUTURE: true } as unknown as Record<string, boolean>);
    const state = useStore.getState();
    expect(state.featureFlags.NEW_CHART_EDITOR_ENABLED).toBe(true);
    expect(
      (state.featureFlags as unknown as Record<string, boolean>).OTHER_FLAG_FUTURE,
    ).toBe(true);
  });
});
