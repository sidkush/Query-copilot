import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TOKENS } from './tokens';
import { useStore } from '../../store';

const TABS = ['General', 'Agent', 'Layout', 'Export'];

const REFRESH_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
];

const DATE_RANGE_OPTIONS = [
  'All Time', 'Today', 'This Week', 'This Month', 'This Quarter', 'This Year',
];

const inputStyle = {
  background: TOKENS.bg.surface,
  border: `1px solid ${TOKENS.border.default}`,
  borderRadius: TOKENS.radius.md,
  padding: '8px 12px',
  color: TOKENS.text.primary,
  fontSize: 13,
  outline: 'none',
  width: '100%',
  transition: `border-color ${TOKENS.transition}`,
};

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  paddingRight: 28,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: TOKENS.text.secondary,
  marginBottom: 6,
  display: 'block',
};

export default function SettingsModal({ dashboard, onSave, onClose }) {
  const existing = dashboard?.settings || {};
  const agentAutoExecute = useStore((s) => s.agentAutoExecute);
  const setAgentAutoExecute = useStore((s) => s.setAgentAutoExecute);
  const [activeTab, setActiveTab] = useState('General');
  const [settings, setSettings] = useState({
    autoRefreshInterval: existing.autoRefreshInterval ?? 0,
    timezone: existing.timezone ?? '',
    defaultDateRange: existing.defaultDateRange ?? 'All Time',
    tileGap: existing.tileGap ?? 12,
    tilePadding: existing.tilePadding ?? 16,
    animationSpeed: existing.animationSpeed ?? 'normal',
    exportFormat: existing.exportFormat ?? 'pdf',
    pageOrientation: existing.pageOrientation ?? 'landscape',
    includeTimestamp: existing.includeTimestamp ?? true,
  });

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    onSave?.(settings);
    onClose?.();
  };

  // Escape key to close [ADV-FIX H4]
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--modal-overlay)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl shadow-2xl"
        style={{
          background: TOKENS.bg.elevated,
          border: `1px solid ${TOKENS.border.hover}`,
          width: 480,
          maxHeight: '80vh',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${TOKENS.border.default}` }}>
          <h2 className="text-base font-semibold" style={{ color: TOKENS.text.primary }}>Dashboard Settings</h2>
          <button onClick={onClose} className="cursor-pointer" style={{ color: TOKENS.text.muted, background: 'none', border: 'none', fontSize: 18 }}>×</button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 px-6 pt-3" style={{ borderBottom: `1px solid ${TOKENS.border.default}` }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 pb-2.5 text-xs font-semibold cursor-pointer"
              style={{
                color: activeTab === tab ? TOKENS.accent : TOKENS.text.muted,
                background: 'none', border: 'none',
                borderBottom: activeTab === tab ? `2px solid ${TOKENS.accent}` : '2px solid transparent',
                transition: `all ${TOKENS.transition}`,
              }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6" style={{ maxHeight: 'calc(80vh - 160px)', overflowY: 'auto' }}>
          {activeTab === 'General' && (
            <div className="flex flex-col gap-5">
              <div>
                <label style={labelStyle}>Auto-Refresh Interval</label>
                <select style={selectStyle} value={settings.autoRefreshInterval}
                  onChange={e => update('autoRefreshInterval', Number(e.target.value))}>
                  {REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Timezone</label>
                <input style={inputStyle} placeholder="e.g. America/New_York"
                  value={settings.timezone} onChange={e => update('timezone', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Default Date Range</label>
                <select style={selectStyle} value={settings.defaultDateRange}
                  onChange={e => update('defaultDateRange', e.target.value)}>
                  {DATE_RANGE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'Agent' && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <label style={{ ...labelStyle, marginBottom: 2 }}>Auto-execute SQL queries</label>
                  <p style={{ fontSize: 11, color: TOKENS.text.muted, margin: 0 }}>
                    When enabled, the agent runs SQL automatically. Disable to review each query before execution.
                  </p>
                </div>
                <button
                  onClick={() => setAgentAutoExecute(!agentAutoExecute)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none',
                    background: agentAutoExecute ? TOKENS.accent : TOKENS.bg.surface,
                    cursor: 'pointer', position: 'relative', flexShrink: 0,
                    transition: `background ${TOKENS.transition}`,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: agentAutoExecute ? 23 : 3,
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    transition: `left ${TOKENS.transition}`,
                  }} />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'Layout' && (
            <div className="flex flex-col gap-5">
              <div>
                <label style={labelStyle}>Tile Gap ({settings.tileGap}px)</label>
                <input type="range" min={4} max={24} step={2} value={settings.tileGap}
                  onChange={e => update('tileGap', Number(e.target.value))}
                  style={{ width: '100%', accentColor: TOKENS.accent }} />
              </div>
              <div>
                <label style={labelStyle}>Tile Padding ({settings.tilePadding}px)</label>
                <input type="range" min={8} max={32} step={4} value={settings.tilePadding}
                  onChange={e => update('tilePadding', Number(e.target.value))}
                  style={{ width: '100%', accentColor: TOKENS.accent }} />
              </div>
              <div>
                <label style={labelStyle}>Animation Speed</label>
                <div className="flex gap-2">
                  {['fast', 'normal', 'slow'].map(speed => (
                    <button key={speed} onClick={() => update('animationSpeed', speed)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer capitalize"
                      style={{
                        background: settings.animationSpeed === speed ? TOKENS.accentGlow : TOKENS.bg.surface,
                        color: settings.animationSpeed === speed ? TOKENS.accent : TOKENS.text.secondary,
                        border: `1px solid ${settings.animationSpeed === speed ? TOKENS.accent : TOKENS.border.default}`,
                        transition: `all ${TOKENS.transition}`,
                      }}>
                      {speed}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Export' && (
            <div className="flex flex-col gap-5">
              <div>
                <label style={labelStyle}>Default Format</label>
                <div className="flex gap-2">
                  {['pdf', 'png'].map(fmt => (
                    <button key={fmt} onClick={() => update('exportFormat', fmt)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer uppercase"
                      style={{
                        background: settings.exportFormat === fmt ? TOKENS.accentGlow : TOKENS.bg.surface,
                        color: settings.exportFormat === fmt ? TOKENS.accent : TOKENS.text.secondary,
                        border: `1px solid ${settings.exportFormat === fmt ? TOKENS.accent : TOKENS.border.default}`,
                        transition: `all ${TOKENS.transition}`,
                      }}>
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Page Orientation</label>
                <div className="flex gap-2">
                  {['landscape', 'portrait'].map(ori => (
                    <button key={ori} onClick={() => update('pageOrientation', ori)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer capitalize"
                      style={{
                        background: settings.pageOrientation === ori ? TOKENS.accentGlow : TOKENS.bg.surface,
                        color: settings.pageOrientation === ori ? TOKENS.accent : TOKENS.text.secondary,
                        border: `1px solid ${settings.pageOrientation === ori ? TOKENS.accent : TOKENS.border.default}`,
                        transition: `all ${TOKENS.transition}`,
                      }}>
                      {ori}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={settings.includeTimestamp}
                  onChange={e => update('includeTimestamp', e.target.checked)}
                  style={{ accentColor: TOKENS.accent }} />
                <label style={{ ...labelStyle, marginBottom: 0 }}>Include export timestamp</label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: `1px solid ${TOKENS.border.default}` }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
            style={{ background: 'transparent', color: TOKENS.text.secondary, border: `1px solid ${TOKENS.border.default}` }}>
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: TOKENS.accent, color: '#fff', border: 'none' }}>
            Save Settings
          </button>
        </div>
      </motion.div>
    </div>
  );
}
