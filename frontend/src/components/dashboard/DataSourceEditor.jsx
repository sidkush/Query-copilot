import { useState, useCallback, useMemo } from 'react';
import { TOKENS } from './tokens';
import { api } from '../../api';
import { findCommonColumns } from '../../lib/dataBlender';

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: TOKENS.bg.surface,
  border: `1px solid ${TOKENS.border.default}`,
  borderRadius: TOKENS.radius.sm,
  color: TOKENS.text.primary,
  fontSize: '14px',
  outline: 'none',
  transition: TOKENS.transition,
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: TOKENS.text.secondary,
  marginBottom: '6px',
};

function generateId() {
  return 'ds_' + Math.random().toString(36).slice(2, 10);
}

const LABELS = ['B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function DataSourceEditor({
  dataSources, blendConfig, primaryColumns = [],
  dashboardId, tileId, connId,
  onChange, onBlendConfigChange,
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [runningId, setRunningId] = useState(null);
  const [runError, setRunError] = useState(null);

  const sources = useMemo(() => dataSources || [], [dataSources]);
  const config = blendConfig || { joinKey: '', enabled: false };
  const commonCols = findCommonColumns(primaryColumns, sources);

  const handleAddSource = useCallback(() => {
    const label = LABELS[sources.length] || `S${sources.length + 2}`;
    const newSource = { id: generateId(), label, sql: '', columns: [], rows: [] };
    onChange([...sources, newSource]);
    setActiveTab(sources.length);
  }, [sources, onChange]);

  const handleRemoveSource = useCallback((idx) => {
    const updated = sources.filter((_, i) => i !== idx);
    onChange(updated);
    setActiveTab(Math.max(0, idx - 1));
  }, [sources, onChange]);

  const handleSourceChange = useCallback((idx, field, value) => {
    const updated = sources.map((s, i) => i === idx ? { ...s, [field]: value } : s);
    onChange(updated);
  }, [sources, onChange]);

  const handleRunSource = useCallback(async (idx) => {
    const source = sources[idx];
    if (!source?.sql?.trim()) return;
    setRunningId(source.id);
    setRunError(null);
    try {
      const result = await api.refreshTile(dashboardId, tileId, connId, null, source.id);
      handleSourceChange(idx, 'columns', result.columns || []);
      handleSourceChange(idx, 'rows', result.rows || []);
    } catch (err) {
      setRunError(err.message || 'Query failed');
    } finally {
      setRunningId(null);
    }
  }, [sources, dashboardId, tileId, connId, handleSourceChange]);

  return (
    <div>
      {/* Source tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: TOKENS.text.muted, padding: '4px 6px', borderRadius: 6, background: TOKENS.bg.surface }}>
          A (primary)
        </span>
        {sources.map((src, idx) => (
          <button key={src.id} onClick={() => setActiveTab(idx)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              background: activeTab === idx ? TOKENS.accentGlow : TOKENS.bg.surface,
              border: `1px solid ${activeTab === idx ? TOKENS.accent : TOKENS.border.default}`,
              color: activeTab === idx ? TOKENS.accentLight : TOKENS.text.secondary,
            }}>
            {src.label}
            <span onClick={(e) => { e.stopPropagation(); handleRemoveSource(idx); }}
              style={{ marginLeft: 6, color: TOKENS.text.muted, cursor: 'pointer' }}>x</span>
          </button>
        ))}
        <button onClick={handleAddSource}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
            background: 'transparent', border: `1px dashed ${TOKENS.border.default}`, color: TOKENS.text.muted,
          }}>+</button>
      </div>

      {/* Active source editor */}
      {sources.length > 0 && sources[activeTab] && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: '0 0 70px' }}>
              <label style={{ ...labelStyle, fontSize: 10 }}>Label</label>
              <input value={sources[activeTab].label}
                onChange={e => handleSourceChange(activeTab, 'label', e.target.value)}
                style={{ ...inputStyle, textAlign: 'center' }} maxLength={3} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, fontSize: 10 }}>
                SQL
                {sources[activeTab].rows?.length > 0 && (
                  <span style={{ color: TOKENS.success, marginLeft: 8, textTransform: 'none', fontWeight: 400 }}>
                    {sources[activeTab].rows.length} rows
                  </span>
                )}
              </label>
              <textarea
                value={sources[activeTab].sql || ''}
                onChange={e => handleSourceChange(activeTab, 'sql', e.target.value)}
                rows={3}
                style={{ ...inputStyle, fontFamily: '"JetBrains Mono", monospace', fontSize: 13, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="SELECT ..."
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => handleRunSource(activeTab)}
              disabled={runningId === sources[activeTab].id || !sources[activeTab].sql?.trim()}
              style={{
                padding: '6px 14px', borderRadius: TOKENS.radius.sm,
                background: TOKENS.success, color: '#fff', border: 'none',
                fontSize: 13, fontWeight: 600,
                cursor: (runningId === sources[activeTab].id || !sources[activeTab].sql?.trim()) ? 'wait' : 'pointer',
                opacity: (runningId === sources[activeTab].id || !sources[activeTab].sql?.trim()) ? 0.5 : 1,
              }}>
              {runningId === sources[activeTab].id ? 'Running...' : 'Run'}
            </button>
            {runError && <span style={{ fontSize: 12, color: TOKENS.danger }}>{runError}</span>}
          </div>
        </div>
      )}

      {/* Blend config */}
      {sources.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${TOKENS.border.default}` }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: TOKENS.text.primary, cursor: 'pointer' }}>
            <input type="checkbox" checked={config.enabled}
              onChange={e => onBlendConfigChange({ ...config, enabled: e.target.checked })}
              style={{ accentColor: TOKENS.accent }} />
            Enable Blending
          </label>
          {config.enabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: TOKENS.text.muted }}>Join on:</span>
              <select
                value={config.joinKey}
                onChange={e => onBlendConfigChange({ ...config, joinKey: e.target.value })}
                style={{ ...inputStyle, width: 'auto', minWidth: 120, cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>
                <option value="">-- select --</option>
                {commonCols.map(col => <option key={col} value={col}>{col}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {sources.length === 0 && (
        <p style={{ fontSize: 12, color: TOKENS.text.muted }}>
          Add a data source to blend multiple queries into one chart.
        </p>
      )}
    </div>
  );
}
