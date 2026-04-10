import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TOKENS } from './tokens';
import { api } from '../../api';

const EXPIRY_OPTIONS = [
  { value: 24, label: '1 day' },
  { value: 72, label: '3 days' },
  { value: 168, label: '1 week' },
  { value: 720, label: '30 days' },
];

export default function ShareModal({ dashboardId, dashboardName, currentToken, onClose, onTokenCreated }) {
  const [expiresHours, setExpiresHours] = useState(168);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [shareUrl, setShareUrl] = useState(
    currentToken ? `${window.location.origin}/shared/${currentToken}` : ''
  );
  const [copied, setCopied] = useState(false);

  // Escape key to close [ADV-FIX H4]
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await api.shareDashboard(dashboardId, expiresHours);
      const url = `${window.location.origin}/shared/${result.token}`;
      setShareUrl(url);
      onTokenCreated?.(result.token);
    } catch (err) {
      console.error('Share failed:', err);
      setError(err?.message || 'Failed to generate share link');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async () => {
    if (!currentToken) return;
    setError(null);
    try {
      await api.revokeShare(dashboardId, currentToken);
      setShareUrl('');
      onTokenCreated?.(null);
    } catch (err) {
      console.error('Revoke failed:', err);
      setError(err?.message || 'Failed to revoke share link');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--modal-overlay)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl shadow-2xl w-[420px]"
        style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.hover}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${TOKENS.border.default}` }}>
          <h2 className="text-base font-semibold" style={{ color: TOKENS.text.primary }}>Share Dashboard</h2>
          <button onClick={onClose} className="cursor-pointer" style={{ color: TOKENS.text.muted, background: 'none', border: 'none', fontSize: 18 }}>×</button>
        </div>

        <div className="p-6">
          <p className="text-xs mb-4" style={{ color: TOKENS.text.secondary }}>
            Generate a read-only link for <strong style={{ color: TOKENS.text.primary }}>{dashboardName}</strong>. Anyone with the link can view without logging in.
          </p>

          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              {error}
            </div>
          )}

          {shareUrl ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3 py-2 rounded-lg text-xs"
                  style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.primary, outline: 'none' }}
                />
                <button onClick={handleCopy}
                  className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
                  style={{ background: copied ? TOKENS.success : TOKENS.accent, color: '#fff', border: 'none' }}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <button onClick={handleRevoke}
                className="text-xs cursor-pointer"
                style={{ color: TOKENS.danger, background: 'none', border: 'none', padding: 0 }}>
                Revoke this link
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: TOKENS.text.secondary }}>Link expires in</label>
                <div className="flex gap-2">
                  {EXPIRY_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setExpiresHours(opt.value)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer"
                      style={{
                        background: expiresHours === opt.value ? TOKENS.accentGlow : TOKENS.bg.surface,
                        border: `1px solid ${expiresHours === opt.value ? TOKENS.accent : TOKENS.border.default}`,
                        color: expiresHours === opt.value ? TOKENS.accent : TOKENS.text.secondary,
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleGenerate} disabled={generating}
                className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer"
                style={{ background: TOKENS.accent, color: '#fff', border: 'none', opacity: generating ? 0.6 : 1 }}>
                {generating ? 'Generating...' : 'Generate Share Link'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
