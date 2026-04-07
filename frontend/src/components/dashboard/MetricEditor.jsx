import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from './tokens';
import { sandboxComputeMetric } from '../../lib/formulaSandbox';

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
  return 'm_' + Math.random().toString(36).slice(2, 10);
}

export default function MetricEditor({ metrics = [], sampleRows = [], onSave, onClose }) {
  const [items, setItems] = useState(metrics.map(m => ({ ...m })));
  const [editingIdx, setEditingIdx] = useState(null);
  const [name, setName] = useState('');
  const [formula, setFormula] = useState('');
  const [description, setDescription] = useState('');
  const [testResult, setTestResult] = useState(null);

  const resetForm = useCallback(() => {
    setName(''); setFormula(''); setDescription('');
    setTestResult(null); setEditingIdx(null);
  }, []);

  const handleTest = useCallback(async () => {
    if (!formula.trim()) return;
    setTestResult({ value: null, error: null, message: 'Evaluating...' });
    const result = await sandboxComputeMetric(formula, sampleRows);
    if (result.requiresBackend) {
      setTestResult({ value: null, error: null, message: 'LOD expression detected — will be computed server-side' });
    } else {
      setTestResult(result);
    }
  }, [formula, sampleRows]);

  const handleAdd = useCallback(() => {
    if (!name.trim() || !formula.trim()) return;
    if (editingIdx !== null) {
      setItems(prev => prev.map((m, i) => i === editingIdx ? { ...m, name: name.trim(), formula: formula.trim(), description: description.trim() } : m));
    } else {
      setItems(prev => [...prev, { id: generateId(), name: name.trim(), formula: formula.trim(), description: description.trim() }]);
    }
    resetForm();
  }, [name, formula, description, editingIdx, resetForm]);

  const handleEdit = useCallback((idx) => {
    const m = items[idx];
    setName(m.name); setFormula(m.formula); setDescription(m.description || '');
    setEditingIdx(idx); setTestResult(null);
  }, [items]);

  const handleRemove = useCallback((idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) resetForm();
  }, [editingIdx, resetForm]);

  const handleSave = useCallback(() => {
    onSave(items);
    onClose();
  }, [items, onSave, onClose]);

  return (
    <AnimatePresence>
      <motion.div
        key="metric-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <motion.div
          key="metric-modal"
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 540, maxHeight: '80vh',
            background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`,
            borderRadius: TOKENS.radius.xl, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${TOKENS.border.default}`, flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: TOKENS.text.primary }}>Custom Metrics</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} style={{ padding: '6px 16px', borderRadius: TOKENS.radius.sm, background: TOKENS.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
              <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: TOKENS.radius.sm, background: TOKENS.bg.surface, color: TOKENS.text.secondary, border: `1px solid ${TOKENS.border.default}`, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>

          {/* Content */}
          <div style={{ overflowY: 'auto', padding: '0 20px 20px', flex: 1 }}>
            {/* Existing metrics list */}
            {items.length > 0 && (
              <div style={{ padding: '16px 0', borderBottom: `1px solid ${TOKENS.border.default}` }}>
                <label style={labelStyle}>Defined Metrics</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((m, idx) => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      borderRadius: TOKENS.radius.sm, background: editingIdx === idx ? TOKENS.accentGlow : TOKENS.bg.surface,
                      border: `1px solid ${editingIdx === idx ? TOKENS.accent : TOKENS.border.default}`,
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>fx</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: TOKENS.text.primary }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: TOKENS.text.muted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.formula}</div>
                      </div>
                      <button onClick={() => handleEdit(idx)} style={{ background: 'none', border: 'none', color: TOKENS.text.secondary, cursor: 'pointer', fontSize: 12 }}>Edit</button>
                      <button onClick={() => handleRemove(idx)} style={{ background: 'none', border: 'none', color: TOKENS.danger, cursor: 'pointer', fontSize: 12 }}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add / Edit form */}
            <div style={{ padding: '16px 0' }}>
              <label style={labelStyle}>{editingIdx !== null ? 'Edit Metric' : 'Add Metric'}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. ARPU" />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Formula</label>
                  <textarea
                    value={formula} onChange={e => { setFormula(e.target.value); setTestResult(null); }}
                    rows={2}
                    style={{ ...inputStyle, fontFamily: '"JetBrains Mono", monospace', fontSize: 13, resize: 'vertical', lineHeight: 1.5 }}
                    placeholder="e.g. SUM(revenue) / COUNT(DISTINCT customer_id)"
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {['SUM', 'AVG', 'COUNT', 'COUNT(DISTINCT)', 'MIN', 'MAX', '+', '-', '*', '/'].map(hint => (
                      <span key={hint} style={{ fontSize: 10, color: TOKENS.text.muted, background: TOKENS.bg.surface, padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }}
                        onClick={() => setFormula(f => f + (f && !f.endsWith(' ') ? ' ' : '') + hint + (hint.length > 2 ? '(' : ''))}
                      >{hint}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Description (optional)</label>
                  <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="What this metric measures" />
                </div>

                {/* Test + Add buttons */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={handleTest} disabled={!formula.trim() || !sampleRows.length}
                    style={{
                      padding: '6px 14px', borderRadius: TOKENS.radius.sm,
                      background: TOKENS.bg.surface, color: TOKENS.text.primary,
                      border: `1px solid ${TOKENS.border.default}`, fontSize: 13, cursor: 'pointer',
                      opacity: (!formula.trim() || !sampleRows.length) ? 0.4 : 1,
                    }}>Test</button>
                  <button onClick={handleAdd} disabled={!name.trim() || !formula.trim()}
                    style={{
                      padding: '6px 14px', borderRadius: TOKENS.radius.sm,
                      background: (!name.trim() || !formula.trim()) ? TOKENS.bg.surface : TOKENS.accent,
                      color: (!name.trim() || !formula.trim()) ? TOKENS.text.muted : '#fff',
                      border: 'none', fontSize: 13, fontWeight: 600, cursor: (!name.trim() || !formula.trim()) ? 'not-allowed' : 'pointer',
                    }}>{editingIdx !== null ? 'Update' : 'Add'}</button>
                  {editingIdx !== null && (
                    <button onClick={resetForm} style={{ background: 'none', border: 'none', color: TOKENS.text.muted, cursor: 'pointer', fontSize: 12 }}>Cancel edit</button>
                  )}
                  {testResult && (
                    <span style={{ fontSize: 12, color: testResult.error ? TOKENS.danger : testResult.message ? TOKENS.accent : TOKENS.success, marginLeft: 8 }}>
                      {testResult.error ? `Error: ${testResult.error}` : testResult.message ? testResult.message : `Result: ${Math.round(testResult.value * 100) / 100}`}
                    </span>
                  )}
                </div>

                {!sampleRows.length && (
                  <p style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 4 }}>
                    Add data to a tile first to use the Test feature.
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
