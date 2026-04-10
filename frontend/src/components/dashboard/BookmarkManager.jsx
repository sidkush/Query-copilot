import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from './tokens';
import { api } from '../../api';

export default function BookmarkManager({ dashboardId, currentState, onApply, onClose, tabNames = {} }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

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
      const bm = await api.saveBookmark(dashboardId, name.trim(), currentState);
      setBookmarks(prev => [...prev, bm]);
      setName('');
    } catch (err) {
      console.error('Save bookmark failed:', err);
    } finally {
      setSaving(false);
    }
  }, [dashboardId, name, currentState]);

  const handleDelete = useCallback(async (bmId) => {
    try {
      await api.deleteBookmark(dashboardId, bmId);
      setBookmarks(prev => prev.filter(b => b.id !== bmId));
    } catch (err) {
      console.error('Delete bookmark failed:', err);
    }
  }, [dashboardId]);

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
              const rangeLabel = s.globalFilters?.range && s.globalFilters.range !== 'all_time' ? s.globalFilters.range.replace(/_/g, ' ') : '';
              const details = [tabLabel, rangeLabel, filterCount > 0 ? `${filterCount} filter${filterCount > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');

              return (
                <div key={bm.id} style={{ padding: '10px 0', borderBottom: `1px solid ${TOKENS.border.default}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => { onApply(bm.state); onClose(); }} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: TOKENS.text.primary, fontSize: 13, fontWeight: 500 }}>
                      {bm.name}
                    </button>
                    <span style={{ fontSize: 11, color: TOKENS.text.muted, flexShrink: 0 }}>
                      {bm.created_at ? new Date(bm.created_at).toLocaleDateString() : ''}
                    </span>
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
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
