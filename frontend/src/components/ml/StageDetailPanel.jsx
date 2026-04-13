import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

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
  maxHeight: 260,
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

function IngestContent({ data }) {
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
    </div>
  );
}

function CleanContent({ data }) {
  const missing = data?.missingValues || [];
  const quality = data?.qualityScore ?? '--';
  const strategy = data?.imputationStrategy || 'None';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={statGridStyle}>
        <div style={statCardStyle}>
          <div style={statValueStyle}>{typeof quality === 'number' ? `${quality}%` : quality}</div>
          <div style={statLabelStyle}>Data Quality</div>
        </div>
        <div style={statCardStyle}>
          <div style={{ ...statValueStyle, fontSize: 14 }}>{strategy}</div>
          <div style={statLabelStyle}>Imputation</div>
        </div>
      </div>
      {missing.length > 0 && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Column</th>
              <th style={thStyle}>Missing %</th>
              <th style={thStyle}>Strategy</th>
            </tr>
          </thead>
          <tbody>
            {missing.map((m) => (
              <tr key={m.column}>
                <td style={tdStyle}>{m.column}</td>
                <td style={tdStyle}>{m.percent}%</td>
                <td style={tdStyle}>{m.strategy || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FeaturesContent({ data, onApplyChanges }) {
  const features = data?.features || [];
  const [selections, setSelections] = useState(() =>
    Object.fromEntries(features.map((f) => [f.name, f.include !== false]))
  );

  const toggle = (name) => {
    const next = { ...selections, [name]: !selections[name] };
    setSelections(next);
  };

  const handleApply = () => {
    onApplyChanges?.({
      features: features.map((f) => ({ ...f, include: selections[f.name] ?? true })),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Null %</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Include</th>
          </tr>
        </thead>
        <tbody>
          {features.map((f) => (
            <tr key={f.name}>
              <td style={{ ...tdStyle, fontWeight: 500, color: TOKENS.text.primary }}>{f.name}</td>
              <td style={tdStyle}>{f.type}</td>
              <td style={tdStyle}>{f.nullPercent ?? f.missing_pct ?? 0}%</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={selections[f.name] ?? true}
                  onChange={() => toggle(f.name)}
                  style={{ accentColor: TOKENS.accent, cursor: 'pointer' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={btnPrimary} onClick={handleApply}>Apply Changes</button>
      </div>
    </div>
  );
}

function TrainContent({ data, onApplyChanges }) {
  const models = data?.models || [];
  const [params, setParams] = useState(() =>
    Object.fromEntries(
      models.map((m) => [m.name, { learning_rate: m.learning_rate ?? 0.01, n_estimators: m.n_estimators ?? 100, max_depth: m.max_depth ?? 6 }])
    )
  );

  const setParam = (model, key, val) => {
    setParams((p) => ({ ...p, [model]: { ...p[model], [key]: val } }));
  };

  const handleApply = () => {
    onApplyChanges?.({
      models: models.map((m) => ({ ...m, ...params[m.name] })),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Model</th>
            <th style={thStyle}>Learning Rate</th>
            <th style={thStyle}>Estimators</th>
            <th style={thStyle}>Max Depth</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.name}>
              <td style={{ ...tdStyle, fontWeight: 500, color: TOKENS.text.primary }}>{m.name}</td>
              <td style={tdStyle}>
                <input
                  type="number"
                  step="0.001"
                  value={params[m.name]?.learning_rate ?? 0.01}
                  onChange={(e) => setParam(m.name, 'learning_rate', parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  step="10"
                  value={params[m.name]?.n_estimators ?? 100}
                  onChange={(e) => setParam(m.name, 'n_estimators', parseInt(e.target.value, 10) || 0)}
                  style={inputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  step="1"
                  value={params[m.name]?.max_depth ?? 6}
                  onChange={(e) => setParam(m.name, 'max_depth', parseInt(e.target.value, 10) || 0)}
                  style={inputStyle}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={btnPrimary} onClick={handleApply}>Apply Changes</button>
      </div>
    </div>
  );
}

function EvaluateContent({ data }) {
  const metrics = data?.metrics || [];
  const bestIdx = metrics.reduce((best, m, i) => (m.f1 > (metrics[best]?.f1 ?? -1) ? i : best), 0);

  return (
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
  );
}

function ResultsContent({ data }) {
  const model = data?.bestModel || {};
  return (
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
  );
}

/* ── Stage labels ──────────────────────────────────────────── */

const STAGE_LABELS = {
  ingest: 'Data Ingest',
  clean: 'Data Cleaning',
  features: 'Feature Extraction',
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

export default function StageDetailPanel({ stage, data, onClose, onApplyChanges }) {
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

            {/* Body */}
            <div style={bodyStyle}>
              {Renderer ? (
                <Renderer data={data || {}} onApplyChanges={onApplyChanges} />
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
