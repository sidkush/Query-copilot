// frontend/src/components/dashboard/freeform/lib/dashboardShape.ts
//
// Empty-dashboard factory keyed by preset id. There is no pre-existing
// `createEmptyDashboard()` helper in the codebase (grep returned nothing),
// so the minimal-valid Dashboard is assembled here. Keep this the single
// source of truth for the empty shape — downstream code must round-trip
// through `emptyDashboardForPreset`.

import type { ContainerZone, Dashboard } from './types';
import { getPreset } from '../../presets/registry';

const DEFAULT_SIZE = { mode: 'automatic' as const };

function emptyRoot(): ContainerZone {
  return {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children: [],
  };
}

export function emptyDashboardForPreset(presetId: string): Dashboard {
  const preset = getPreset(presetId);
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: '',
    name: 'Untitled',
    activePresetId: preset.id,
    presetLayouts: {
      [preset.id]: {
        tiledRoot: preset.starter.tiledRoot ?? null,
        floatingLayer: preset.starter.floatingLayer ?? [],
      },
    },
    size: DEFAULT_SIZE,
    tiledRoot: emptyRoot(),
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}
