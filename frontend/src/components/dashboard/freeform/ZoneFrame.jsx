// frontend/src/components/dashboard/freeform/ZoneFrame.jsx
import { memo, useCallback } from 'react';
import { useStore } from '../../../store';
import { getZoneDisplayLabel } from './lib/zoneLabel';

/**
 * Zone types whose title bar is shown by default.
 * Per Build_Tableau.md Appendix A.7 DashboardObjectType: worksheet / text /
 * webpage / filter / legend / parameter / navigation / extension all benefit
 * from a named title bar. blank + image default to chrome-less so they don't
 * intrude on static content; users opt in via the zone properties panel (Plan 5d).
 */
const TITLE_BAR_DEFAULT_VISIBLE = new Set([
  'worksheet',
  'text',
  'webpage',
  'filter',
  'legend',
  'parameter',
  'navigation',
  'extension',
]);

function shouldShowTitleBar(zone) {
  if (zone.showTitleBar === false) return false;
  if (zone.showTitleBar === true) return true;
  return TITLE_BAR_DEFAULT_VISIBLE.has(zone.type);
}

function EdgeHotzones() {
  return (
    <>
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--n" data-edge="n" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--s" data-edge="s" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--e" data-edge="e" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--w" data-edge="w" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--ne" data-edge="ne" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--nw" data-edge="nw" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--se" data-edge="se" />
      <div className="analyst-pro-zone-frame__edge analyst-pro-zone-frame__edge--sw" data-edge="sw" />
    </>
  );
}

function ZoneFrame({ zone, resolved, children, onContextMenu, onQuickAction }) {
  const setHovered = useStore((s) => s.setAnalystProHoveredZoneId);

  const withTitle = shouldShowTitleBar(zone);
  const label = getZoneDisplayLabel(zone);

  const handleMouseEnter = useCallback(() => setHovered(zone.id), [setHovered, zone.id]);
  const handleMouseLeave = useCallback(() => setHovered(null), [setHovered]);
  const handleContextMenu = useCallback(
    (e) => {
      if (typeof onContextMenu === 'function') {
        e.preventDefault();
        onContextMenu(e, zone);
      }
    },
    [onContextMenu, zone],
  );

  // Read onQuickAction off props through the ref in the DOM to avoid eslint no-unused-vars;
  // T5 populates the buttons that actually use it.
  void onQuickAction;

  // resolved is { x, y, width, height } in dashboard coords — exposed for
  // downstream consumers (debug overlay) via data-* attributes.
  return (
    <div
      data-testid={`zone-frame-${zone.id}`}
      data-zone-id={zone.id}
      data-zone-type={zone.type}
      data-resolved-w={resolved?.width ?? 0}
      data-resolved-h={resolved?.height ?? 0}
      className={`analyst-pro-zone-frame${withTitle ? ' analyst-pro-zone-frame--with-title' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role="group"
      aria-label={label}
    >
      {withTitle && (
        <div
          data-testid={`zone-frame-${zone.id}-title`}
          className="analyst-pro-zone-frame__title"
        >
          <span className="analyst-pro-zone-frame__grip" aria-hidden="true">⋮⋮</span>
          <span
            data-testid={`zone-frame-${zone.id}-name`}
            className="analyst-pro-zone-frame__name"
          >
            {label}
          </span>
          {/* Quick-action buttons slot — populated in Plan 5a T5. */}
          <span className="analyst-pro-zone-frame__actions" data-testid={`zone-frame-${zone.id}-actions`} />
        </div>
      )}
      <EdgeHotzones />
      <div className="analyst-pro-zone-frame__body">{children}</div>
    </div>
  );
}

export default memo(ZoneFrame);
