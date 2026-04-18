// frontend/src/components/dashboard/presets/applyPreset.ts
//
// Pure helper that swaps a dashboard's active preset. On first switch
// into a preset we seed `presetLayouts[id]` from the preset's starter
// template; on re-entry we preserve whatever the user last saved.

import type { Dashboard } from '../freeform/lib/types';
import { getPreset } from './registry';

export function applyPreset(dashboard: Dashboard, presetId: string): Dashboard {
  const resolved = getPreset(presetId);
  const existing = dashboard.presetLayouts[resolved.id];
  // Treat an entry with null tiledRoot as unseeded — the preset's starter
  // template wins until the user has actually authored something under
  // this preset. Only a non-null tiledRoot counts as a user edit.
  const hasUserEdit = !!existing?.tiledRoot;
  const layout = hasUserEdit
    ? existing
    : {
        tiledRoot: resolved.starter.tiledRoot,
        floatingLayer: resolved.starter.floatingLayer,
      };
  return {
    ...dashboard,
    activePresetId: resolved.id,
    presetLayouts: { ...dashboard.presetLayouts, [resolved.id]: layout },
  };
}
