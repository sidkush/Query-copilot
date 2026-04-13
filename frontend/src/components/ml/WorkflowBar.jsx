import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { api } from '../../api';
import { TOKENS } from '../dashboard/tokens';

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG — keeps bundle lean, no extra dependency)        */
/* ------------------------------------------------------------------ */
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M7 1v12M1 7h12" />
  </svg>
);
const SaveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.5 13H2.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h7.09a1 1 0 0 1 .7.29l2.42 2.42a1 1 0 0 1 .29.7V12a1 1 0 0 1-1 1Z" />
    <path d="M10 13V8H4v5M4 1v3h5" />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 3.5h11M4.5 3.5V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M11 3.5l-.5 8.5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1L3 3.5" />
  </svg>
);
const ChevronIcon = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: `transform ${TOKENS.transition}`, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
    <path d="M3 4.5 6 7.5 9 4.5" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */
const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: 40,
    padding: '0 16px',
    background: TOKENS.bg.base,
    borderBottom: `1px solid ${TOKENS.border.default}`,
    gap: 12,
    fontFamily: TOKENS.tile.headerFont,
    fontSize: 13,
    color: TOKENS.text.primary,
    position: 'relative',
    userSelect: 'none',
    flexShrink: 0,
  },
  left: { display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '1 1 auto', position: 'relative' },
  right: { display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' },

  /* Status dot */
  dot: (active) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: active ? TOKENS.success : TOKENS.text.muted,
    flexShrink: 0,
    transition: `background ${TOKENS.transition}`,
  }),

  /* Inline editable name */
  nameDisplay: {
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: TOKENS.radius.sm,
    border: '1px solid transparent',
    transition: `all ${TOKENS.transition}`,
    fontWeight: 500,
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameInput: {
    fontFamily: TOKENS.tile.headerFont,
    fontSize: 13,
    fontWeight: 500,
    padding: '2px 6px',
    borderRadius: TOKENS.radius.sm,
    border: `1px solid ${TOKENS.accent}`,
    background: TOKENS.bg.elevated,
    color: TOKENS.text.primary,
    outline: 'none',
    width: 180,
    boxShadow: `0 0 0 2px ${TOKENS.accentGlow}`,
  },

  /* Ghost button */
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    padding: '0 10px',
    borderRadius: TOKENS.radius.sm,
    border: 'none',
    background: 'transparent',
    color: TOKENS.text.secondary,
    fontSize: 12,
    fontFamily: TOKENS.tile.headerFont,
    fontWeight: 500,
    cursor: 'pointer',
    transition: `all ${TOKENS.transition}`,
    whiteSpace: 'nowrap',
  },
  btnDanger: {
    color: TOKENS.danger,
  },

  /* Dropdown trigger */
  dropdownTrigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 28,
    padding: '0 10px',
    borderRadius: TOKENS.radius.sm,
    border: `1px solid ${TOKENS.border.default}`,
    background: TOKENS.bg.elevated,
    color: TOKENS.text.secondary,
    fontSize: 12,
    fontFamily: TOKENS.tile.headerFont,
    fontWeight: 500,
    cursor: 'pointer',
    transition: `all ${TOKENS.transition}`,
    maxWidth: 220,
  },

  /* Dropdown overlay */
  overlay: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: 4,
    minWidth: 220,
    maxWidth: 300,
    maxHeight: 240,
    overflowY: 'auto',
    background: TOKENS.bg.elevated,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${TOKENS.border.default}`,
    borderRadius: TOKENS.radius.md,
    boxShadow: TOKENS.tile.shadow,
    zIndex: 50,
    padding: '4px 0',
  },
  overlayItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    fontSize: 12,
    fontFamily: TOKENS.tile.headerFont,
    color: TOKENS.text.primary,
    cursor: 'pointer',
    transition: `background ${TOKENS.transition}`,
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
  },
  overlayItemActive: {
    background: TOKENS.accentLight,
    color: TOKENS.accent,
    fontWeight: 600,
  },
  emptyState: {
    padding: '12px 16px',
    fontSize: 12,
    color: TOKENS.text.muted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function WorkflowBar({ connId }) {
  const {
    mlActiveWorkflow, mlWorkflows,
    setMLActiveWorkflow, setMLWorkflows, updatePipelineStage, resetMLPipeline,
  } = useStore();

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hovered, setHovered] = useState(false);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  /* ---- Fetch workflow list on mount ---- */
  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await api.mlListPipelines();
      setMLWorkflows(res.pipelines || []);
    } catch { /* silent — list may not exist yet */ }
  }, [setMLWorkflows]);

  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  /* ---- Close dropdown on outside click ---- */
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  /* ---- Auto-focus input on edit mode ---- */
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  /* ---- Has at least one completed stage? ---- */
  const hasCompleteStage = mlActiveWorkflow?.stages
    ? Object.values(mlActiveWorkflow.stages).some((s) => s.status === 'complete' || s.status === 'done')
    : false;

  /* ---- Handlers ---- */
  const handleNew = async () => {
    try {
      const res = await api.mlCreatePipeline('Untitled Workflow', connId);
      setMLActiveWorkflow(res);
      resetMLPipeline();
      await fetchWorkflows();
    } catch { /* toast could go here */ }
  };

  const handleSave = async () => {
    if (!mlActiveWorkflow) return;
    setSaving(true);
    try {
      await api.mlUpdatePipeline(mlActiveWorkflow.id, {
        name: mlActiveWorkflow.name,
        target_column: mlActiveWorkflow.target_column || null,
        stages: mlActiveWorkflow.stages || {},
      });
      await fetchWorkflows();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleLoad = async (id) => {
    setDropdownOpen(false);
    try {
      const res = await api.mlLoadPipeline(id);
      setMLActiveWorkflow(res);
      // Sync loaded stages into pipeline visualization store
      resetMLPipeline();
      if (res.stages) {
        Object.entries(res.stages).forEach(([key, stage]) => {
          updatePipelineStage(key, { status: stage.status, data: stage.output_summary });
        });
      }
    } catch { /* silent */ }
  };

  const handleDelete = async () => {
    if (!mlActiveWorkflow) return;
    const confirmed = window.confirm(`Delete "${mlActiveWorkflow.name}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await api.mlDeletePipeline(mlActiveWorkflow.id);
      setMLActiveWorkflow(null);
      resetMLPipeline();
      await fetchWorkflows();
    } catch { /* silent */ }
  };

  const startEditing = () => {
    if (!mlActiveWorkflow) return;
    setEditValue(mlActiveWorkflow.name || '');
    setEditing(true);
  };

  const commitName = async () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (!trimmed || !mlActiveWorkflow || trimmed === mlActiveWorkflow.name) return;
    try {
      await api.mlUpdatePipeline(mlActiveWorkflow.id, { name: trimmed });
      setMLActiveWorkflow({ ...mlActiveWorkflow, name: trimmed });
      await fetchWorkflows();
    } catch { /* silent */ }
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitName();
    if (e.key === 'Escape') cancelEdit();
  };

  /* ---- Render ---- */
  return (
    <div style={styles.bar} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* Left: name + status dot */}
      <div style={styles.left}>
        <span style={styles.dot(hasCompleteStage)} title={hasCompleteStage ? 'Has completed stages' : 'New workflow'} />
        {mlActiveWorkflow ? (
          editing ? (
            <input
              ref={inputRef}
              style={styles.nameInput}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <span
              style={styles.nameDisplay}
              onClick={startEditing}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.border.hover; e.currentTarget.style.background = TOKENS.bg.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
              title="Click to rename"
            >
              {mlActiveWorkflow.name || 'Untitled'}
            </span>
          )
        ) : (
          <span style={{ color: TOKENS.text.muted, fontStyle: 'italic' }}>No workflow selected</span>
        )}
      </div>

      {/* Center: workflow selector dropdown */}
      <div style={styles.center} ref={dropdownRef}>
        <button
          style={styles.dropdownTrigger}
          onClick={() => setDropdownOpen((o) => !o)}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.border.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border.default; }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mlWorkflows.length ? `${mlWorkflows.length} workflow${mlWorkflows.length !== 1 ? 's' : ''}` : 'Workflows'}
          </span>
          <ChevronIcon open={dropdownOpen} />
        </button>

        {dropdownOpen && (
          <div style={styles.overlay}>
            {mlWorkflows.length === 0 ? (
              <div style={styles.emptyState}>No saved workflows yet</div>
            ) : (
              mlWorkflows.map((wf) => {
                const isActive = mlActiveWorkflow?.id === wf.id;
                return (
                  <button
                    key={wf.id}
                    style={{ ...styles.overlayItem, ...(isActive ? styles.overlayItemActive : {}) }}
                    onClick={() => handleLoad(wf.id)}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = TOKENS.bg.hover; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={styles.dot(
                      wf.stages && Object.values(wf.stages).some((s) => s.status === 'complete' || s.status === 'done')
                    )} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wf.name || 'Untitled'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Right: action buttons */}
      <div style={styles.right}>
        <button
          style={styles.btn}
          onClick={handleNew}
          title="New workflow"
          onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.bg.hover; e.currentTarget.style.color = TOKENS.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = TOKENS.text.secondary; }}
        >
          <PlusIcon /> New
        </button>

        <button
          style={{ ...styles.btn, opacity: mlActiveWorkflow ? 1 : 0.4, pointerEvents: mlActiveWorkflow ? 'auto' : 'none' }}
          onClick={handleSave}
          title="Save workflow"
          onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.bg.hover; e.currentTarget.style.color = TOKENS.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = TOKENS.text.secondary; }}
        >
          <SaveIcon /> {saving ? 'Saving...' : 'Save'}
        </button>

        {mlActiveWorkflow && hovered && (
          <button
            style={{ ...styles.btn, ...styles.btnDanger }}
            onClick={handleDelete}
            title="Delete workflow"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  );
}
