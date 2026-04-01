import { TOKENS } from './tokens';
import ResultsChart from '../ResultsChart';
import KPICard from './KPICard';

export default function TileWrapper({ tile, index, onEdit, onEditSQL, onChangeChart, onRemove, onRefresh }) {
  const commentCount = (tile?.annotations || []).length;

  if (tile?.chartType === 'kpi') {
    return <KPICard tile={tile} index={index} onEdit={onEdit} />;
  }

  return (
    <div className="relative overflow-hidden rounded-[14px] group h-full flex flex-col"
      style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, transition: `all ${TOKENS.transition}` }}>
      {/* Drag handle */}
      <div className="absolute top-3.5 left-2 w-3 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 cursor-grab"
        style={{ transition: `opacity ${TOKENS.transition}` }}>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-[18px] pt-[14px]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: TOKENS.text.primary }}>{tile?.title || 'Untitled'}</span>
          {tile?.subtitle && <span className="text-[11px]" style={{ color: TOKENS.text.muted }}>{tile.subtitle}</span>}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100" style={{ transition: `opacity ${TOKENS.transition}` }}>
          {commentCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer"
              style={{ color: TOKENS.text.muted, background: TOKENS.bg.surface }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[11px] h-[11px]"><path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293c.121-.233.362-.393.642-.413a41.1 41.1 0 003.55-.414c1.437-.232 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2z" clipRule="evenodd"/></svg>
              {commentCount}
            </span>
          )}
          {[
            { title: 'Refresh', icon: 'M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903H14.25a.75.75 0 000 1.5h6a.75.75 0 00.75-.75v-6a.75.75 0 00-1.5 0v2.553l-1.256-1.255a9 9 0 00-14.3 5.842.75.75 0 001.506-.429zM15.245 9.941a7.5 7.5 0 01-12.548 3.364L.794 11.402H5.75a.75.75 0 000-1.5h-6a.75.75 0 00-.75.75v6a.75.75 0 001.5 0v-2.553l1.256 1.255a9 9 0 0014.3-5.842.75.75 0 00-1.506.429z', onClick: onRefresh },
            { title: 'Edit SQL', icon: 'M6.28 5.22a.75.75 0 010 1.06L2.56 10l3.72 3.72a.75.75 0 01-1.06 1.06L.97 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0zm7.44 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L17.44 10l-3.72-3.72a.75.75 0 010-1.06zM11.377 2.011a.75.75 0 01.612.867l-2.5 14.5a.75.75 0 01-1.478-.255l2.5-14.5a.75.75 0 01.866-.612z', onClick: onEditSQL },
            { title: 'Chart type', icon: 'M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z', onClick: onChangeChart },
            { title: 'Edit', icon: 'M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z', onClick: () => onEdit?.(tile) },
          ].map(({ title, icon, onClick }) => (
            <button key={title} onClick={onClick} title={title}
              className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
              style={{ color: TOKENS.text.muted, transition: `all ${TOKENS.transition}` }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d={icon} clipRule="evenodd"/></svg>
            </button>
          ))}
          <button onClick={onRemove} title="Remove"
            className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
            style={{ color: TOKENS.danger, transition: `all ${TOKENS.transition}` }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5z" clipRule="evenodd"/></svg>
          </button>
        </div>
      </div>
      {/* Chart body */}
      <div className="flex-1 px-[18px] pb-[18px] pt-3 min-h-[160px]">
        {tile?.rows?.length > 0 ? (
          <ResultsChart columns={tile.columns} rows={tile.rows} embedded
            defaultChartType={tile.chartType} defaultPalette={tile.palette}
            defaultMeasure={tile.selectedMeasure} defaultMeasures={tile.activeMeasures} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: TOKENS.text.muted }}>No data</div>
        )}
      </div>
      {/* Resize handle */}
      <div className="absolute bottom-1 right-1 w-3 h-3 opacity-0 group-hover:opacity-40 cursor-se-resize"
        style={{ transition: `opacity ${TOKENS.transition}` }}>
        <div className="absolute bottom-0 right-0 w-2.5 h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <div className="absolute bottom-0 right-0 w-0.5 h-2.5 rounded" style={{ background: TOKENS.text.muted }}/>
      </div>
    </div>
  );
}
