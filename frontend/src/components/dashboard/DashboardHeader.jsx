import { useState, useRef, useEffect } from 'react';
import { TOKENS } from './tokens';

export default function DashboardHeader({ dashboard, saving, onNameChange }) {
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
