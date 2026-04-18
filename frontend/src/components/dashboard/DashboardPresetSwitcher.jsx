import { motion } from 'framer-motion';
import { useStore } from '../../store';
import { listPresets } from './presets/registry';
import { SPRINGS } from './motion';

/**
 * DashboardPresetSwitcher — capsule of preset pills.
 *
 * Drives the same visual pattern as the old DashboardModeToggle but is
 * backed by the preset registry. The active pill morphs between slots
 * via framer-motion's shared `layoutId`. Click fires `switchPreset()`
 * which seeds the preset's starter ZoneTree the first time a dashboard
 * enters the preset and restores the user's saved layout on re-entry.
 *
 * Hidden (returns null) while fewer than two presets are registered —
 * Plans B–E register the other four themed presets via _registerPreset.
 */
export default function DashboardPresetSwitcher() {
  const presets = listPresets();
  const activeId = useStore((s) => s.analystProDashboard?.activePresetId) ?? 'analyst-pro';
  const switchPreset = useStore((s) => s.switchPreset);

  if (presets.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label="Dashboard preset"
      className="dashboard-preset-switcher"
    >
      {presets.map((p) => {
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`dashboard-preset-${p.id}`}
            onClick={() => switchPreset && switchPreset(p.id)}
            className="dashboard-preset-switcher__pill"
          >
            {active && (
              <motion.span
                layoutId="preset-active-bg"
                className="dashboard-preset-switcher__pill-bg"
                transition={SPRINGS.snappy}
              />
            )}
            <span className="dashboard-preset-switcher__pill-label">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
