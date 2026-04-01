import { useState, useEffect, useRef } from 'react';
import { TOKENS } from './tokens';

export default function CommandBar({ onAddTile, onExport, onSettings, onAICommand }) {
  const [showInput, setShowInput] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowInput(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setShowInput(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onAICommand?.(query.trim());
      setQuery('');
      setShowInput(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 border-b px-6 py-2.5 flex items-center gap-3"
      style={{
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        background: 'rgba(5,5,6,0.82)',
        borderColor: TOKENS.border.default,
      }}>
      {showInput ? (
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2.5 rounded-lg px-3.5 py-2"
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" style={{ color: TOKENS.text.muted }}>
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/>
          </svg>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder='Ask AI: "Add a revenue trend chart" or search tiles...'
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: TOKENS.text.primary }} />
          <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ fontFamily: "'JetBrains Mono', monospace", color: TOKENS.text.muted, background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}` }}>Esc</kbd>
        </form>
      ) : (
        <div className="flex-1 flex items-center gap-2.5 rounded-lg px-3.5 py-2 cursor-text"
          onClick={() => setShowInput(true)}
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, transition: `border-color ${TOKENS.transition}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" style={{ color: TOKENS.text.muted }}>
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/>
          </svg>
          <span className="text-sm" style={{ color: TOKENS.text.muted }}>Ask AI to add a chart, or search tiles...</span>
          <kbd className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ fontFamily: "'JetBrains Mono', monospace", color: TOKENS.text.muted, background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}` }}>Ctrl+K</kbd>
        </div>
      )}
      <div className="flex gap-1.5">
        <button onClick={onAddTile} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer"
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/></svg>
          Add Tile
        </button>
        <button onClick={onExport} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer"
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M13.75 7h-3v5.296l1.943-2.048a.75.75 0 011.114 1.004l-3.25 3.5a.75.75 0 01-1.114 0l-3.25-3.5a.75.75 0 111.114-1.004l1.943 2.048V7h-3a1.75 1.75 0 00-1.75 1.75v7.5c0 .966.784 1.75 1.75 1.75h7.5A1.75 1.75 0 0015.5 16.25v-7.5A1.75 1.75 0 0013.75 7z"/></svg>
          Export
        </button>
        <button onClick={onSettings} className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer"
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
        </button>
      </div>
    </div>
  );
}
