import React, { useCallback, useMemo } from 'react';
import { useStore } from '../../../../store';
import LayoutTab from './zoneInspector/LayoutTab';
import StyleTab from './zoneInspector/StyleTab';
import VisibilityTab from './zoneInspector/VisibilityTab';

const TABS = [
  { id: 'layout',     label: 'Layout' },
  { id: 'style',      label: 'Style' },
  { id: 'visibility', label: 'Visibility' },
];

function findZone(dashboard, zoneId) {
  if (!dashboard || !zoneId) return null;
  const float = dashboard.floatingLayer?.find((z) => z.id === zoneId);
  if (float) return float;
  const walk = (z) => {
    if (!z) return null;
    if (z.id === zoneId) return z;
    if (!z.children) return null;
    for (const c of z.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(dashboard.tiledRoot);
}

export default function ZonePropertiesPanel() {
  const dashboard = useStore((s) => s.analystProDashboard);
  const selection = useStore((s) => s.analystProSelection);
  const activeTabRaw = useStore((s) => s.analystProPropertiesTab);
  const setTab = useStore((s) => s.setPropertiesTabAnalystPro);
  const setZoneProperty = useStore((s) => s.setZonePropertyAnalystPro);

  const selectedId = selection?.size === 1 ? Array.from(selection)[0] : null;
  const zone = useMemo(() => findZone(dashboard, selectedId), [dashboard, selectedId]);

  const activeTab = activeTabRaw || 'layout';

  const onPatch = useCallback(
    (patch) => {
      if (!selectedId) return;
      setZoneProperty(selectedId, patch);
    },
    [selectedId, setZoneProperty],
  );

  if (!selectedId || !zone) return null;

  return (
    <aside
      aria-label="Zone properties"
      data-testid="zone-properties-panel"
      className="analyst-pro-zone-inspector"
    >
      <h3 className="analyst-pro-zone-inspector__heading">
        {zone.displayName || zone.id}
      </h3>
      <div role="tablist" className="analyst-pro-zone-inspector__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls={`zone-properties-${t.id}-tab`}
            className={`analyst-pro-zone-inspector__tab${activeTab === t.id ? ' analyst-pro-zone-inspector__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'layout'     && <LayoutTab     zone={zone} onPatch={onPatch} />}
      {activeTab === 'style'      && <StyleTab      zone={zone} onPatch={onPatch} />}
      {activeTab === 'visibility' && <VisibilityTab zone={zone} onPatch={onPatch} />}
    </aside>
  );
}
