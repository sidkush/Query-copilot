// frontend/src/components/dashboard/freeform/ContextMenu.jsx
//
// Portal-rendered right-click menu. Pure presentation over the
// analystProContextMenu store slice — Plan 5c.
//
// Keyboard nav + submenu flyouts (T9). Command dispatcher lands in T10.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../../store';
import { clampToViewport } from './lib/contextMenuBuilder';

const DEFAULT_MENU_WIDTH = 220;
const DEFAULT_MENU_HEIGHT = 320;

function firstFocusableIndex(items) {
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it.kind === 'separator') continue;
    if (it.disabled) continue;
    return i;
  }
  return -1;
}

function nextFocusableIndex(items, from, dir) {
  const n = items.length;
  if (n === 0) return -1;
  let i = from;
  for (let step = 0; step < n; step += 1) {
    i = (i + dir + n) % n;
    const it = items[i];
    if (it.kind === 'separator') continue;
    if (it.disabled) continue;
    return i;
  }
  return from;
}

function MenuRows({ items, focusIndex, onItemPointerEnter, onItemClick, onItemKeyTrigger }) {
  return items.map((item, idx) => {
    if (item.kind === 'separator') {
      return <div key={`sep-${idx}`} role="separator" className="analyst-pro-context-menu__separator" />;
    }
    const focused = idx === focusIndex;
    const commonProps = {
      'data-menu-id': item.kind === 'submenu' ? item.id : item.id,
      'data-menu-index': idx,
      'data-focused': String(focused),
      'aria-disabled': item.disabled || undefined,
      className: 'analyst-pro-context-menu__item',
      onPointerEnter: () => onItemPointerEnter(idx),
      onClick: (e) => onItemClick(e, idx, item),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onItemKeyTrigger(idx, item);
        }
      },
      type: 'button',
    };
    if (item.kind === 'submenu') {
      return (
        <button
          key={item.id}
          {...commonProps}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={focused ? 'true' : 'false'}
        >
          <span className="analyst-pro-context-menu__check" data-checked="false" aria-hidden="true" />
          <span className="analyst-pro-context-menu__item-label">{item.label}</span>
          <span className="analyst-pro-context-menu__submenu-arrow" aria-hidden="true">▸</span>
        </button>
      );
    }
    const isCheckbox = item.kind === 'checkbox';
    return (
      <button
        key={item.id}
        {...commonProps}
        role={isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={isCheckbox ? item.checked : undefined}
        aria-keyshortcuts={'shortcut' in item ? item.shortcut : undefined}
      >
        <span className="analyst-pro-context-menu__check" data-checked={String(isCheckbox && !!item.checked)} aria-hidden="true">
          {isCheckbox && item.checked ? '✓' : ''}
        </span>
        <span className="analyst-pro-context-menu__item-label">{item.label}</span>
        {'shortcut' in item && item.shortcut ? (
          <span className="analyst-pro-context-menu__item-shortcut">{item.shortcut}</span>
        ) : null}
      </button>
    );
  });
}

function Flyout({ parentRect, items, onClose, onSelect }) {
  const rootRef = useRef(null);
  const [focusIndex, setFocusIndex] = useState(firstFocusableIndex(items));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); setFocusIndex((i) => nextFocusableIndex(items, i, +1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIndex((i) => nextFocusableIndex(items, i, -1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onClose(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const it = items[focusIndex];
      if (it && it.kind !== 'separator' && !it.disabled) onSelect(it);
    }
  };

  useEffect(() => {
    if (rootRef.current) rootRef.current.focus();
  }, []);

  const left = parentRect ? parentRect.right + 2 : 0;
  const top = parentRect ? parentRect.top : 0;

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      tabIndex={-1}
      className="analyst-pro-context-menu analyst-pro-context-menu__flyout"
      style={{ left, top }}
      onKeyDown={onKeyDown}
      data-testid="analyst-pro-context-menu-flyout"
    >
      <MenuRows
        items={items}
        focusIndex={focusIndex}
        onItemPointerEnter={setFocusIndex}
        onItemClick={(_e, _idx, item) => {
          if (item.kind !== 'separator' && !item.disabled) onSelect(item);
        }}
        onItemKeyTrigger={(_idx, item) => {
          if (item.kind !== 'separator' && !item.disabled) onSelect(item);
        }}
      />
    </div>,
    document.body,
  );
}

export default function ContextMenu() {
  const menu = useStore((s) => s.analystProContextMenu);
  const close = useStore((s) => s.closeContextMenuAnalystPro);
  const dashboard = useStore((s) => s.analystProDashboard);
  const updateZone = useStore((s) => s.updateZoneAnalystPro);
  const clearSelection = useStore((s) => s.clearSelection);
  const setSelection = useStore((s) => s.setAnalystProSelection);
  const ungroup = useStore((s) => s.ungroupAnalystPro);
  const setActionsDialogOpen = useStore((s) => s.setActionsDialogOpen);
  const copyZoneToClipboard = useStore((s) => s.copyZoneToClipboardAnalystPro);
  const clipboard = useStore((s) => s.analystProZoneClipboard);
  const insertObject = useStore((s) => s.insertObjectAnalystPro);
  // Plan 5d — real dispatches for properties-panel + fitMode + show-title toggle.
  const openPropertiesTab = useStore((s) => s.openPropertiesTabAnalystPro);
  const setZoneProperty = useStore((s) => s.setZonePropertyAnalystPro);
  const rootRef = useRef(null);
  const [measured, setMeasured] = useState(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [submenuIndex, setSubmenuIndex] = useState(null);
  const [parentRowRect, setParentRowRect] = useState(null);

  useEffect(() => {
    if (menu) {
      setFocusIndex(firstFocusableIndex(menu.items));
      setSubmenuIndex(null);
    } else {
      setFocusIndex(-1);
      setSubmenuIndex(null);
    }
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setMeasured({ width: rect.width, height: rect.height });
    node.focus();
  }, [menu]);

  const pos = useMemo(() => {
    if (!menu) return null;
    const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    const w = measured?.width ?? DEFAULT_MENU_WIDTH;
    const h = measured?.height ?? DEFAULT_MENU_HEIGHT;
    return clampToViewport(menu.x, menu.y, w, h, vw, vh);
  }, [menu, measured]);

  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (e) => {
      const node = rootRef.current;
      if (node && node.contains(e.target)) return;
      const flyout = document.querySelector('[data-testid="analyst-pro-context-menu-flyout"]');
      if (flyout && flyout.contains(e.target)) return;
      close();
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    const handleScroll = () => close();
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menu, close]);

  const selectItem = useCallback((item) => {
    if (item.kind !== 'command' && item.kind !== 'checkbox') return;
    if (item.disabled) return;

    const zoneId = menu?.zoneId ?? null;
    const zone = (() => {
      if (!dashboard || !zoneId) return null;
      const stack = [dashboard.tiledRoot, ...(dashboard.floatingLayer || [])];
      while (stack.length) {
        const n = stack.pop();
        if (!n) continue;
        if (n.id === zoneId) return n;
        if (n.children) stack.push(...n.children);
      }
      return null;
    })();

    if (item.todo) {
      console.debug(`[analyst-pro context-menu] TODO Plan ${item.todo.plan}`, { id: item.id, reason: item.todo.reason });
      close();
      return;
    }

    switch (item.id) {
      case 'deselect':
        if (clearSelection) clearSelection();
        break;
      case 'selectParent': {
        if (!dashboard || !zoneId) break;
        const findParent = (container, target) => {
          for (const child of container.children) {
            if (child.id === target) return container.id;
            if (child.children) {
              const hit = findParent(child, target);
              if (hit) return hit;
            }
          }
          return null;
        };
        const parentId = findParent(dashboard.tiledRoot, zoneId);
        if (parentId && setSelection) setSelection([parentId]);
        break;
      }
      case 'toggleShowTitle': {
        if (!zone || !setZoneProperty) break;
        // Plan 5d — write to `showTitle` (authoritative). Read current value
        // honouring either new or legacy field; default true.
        const cur = zone.showTitle ?? zone.showTitleBar ?? true;
        setZoneProperty(zoneId, { showTitle: !cur });
        break;
      }
      // Plan 5d — properties panel tab activation (Background/Border/Padding menu items).
      case 'openProperties.style.background':
      case 'openProperties.style.border':
        if (openPropertiesTab) openPropertiesTab('style');
        break;
      case 'openProperties.layout.innerPadding':
      case 'openProperties.layout.outerPadding':
        if (openPropertiesTab) openPropertiesTab('layout');
        break;
      // Plan 5d — fitMode commands.
      case 'setFitMode.fit':
        if (zoneId && setZoneProperty) setZoneProperty(zoneId, { fitMode: 'fit' });
        break;
      case 'setFitMode.fitWidth':
        if (zoneId && setZoneProperty) setZoneProperty(zoneId, { fitMode: 'fit-width' });
        break;
      case 'setFitMode.fitHeight':
        if (zoneId && setZoneProperty) setZoneProperty(zoneId, { fitMode: 'fit-height' });
        break;
      case 'setFitMode.entireView':
        if (zoneId && setZoneProperty) setZoneProperty(zoneId, { fitMode: 'entire' });
        break;
      case 'setFitMode.fixed':
        if (zoneId && setZoneProperty) setZoneProperty(zoneId, { fitMode: 'fixed' });
        break;
      case 'toggleShowCaption': {
        if (!zone || !updateZone) break;
        updateZone(zoneId, { showCaption: !(zone.showCaption === true) });
        break;
      }
      case 'openActionsDialog':
        if (setActionsDialogOpen) setActionsDialogOpen(true);
        break;
      case 'removeContainerUnwrap':
        if (zoneId && ungroup) ungroup(zoneId);
        break;
      case 'copy':
        if (zone && copyZoneToClipboard) copyZoneToClipboard(zone);
        break;
      case 'paste':
      case 'canvas.paste': {
        if (clipboard && clipboard.type && clipboard.type !== 'container-horz' && clipboard.type !== 'container-vert') {
          if (insertObject) insertObject({ type: clipboard.type, x: menu?.x ?? 40, y: menu?.y ?? 40 });
        } else {
          console.debug('[analyst-pro context-menu] paste no-op', { clipboard });
        }
        break;
      }
      case 'canvas.addText':
        if (insertObject) insertObject({ type: 'text', x: menu?.x ?? 40, y: menu?.y ?? 40 });
        break;
      case 'canvas.addImage':
        if (insertObject) insertObject({ type: 'image', x: menu?.x ?? 40, y: menu?.y ?? 40 });
        break;
      case 'canvas.addBlank':
        if (insertObject) insertObject({ type: 'blank', x: menu?.x ?? 40, y: menu?.y ?? 40 });
        break;
      default:
        console.debug('[analyst-pro context-menu] unhandled id', { id: item.id });
        break;
    }
    close();
  }, [menu, dashboard, clipboard, clearSelection, setSelection, updateZone, ungroup, setActionsDialogOpen, copyZoneToClipboard, insertObject, close]);

  const onRootKeyDown = (e) => {
    if (!menu) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex((i) => nextFocusableIndex(menu.items, i, +1));
      setSubmenuIndex(null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex((i) => nextFocusableIndex(menu.items, i, -1));
      setSubmenuIndex(null);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIndex(firstFocusableIndex(menu.items));
    } else if (e.key === 'End') {
      e.preventDefault();
      let last = -1;
      for (let i = menu.items.length - 1; i >= 0; i -= 1) {
        const it = menu.items[i];
        if (it.kind === 'separator') continue;
        if (it.disabled) continue;
        last = i; break;
      }
      if (last >= 0) setFocusIndex(last);
    } else if (e.key === 'ArrowRight') {
      const it = menu.items[focusIndex];
      if (it && it.kind === 'submenu' && !it.disabled) {
        e.preventDefault();
        setSubmenuIndex(focusIndex);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      const it = menu.items[focusIndex];
      if (!it || it.kind === 'separator' || it.disabled) return;
      e.preventDefault();
      if (it.kind === 'submenu') setSubmenuIndex(focusIndex);
      else selectItem(it);
    }
  };

  useEffect(() => {
    if (submenuIndex == null) { setParentRowRect(null); return; }
    const node = rootRef.current;
    if (!node) return;
    const row = node.querySelector(`[data-menu-index="${submenuIndex}"]`);
    setParentRowRect(row ? row.getBoundingClientRect() : null);
  }, [submenuIndex]);

  if (!menu || !pos) return null;

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      aria-label="Zone actions"
      tabIndex={-1}
      className="analyst-pro-context-menu"
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={onRootKeyDown}
      data-testid="analyst-pro-context-menu"
    >
      <MenuRows
        items={menu.items}
        focusIndex={focusIndex}
        onItemPointerEnter={(idx) => {
          setFocusIndex(idx);
          if (menu.items[idx]?.kind === 'submenu') setSubmenuIndex(idx);
          else setSubmenuIndex(null);
        }}
        onItemClick={(_e, idx, item) => {
          if (item.kind === 'submenu') {
            setSubmenuIndex(idx);
            return;
          }
          if (item.kind === 'separator' || item.disabled) return;
          selectItem(item);
        }}
        onItemKeyTrigger={(idx, item) => {
          if (item.kind === 'submenu') setSubmenuIndex(idx);
          else if (!item.disabled && item.kind !== 'separator') selectItem(item);
        }}
      />
      {submenuIndex != null && menu.items[submenuIndex] && menu.items[submenuIndex].kind === 'submenu' && (
        <Flyout
          parentRect={parentRowRect}
          items={menu.items[submenuIndex].items}
          onClose={() => setSubmenuIndex(null)}
          onSelect={selectItem}
        />
      )}
    </div>,
    document.body,
  );
}
