import { useState, useRef } from 'react';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import TileWrapper from './TileWrapper';
import { TOKENS } from './tokens';

function SectionGrid({ tiles, layout, onLayoutChange, sectionId, onTileEdit, onTileEditSQL, onTileChartChange, onTileRemove, onTileRefresh }) {
  const containerRef = useRef(null);
  const width = useContainerWidth(containerRef);

  return (
    <div ref={containerRef} className="px-6">
      {width > 0 && (
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={80}
          width={width}
          margin={[12, 12]}
          isDraggable
          isResizable
          draggableHandle=".cursor-grab"
          onLayoutChange={(newLayout) => onLayoutChange?.(sectionId, newLayout)}
        >
          {tiles.map((tile, i) => (
            <div key={tile.id}>
              <TileWrapper tile={tile} index={i}
                onEdit={onTileEdit}
                onEditSQL={() => onTileEditSQL?.(tile)}
                onChangeChart={() => onTileChartChange?.(tile)}
                onRemove={() => onTileRemove?.(tile.id)}
                onRefresh={() => onTileRefresh?.(tile.id)} />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}

export default function Section({ section, onLayoutChange, onTileEdit, onTileEditSQL, onTileChartChange, onTileRemove, onTileRefresh, onAddTile, onEditSection }) {
  const [collapsed, setCollapsed] = useState(section?.collapsed || false);

  const tiles = section?.tiles || [];
  const layout = section?.layout || [];

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 cursor-pointer select-none group px-6"
        onClick={() => setCollapsed(!collapsed)}>
        <svg className="w-3.5 h-3.5" style={{ color: TOKENS.text.muted, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: `transform ${TOKENS.transition}` }}
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
        </svg>
        <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: TOKENS.text.primary }}>{section?.name || 'Untitled Section'}</span>
        <div className="flex-1 h-px" style={{ background: TOKENS.border.default }}/>
        <span className="text-[11px] px-2 py-px rounded-full" style={{ color: TOKENS.text.muted, background: TOKENS.bg.elevated }}>{tiles.length} tiles</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100" style={{ transition: `opacity ${TOKENS.transition}` }}>
          <button onClick={e => { e.stopPropagation(); onAddTile?.(); }} className="cursor-pointer" style={{ color: TOKENS.text.muted }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/></svg>
          </button>
          <button onClick={e => { e.stopPropagation(); onEditSection?.(); }} className="cursor-pointer" style={{ color: TOKENS.text.muted }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>
          </button>
        </div>
      </div>
      {!collapsed && tiles.length > 0 && (
        <SectionGrid tiles={tiles} layout={layout} onLayoutChange={onLayoutChange} sectionId={section.id}
          onTileEdit={onTileEdit} onTileEditSQL={onTileEditSQL} onTileChartChange={onTileChartChange}
          onTileRemove={onTileRemove} onTileRefresh={onTileRefresh} />
      )}
      {!collapsed && tiles.length === 0 && (
        <div className="flex items-center justify-center py-12 mx-6 rounded-xl border border-dashed"
          style={{ borderColor: TOKENS.border.default, color: TOKENS.text.muted }}>
          <button onClick={onAddTile} className="text-sm cursor-pointer" style={{ color: TOKENS.accentLight }}>
            + Add a tile to this section
          </button>
        </div>
      )}
    </div>
  );
}
