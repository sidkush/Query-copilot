import { useState, useRef, useEffect } from 'react';
import GridLayout from 'react-grid-layout';
import TileWrapper from './TileWrapper';
import FreeformCanvas from './FreeformCanvas';
import LayoutModeToggle from './LayoutModeToggle';
import { TOKENS } from './tokens';

function SectionGrid({ tiles, layout, onLayoutChange, sectionId, connId, onTileEdit, onTileEditSQL, onTileChartChange, onTileRemove, onTileRefresh, customMetrics, onTileSelect, selectedTileId, themeConfig, crossFilter, onCrossFilterClick, dashboardId, fullscreenMode = false }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="px-6">
      {width > 0 && (
        <GridLayout
          className="layout"
          layout={layout.map(item => ({ minW: 2, minH: 2, ...item }))}
          cols={12}
          rowHeight={60}
          width={width}
          margin={[themeConfig?.spacing?.tileGap ?? 12, themeConfig?.spacing?.tileGap ?? 12]}
          isDraggable={!fullscreenMode}
          isResizable={!fullscreenMode}
          draggableHandle=".cursor-grab"
          onLayoutChange={(newLayout) => onLayoutChange?.(sectionId, newLayout)}
        >
          {tiles.map((tile, i) => (
            <div key={tile.id}>
              <TileWrapper tile={tile} index={i}
                onEdit={onTileEdit}
                onEditSQL={() => onTileEditSQL?.(tile)}
                onChangeChart={(tileId, chartType) => onTileChartChange?.(tileId, chartType)}
                onRemove={() => onTileRemove?.(tile.id)}
                onRefresh={() => onTileRefresh?.(tile.id, connId)}
                customMetrics={customMetrics}
                onSelect={() => onTileSelect?.(tile.id)}
                selectedTileId={selectedTileId}
                crossFilter={crossFilter}
                onCrossFilterClick={onCrossFilterClick}
                dashboardId={dashboardId}
                themeConfig={themeConfig} />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}

export default function Section({
  section, connId, onLayoutChange, onTileEdit, onTileEditSQL,
  onTileChartChange, onTileRemove, onTileRefresh, onAddTile, onEditSection,
  customMetrics, onToggleLayoutMode, onFreeformLayoutChange, onCanvasViewportChange,
  onTileSelect, selectedTileId, themeConfig, crossFilter, onCrossFilterClick, dashboardId,
  fullscreenMode = false,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const tiles = section?.tiles || [];
  const layout = section?.layout || [];
  const layoutMode = section?.layoutMode || 'grid';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 cursor-pointer select-none group px-6"
        onClick={() => setCollapsed(!collapsed)}>
        <svg className="w-3.5 h-3.5" style={{ color: TOKENS.text.muted, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: `transform ${TOKENS.transition}` }}
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
        <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: TOKENS.text.primary }}>{section?.name || 'Untitled Section'}</span>
        {section?.visibilityRule && (
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 600, textTransform: 'none', letterSpacing: 'normal' }}>
            conditional
          </span>
        )}
        <div className="flex-1 h-px" style={{ background: TOKENS.border.default }} />

        {/* Layout mode toggle (hidden in fullscreen) */}
        {tiles.length > 0 && !fullscreenMode && (
          <div onClick={e => e.stopPropagation()}>
            <LayoutModeToggle mode={layoutMode} onToggle={(mode) => onToggleLayoutMode?.(section.id, mode)} />
          </div>
        )}

        <span className="text-[11px] px-2 py-px rounded-full" style={{ color: TOKENS.text.muted, background: TOKENS.bg.elevated }}>{tiles.length} tiles</span>
        {!fullscreenMode && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100" style={{ transition: `opacity ${TOKENS.transition}` }}>
            <button onClick={e => { e.stopPropagation(); onAddTile?.(section.id); }} className="cursor-pointer" style={{ color: TOKENS.text.muted }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
            </button>
            <button onClick={e => { e.stopPropagation(); onEditSection?.(); }} className="cursor-pointer" style={{ color: TOKENS.text.muted }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" /></svg>
            </button>
          </div>
        )}
      </div>

      {!collapsed && tiles.length > 0 && layoutMode === 'grid' && (
        <SectionGrid tiles={tiles} layout={layout} onLayoutChange={onLayoutChange} sectionId={section.id}
          connId={connId}
          onTileEdit={onTileEdit} onTileEditSQL={onTileEditSQL} onTileChartChange={onTileChartChange}
          onTileRemove={onTileRemove} onTileRefresh={onTileRefresh} customMetrics={customMetrics}
          onTileSelect={onTileSelect} selectedTileId={selectedTileId} themeConfig={themeConfig}
          crossFilter={crossFilter} onCrossFilterClick={onCrossFilterClick}
          dashboardId={dashboardId} fullscreenMode={fullscreenMode} />
      )}

      {!collapsed && tiles.length > 0 && layoutMode === 'freeform' && (
        <div className="px-6">
          <FreeformCanvas
            tiles={tiles}
            freeformLayout={section?.freeformLayout || []}
            canvasViewport={section?.canvasViewport || { panX: 0, panY: 0, zoom: 1 }}
            onLayoutChange={onFreeformLayoutChange || onLayoutChange}
            onViewportChange={(vp) => onCanvasViewportChange?.(section.id, vp)}
            sectionId={section.id}
            connId={connId}
            onTileEdit={onTileEdit}
            onTileEditSQL={onTileEditSQL}
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
        <div className="flex items-center justify-center py-12 mx-6 rounded-xl border border-dashed"
          style={{ borderColor: TOKENS.border.default, color: TOKENS.text.muted }}>
          <button onClick={() => onAddTile?.(section.id)} className="text-sm cursor-pointer" style={{ color: TOKENS.accentLight }}>
            + Add a tile to this section
          </button>
        </div>
      )}
    </div>
  );
}
