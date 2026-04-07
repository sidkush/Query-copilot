import { useState, useEffect, useRef } from 'react';
import { TOKENS } from './tokens';
import { api } from '../../api';

const OPERATORS = ['>', '<', '>=', '<=', '==', '!='];
const FREQ_OPTIONS = [
  { label: '15 min', value: 900 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: 'Daily', value: 86400 },
  { label: 'Weekly', value: 604800 },
];

export default function AlertManager({ connId, dashboardId, onClose }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [nlInput, setNlInput] = useState('');
  const [error, setError] = useState(null);
  const [checkingId, setCheckingId] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const nlRef = useRef(null);

  // New alert form state
  const [form, setForm] = useState({
    name: '', sql: '', column: '', operator: '>', threshold: 0, frequency_seconds: 3600,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.listAlerts();
        if (!cancelled) setAlerts(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadAlerts = async () => {
    try {
      const data = await api.listAlerts();
      setAlerts(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleParseNL = async () => {
    if (!nlInput.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const parsed = await api.parseAlertCondition(nlInput.trim(), connId);
      setForm({
        name: parsed.name || '',
        sql: parsed.sql || '',
        column: parsed.column || '',
        operator: parsed.operator || '>',
        threshold: parsed.threshold ?? 0,
        frequency_seconds: parsed.frequency_seconds || 3600,
      });
      setCreating(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !form.sql || !form.column) {
      setError('Name, SQL, and column are required');
      return;
    }
    if (isNaN(form.threshold)) {
      setError('Threshold must be a valid number');
      return;
    }
    setError(null);
    try {
      await api.createAlert({
        ...form,
        conn_id: connId,
        dashboard_id: dashboardId,
        condition_text: nlInput,
      });
      setCreating(false);
      setNlInput('');
      setForm({ name: '', sql: '', column: '', operator: '>', threshold: 0, frequency_seconds: 3600 });
      await loadAlerts();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggle = async (alert) => {
    const newStatus = alert.status === 'active' ? 'paused' : 'active';
    try {
      await api.updateAlert(alert.id, { status: newStatus });
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, status: newStatus } : a));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCheck = async (alertId) => {
    setCheckingId(alertId);
    setCheckResult(null);
    try {
      const result = await api.checkAlert(alertId);
      setCheckResult(result);
      await loadAlerts();
    } catch (e) {
      setError(e.message);
    } finally {
      setCheckingId(null);
    }
  };

  const relTime = (iso) => {
    if (!iso) return 'Never';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border"
        onClick={e => e.stopPropagation()}
        style={{ background: TOKENS.bg.surface, borderColor: TOKENS.border.default }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b"
          style={{ background: TOKENS.bg.surface, borderColor: TOKENS.border.default }}>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              style={{ color: TOKENS.warning }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <h2 className="text-lg font-semibold" style={{ color: TOKENS.text.primary }}>Alerts</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: TOKENS.bg.elevated, color: TOKENS.text.muted }}>
              {alerts.filter(a => a.status === 'active').length} active
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg cursor-pointer"
            style={{ color: TOKENS.text.muted, background: TOKENS.bg.elevated }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* NL Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium" style={{ color: TOKENS.text.muted }}>
              Describe your alert condition in plain English
            </label>
            <div className="flex gap-2">
              <input ref={nlRef} value={nlInput} onChange={e => setNlInput(e.target.value)}
                placeholder='e.g., "Alert me when daily revenue drops below $10,000"'
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.primary }}
                onKeyDown={e => e.key === 'Enter' && handleParseNL()}
                disabled={parsing} />
              <button onClick={handleParseNL} disabled={parsing || !nlInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                style={{ background: TOKENS.accent, color: '#fff' }}>
                {parsing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : 'Parse'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} style={{ color: '#f87171', cursor: 'pointer', background: 'none', border: 'none' }}>x</button>
            </div>
          )}

          {/* Check result */}
          {checkResult && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{
                background: checkResult.triggered ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${checkResult.triggered ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                color: checkResult.triggered ? '#f87171' : '#4ade80',
              }}>
              <span>{checkResult.triggered ? 'TRIGGERED' : 'OK'}: {checkResult.column} = {checkResult.value} {checkResult.operator} {checkResult.threshold}</span>
              <button onClick={() => setCheckResult(null)} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}>x</button>
            </div>
          )}

          {/* Create form */}
          {creating && (
            <div className="p-4 rounded-xl border space-y-3"
              style={{ background: TOKENS.bg.elevated, borderColor: TOKENS.border.default }}>
              <div className="text-sm font-medium" style={{ color: TOKENS.text.primary }}>Configure Alert</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs" style={{ color: TOKENS.text.muted }}>Name</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded text-sm outline-none mt-1"
                    style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.primary }} />
                </div>
                <div>
                  <label className="text-xs" style={{ color: TOKENS.text.muted }}>Column to monitor</label>
                  <input value={form.column} onChange={e => setForm(p => ({ ...p, column: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded text-sm outline-none mt-1"
                    style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.primary }} />
                </div>
              </div>
              <div>
                <label className="text-xs" style={{ color: TOKENS.text.muted }}>SQL Query</label>
                <textarea value={form.sql} onChange={e => setForm(p => ({ ...p, sql: e.target.value }))}
                  rows={3} className="w-full px-2.5 py-1.5 rounded text-sm outline-none mt-1 font-mono resize-y"
                  style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.primary }} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs" style={{ color: TOKENS.text.muted }}>Operator</label>
                  <select value={form.operator} onChange={e => setForm(p => ({ ...p, operator: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded text-sm outline-none mt-1"
                    style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.primary }}>
                    {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs" style={{ color: TOKENS.text.muted }}>Threshold</label>
                  <input type="number" value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                    className="w-full px-2.5 py-1.5 rounded text-sm outline-none mt-1"
                    style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.primary }} />
                </div>
                <div>
                  <label className="text-xs" style={{ color: TOKENS.text.muted }}>Check frequency</label>
                  <select value={form.frequency_seconds} onChange={e => setForm(p => ({ ...p, frequency_seconds: parseInt(e.target.value) }))}
                    className="w-full px-2.5 py-1.5 rounded text-sm outline-none mt-1"
                    style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.primary }}>
                    {FREQ_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleCreate}
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                  style={{ background: TOKENS.accent, color: '#fff' }}>
                  Create Alert
                </button>
                <button onClick={() => { setCreating(false); setForm({ name: '', sql: '', column: '', operator: '>', threshold: 0, frequency_seconds: 3600 }); }}
                  className="px-4 py-2 rounded-lg text-sm cursor-pointer"
                  style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Alert list */}
          {loading ? (
            <div className="text-center py-8 text-sm" style={{ color: TOKENS.text.muted }}>Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                style={{ color: TOKENS.text.muted }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <div className="text-sm" style={{ color: TOKENS.text.muted }}>No alerts yet</div>
              <div className="text-xs" style={{ color: TOKENS.text.muted }}>
                Type a condition above like "Alert me when revenue drops below $50K"
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(alert => (
                <div key={alert.id} className="flex items-center gap-3 p-3 rounded-xl border"
                  style={{ background: TOKENS.bg.elevated, borderColor: TOKENS.border.default }}>
                  {/* Status dot */}
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: alert.status === 'active' ? TOKENS.success : TOKENS.text.muted }} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: TOKENS.text.primary }}>
                      {alert.name}
                    </div>
                    <div className="text-xs truncate" style={{ color: TOKENS.text.muted }}>
                      {alert.column} {alert.operator} {alert.threshold}
                      {' '}&middot;{' '}
                      {FREQ_OPTIONS.find(f => f.value === alert.frequency_seconds)?.label || `${alert.frequency_seconds}s`}
                      {alert.trigger_count > 0 && (
                        <span style={{ color: TOKENS.warning }}> &middot; Triggered {alert.trigger_count}x</span>
                      )}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: TOKENS.text.muted }}>
                      Last checked: {relTime(alert.last_checked)}
                      {alert.last_triggered && <span style={{ color: TOKENS.warning }}> &middot; Last triggered: {relTime(alert.last_triggered)}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => handleCheck(alert.id)} disabled={checkingId === alert.id}
                      title="Check now" className="p-1.5 rounded-lg cursor-pointer"
                      style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary }}>
                      {checkingId === alert.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-transparent border-t-current rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 12v.01" />
                        </svg>
                      )}
                    </button>
                    <button onClick={() => handleToggle(alert)}
                      title={alert.status === 'active' ? 'Pause' : 'Resume'}
                      className="p-1.5 rounded-lg cursor-pointer"
                      style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: alert.status === 'active' ? TOKENS.warning : TOKENS.success }}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        {alert.status === 'active' ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                        )}
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(alert.id)}
                      title="Delete" className="p-1.5 rounded-lg cursor-pointer"
                      style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: '#f87171' }}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
