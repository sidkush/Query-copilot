import type { DashboardPreset } from './types';

const analystProPreset: DashboardPreset = {
  id: 'analyst-pro',
  name: 'Analyst Pro',
  tagline: 'Fully customizable freeform canvas.',
  scheme: 'dark',
  tokens: {
    bg: 'var(--bg-base)',
    fg: 'var(--text-primary)',
    accent: 'var(--accent)',
    accentWarn: 'var(--status-danger)',
    border: 'var(--border-default)',
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontMono: "ui-monospace, 'JetBrains Mono', monospace",
    density: 'comfortable',
    radius: 8,
  },
};

const _registry: Record<string, DashboardPreset> = {
  'analyst-pro': analystProPreset,
};

export const DEFAULT_PRESET_ID = 'analyst-pro' as const;

export function getPreset(id: string): DashboardPreset {
  return _registry[id] ?? _registry[DEFAULT_PRESET_ID];
}

export function listPresets(): DashboardPreset[] {
  return Object.values(_registry);
}

/** Plans B–E register their presets through this entrypoint. */
export function _registerPreset(preset: DashboardPreset): void {
  _registry[preset.id] = preset;
}
