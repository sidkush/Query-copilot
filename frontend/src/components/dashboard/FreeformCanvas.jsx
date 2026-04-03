import { useState, useRef, useCallback, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import TileWrapper from './TileWrapper';
import { TOKENS } from './tokens';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

const DOT_GRID = `radial-gradient(circle, ${TOKENS.border.default} 1px, transparent 1px)`;

export default function FreeformCanvas({
  tiles, freeformLayout = [], canvasViewport = { panX: 0, panY: 0, zoom: 1 },
  onLayoutChange, onViewportChange, sectionId,
  connId, onTileEdit, onTileEditSQL, onTileChartChange, onTileRemove, onTileRefresh, customMetrics,
  onTileSelect, selectedTileId, crossFilter, onCrossFilterClick, dashboardId, themeConfig,
}) {
  const containerRef = useRef(null);
  const [pan, setPan] = useState({ x: canvasViewport.panX || 0, y: canvasViewport.panY || 0 });
  const [zoom, setZoom] = useState(canvasViewport.zoom || 1);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [contextMenu, setContextMenu] = useState(null);

  // Build layout map
  const layoutMap = {};
  for (const item of freeformLayout) { layoutMap[item.i] = item; }

  // Default positions for tiles without freeform layout
  const getLayout = (tileId, idx) => layoutMap[tileId] || {
    i: tileId, x: 20 + (idx % 3) * 420, y: 20 + Math.floor(idx / 3) * 350,
    width: 400, height: 320, zIndex: idx + 1,
  };

  const updateLayout = useCallback((tileId, updates) => {
    const newLayout = freeformLayout.map(item =>
      item.i === tileId ? { ...item, ...updates } : item
    );
    if (!newLayout.find(item => item.i === tileId)) {
      newLayout.push({ ...getLayout(tileId, tiles.findIndex(t => t.id === tileId)), ...updates });
    }
    onLayoutChange?.(sectionId, newLayout);
  }, [freeformLayout, sectionId, onLayoutChange, tiles]);

  // Pan handlers (shift+drag or middle mouse)
  const handleMouseDown = useCallback((e) => {
    if (e.target !== containerRef.current && e.target !== containerRef.current?.firstChild) return;
    if (e.shiftKey || e.button === 1) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
    setContextMenu(null);
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      onViewportChange?.({ panX: pan.x, panY: pan.y, zoom });
    }
  }, [pan, zoom, onViewportChange]);

  // Zoom handler
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(z => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta));
      onViewportChange?.({ panX: pan.x, panY: pan.y, zoom: newZoom });
      return newZoom;
    });
  }, [pan, onViewportChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Context menu handlers
  const bringToFront = useCallback((tileId) => {
    const maxZ = Math.max(...freeformLayout.map(l => l.zIndex || 0), 0);
    updateLayout(tileId, { zIndex: maxZ + 1 });
    setContextMenu(null);
  }, [freeformLayout, updateLayout]);

  const sendToBack = useCallback((tileId) => {
    const minZ = Math.min(...freeformLayout.map(l => l.zIndex || 0), 0);
    updateLayout(tileId, { zIndex: minZ - 1 });
    setContextMenu(null);
  }, [freeformLayout, updateLayout]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'relative', width: '100%', minHeight: 500,
        overflow: 'hidden', cursor: isPanning.current ? 'grabbing' : 'default',
        background: TOKENS.bg.deep,
        backgroundImage: DOT_GRID,
        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        borderRadius: TOKENS.radius.lg,
        border: `1px solid ${TOKENS.border.default}`,
      }}
    >
      {/* Transformed inner canvas */}
      <div style={{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        position: 'absolute', top: 0, left: 0,
        width: 4000, height: 4000,
      }}>
        {tiles.map((tile, idx) => {
          const layout = getLayout(tile.id, idx);
          return (
            <Rnd
              key={tile.id}
              position={{ x: layout.x, y: layout.y }}
              size={{ width: layout.width, height: layout.height }}
              style={{ zIndex: layout.zIndex || idx }}
              minWidth={200}
              minHeight={160}
              bounds="parent"
              scale={zoom}
              onDragStart={() => onTileSelect?.(tile.id)}
              onDragStop={(e, d) => updateLayout(tile.id, { x: d.x, y: d.y })}
              onResizeStop={(e, dir, ref, delta, pos) => {
                updateLayout(tile.id, { x: pos.x, y: pos.y, width: ref.offsetWidth, height: ref.offsetHeight });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ tileId: tile.id, x: e.clientX, y: e.clientY });
              }}
            >
              <div style={{ width: '100%', height: '100%' }}>
                <TileWrapper
                  tile={tile} index={idx}
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
                  themeConfig={themeConfig}
                />
              </div>
            </Rnd>
          );
        })}
      </div>

      {/* Zoom indicator */}
      <div style={{
        position: 'absolute', bottom: 10, right: 10, zIndex: 100,
        padding: '4px 10px', borderRadius: 6,
        background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`,
        fontSize: 11, color: TOKENS.text.muted, pointerEvents: 'none',
      }}>
        {Math.round(zoom * 100)}%
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 200,
          background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.hover}`,
          borderRadius: 10, padding: 4, minWidth: 140,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}>
          {[
            { label: 'Bring to Front', action: () => bringToFront(contextMenu.tileId) },
            { label: 'Send to Back', action: () => sendToBack(contextMenu.tileId) },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{
                display: 'block', width: '100%', padding: '6px 12px', textAlign: 'left',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: TOKENS.text.secondary, fontSize: 12, borderRadius: 6,
                transition: `background ${TOKENS.transition}`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = TOKENS.bg.hover; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
