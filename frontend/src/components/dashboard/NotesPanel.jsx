import { useState } from 'react';
import { TOKENS } from './tokens';

export default function NotesPanel({ annotations = [], userName, onAdd, onDelete }) {
  const [text, setText] = useState('');

  const initials = (name) => {
    if (!name) return '?';
    const parts = name.split(/\s+/);
    return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
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

  const handleSubmit = () => {
    if (text.trim()) {
      onAdd?.(text.trim());
      setText('');
    }
  };

  return (
    <div className="mx-6 mt-6 rounded-[14px] p-5" style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-semibold" style={{ color: TOKENS.text.primary }}>Notes & Commentary</span>
        <span className="text-[11px] px-2 py-px rounded-full" style={{ color: TOKENS.text.muted, background: TOKENS.bg.surface }}>{annotations.length} notes</span>
      </div>
      {annotations.map((note, i) => (
        <div key={note.id || i} className="flex gap-2.5 py-2.5 group" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${TOKENS.accent}, #a78bfa)` }}>
            {initials(note.authorName)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold" style={{ color: TOKENS.text.primary }}>{note.authorName || 'Unknown'}</span>
              <span className="text-[11px]" style={{ color: TOKENS.text.muted }}>{relTime(note.created_at)}</span>
              {onDelete && note.id && (
                <button onClick={() => onDelete(note.id)}
                  className="opacity-0 group-hover:opacity-100 ml-auto cursor-pointer"
                  style={{ color: TOKENS.danger, background: 'none', border: 'none', padding: 0, transition: `opacity ${TOKENS.transition}` }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.78.72l.5 6a.75.75 0 01-1.5.12l-.5-6a.75.75 0 01.72-.78zm2.84 0a.75.75 0 01.72.78l-.5 6a.75.75 0 11-1.5-.12l.5-6a.75.75 0 01.78-.72z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: TOKENS.text.secondary }}>{note.text}</p>
          </div>
        </div>
      ))}
      <div className="flex gap-2.5 items-center mt-3 pt-3" style={{ borderTop: `1px solid ${TOKENS.border.default}` }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #22c55e, #4ade80)' }}>You</div>
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Add a note or @mention a collaborator..."
          className="flex-1 bg-transparent outline-none text-[13px] rounded-lg px-3.5 py-2"
          style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary }} />
        {text.trim() && (
          <button onClick={handleSubmit} className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{ background: TOKENS.accent, color: 'white' }}>Send</button>
        )}
      </div>
    </div>
  );
}
