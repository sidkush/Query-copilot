import { useState } from 'react';
import { TOKENS } from './tokens';

export default function NotesPanel({ annotations = [], userName, onAdd }) {
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
        <div key={note.id || i} className="flex gap-2.5 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${TOKENS.accent}, #a78bfa)` }}>
            {initials(note.authorName)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold" style={{ color: TOKENS.text.primary }}>{note.authorName || 'Unknown'}</span>
              <span className="text-[11px]" style={{ color: TOKENS.text.muted }}>{relTime(note.created_at)}</span>
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
