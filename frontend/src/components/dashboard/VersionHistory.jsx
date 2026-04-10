import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TOKENS } from './tokens';
import { api } from '../../api';

function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function VersionHistory({ dashboardId, onClose, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);
  const [error, setError] = useState(null);

  // Escape key to close [ADV-FIX H4]
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.listVersions(dashboardId);
        setVersions((res.versions || []).reverse()); // newest first
      } catch (err) {
        console.error('Failed to load versions:', err);
        setError(err?.message || 'Failed to load version history');
      } finally {
        setLoading(false);
      }
    })();
  }, [dashboardId]);

  const handleRestore = async (versionId) => {
    if (!confirm('Restore this version? Current state will be saved as a snapshot first.')) return;
    setRestoring(versionId);
    setError(null);
    try {
      const restored = await api.restoreVersion(dashboardId, versionId);
      onRestore?.(restored);
      onClose();
    } catch (err) {
      console.error('Restore failed:', err);
      setError(err?.message || 'Failed to restore version');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--modal-overlay)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl shadow-2xl w-[460px] max-h-[70vh] flex flex-col"
        style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.hover}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${TOKENS.border.default}` }}>
          <h2 className="text-base font-semibold" style={{ color: TOKENS.text.primary }}>Version History</h2>
          <button onClick={onClose} className="cursor-pointer"
            style={{ color: TOKENS.text.muted, background: 'none', border: 'none', fontSize: 18 }}>×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-center py-8" style={{ color: TOKENS.text.muted, fontSize: 13 }}>
              Loading versions...
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8" style={{ color: TOKENS.text.muted, fontSize: 13 }}>
              No versions yet. Versions are created automatically when you modify the dashboard.
            </div>
          ) : (
            <div className="space-y-1">
              {versions.map((v, i) => (
                <div key={v.id}
                  className="flex items-center justify-between px-4 py-3 rounded-lg"
                  style={{
                    background: i === 0 ? TOKENS.accentGlow : 'transparent',
                    border: `1px solid ${i === 0 ? TOKENS.accent + '33' : 'transparent'}`,
                    transition: `background ${TOKENS.transition}`,
                  }}
                  onMouseEnter={e => { if (i !== 0) e.currentTarget.style.background = TOKENS.bg.surface; }}
                  onMouseLeave={e => { if (i !== 0) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="flex items-center gap-3">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full"
                        style={{ background: i === 0 ? TOKENS.accent : TOKENS.text.muted }} />
                      {i < versions.length - 1 && (
                        <div className="w-px h-6 mt-1" style={{ background: TOKENS.border.default }} />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-medium" style={{ color: TOKENS.text.primary }}>
                        {v.label || (i === 0 ? 'Latest version' : 'Version snapshot')}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: TOKENS.text.muted }}>
                        {relTime(v.timestamp)}
                        <span className="ml-2" style={{ opacity: 0.6 }}>
                          {new Date(v.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  {i > 0 && (
                    <button
                      onClick={() => handleRestore(v.id)}
                      disabled={restoring === v.id}
                      className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer"
                      style={{
                        background: TOKENS.bg.surface,
                        border: `1px solid ${TOKENS.border.default}`,
                        color: TOKENS.text.secondary,
                        opacity: restoring === v.id ? 0.5 : 1,
                      }}
                    >
                      {restoring === v.id ? 'Restoring...' : 'Restore'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
