// frontend/src/components/dashboard/freeform/lib/migrateLegacyArchetype.ts
//
// Front-end migrator for dashboards persisted before the preset rework.
// Old records carry `archetype: "briefing" | "workbench" | "ops" |
// "story" | "pitch" | "tableau" | "analyst-pro"`; we collapse the six
// non-Analyst-Pro variants onto `analyst-pro` (their content renders
// there now), strip the legacy key, and fill in an empty `presetLayouts`
// map so downstream code can read `activePresetId` / `presetLayouts`
// without null-checking.
//
// No-op when `activePresetId` is already present — i.e. the record has
// already been migrated (or was written by new-world code).

import type { Dashboard } from './types';

const LEGACY_IDS = new Set(['briefing', 'workbench', 'ops', 'story', 'pitch', 'tableau']);

export function migrateLegacyArchetype<T extends { archetype?: string; activePresetId?: string }>(
  raw: T,
): Dashboard {
  if (raw.activePresetId) return raw as unknown as Dashboard;
  const legacy = (raw as { archetype?: string }).archetype;
  const presetId = legacy && LEGACY_IDS.has(legacy) ? 'analyst-pro' : (legacy ?? 'analyst-pro');
  const out: Record<string, unknown> = { ...raw, activePresetId: presetId };
  delete out.archetype;
  if (!out.presetLayouts) out.presetLayouts = {};
  return out as Dashboard;
}
