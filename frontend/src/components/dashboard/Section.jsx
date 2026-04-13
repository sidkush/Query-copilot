import { useState, useRef, useEffect } from 'react';
import GridLayout from 'react-grid-layout';
import TileWrapper from './TileWrapper';
import FreeformCanvas from './FreeformCanvas';
import LayoutModeToggle from './LayoutModeToggle';
import { TOKENS } from './tokens';
import { useStore } from '../../store';

function SectionGrid({ tiles, layout, onLayoutChange, sectionId, connId, onTileEdit, onTileChartChange, onTileRemove, onTileMove, onTileCopy, onTileRefresh, customMetrics, onTileSelect, selectedTileId, themeConfig, crossFilter, onCrossFilterClick, dashboardId, fullscreenMode = false, allTabs = [] }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);
  // "Shrink-only freeze" during agent panel resize:
  //   - When the container GROWS during resize → freeze at current width
  //     (prevents the grid from briefly expanding past what will fit)
  //   - When the container SHRINKS during resize → immediately update
  //     (prevents overflow clipping on the right edge — the bug this fixes)
  //   - When resize ends → one final full measurement
  //
  // The earlier "full freeze" approach pinned the width on every frame of
  // resize, which meant the grid rendered at its PRE-resize width inside a
  // shrunken container. `overflow-x: hidden` on <main> then clipped the
  // rightmost column. This "shrink-only" variant fixes that while preserving
  // the smooth feel during resize.
  const agentResizing = useStore((s) => s.agentResizing);
  const lastMeasuredRef = useRef(0);

  // Subpixel + scrollbar safety buffer. ResizeObserver's contentRect can
  // return floating-point widths; react-grid-layout's integer math can then
  // compute a rightmost tile edge that sits ~0.5px past the container. We
  // subtract a small constant so the grid always leaves visible breathing
  // room regardless of rounding.
  const SAFETY_BUFFER = 4;

  useEffect(() => {
    if (!containerRef.current) return;
    let rafId = null;
    const observer = new ResizeObserver((entries) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        for (const entry of entries) {
          const raw = entry.contentRect.width;
          const safe = Math.max(0, Math.floor(raw) - SAFETY_BUFFER);
          lastMeasuredRef.current = safe;
          const resizing = useStore.getState().agentResizing;
          setWidth((prev) => {
            if (resizing && safe > prev) {
              // Container is growing during resize — hold the grid at its
              // current width so it doesn't bounce outward. Final reflow
              // happens on resize-end via the effect below.
              return prev;
            }
            // Shrinking OR not resizing — update immediately to prevent
            // any possibility of horizontal overflow.
            return safe;
          });
        }
      });
    });
    observer.observe(containerRef.current);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  // Resize-end catch-up — when agentResizing flips false, snap to the real
  // container width so the grid fills any space the shrink-only branch
  // preserved during the drag.
  useEffect(() => {
    if (agentResizing) return;
    if (!containerRef.current) return;
    const id = requestAnimationFrame(() => {
      const raw = containerRef.current?.getBoundingClientRect().width || 0;
      const safe = Math.max(0, Math.floor(raw) - SAFETY_BUFFER);
      if (safe > 0 && Math.abs(safe - width) > 1) {
        setWidth(safe);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [agentResizing, width]);

  return (
    <div
      ref={containerRef}
      style={{
        // Exact alignment with GlobalFilterBar (which uses margin: '0 24px').
        // Using MARGIN instead of padding here means the Section's own outer
        // box stops at the exact same x-coordinate as the filter bar. Previously
        // we used padding — the container ran full-width and tried to rely on
        // padding to keep tiles inside, but that left the container's right
        // edge flush with the main element's right edge (which is where the
        // overflow-x: hidden clipping happens). With margin, the container's
        // right edge is 24px inside main, just like the filter bar.
        margin: '0 24px',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* Freeze overlay — visible only while the agent panel is being dragged */}
      <div className="dash-freeze-overlay" data-active={agentResizing || undefined} aria-hidden="true" />
      {width > 0 && (
        <GridLayout
          className="layout"
          layout={layout.map(item => ({ ...item, minW: 2, minH: 1 }))}
          cols={12}
          rowHeight={60}
          width={width}
          margin={[themeConfig?.spacing?.tileGap ?? 12, themeConfig?.spacing?.tileGap ?? 12]}
          isDraggable={!fullscreenMode && !agentResizing}
          isResizable={!fullscreenMode && !agentResizing}
          draggableHandle=".cursor-grab"
          onLayoutChange={(newLayout) => onLayoutChange?.(sectionId, newLayout)}
        >
          {tiles.map((tile, i) => (
            <div key={tile.id}>
              <TileWrapper tile={tile} index={i}
                onEdit={onTileEdit}
                onChangeChart={(tileId, chartType) => onTileChartChange?.(tileId, chartType)}
                onRemove={() => onTileRemove?.(tile.id)}
                onMove={(targetTabId, targetSectionId) => onTileMove?.(tile.id, targetTabId, targetSectionId)}
                onCopy={(targetTabId, targetSectionId) => onTileCopy?.(tile.id, targetTabId, targetSectionId)}
                onRefresh={() => onTileRefresh?.(tile.id, connId)}
                customMetrics={customMetrics}
                onSelect={() => onTileSelect?.(tile.id)}
                selectedTileId={selectedTileId}
                crossFilter={crossFilter}
                onCrossFilterClick={onCrossFilterClick}
                dashboardId={dashboardId}
                themeConfig={themeConfig}
                allTabs={allTabs} />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}

export default function Section({
  section, connId, onLayoutChange, onTileEdit,
  onTileChartChange, onTileRemove, onTileMove, onTileCopy, onTileRefresh, onAddTile, onEditSection,
  onDeleteSection, onReorderSection, onRenameSection,
  customMetrics, onToggleLayoutMode, onFreeformLayoutChange, onCanvasViewportChange,
  onTileSelect, selectedTileId, themeConfig, crossFilter, onCrossFilterClick, dashboardId,
  fullscreenMode = false, allTabs = [], sectionNumber = null,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showMenu]);

  const tiles = section?.tiles || [];
  const layout = section?.layout || [];
  const layoutMode = section?.layoutMode || 'grid';

  const numLabel = sectionNumber != null ? String(sectionNumber).padStart(2, '0') : null;

  return (
    <div className="mb-8">
      {/* Editorial section header — eyebrow + title + actions */}
      <div
        className="section-header-group flex items-end gap-3 mb-4 cursor-pointer select-none group px-6"
        onClick={() => setCollapsed(!collapsed)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(!collapsed); }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} section ${section?.name || ''}`}
      >
        <div className="flex flex-col gap-1 min-w-0 flex-shrink-0">
          {/* Eyebrow: SECTION 01 ─── */}
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {numLabel && <span>Section {numLabel}</span>}
            {numLabel && <span className="section-dash" aria-hidden="true" />}
            {tiles.length > 0 && (
              <span style={{ letterSpacing: '0.14em', opacity: 0.7 }}>
                {tiles.length} {tiles.length === 1 ? 'tile' : 'tiles'}
              </span>
            )}
          </div>
          {/* Title row */}
          <div className="flex items-center gap-2.5">
            <svg
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{
                color: TOKENS.text.muted,
                transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
                transition: 'transform 400ms cubic-bezier(0.32,0.72,0,1)',
              }}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
            {renaming ? (
              <input
                autoFocus
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onRenameSection?.(section.id, renameName); setRenaming(false); }
                  if (e.key === 'Escape') setRenaming(false);
                }}
                onBlur={() => { if (renameName.trim()) onRenameSection?.(section.id, renameName); setRenaming(false); }}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent outline-none px-1 rounded"
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: TOKENS.text.primary,
                  borderBottom: `2px solid ${TOKENS.accent}`,
                  width: 260,
                  fontFamily: TOKENS.tile.headerFont,
                }}
              />
            ) : (
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: TOKENS.text.primary,
                  fontFamily: TOKENS.tile.headerFont,
                  lineHeight: 1.2,
                  margin: 0,
                }}
              >
                {section?.name || 'Untitled section'}
              </h2>
            )}
            {section?.visibilityRule && (
              <span
                className="eyebrow"
                style={{
                  padding: '2px 8px',
                  borderRadius: 9999,
                  background: 'var(--accent-tint-soft)',
                  color: TOKENS.accent,
                  border: '1px solid var(--accent-tint-mid)',
                  fontSize: 9,
                }}
              >
                Conditional
              </span>
            )}
          </div>
        </div>

        {/* Spacer rule */}
        <div
          className="flex-1 h-px"
          style={{
            background: `linear-gradient(90deg, ${TOKENS.border.default} 0%, transparent 100%)`,
            alignSelf: 'center',
            marginBottom: 6,
          }}
          aria-hidden="true"
        />

        {/* Layout mode toggle (hidden in fullscreen) */}
        {tiles.length > 0 && !fullscreenMode && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginBottom: 2 }}>
            <LayoutModeToggle mode={layoutMode} onToggle={(mode) => onToggleLayoutMode?.(section.id, mode)} />
          </div>
        )}

        {!fullscreenMode && (
          <div
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100"
            style={{ transition: 'opacity 300ms cubic-bezier(0.32,0.72,0,1)', marginBottom: 2 }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onAddTile?.(section.id); }}
              className="cursor-pointer ease-spring flex items-center justify-center rounded-full"
              style={{ color: TOKENS.text.muted, width: 26, height: 26, background: 'transparent', border: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = TOKENS.text.primary; e.currentTarget.style.background = TOKENS.bg.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = TOKENS.text.muted; e.currentTarget.style.background = 'transparent'; }}
              title="Add tile"
              aria-label="Add tile"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu((o) => !o); }}
                className="cursor-pointer ease-spring flex items-center justify-center rounded-full"
                style={{ color: TOKENS.text.muted, width: 26, height: 26, background: 'transparent', border: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = TOKENS.text.primary; e.currentTarget.style.background = TOKENS.bg.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = TOKENS.text.muted; e.currentTarget.style.background = 'transparent'; }}
                title="Section menu"
                aria-label="Section menu"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true"><path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" /></svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 top-7 z-50 rounded-lg shadow-2xl py-1" style={{
                  background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.hover}`,
                  minWidth: 160, boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                }}>
                  {[
                    { label: 'Rename', action: () => { setRenaming(true); setRenameName(section?.name || ''); setShowMenu(false); } },
                    { label: 'Move Up', action: () => { onReorderSection?.(section.id, 'up'); setShowMenu(false); } },
                    { label: 'Move Down', action: () => { onReorderSection?.(section.id, 'down'); setShowMenu(false); } },
                    { label: 'Delete Section', action: () => { if (confirm('Delete this section and all its tiles?')) { onDeleteSection?.(section.id); } setShowMenu(false); }, danger: true },
                  ].map(item => (
                    <button key={item.label} onClick={e => { e.stopPropagation(); item.action(); }}
                      className="w-full text-left px-3 py-1.5 text-xs cursor-pointer"
                      style={{
                        color: item.danger ? TOKENS.danger : TOKENS.text.secondary,
                        background: 'transparent', border: 'none',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = TOKENS.bg.hover; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!collapsed && tiles.length > 0 && layoutMode === 'grid' && (
        <SectionGrid tiles={tiles} layout={layout} onLayoutChange={onLayoutChange} sectionId={section.id}
          connId={connId}
          onTileEdit={onTileEdit} onTileChartChange={onTileChartChange}
          onTileRemove={onTileRemove} onTileMove={onTileMove} onTileCopy={onTileCopy}
          onTileRefresh={onTileRefresh} customMetrics={customMetrics}
          onTileSelect={onTileSelect} selectedTileId={selectedTileId} themeConfig={themeConfig}
          crossFilter={crossFilter} onCrossFilterClick={onCrossFilterClick}
          dashboardId={dashboardId} fullscreenMode={fullscreenMode} allTabs={allTabs} />
      )}

      {!collapsed && tiles.length > 0 && layoutMode === 'freeform' && (
        <div style={{ margin: '0 24px', boxSizing: 'border-box' }}>
          <FreeformCanvas
            tiles={tiles}
            freeformLayout={section?.freeformLayout || []}
            canvasViewport={section?.canvasViewport || { panX: 0, panY: 0, zoom: 1 }}
            onLayoutChange={onFreeformLayoutChange || onLayoutChange}
            onViewportChange={(vp) => onCanvasViewportChange?.(section.id, vp)}
            sectionId={section.id}
            connId={connId}
            onTileEdit={onTileEdit}
            onTileChartChange={onTileChartChange}
            onTileRemove={onTileRemove}
            onTileRefresh={onTileRefresh}
            customMetrics={customMetrics}
            onTileSelect={onTileSelect}
            selectedTileId={selectedTileId}
            themeConfig={themeConfig}
            crossFilter={crossFilter}
            onCrossFilterClick={onCrossFilterClick}
            dashboardId={dashboardId}
          />
        </div>
      )}

      {!collapsed && tiles.length === 0 && !fullscreenMode && (
        <div
          className="flex flex-col items-center justify-center py-20 mx-6"
          style={{
            border: `1px dashed ${TOKENS.border.default}`,
            borderRadius: 20,
            background: `radial-gradient(ellipse at center top, ${TOKENS.accentGlow} 0%, transparent 60%)`,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: TOKENS.accentGlow,
              border: `1px solid ${TOKENS.border.default}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TOKENS.accent} strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="3" width="7" height="9" rx="1.5" />
              <rect x="14" y="3" width="7" height="5" rx="1.5" />
              <rect x="14" y="12" width="7" height="9" rx="1.5" />
              <rect x="3" y="16" width="7" height="5" rx="1.5" />
            </svg>
          </div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>Empty section</p>
          <p style={{ fontSize: 14, color: TOKENS.text.secondary, marginBottom: 18, maxWidth: 360, textAlign: 'center', lineHeight: 1.5 }}>
            Add a tile to start visualizing — ask a question in natural language, or pick a chart type.
          </p>
          <button
            onClick={() => onAddTile?.(section.id)}
            className="group inline-flex items-center gap-2 pl-5 pr-1.5 py-1.5 rounded-full ease-spring cursor-pointer"
            style={{
              background: 'var(--accent)',
              color: 'var(--text-on-accent)',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 8px 24px -8px var(--accent-shadow), 0 1px 0 rgba(255,255,255,0.15) inset',
              border: 'none',
            }}
          >
            <span>Add first tile</span>
            <span
              className="flex items-center justify-center w-7 h-7 rounded-full ease-spring transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-[1px]"
              style={{ background: 'var(--on-accent-overlay)' }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
