import { useState, useMemo } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';
import { useStore } from '../../store';

/* ── Shared styles ─────────────────────────────────────────── */

const panelStyle = {
  background: TOKENS.bg.surface,
  border: `1px solid ${TOKENS.border.default}`,
  borderRadius: TOKENS.radius.lg,
  overflow: 'hidden',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: `1px solid ${TOKENS.border.default}`,
};

const titleStyle = {
  fontSize: 13,
  fontFamily: TOKENS.tile.headerFont,
  fontWeight: 600,
  color: TOKENS.text.primary,
};

const bodyStyle = {
  padding: '12px 14px',
  maxHeight: 420,
  overflowY: 'auto',
};

const statGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
  gap: 10,
};

const statCardStyle = {
  padding: '10px 12px',
  borderRadius: TOKENS.radius.md,
  background: TOKENS.bg.elevated,
  border: `1px solid ${TOKENS.border.default}`,
};

const statValueStyle = {
  fontSize: 18,
  fontWeight: 700,
  fontFamily: TOKENS.tile.headerFont,
  color: TOKENS.text.primary,
  lineHeight: 1.2,
};

const statLabelStyle = {
  fontSize: 10,
  color: TOKENS.text.muted,
  marginTop: 2,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};

const thStyle = {
  padding: '6px 10px',
  textAlign: 'left',
  borderBottom: `1px solid ${TOKENS.border.default}`,
  color: TOKENS.text.muted,
  fontWeight: 600,
  fontSize: 11,
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '5px 10px',
  borderBottom: `1px solid ${TOKENS.border.default}`,
  color: TOKENS.text.secondary,
};

const inputStyle = {
  width: 72,
  padding: '3px 6px',
  borderRadius: TOKENS.radius.sm,
  border: `1px solid ${TOKENS.border.default}`,
  background: TOKENS.bg.elevated,
  color: TOKENS.text.primary,
  fontSize: 12,
  outline: 'none',
};

const btnPrimary = {
  padding: '6px 16px',
  borderRadius: TOKENS.radius.md,
  background: TOKENS.accent,
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  fontFamily: TOKENS.tile.headerFont,
  transition: `background ${TOKENS.transition}`,
};

const btnSecondary = {
  padding: '6px 12px',
  borderRadius: TOKENS.radius.md,
  background: 'transparent',
  color: TOKENS.text.secondary,
  border: `1px solid ${TOKENS.border.default}`,
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  transition: `all ${TOKENS.transition}`,
};

const selectStyle = {
  padding: '4px 8px',
  borderRadius: TOKENS.radius.sm,
  background: TOKENS.bg.elevated,
  border: `1px solid ${TOKENS.border.default}`,
  color: TOKENS.text.primary,
  fontSize: 12,
  fontFamily: TOKENS.tile.headerFont,
  cursor: 'pointer',
  outline: 'none',
  transition: `border-color ${TOKENS.transition}`,
};

const btnClose = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: 'none',
  background: 'transparent',
  color: TOKENS.text.muted,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: `background ${TOKENS.transition}`,
};

/* ── Stage content renderers ───────────────────────────────── */

function IngestContent({ data, onRunStage }) {
  const [rowLimit, setRowLimit] = useState(10);
  const tables = data?.tables || [];
  const totalRows = data?.rowCount || tables.reduce((s, t) => s + (typeof t.rows === 'number' ? t.rows : 0), 0);
  const totalFeatures = data?.totalFeatures || data?.columnCount || 0;
  const preview = data?.preview || [];
  const visibleRows = preview.slice(0, rowLimit);

  const TYPE_BADGES = {
    numeric: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'NUM' },
    categorical: { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', label: 'CAT' },
    datetime: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', label: 'DATE' },
    text: { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee', label: 'TEXT' },
    pii: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'PII' },
    unknown: { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: '?' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stat summary row */}
      <div style={statGridStyle}>
        <div style={statCardStyle}>
          <div style={statValueStyle}>{tables.length || 1}</div>
          <div style={statLabelStyle}>Tables</div>
        </div>
        <div style={statCardStyle}>
          <div style={statValueStyle}>{totalRows > 0 ? totalRows.toLocaleString() : 'Loaded'}</div>
          <div style={statLabelStyle}>Rows</div>
        </div>
        <div style={statCardStyle}>
          <div style={statValueStyle}>{totalFeatures}</div>
          <div style={statLabelStyle}>Features</div>
        </div>
      </div>

      {/* Data preview table */}
      {preview.length > 0 && (
        <div>
          {/* Header with row selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Column Preview
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: TOKENS.text.muted }}>Show</span>
              <select
                value={rowLimit}
                onChange={(e) => setRowLimit(Number(e.target.value))}
                style={{
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: TOKENS.radius.sm,
                  background: TOKENS.bg.elevated,
                  border: `1px solid ${TOKENS.border.default}`,
                  color: TOKENS.text.primary,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>All</option>
              </select>
              <span style={{ fontSize: 10, color: TOKENS.text.muted }}>
                of {preview.length}
              </span>
            </div>
          </div>

          {/* Table */}
          <div style={{ borderRadius: TOKENS.radius.md, border: `1px solid ${TOKENS.border.default}`, overflow: 'hidden' }}>
            <table style={{ ...tableStyle, fontSize: 11 }}>
              <thead>
                <tr style={{ background: TOKENS.bg.elevated }}>
                  <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px' }}>Column</th>
                  <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px' }}>Type</th>
                  <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px', textAlign: 'right' }}>Unique</th>
                  <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px', textAlign: 'right' }}>Null %</th>
                  <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px', textAlign: 'right' }}>Range / Stats</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((col, i) => {
                  const badge = TYPE_BADGES[col.type] || TYPE_BADGES.unknown;
                  const hasStats = col.min != null && col.max != null;
                  return (
                    <tr
                      key={col.name}
                      style={{
                        background: i % 2 === 0 ? 'transparent' : `${TOKENS.bg.elevated}40`,
                        transition: 'background 150ms',
                      }}
                    >
                      <td style={{ ...tdStyle, padding: '6px 10px', fontWeight: 500, color: TOKENS.text.primary, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>
                        {col.name}
                      </td>
                      <td style={{ ...tdStyle, padding: '6px 10px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          background: badge.bg,
                          color: badge.color,
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, padding: '6px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, color: TOKENS.text.secondary }}>
                        {col.unique > 0 ? col.unique.toLocaleString() : '-'}
                      </td>
                      <td style={{ ...tdStyle, padding: '6px 10px', textAlign: 'right' }}>
                        {col.nullPct > 0 ? (
                          <span style={{ color: col.nullPct > 10 ? TOKENS.danger : TOKENS.warning, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10 }}>
                            {col.nullPct}%
                          </span>
                        ) : (
                          <span style={{ color: TOKENS.success, fontSize: 10 }}>0%</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, padding: '6px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, color: TOKENS.text.muted }}>
                        {hasStats ? `${Number(col.min).toFixed(1)} .. ${Number(col.max).toFixed(1)}` : col.type === 'categorical' ? `${col.unique} classes` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Truncation notice */}
          {preview.length > rowLimit && (
            <div style={{ textAlign: 'center', padding: '6px 0', fontSize: 10, color: TOKENS.text.muted }}>
              +{preview.length - rowLimit} more columns
            </div>
          )}
        </div>
      )}

      {/* Run action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button style={btnPrimary} onClick={() => onRunStage?.('ingest', {})}>
          Load Data
        </button>
      </div>
    </div>
  );
}

function CleanContent({ data, onRunStage }) {
  const features = data?.features || data?.preview || [];
  const quality = data?.qualityScore ?? (features.length > 0
    ? Math.round(100 - features.reduce((s, f) => s + (f.missing_pct || f.nullPct || 0), 0) / Math.max(features.length, 1))
    : null);
  const [globalStrategy, setGlobalStrategy] = useState(data?.imputationStrategy || 'median');
  const [perColumn, setPerColumn] = useState(() =>
    Object.fromEntries(features.map(f => [f.name, 'auto']))
  );
  const [scaling, setScaling] = useState(data?.scaling || 'standard');
  const [powerTransform, setPowerTransform] = useState(data?.powerTransform || 'none');
  const [outlierTreatment, setOutlierTreatment] = useState(data?.outlierTreatment || 'none');

  const setColStrategy = (name, strategy) => {
    setPerColumn(prev => ({ ...prev, [name]: strategy }));
  };

  const STRATEGY_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'median', label: 'Median Fill' },
    { value: 'mean', label: 'Mean Fill' },
    { value: 'mode', label: 'Mode Fill' },
    { value: 'zero', label: 'Zero Fill' },
    { value: 'ffill', label: 'Forward Fill' },
    { value: 'bfill', label: 'Backward Fill' },
    { value: 'knn', label: 'KNN Imputer' },
    { value: 'mice', label: 'MICE (Iterative)' },
    { value: 'drop_col', label: 'Drop Column' },
    { value: 'drop_rows', label: 'Drop Rows' },
  ];

  const TYPE_BADGES = {
    numeric: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'NUM' },
    categorical: { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', label: 'CAT' },
    datetime: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', label: 'DATE' },
    text: { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee', label: 'TEXT' },
    pii: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'PII' },
    unknown: { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: '?' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Quality score bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Data Quality</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: quality >= 90 ? TOKENS.success : quality >= 70 ? TOKENS.warning : TOKENS.danger, fontFamily: TOKENS.tile.headerFont }}>
              {quality != null ? `${quality}%` : 'Analyze data first'}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: TOKENS.bg.elevated, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: 3,
              width: quality != null ? `${quality}%` : '0%',
              background: quality >= 90 ? TOKENS.success : quality >= 70 ? TOKENS.warning : TOKENS.danger,
              transition: 'width 0.4s ease-out',
            }} />
          </div>
        </div>
        <div>
          <span style={{ fontSize: 10, color: TOKENS.text.muted, display: 'block', marginBottom: 2 }}>Global Strategy</span>
          <select value={globalStrategy} onChange={(e) => setGlobalStrategy(e.target.value)} style={selectStyle}>
            <option value="median">Median</option>
            <option value="mean">Mean</option>
            <option value="mode">Mode</option>
            <option value="drop">Drop rows</option>
          </select>
        </div>
      </div>

      {/* Per-column cleaning table */}
      {features.length > 0 ? (
        <div style={{ borderRadius: TOKENS.radius.md, border: `1px solid ${TOKENS.border.default}`, overflow: 'hidden' }}>
          <table style={{ ...tableStyle, fontSize: 11 }}>
            <thead>
              <tr style={{ background: TOKENS.bg.elevated }}>
                <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px' }}>Column</th>
                <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px' }}>Type</th>
                <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px', textAlign: 'right' }}>Null %</th>
                <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px', width: 80 }}>Null Bar</th>
                <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px' }}>Transform</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => {
                const nullPct = f.missing_pct || f.nullPct || 0;
                const badge = TYPE_BADGES[f.type] || TYPE_BADGES.unknown;
                return (
                  <tr key={f.name} style={{ background: i % 2 === 0 ? 'transparent' : `${TOKENS.bg.elevated}40` }}>
                    <td style={{ ...tdStyle, padding: '6px 10px', fontWeight: 500, color: TOKENS.text.primary, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>
                      {f.name}
                    </td>
                    <td style={{ ...tdStyle, padding: '6px 10px' }}>
                      <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, padding: '6px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10 }}>
                      <span style={{ color: nullPct > 10 ? TOKENS.danger : nullPct > 0 ? TOKENS.warning : TOKENS.success }}>
                        {nullPct.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ ...tdStyle, padding: '6px 10px' }}>
                      <div style={{ height: 4, borderRadius: 2, background: TOKENS.bg.elevated, overflow: 'hidden', width: 80 }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(nullPct, 100)}%`, background: nullPct > 10 ? TOKENS.danger : nullPct > 0 ? TOKENS.warning : TOKENS.success }} />
                      </div>
                    </td>
                    <td style={{ ...tdStyle, padding: '4px 10px' }}>
                      <select
                        value={perColumn[f.name] || 'auto'}
                        onChange={(e) => setColStrategy(f.name, e.target.value)}
                        style={{ ...selectStyle, fontSize: 10, padding: '2px 4px', width: '100%' }}
                      >
                        {STRATEGY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: TOKENS.text.muted }}>
          Run Data Ingest first to see column details
        </div>
      )}

      {/* Scaling & Normalization */}
      <div style={{ borderTop: `1px solid ${TOKENS.border.default}`, paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Scaling & Normalization
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { value: 'none', label: 'None' },
            { value: 'standard', label: 'StandardScaler' },
            { value: 'minmax', label: 'MinMaxScaler' },
            { value: 'robust', label: 'RobustScaler' },
            { value: 'maxabs', label: 'MaxAbsScaler' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setScaling(opt.value)}
              style={{
                padding: '4px 10px',
                borderRadius: TOKENS.radius.sm,
                border: `1px solid ${scaling === opt.value ? TOKENS.accent : TOKENS.border.default}`,
                background: scaling === opt.value ? `${TOKENS.accent}15` : 'transparent',
                color: scaling === opt.value ? TOKENS.accent : TOKENS.text.secondary,
                fontSize: 10,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Power Transforms */}
      <div style={{ borderTop: `1px solid ${TOKENS.border.default}`, paddingTop: 10, marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Power Transforms (for skewed data)
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { value: 'none', label: 'None' },
            { value: 'yeo-johnson', label: 'Yeo-Johnson' },
            { value: 'box-cox', label: 'Box-Cox' },
            { value: 'log', label: 'Log Transform' },
            { value: 'sqrt', label: 'Square Root' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setPowerTransform(opt.value)}
              style={{
                padding: '4px 10px',
                borderRadius: TOKENS.radius.sm,
                border: `1px solid ${powerTransform === opt.value ? '#a855f7' : TOKENS.border.default}`,
                background: powerTransform === opt.value ? 'rgba(168,85,247,0.1)' : 'transparent',
                color: powerTransform === opt.value ? '#a855f7' : TOKENS.text.secondary,
                fontSize: 10,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Outlier Treatment */}
      <div style={{ borderTop: `1px solid ${TOKENS.border.default}`, paddingTop: 10, marginTop: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
          Outlier Treatment
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { value: 'none', label: 'None' },
            { value: 'iqr', label: 'IQR Clip' },
            { value: 'zscore', label: 'Z-Score Clip' },
            { value: 'winsorize', label: 'Winsorize' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setOutlierTreatment(opt.value)}
              style={{
                padding: '4px 10px',
                borderRadius: TOKENS.radius.sm,
                border: `1px solid ${outlierTreatment === opt.value ? '#f59e0b' : TOKENS.border.default}`,
                background: outlierTreatment === opt.value ? 'rgba(245,158,11,0.1)' : 'transparent',
                color: outlierTreatment === opt.value ? '#f59e0b' : TOKENS.text.secondary,
                fontSize: 10,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Run action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button style={btnPrimary} onClick={() => onRunStage?.('clean', {
          imputation: globalStrategy,
          per_column: perColumn,
          scaling,
          power_transform: powerTransform,
          outlier_treatment: outlierTreatment,
        })}>
          Run Cleaning
        </button>
      </div>
    </div>
  );
}

function FeaturesContentInner({ features, onApplyChanges, onRunStage }) {
  const [selections, setSelections] = useState(() =>
    Object.fromEntries(features.map((f) => [f.name, f.include !== false]))
  );
  const [customFeatures, setCustomFeatures] = useState([]);
  const [showCreator, setShowCreator] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExpr, setNewExpr] = useState('');
  const [newType, setNewType] = useState('numeric');
  const [encoding, setEncoding] = useState('label');

  const toggle = (name) => setSelections(prev => ({ ...prev, [name]: !prev[name] }));

  const addCustom = () => {
    if (!newName.trim() || !newExpr.trim()) return;
    setCustomFeatures(prev => [...prev, {
      name: newName.trim(),
      expression: newExpr.trim(),
      type: newType,
      isCustom: true,
    }]);
    setSelections(prev => ({ ...prev, [newName.trim()]: true }));
    setNewName('');
    setNewExpr('');
    setShowCreator(false);
  };

  const removeCustom = (name) => {
    setCustomFeatures(prev => prev.filter(f => f.name !== name));
    setSelections(prev => { const n = { ...prev }; delete n[name]; return n; });
  };

  const allFeatures = [...features, ...customFeatures];
  const selectedCount = allFeatures.filter(f => selections[f.name]).length;
  const excludedCount = allFeatures.length - selectedCount;

  const TYPE_BADGES = {
    numeric: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'NUM' },
    categorical: { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', label: 'CAT' },
    datetime: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', label: 'DATE' },
    text: { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee', label: 'TEXT' },
    pii: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'PII' },
    custom: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', label: 'CUSTOM' },
    unknown: { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: '?' },
  };

  if (features.length === 0 && customFeatures.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: TOKENS.text.muted }}>
        Run Data Ingest first to load features
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
          <span style={{ color: TOKENS.success, fontWeight: 600 }}>{selectedCount} selected</span>
          <span style={{ color: TOKENS.text.muted }}>{excludedCount} excluded</span>
          <span style={{ color: '#a855f7', fontWeight: 600 }}>{customFeatures.length} custom</span>
        </div>
        <button
          onClick={() => setShowCreator(!showCreator)}
          style={{
            ...btnSecondary,
            fontSize: 10,
            padding: '4px 10px',
            color: showCreator ? TOKENS.danger : '#a855f7',
            borderColor: showCreator ? TOKENS.danger : '#a855f740',
          }}
        >
          {showCreator ? 'Cancel' : '+ Custom Feature'}
        </button>
      </div>

      {/* Custom feature creator */}
      {showCreator && (
        <div style={{
          padding: 12,
          borderRadius: TOKENS.radius.md,
          border: '1px solid #a855f730',
          background: 'rgba(168,85,247,0.04)',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Feature name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ ...selectStyle, flex: 1, fontSize: 11 }}
            />
            <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ ...selectStyle, fontSize: 11, width: 100 }}>
              <option value="numeric">Numeric</option>
              <option value="categorical">Categorical</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Expression: col1 + col2, CASE WHEN x > 0 THEN 1 ELSE 0"
              value={newExpr}
              onChange={(e) => setNewExpr(e.target.value)}
              style={{ ...selectStyle, flex: 1, fontSize: 11, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
            />
            <button onClick={addCustom} style={{ ...btnPrimary, fontSize: 10, padding: '4px 12px', background: '#a855f7' }}>
              Add
            </button>
          </div>
        </div>
      )}

      {/* Features table */}
      <div style={{ borderRadius: TOKENS.radius.md, border: `1px solid ${TOKENS.border.default}`, overflow: 'hidden' }}>
        <table style={{ ...tableStyle, fontSize: 11 }}>
          <thead>
            <tr style={{ background: TOKENS.bg.elevated }}>
              <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px', width: 30, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedCount === allFeatures.length}
                  onChange={() => {
                    const allSelected = selectedCount === allFeatures.length;
                    setSelections(Object.fromEntries(allFeatures.map(f => [f.name, !allSelected])));
                  }}
                  style={{ accentColor: TOKENS.accent, cursor: 'pointer' }}
                />
              </th>
              <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px' }}>Feature</th>
              <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px' }}>Type</th>
              <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px', textAlign: 'right' }}>Null %</th>
              <th style={{ ...thStyle, fontSize: 10, padding: '7px 10px', textAlign: 'right' }}>Stats</th>
              <th style={{ ...thStyle, fontSize: 10, padding: '7px 6px', width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {allFeatures.map((f, i) => {
              const badge = f.isCustom ? TYPE_BADGES.custom : (TYPE_BADGES[f.type] || TYPE_BADGES.unknown);
              const nullPct = f.nullPercent || f.nullPct || 0;
              return (
                <tr key={f.name} style={{ background: i % 2 === 0 ? 'transparent' : `${TOKENS.bg.elevated}40`, opacity: selections[f.name] ? 1 : 0.4 }}>
                  <td style={{ ...tdStyle, padding: '6px 10px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selections[f.name] ?? true}
                      onChange={() => toggle(f.name)}
                      style={{ accentColor: TOKENS.accent, cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ ...tdStyle, padding: '6px 10px', fontWeight: 500, color: TOKENS.text.primary, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>
                    {f.name}
                    {f.expression && (
                      <div style={{ fontSize: 9, color: TOKENS.text.muted, fontWeight: 400, marginTop: 1 }}>
                        = {f.expression}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, padding: '6px 10px' }}>
                    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, padding: '6px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10 }}>
                    {f.isCustom ? '-' : (
                      <span style={{ color: nullPct > 10 ? TOKENS.danger : nullPct > 0 ? TOKENS.warning : TOKENS.success }}>
                        {nullPct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, padding: '6px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, color: TOKENS.text.muted }}>
                    {f.isCustom ? 'derived' : f.unique ? `${f.unique} uniq` : f.mean != null ? `avg ${Number(f.mean).toFixed(1)}` : '-'}
                  </td>
                  <td style={{ ...tdStyle, padding: '4px 6px' }}>
                    {f.isCustom && (
                      <button onClick={() => removeCustom(f.name)} style={{ background: 'none', border: 'none', color: TOKENS.danger, cursor: 'pointer', fontSize: 12, padding: 2 }} title="Remove custom feature">
                        x
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Encoding Options */}
      <div style={{ borderTop: `1px solid ${TOKENS.border.default}`, paddingTop: 10, marginTop: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
          Categorical Encoding
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { value: 'label', label: 'Label Encoding' },
            { value: 'onehot', label: 'One-Hot Encoding' },
            { value: 'ordinal', label: 'Ordinal Encoding' },
            { value: 'target', label: 'Target Encoding' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setEncoding(opt.value)}
              style={{
                padding: '4px 10px',
                borderRadius: TOKENS.radius.sm,
                border: `1px solid ${encoding === opt.value ? TOKENS.accent : TOKENS.border.default}`,
                background: encoding === opt.value ? `${TOKENS.accent}15` : 'transparent',
                color: encoding === opt.value ? TOKENS.accent : TOKENS.text.secondary,
                fontSize: 10,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={btnSecondary} onClick={() => onApplyChanges?.({
          features: allFeatures.map(f => ({ ...f, include: selections[f.name] ?? true })),
        })}>
          Apply Changes
        </button>
        <button
          style={btnPrimary}
          onClick={() => {
            const include = allFeatures.filter(f => selections[f.name]).map(f => f.name);
            const exclude = allFeatures.filter(f => !selections[f.name]).map(f => f.name);
            const custom = customFeatures.filter(f => selections[f.name]);
            onRunStage?.('features', { include, exclude, custom_features: custom, encoding });
          }}
        >
          Run Feature Engineering
        </button>
      </div>
    </div>
  );
}

// Wrapper that resets internal state when features list changes
function FeaturesContent({ data, onApplyChanges, onRunStage }) {
  const features = useMemo(() => data?.features || [], [data?.features]);
  const featureKey = useMemo(() => features.map(f => f.name).join(','), [features]);
  return (
    <FeaturesContentInner
      key={featureKey}
      features={features}
      onApplyChanges={onApplyChanges}
      onRunStage={onRunStage}
    />
  );
}

/* ── Training stage catalog & constants ────────────────────── */

const MODEL_CATALOG = {
  classification: [
    { name: 'XGBoost', library: 'xgboost', desc: 'Gradient boosting — best for structured data', params: { n_estimators: 100, max_depth: 6, learning_rate: 0.1 } },
    { name: 'LightGBM', library: 'lightgbm', desc: 'Fast gradient boosting — good with categoricals', params: { n_estimators: 100, max_depth: -1, learning_rate: 0.1 } },
    { name: 'Random Forest', library: 'sklearn', desc: 'Ensemble — interpretable, robust baseline', params: { n_estimators: 100, max_depth: 10, min_samples_split: 2 } },
    { name: 'Logistic Regression', library: 'sklearn', desc: 'Linear — fast, interpretable', params: { max_iter: 1000, C: 1.0 } },
  ],
  regression: [
    { name: 'XGBoost', library: 'xgboost', desc: 'Gradient boosting regressor', params: { n_estimators: 100, max_depth: 6, learning_rate: 0.1 } },
    { name: 'LightGBM', library: 'lightgbm', desc: 'Fast gradient boosting regressor', params: { n_estimators: 100, learning_rate: 0.1 } },
    { name: 'Random Forest', library: 'sklearn', desc: 'Ensemble regressor', params: { n_estimators: 100, max_depth: 10 } },
    { name: 'Linear Regression', library: 'sklearn', desc: 'Linear baseline', params: {} },
  ],
  clustering: [
    { name: 'KMeans', library: 'sklearn', desc: 'Centroid-based clustering', params: { n_clusters: 5, n_init: 10 } },
    { name: 'DBSCAN', library: 'sklearn', desc: 'Density-based — finds arbitrary shapes', params: { eps: 0.5, min_samples: 5 } },
  ],
  anomaly: [
    { name: 'Isolation Forest', library: 'sklearn', desc: 'Tree-based anomaly detector', params: { n_estimators: 100, contamination: 0.1 } },
    { name: 'Local Outlier Factor', library: 'sklearn', desc: 'Distance-based outlier detection', params: { n_neighbors: 20, contamination: 0.1 } },
  ],
};

const TASK_TYPES = [
  { key: 'classification', label: 'Classification', desc: 'Predict categories', color: '#a855f7' },
  { key: 'regression', label: 'Regression', desc: 'Predict numbers', color: '#22c55e' },
  { key: 'clustering', label: 'Clustering', desc: 'Find groups', color: '#06b6d4' },
  { key: 'anomaly', label: 'Anomaly', desc: 'Detect outliers', color: '#f59e0b' },
];

const LIB_COLORS = {
  xgboost: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
  lightgbm: { bg: 'rgba(99,102,241,0.12)', color: '#818cf8' },
  sklearn: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
};

const TYPE_BADGE_COLORS = {
  numeric: { bg: 'rgba(34,197,94,0.10)', color: '#22c55e' },
  categorical: { bg: 'rgba(168,85,247,0.10)', color: '#a855f7' },
  boolean: { bg: 'rgba(245,158,11,0.10)', color: '#f59e0b' },
  text: { bg: 'rgba(6,182,212,0.10)', color: '#06b6d4' },
  date: { bg: 'rgba(239,68,68,0.10)', color: '#ef4444' },
  pii: { bg: 'rgba(239,68,68,0.10)', color: '#ef4444' },
};

// eslint-disable-next-line no-unused-vars
function TrainContent({ data, onApplyChanges, onRunStage }) {
  const store = useStore.getState();
  const ingestData = store.mlPipelineStages?.ingest?.data;
  const availableColumns = useMemo(() =>
    (ingestData?.preview || []).map(f => ({ name: f.name, type: f.type })),
    [ingestData],
  );

  const [taskType, setTaskType] = useState(data?.task_type || 'classification');
  const [targetCol, setTargetCol] = useState(data?.target_column || '');
  const [selectedModels, setSelectedModels] = useState(new Set(data?.models?.map(m => m.name) || ['XGBoost']));
  const [expandedModel, setExpandedModel] = useState(null);
  const [paramOverrides, setParamOverrides] = useState({});
  const [testSize, setTestSize] = useState(0.2);
  const [dataSource, setDataSource] = useState('twin');
  const [sampleSize, setSampleSize] = useState(500000);

  const models = MODEL_CATALOG[taskType] || [];

  const toggleModel = (name) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const getParams = (modelName) => {
    const model = models.find(m => m.name === modelName);
    const defaults = model?.params || {};
    return { ...defaults, ...(paramOverrides[modelName] || {}) };
  };

  const setParam = (modelName, key, value) => {
    setParamOverrides(prev => ({
      ...prev,
      [modelName]: { ...(prev[modelName] || {}), [key]: value },
    }));
  };

  const canStart = targetCol && selectedModels.size > 0;

  /* ── styles ── */
  const sectionLabel = {
    fontSize: 10,
    fontWeight: 700,
    color: TOKENS.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
  };

  const selectStyle = {
    ...inputStyle,
    width: '100%',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    paddingRight: 24,
  };

  const pillBase = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '8px 14px',
    borderRadius: TOKENS.radius.md,
    border: `1px solid ${TOKENS.border.default}`,
    background: TOKENS.bg.elevated,
    cursor: 'pointer',
    transition: TOKENS.transition,
    flex: 1,
    minWidth: 0,
  };

  const modelRow = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: TOKENS.radius.sm,
    border: `1px solid ${TOKENS.border.default}`,
    background: TOKENS.bg.elevated,
    cursor: 'pointer',
    transition: TOKENS.transition,
  };

  const paramRow = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '4px 0',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Data Source ── */}
      <div>
        <div style={sectionLabel}>Data Source</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { key: 'twin', label: 'Twin (Quick)', desc: 'DuckDB replica', detail: '~50K rows', speed: 'instant', color: TOKENS.success },
            { key: 'sample', label: 'Smart Sample', desc: 'Stratified random', detail: `${(sampleSize / 1000).toFixed(0)}K rows`, speed: '~30s', color: TOKENS.accent },
            { key: 'full', label: 'Full Dataset', desc: 'Source DB directly', detail: 'All rows', speed: 'minutes', color: '#a855f7' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setDataSource(opt.key)}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: TOKENS.radius.md,
                border: `1.5px solid ${dataSource === opt.key ? opt.color : TOKENS.border.default}`,
                background: dataSource === opt.key ? `${opt.color}08` : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: `all ${TOKENS.transition}`,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: dataSource === opt.key ? opt.color : TOKENS.text.primary, fontFamily: TOKENS.tile.headerFont }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 10, color: TOKENS.text.muted, marginTop: 2 }}>
                {opt.desc}
              </div>
              <div style={{ fontSize: 9, color: TOKENS.text.muted, marginTop: 3, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                {opt.detail} &middot; {opt.speed}
              </div>
            </button>
          ))}
        </div>

        {/* Sample size input (only for Smart Sample) */}
        {dataSource === 'sample' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 10, color: TOKENS.text.muted, whiteSpace: 'nowrap' }}>Sample size</span>
            <input
              type="number"
              value={sampleSize}
              onChange={(e) => setSampleSize(Math.max(1000, parseInt(e.target.value) || 500000))}
              step={50000}
              min={1000}
              max={10000000}
              style={{ ...selectStyle, width: 120, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}
            />
            <span style={{ fontSize: 10, color: TOKENS.text.muted }}>rows</span>
          </div>
        )}
      </div>

      {/* ── A. Target Column ── */}
      <div>
        <div style={sectionLabel}>Target Column</div>
        <select
          value={targetCol}
          onChange={(e) => setTargetCol(e.target.value)}
          style={selectStyle}
        >
          <option value="">Select target column...</option>
          {availableColumns.map((col) => {
            const badge = col.type ? ` (${col.type})` : '';
            return (
              <option key={col.name} value={col.name}>
                {col.name}{badge}
              </option>
            );
          })}
        </select>
        {targetCol && availableColumns.length > 0 && (() => {
          const col = availableColumns.find(c => c.name === targetCol);
          const tc = TYPE_BADGE_COLORS[col?.type] || TYPE_BADGE_COLORS.text;
          return (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: TOKENS.text.secondary }}>{targetCol}</span>
              {col?.type && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: tc.bg,
                  color: tc.color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  {col.type}
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── B. Problem Type ── */}
      <div>
        <div style={sectionLabel}>Problem Type</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {TASK_TYPES.map((t) => {
            const active = taskType === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTaskType(t.key);
                  setSelectedModels(new Set());
                  setExpandedModel(null);
                  setParamOverrides({});
                }}
                style={{
                  ...pillBase,
                  background: active ? `${t.color}18` : TOKENS.bg.elevated,
                  borderColor: active ? t.color : TOKENS.border.default,
                  boxShadow: active ? `0 0 0 1px ${t.color}40` : 'none',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = TOKENS.border.hover; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = TOKENS.border.default; }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: active ? t.color : TOKENS.text.primary }}>{t.label}</span>
                <span style={{ fontSize: 9, color: active ? t.color : TOKENS.text.muted, opacity: active ? 0.8 : 1 }}>{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── C. Model Selection ── */}
      <div>
        <div style={sectionLabel}>
          Models
          <span style={{ fontWeight: 400, color: TOKENS.text.muted, marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
            {selectedModels.size} selected
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {models.map((m) => {
            const checked = selectedModels.has(m.name);
            const expanded = expandedModel === m.name;
            const lc = LIB_COLORS[m.library] || LIB_COLORS.sklearn;
            const mParams = getParams(m.name);
            const paramEntries = Object.entries(mParams);

            return (
              <div key={m.name}>
                {/* Model row */}
                <div
                  style={{
                    ...modelRow,
                    borderColor: checked ? `${TASK_TYPES.find(t => t.key === taskType)?.color || TOKENS.accent}50` : TOKENS.border.default,
                    background: checked ? `${TASK_TYPES.find(t => t.key === taskType)?.color || TOKENS.accent}08` : TOKENS.bg.elevated,
                  }}
                  onClick={() => {
                    if (checked) setExpandedModel(expanded ? null : m.name);
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.border.hover; }}
                  onMouseLeave={(e) => {
                    const tc = TASK_TYPES.find(t => t.key === taskType)?.color || TOKENS.accent;
                    e.currentTarget.style.borderColor = checked ? `${tc}50` : TOKENS.border.default;
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleModel(m.name);
                      if (!checked) setExpandedModel(m.name);
                      else if (expanded) setExpandedModel(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: TASK_TYPES.find(t => t.key === taskType)?.color || TOKENS.accent, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text.primary, whiteSpace: 'nowrap' }}>{m.name}</span>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: lc.bg,
                    color: lc.color,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    flexShrink: 0,
                  }}>
                    {m.library}
                  </span>
                  <span style={{ fontSize: 11, color: TOKENS.text.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.desc}
                  </span>
                  {checked && paramEntries.length > 0 && (
                    <svg
                      width={12} height={12} viewBox="0 0 12 12"
                      style={{ flexShrink: 0, transition: 'transform 200ms', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', color: TOKENS.text.muted }}
                    >
                      <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                </div>

                {/* D. Hyperparameter accordion */}
                {checked && expanded && paramEntries.length > 0 && (
                  <div style={{
                    margin: '0 0 2px 28px',
                    padding: '8px 12px',
                    borderRadius: `0 0 ${TOKENS.radius.sm} ${TOKENS.radius.sm}`,
                    background: TOKENS.bg.base,
                    border: `1px solid ${TOKENS.border.default}`,
                    borderTop: 'none',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: TOKENS.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Hyperparameters
                    </div>
                    {paramEntries.map(([key, val]) => (
                      <div key={key} style={paramRow}>
                        <span style={{ fontSize: 11, color: TOKENS.text.secondary, fontFamily: "'JetBrains Mono', monospace", minWidth: 110 }}>
                          {key}
                        </span>
                        <input
                          type="number"
                          step={typeof val === 'number' && val % 1 !== 0 ? 0.01 : 1}
                          value={val}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const parsed = raw.includes('.') ? parseFloat(raw) : parseInt(raw, 10);
                            setParam(m.name, key, isNaN(parsed) ? raw : parsed);
                          }}
                          style={{
                            ...inputStyle,
                            width: 80,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 11,
                            textAlign: 'right',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── E. Train/Test Split ── */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Train/Test Split</span>
          <span style={{ fontSize: 11, color: TOKENS.text.primary, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{Math.round((1 - testSize) * 100)}% / {Math.round(testSize * 100)}%</span>
        </div>
        <input type="range" min={0.1} max={0.4} step={0.05} value={testSize}
          onChange={(e) => setTestSize(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: TOKENS.accent }} />
      </div>

      {/* ── F. Start Training ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button
          style={{
            ...btnPrimary,
            opacity: canStart ? 1 : 0.45,
            pointerEvents: canStart ? 'auto' : 'none',
            padding: '8px 20px',
            fontSize: 12,
          }}
          disabled={!canStart}
          onClick={() => onRunStage?.('train', {
            target_column: targetCol,
            task_type: taskType,
            models: [...selectedModels],
            params: Object.fromEntries(
              [...selectedModels].map(name => [name, getParams(name)])
            ),
            test_size: testSize,
            data_source: dataSource,
            sample_size: dataSource === 'sample' ? sampleSize : undefined,
          })}
        >
          Start Training
        </button>
      </div>
    </div>
  );
}

function EvaluateContent({ data, onRunStage }) {
  const metrics = data?.metrics || [];
  const bestIdx = metrics.reduce((best, m, i) => (m.f1 > (metrics[best]?.f1 ?? -1) ? i : best), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Model</th>
            <th style={thStyle}>Accuracy</th>
            <th style={thStyle}>Precision</th>
            <th style={thStyle}>Recall</th>
            <th style={thStyle}>F1</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => {
            const isBest = i === bestIdx && metrics.length > 1;
            const rowBg = isBest ? 'rgba(34,197,94,0.06)' : 'transparent';
            return (
              <tr key={m.model} style={{ background: rowBg }}>
                <td style={{ ...tdStyle, fontWeight: 500, color: TOKENS.text.primary }}>
                  {m.model}
                  {isBest && (
                    <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: TOKENS.success, color: '#fff', fontWeight: 600 }}>
                      BEST
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{m.accuracy?.toFixed(3) ?? '--'}</td>
                <td style={tdStyle}>{m.precision?.toFixed(3) ?? '--'}</td>
                <td style={tdStyle}>{m.recall?.toFixed(3) ?? '--'}</td>
                <td style={{ ...tdStyle, fontWeight: isBest ? 700 : 400, color: isBest ? TOKENS.success : TOKENS.text.secondary }}>
                  {m.f1?.toFixed(3) ?? '--'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Run action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={btnPrimary} onClick={() => onRunStage?.('evaluate', {})}>
          Run Evaluation
        </button>
      </div>
    </div>
  );
}

function ResultsContent({ data, onRunStage }) {
  const model = data?.bestModel || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...statCardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: TOKENS.tile.headerFont, color: TOKENS.text.primary }}>
          {model.name || 'No model selected'}
        </div>
        {model.accuracy != null && (
          <div style={{ fontSize: 12, color: TOKENS.text.secondary }}>
            Accuracy: <span style={{ fontWeight: 600, color: TOKENS.success }}>{(model.accuracy * 100).toFixed(1)}%</span>
            {model.f1 != null && <> &middot; F1: <span style={{ fontWeight: 600 }}>{model.f1.toFixed(3)}</span></>}
          </div>
        )}
        {model.downloadUrl && (
          <a
            href={model.downloadUrl}
            download
            style={{
              ...btnPrimary,
              textDecoration: 'none',
              textAlign: 'center',
              display: 'inline-block',
              alignSelf: 'flex-start',
              marginTop: 4,
            }}
          >
            Download Model
          </a>
        )}
      </div>

      {/* Finalize action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={btnPrimary} onClick={() => onRunStage?.('results', {})}>
          Finalize Pipeline
        </button>
      </div>
    </div>
  );
}

/* ── Stage labels ──────────────────────────────────────────── */

const STAGE_LABELS = {
  ingest: 'Data Ingest',
  clean: 'Data Cleaning',
  features: 'Feature Engineering',
  train: 'Training',
  evaluate: 'Evaluation',
  results: 'Results',
};

const STAGE_RENDERERS = {
  ingest: IngestContent,
  clean: CleanContent,
  features: FeaturesContent,
  train: TrainContent,
  evaluate: EvaluateContent,
  results: ResultsContent,
};

/* ── Main component ────────────────────────────────────────── */

export default function StageDetailPanel({ stage, data, onClose, onApplyChanges, onRunStage }) {
  const Renderer = STAGE_RENDERERS[stage];

  return (
    <AnimatePresence>
      {stage && (
        <motion.div
          key="detail-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          style={{ overflow: 'hidden' }}
        >
          <div style={{ ...panelStyle, marginTop: 12 }}>
            {/* Header */}
            <div style={headerStyle}>
              <span style={titleStyle}>{STAGE_LABELS[stage] || stage}</span>
              <button
                onClick={onClose}
                style={btnClose}
                onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.bg.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                aria-label="Close detail panel"
              >
                <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                  <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Error banner */}
            {data?.error && (
              <div style={{
                padding: '10px 14px',
                background: `${TOKENS.danger}10`,
                borderBottom: `1px solid ${TOKENS.danger}30`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <svg width={14} height={14} viewBox="0 0 14 14" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
                  <circle cx={7} cy={7} r={6} stroke={TOKENS.danger} strokeWidth={1.5} />
                  <path d="M7 4v3M7 9h.01" stroke={TOKENS.danger} strokeWidth={1.5} strokeLinecap="round" />
                </svg>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.danger, marginBottom: 2 }}>Stage Failed</div>
                  <div style={{ fontSize: 11, color: TOKENS.text.secondary, fontFamily: "'JetBrains Mono', ui-monospace, monospace", wordBreak: 'break-word' }}>
                    {data.error}
                  </div>
                </div>
              </div>
            )}

            {/* Body */}
            <div style={bodyStyle}>
              {Renderer ? (
                <Renderer data={data || {}} onApplyChanges={onApplyChanges} onRunStage={onRunStage} />
              ) : (
                <div style={{ fontSize: 12, color: TOKENS.text.muted }}>No details available for this stage.</div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
