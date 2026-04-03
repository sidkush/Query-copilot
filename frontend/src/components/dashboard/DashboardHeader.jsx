import { useState, useRef, useEffect } from 'react';
import { TOKENS } from './tokens';

export default function DashboardHeader({ dashboard, saving, onNameChange, onOpenMetrics, onOpenTheme, onOpenBookmarks, onToggleFullscreen }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dashboard?.name || '');
  const inputRef = useRef(null);

  useEffect(() => { setName(dashboard?.name || ''); }, [dashboard?.name]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== dashboard?.name) onNameChange?.(name.trim());
  };

  const relTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex items-center justify-between mb-4 px-6">
      <div className="flex items-center gap-3 group">
        {editing ? (
          <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
            onBlur={save} onKeyDown={e => e.key === 'Enter' && save()}
            className="text-[22px] font-bold tracking-tight bg-transparent outline-none border-b-2"
            style={{ color: TOKENS.text.primary, borderColor: TOKENS.accent, letterSpacing: '-0.02em' }} />
        ) : (
          <h1 className="text-[22px] font-bold tracking-tight cursor-pointer"
            style={{ color: TOKENS.text.primary, letterSpacing: '-0.02em' }}
            onClick={() => setEditing(true)}>
            {dashboard?.name || 'Untitled Dashboard'}
          </h1>
        )}
        <svg onClick={() => setEditing(true)} className="w-3.5 h-3.5 cursor-pointer opacity-0 group-hover:opacity-100"
          style={{ color: TOKENS.text.muted, transition: `opacity ${TOKENS.transition}` }}
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z"/>
        </svg>
      </div>
      <div className="flex items-center gap-4">
        {onOpenMetrics && (
          <button onClick={onOpenMetrics} title="Custom Metrics"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
            style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007v-.008zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
            </svg>
            Metrics
          </button>
        )}
        {onOpenBookmarks && (
          <button onClick={onOpenBookmarks} title="Saved Views"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
            style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            Views
          </button>
        )}
        {onToggleFullscreen && (
          <button onClick={onToggleFullscreen} title="Fullscreen Preview"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
            style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            Preview
          </button>
        )}
        {onOpenTheme && (
          <button onClick={onOpenTheme} title="Dashboard Theme"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
            style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
            </svg>
            Theme
          </button>
        )}
        {saving && (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: TOKENS.text.muted }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: TOKENS.warning }}></span>
            Saving...
          </span>
        )}
        {!saving && dashboard?.updated_at && (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: TOKENS.text.muted }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: TOKENS.success }}></span>
            Updated {relTime(dashboard.updated_at)}
          </span>
        )}
      </div>
    </div>
  );
}
