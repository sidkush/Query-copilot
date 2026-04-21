import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from './tokens';
import { api } from '../../api';

/**
 * Compare a saved bookmark's tile state against the current live tile list.
 * Returns sets of tile IDs that were added, removed, or modified since the
 * bookmark was captured.
 *
 * @param {object} bookmark  - Bookmark object including `state.tiles`
 * @param {Array}  currentTiles - Current array of tile objects (each with `id` + arbitrary fields)
 * @returns {{ added: string[], removed: string[], modified: string[] }}
 */
// utility helper colocated with the BookmarkManager component for callsite cohesion — fast-refresh acceptable since this file is rarely hot-edited
// eslint-disable-next-line react-refresh/only-export-components
export function compareBookmark(bookmark, currentTiles) {
  const savedTiles = bookmark?.state?.tiles ?? [];

  const savedMap = Object.fromEntries(savedTiles.map(t => [t.id, t]));
  const currentMap = Object.fromEntries((currentTiles ?? []).map(t => [t.id, t]));

  const savedIds = new Set(Object.keys(savedMap));
  const currentIds = new Set(Object.keys(currentMap));

  const added = [...currentIds].filter(id => !savedIds.has(id));
  const removed = [...savedIds].filter(id => !currentIds.has(id));
  const modified = [...savedIds]
    .filter(id => currentIds.has(id))
    .filter(id => JSON.stringify(savedMap[id]) !== JSON.stringify(currentMap[id]));

  return { added, removed, modified };
}

export default function BookmarkManager({ dashboardId, currentState, currentTiles = [], onApply, onClose, tabNames = {} }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [compareId, setCompareId] = useState(null);

  // Escape key to close [ADV-FIX H4]
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!dashboardId) return;
    api.listBookmarks(dashboardId).then(res => setBookmarks(res?.bookmarks || [])).catch(() => {});
  }, [dashboardId]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !dashboardId) return;
    setSaving(true);
    try {
      // Derive next version counter from existing bookmarks for this dashboard.
      const nextVersion = bookmarks.reduce((max, b) => Math.max(max, b.version ?? 0), 0) + 1;
      const stateWithMeta = {
        ...currentState,
        tiles: currentTiles,
        _bookmarkVersion: nextVersion,
        _bookmarkSavedAt: new Date().toISOString(),
      };
      const bm = await api.saveBookmark(dashboardId, name.trim(), stateWithMeta);
      // Attach version fields to the local copy for immediate display.
      const bmWithVersion = { ...bm, version: nextVersion, savedAt: stateWithMeta._bookmarkSavedAt };
      setBookmarks(prev => [...prev, bmWithVersion]);
      setName('');
    } catch (err) {
      void err;
    } finally {
      setSaving(false);
    }
  }, [dashboardId, name, currentState, currentTiles, bookmarks]);

  const handleDelete = useCallback(async (bmId) => {
    try {
      await api.deleteBookmark(dashboardId, bmId);
      setBookmarks(prev => prev.filter(b => b.id !== bmId));
      if (compareId === bmId) setCompareId(null);
    } catch (err) {
      void err;
    }
  }, [dashboardId, compareId]);

  const handleShare = useCallback((bmId) => {
    const url = `${window.location.origin}/analytics?view=${bmId}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }, []);

  return (
    <AnimatePresence>
      <motion.div key="bm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div key="bm-modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 460, maxHeight: '70vh', background: TOKENS.bg.elevated,
            border: `1px solid ${TOKENS.border.default}`, borderRadius: TOKENS.radius.xl,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${TOKENS.border.default}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: TOKENS.text.primary }}>Saved Views</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: TOKENS.text.muted, cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>

          {/* Save new */}
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${TOKENS.border.default}`, display: 'flex', gap: 8 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="View name..." onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={{ flex: 1, padding: '8px 12px', background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, borderRadius: TOKENS.radius.sm, color: TOKENS.text.primary, fontSize: 13, outline: 'none' }} />
            <button onClick={handleSave} disabled={!name.trim() || saving}
              style={{ padding: '8px 16px', background: TOKENS.accent, color: '#fff', border: 'none', borderRadius: TOKENS.radius.sm, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !name.trim() ? 0.4 : 1 }}>
              {saving ? '...' : 'Save'}
            </button>
          </div>

          {/* Bookmark list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
            {bookmarks.length === 0 && <p style={{ color: TOKENS.text.muted, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>No saved views yet</p>}
            {bookmarks.map(bm => {
              const s = bm.state || {};
              const tabLabel = tabNames[s.activeTabId] || '';
              const filterCount = s.globalFilters?.fields?.length || 0;
              const dateFilterCount = s.globalFilters?.dateFilters?.length || (s.globalFilters?.dateColumn ? 1 : 0);
              const rangeLabel = dateFilterCount > 0 ? `${dateFilterCount} date filter${dateFilterCount > 1 ? 's' : ''}` : '';
              const details = [tabLabel, rangeLabel, filterCount > 0 ? `${filterCount} filter${filterCount > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');

              // Version snapshot fields (present on bookmarks saved after this feature shipped)
              const version = bm.version ?? s._bookmarkVersion;
              const savedAt = bm.savedAt ?? s._bookmarkSavedAt;

              // Compare diff — only computed when this bookmark is the active compare target
              const diff = compareId === bm.id ? compareBookmark(bm, currentTiles) : null;
              const diffTotal = diff ? diff.added.length + diff.removed.length + diff.modified.length : 0;

              return (
                <div key={bm.id} style={{ padding: '10px 0', borderBottom: `1px solid ${TOKENS.border.default}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => { onApply(bm.state); onClose(); }} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: TOKENS.text.primary, fontSize: 13, fontWeight: 500 }}>
                      {bm.name}
                      {version != null && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: TOKENS.text.muted, fontWeight: 400 }}>v{version}</span>
                      )}
                    </button>
                    <span style={{ fontSize: 11, color: TOKENS.text.muted, flexShrink: 0 }}>
                      {(savedAt ?? bm.created_at) ? new Date(savedAt ?? bm.created_at).toLocaleDateString() : ''}
                    </span>
                    <button
                      onClick={() => setCompareId(prev => prev === bm.id ? null : bm.id)}
                      title="Compare with current dashboard"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: compareId === bm.id ? TOKENS.accent : TOKENS.text.secondary, fontSize: 12 }}
                    >
                      {compareId === bm.id ? 'Hide' : 'Compare'}
                    </button>
                    <button onClick={() => handleShare(bm.id)} title="Copy share link"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOKENS.text.secondary, fontSize: 12 }}>Link</button>
                    <button onClick={() => handleDelete(bm.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOKENS.danger, fontSize: 12 }}>Del</button>
                  </div>
                  {details && (
                    <div style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 3, paddingLeft: 2 }}>
                      {details}
                      {(s.globalFilters?.fields || []).map((f, i) => (
                        <span key={i} style={{ marginLeft: 6, color: TOKENS.accentLight, fontSize: 10 }}>{f.column}{f.operator}{f.value}</span>
                      ))}
                    </div>
                  )}
                  {/* Version diff summary — shown when Compare is active */}
                  {diff && (
                    <div style={{ marginTop: 6, padding: '6px 8px', background: TOKENS.bg.surface, borderRadius: TOKENS.radius.sm, fontSize: 11 }}>
                      {diffTotal === 0 ? (
                        <span style={{ color: TOKENS.text.muted }}>No changes since this snapshot.</span>
                      ) : (
                        <span style={{ color: TOKENS.text.secondary }}>
                          {diff.added.length > 0 && <span style={{ color: '#4ade80', marginRight: 8 }}>+{diff.added.length} added</span>}
                          {diff.removed.length > 0 && <span style={{ color: TOKENS.danger, marginRight: 8 }}>-{diff.removed.length} removed</span>}
                          {diff.modified.length > 0 && <span style={{ color: '#facc15' }}>{diff.modified.length} changed</span>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
