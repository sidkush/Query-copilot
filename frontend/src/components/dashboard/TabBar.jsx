import { useState } from 'react';
import { TOKENS } from './tokens';

export default function TabBar({ tabs = [], activeTabId, onSelect, onAdd, onRename, onDelete }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  const startRename = (tab) => { setRenamingId(tab.id); setRenameVal(tab.name); };
  const commitRename = () => {
    if (renameVal.trim() && renamingId) onRename?.(renamingId, renameVal.trim());
    setRenamingId(null);
  };

  return (
    <div className="flex items-center gap-0.5 mb-5 border-b px-6" style={{ borderColor: TOKENS.border.default }}>
      {tabs.map(tab => (
        <div key={tab.id}
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium cursor-pointer select-none -mb-px group"
          style={{
            color: tab.id === activeTabId ? TOKENS.accentLight : TOKENS.text.muted,
            borderBottom: `2px solid ${tab.id === activeTabId ? TOKENS.accent : 'transparent'}`,
            transition: `all ${TOKENS.transition}`,
          }}
          onClick={() => onSelect?.(tab.id)}
          onDoubleClick={() => startRename(tab)}>
          {renamingId === tab.id ? (
            <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
              onBlur={commitRename} onKeyDown={e => e.key === 'Enter' && commitRename()}
              autoFocus className="bg-transparent outline-none text-sm w-24"
              style={{ color: TOKENS.text.primary }} />
          ) : tab.name}
          {tabs.length > 1 && tab.id === activeTabId && (
            <button onClick={e => { e.stopPropagation(); onDelete?.(tab.id); }}
              className="ml-1 opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-pointer"
              style={{ color: TOKENS.text.muted, transition: `opacity ${TOKENS.transition}` }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z"/>
              </svg>
            </button>
          )}
        </div>
      ))}
      <button onClick={onAdd}
        className="px-3 py-1.5 text-sm cursor-pointer rounded-t-md mb-1 ml-1"
        style={{ color: TOKENS.text.muted, border: `1px dashed ${TOKENS.border.default}`, transition: `all ${TOKENS.transition}` }}>
        + Add tab
      </button>
    </div>
  );
}
