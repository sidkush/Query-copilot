// frontend/src/components/dashboard/freeform/ContextMenu.jsx
//
// Portal-rendered right-click menu. Pure presentation over the
// analystProContextMenu store slice — Plan 5c.
//
// Keyboard nav + submenu flyouts + focus trap land in Plan 5c T9.
// Command dispatcher lands in Plan 5c T10.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../../store';
import { clampToViewport } from './lib/contextMenuBuilder';

const DEFAULT_MENU_WIDTH = 220;
const DEFAULT_MENU_HEIGHT = 320;

export default function ContextMenu() {
  const menu = useStore((s) => s.analystProContextMenu);
  const close = useStore((s) => s.closeContextMenuAnalystPro);
  const rootRef = useRef(null);
  const [measured, setMeasured] = useState(null);

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
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setMeasured({ width: rect.width, height: rect.height });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (e) => {
      const node = rootRef.current;
      if (node && node.contains(e.target)) return;
      close();
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
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

  const renderItem = useCallback((item, idx) => {
    if (item.kind === 'separator') {
      return <div key={`sep-${idx}`} role="separator" className="analyst-pro-context-menu__separator" />;
    }
    if (item.kind === 'submenu') {
      return (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-disabled={item.disabled || undefined}
          data-menu-id={item.id}
          className="analyst-pro-context-menu__item"
        >
          <span className="analyst-pro-context-menu__check" data-checked="false">&nbsp;</span>
          <span className="analyst-pro-context-menu__item-label">{item.label}</span>
          <span className="analyst-pro-context-menu__submenu-arrow" aria-hidden="true">▸</span>
        </button>
      );
    }
    const isCheckbox = item.kind === 'checkbox';
    return (
      <button
        key={item.id}
        type="button"
        role={isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={isCheckbox ? item.checked : undefined}
        aria-disabled={item.disabled || undefined}
        aria-keyshortcuts={'shortcut' in item ? item.shortcut : undefined}
        data-menu-id={item.id}
        className="analyst-pro-context-menu__item"
        onClick={() => close()}
      >
        <span className="analyst-pro-context-menu__check" data-checked={String(isCheckbox && !!item.checked)}>
          ✓
        </span>
        <span className="analyst-pro-context-menu__item-label">{item.label}</span>
        {'shortcut' in item && item.shortcut ? (
          <span className="analyst-pro-context-menu__item-shortcut">{item.shortcut}</span>
        ) : (
          <span className="analyst-pro-context-menu__item-shortcut" aria-hidden="true">&nbsp;</span>
        )}
      </button>
    );
  }, [close]);

  if (!menu || !pos) return null;

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      aria-label="Zone actions"
      tabIndex={-1}
      className="analyst-pro-context-menu"
      style={{ left: pos.x, top: pos.y }}
      data-testid="analyst-pro-context-menu"
    >
      {menu.items.map(renderItem)}
    </div>,
    document.body,
  );
}
