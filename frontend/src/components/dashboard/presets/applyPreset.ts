// frontend/src/components/dashboard/presets/applyPreset.ts
//
// Pure helper that swaps a dashboard's active preset. On first switch
// into a preset we seed `presetLayouts[id]` from the preset's starter
// template; on re-entry we preserve whatever the user last saved.

import type { Dashboard } from '../freeform/lib/types';
import { getPreset } from './registry';

export function applyPreset(dashboard: Dashboard, presetId: string): Dashboard {
  const resolved = getPreset(presetId);
  if (dashboard.activePresetId === resolved.id && dashboard.presetLayouts[resolved.id]) {
    return dashboard;
  }
  const existing = dashboard.presetLayouts[resolved.id];
  const layout = existing ?? {
    tiledRoot: resolved.starter.tiledRoot,
    floatingLayer: resolved.starter.floatingLayer,
  };
  return {
    ...dashboard,
    activePresetId: resolved.id,
    presetLayouts: { ...dashboard.presetLayouts, [resolved.id]: layout },
  };
}
