// frontend/src/components/dashboard/freeform/ZoneFrame.jsx
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store';
import { getZoneDisplayLabel } from './lib/zoneLabel';
import { TITLE_BAR_DEFAULT_VISIBLE } from './lib/zoneDefaults';

function shouldShowTitleBar(zone) {
  // Plan 5d: `showTitle` is the authoritative field. Legacy fixtures may
  // still carry `showTitleBar` — honour it when `showTitle` is absent.
  if (zone.showTitle === false) return false;
  if (zone.showTitle === true) return true;
  if (zone.showTitleBar === false) return false;
  if (zone.showTitleBar === true) return true;
  return TITLE_BAR_DEFAULT_VISIBLE.has(zone.type);
}

function buildFrameStyle(zone) {
  const style = {};
  // Plan 5d: Worksheet/Zone-level formatting applies below per-field Mark/Field
  // formats. Full precedence chain (Mark > Field > Worksheet > DS > Workbook)
  // lands in Phase 10 (Build_Tableau.md §XIV.1).
  const bg = zone.background;
  if (bg && typeof bg.color === 'string') {
    const opacity = typeof bg.opacity === 'number' ? bg.opacity : 1;
    style.background = bg.color;
    style.opacity = opacity;
  }
  const border = zone.border;
  if (border && Array.isArray(border.weight)) {
    const [l, r, t, b] = border.weight;
    style.borderLeftWidth = `${l || 0}px`;
    style.borderRightWidth = `${r || 0}px`;
    style.borderTopWidth = `${t || 0}px`;
    style.borderBottomWidth = `${b || 0}px`;
    style.borderStyle = border.style === 'dashed' ? 'dashed' : 'solid';
    style.borderColor = border.color || 'currentColor';
  }
  if (typeof zone.innerPadding === 'number') {
    style.padding = `${zone.innerPadding}px`;
  }
  if (typeof zone.outerPadding === 'number') {
    style.margin = `${zone.outerPadding}px`;
  }
  return style;
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
  const updateZone = useStore((s) => s.updateZoneAnalystPro);

  const withTitle = shouldShowTitleBar(zone);
  const label = getZoneDisplayLabel(zone);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    setDraft(zone.displayName ?? label);
    setEditing(true);
  }, [zone.displayName, label]);

  const commit = useCallback(() => {
    if (!editing) return;
    const trimmed = (draft ?? '').trim();
    const nextDisplayName = trimmed.length === 0 ? undefined : trimmed;
    if (nextDisplayName !== zone.displayName) {
      updateZone(zone.id, { displayName: nextDisplayName });
    }
    setEditing(false);
  }, [editing, draft, updateZone, zone.id, zone.displayName]);

  const cancel = useCallback(() => {
    setDraft(zone.displayName ?? label);
    setEditing(false);
  }, [zone.displayName, label]);

  const handleInputKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
      // stop propagation so Enter / Escape don't also hit the frame-level keydown.
      e.stopPropagation();
    },
    [commit, cancel],
  );

  const handleFrameKeyDown = useCallback(
    (e) => {
      if (editing) return; // input owns its own keys
      if (e.key === 'F2') {
        e.preventDefault();
        startEdit();
      } else if (e.key === 'Enter') {
        if (typeof onContextMenu === 'function') {
          e.preventDefault();
          onContextMenu(e, zone);
        }
      }
    },
    [editing, startEdit, onContextMenu, zone],
  );

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

  // Plan 6a — HiddenByUser semantics (Build_Tableau.md §IX.5, E.15).
  // Device-layout override sets zone.hidden=true; data pipeline keeps
  // running one level up (AnalystProWorksheetTile), only the frame is suppressed.
  if (zone?.hidden === true) {
    return (
      <div
        data-testid={`zone-hidden-${zone.id}`}
        data-hidden="true"
        aria-hidden="true"
        style={{ display: 'none' }}
      />
    );
  }

  return (
    <div
      data-testid={`zone-frame-${zone.id}`}
      data-zone-id={zone.id}
      data-zone-type={zone.type}
      data-resolved-w={resolved?.width ?? 0}
      data-resolved-h={resolved?.height ?? 0}
      className={`analyst-pro-zone-frame${withTitle ? ' analyst-pro-zone-frame--with-title' : ''}`}
      style={buildFrameStyle(zone)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onKeyDown={handleFrameKeyDown}
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
          {editing ? (
            <input
              ref={inputRef}
              data-testid={`zone-frame-${zone.id}-name-input`}
              className="analyst-pro-zone-frame__name-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={commit}
              aria-label={`Rename ${label}`}
            />
          ) : (
            <span
              data-testid={`zone-frame-${zone.id}-name`}
              className="analyst-pro-zone-frame__name"
              onDoubleClick={startEdit}
            >
              {label}
            </span>
          )}
          <span className="analyst-pro-zone-frame__actions" data-testid={`zone-frame-${zone.id}-actions`}>
            <button
              type="button"
              className="analyst-pro-zone-frame__action"
              data-testid={`zone-frame-${zone.id}-action-menu`}
              aria-label={`Menu for ${label}`}
              title="More"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onContextMenu === 'function') onContextMenu(e, zone);
                if (typeof onQuickAction === 'function') onQuickAction('menu', zone, e);
              }}
            >
              ⋯
            </button>
            <button
              type="button"
              className="analyst-pro-zone-frame__action"
              data-testid={`zone-frame-${zone.id}-action-fit`}
              aria-label={`Fit to content for ${label}`}
              title="Fit to content"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onQuickAction === 'function') onQuickAction('fit', zone, e);
              }}
            >
              ⛶
            </button>
            <button
              type="button"
              className="analyst-pro-zone-frame__action"
              data-testid={`zone-frame-${zone.id}-action-close`}
              aria-label={`Close ${label}`}
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onQuickAction === 'function') onQuickAction('close', zone, e);
              }}
            >
              ×
            </button>
          </span>
        </div>
      )}
      <EdgeHotzones />
      <div className="analyst-pro-zone-frame__body">{children}</div>
    </div>
  );
}

export default memo(ZoneFrame);
