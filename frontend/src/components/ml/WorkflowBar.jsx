import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { api } from '../../api';
import { TOKENS } from '../dashboard/tokens';
import useConfirmAction from '../../lib/useConfirmAction';

const FONT_DISPLAY_WF = "'Outfit', system-ui, sans-serif";
const FONT_BODY_WF = "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif";
const FONT_MONO_WF = "'JetBrains Mono', ui-monospace, monospace";

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
/*  Styles — instrument strip aesthetic                                */
/* ------------------------------------------------------------------ */
const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: '12px 18px',
    borderRadius: 18,
    background: 'var(--glass-bg-card)',
    border: '1px solid var(--glass-border)',
    boxShadow:
      '0 1px 0 var(--glass-highlight) inset, 0 14px 30px -20px var(--shadow-deep), 0 4px 10px -8px var(--shadow-soft)',
    backdropFilter: 'blur(14px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
    gap: 14,
    fontFamily: FONT_BODY_WF,
    fontSize: 13,
    color: TOKENS.text.primary,
    position: 'relative',
    userSelect: 'none',
    flexShrink: 0,
    // Create a stacking context above the pipeline rail so the Switch
    // dropdown renders in front of stage cards (which use backdrop-filter
    // and thus create their own stacking contexts).
    zIndex: 20,
  },
  left: { display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 260px', minWidth: 0 },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', position: 'relative' },
  right: { display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', flexWrap: 'wrap' },

  /* Status dot — glowing when live */
  dot: (active) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active ? '#4ade80' : 'rgba(148,163,184,0.42)',
    flexShrink: 0,
    boxShadow: active ? '0 0 10px rgba(74,222,128,0.6)' : 'none',
    transition: 'all 380ms cubic-bezier(0.32,0.72,0,1)',
  }),

  /* Eyebrow above workflow name */
  eyebrow: {
    display: 'block',
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: TOKENS.text.muted,
    fontFamily: FONT_DISPLAY_WF,
    marginBottom: 2,
  },

  /* Inline editable name */
  nameDisplay: {
    cursor: 'pointer',
    padding: '4px 10px',
    margin: '-4px -10px',
    borderRadius: 10,
    border: '1px solid transparent',
    transition: 'background 380ms cubic-bezier(0.32,0.72,0,1), border-color 380ms cubic-bezier(0.32,0.72,0,1)',
    fontWeight: 700,
    fontSize: 15,
    color: TOKENS.text.primary,
    fontFamily: FONT_DISPLAY_WF,
    letterSpacing: '-0.018em',
    lineHeight: 1.15,
    maxWidth: 320,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameInput: {
    fontFamily: FONT_DISPLAY_WF,
    fontSize: 15,
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: 10,
    border: '1px solid rgba(37,99,235,0.42)',
    background: 'rgba(37,99,235,0.06)',
    color: TOKENS.text.primary,
    outline: 'none',
    width: 260,
    letterSpacing: '-0.018em',
    boxShadow: '0 0 0 4px rgba(37,99,235,0.12), 0 1px 0 var(--glass-highlight) inset',
  },

  /* Ghost button pill */
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 32,
    padding: '0 14px',
    borderRadius: 9999,
    border: '1px solid var(--glass-border)',
    background: 'var(--surface-glass-subtle)',
    color: TOKENS.text.secondary,
    fontSize: 10.5,
    fontFamily: FONT_DISPLAY_WF,
    fontWeight: 700,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: '0 1px 0 var(--glass-highlight) inset, 0 6px 14px -8px var(--shadow-soft)',
    transition:
      'background 380ms cubic-bezier(0.32,0.72,0,1), color 380ms cubic-bezier(0.32,0.72,0,1), border-color 380ms cubic-bezier(0.32,0.72,0,1), transform 380ms cubic-bezier(0.32,0.72,0,1)',
    whiteSpace: 'nowrap',
  },
  btnDanger: {
    color: 'var(--status-danger)',
    borderColor: 'rgba(239,68,68,0.32)',
    background: 'rgba(239,68,68,0.06)',
  },

  /* Dropdown trigger */
  dropdownTrigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    height: 32,
    padding: '0 14px',
    borderRadius: 9999,
    border: '1px solid var(--glass-border)',
    background: 'var(--surface-glass-subtle)',
    color: TOKENS.text.secondary,
    fontSize: 11,
    fontFamily: FONT_DISPLAY_WF,
    fontWeight: 600,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    boxShadow: '0 1px 0 var(--glass-highlight) inset, 0 6px 14px -8px var(--shadow-soft)',
    transition:
      'background 380ms cubic-bezier(0.32,0.72,0,1), border-color 380ms cubic-bezier(0.32,0.72,0,1), transform 380ms cubic-bezier(0.32,0.72,0,1)',
    maxWidth: 220,
  },

  /* Count chip inside dropdown trigger — mono */
  countChip: {
    fontFamily: FONT_MONO_WF,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 7px',
    borderRadius: 9999,
    background: 'rgba(37,99,235,0.14)',
    color: 'var(--accent)',
    border: '1px solid rgba(37,99,235,0.24)',
  },

  /* Dropdown overlay */
  overlay: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: 8,
    minWidth: 260,
    maxWidth: 320,
    maxHeight: 280,
    overflowY: 'auto',
    background: 'var(--bg-elevated)',
    backdropFilter: 'blur(18px) saturate(1.5)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.5)',
    border: '1px solid var(--glass-border)',
    borderRadius: 14,
    boxShadow:
      '0 1px 0 var(--glass-highlight) inset, 0 24px 60px -22px var(--shadow-deep), 0 8px 16px -10px var(--shadow-mid)',
    // z-index 260 sits above pipeline stage cards (which create stacking
    // contexts via backdrop-filter) and above the detail panel shell.
    zIndex: 260,
    padding: 6,
  },
  overlayItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    fontSize: 12,
    fontFamily: FONT_BODY_WF,
    color: TOKENS.text.primary,
    cursor: 'pointer',
    transition: 'background 280ms cubic-bezier(0.32,0.72,0,1)',
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
    borderRadius: 10,
    letterSpacing: '-0.005em',
  },
  overlayItemActive: {
    background: 'rgba(37,99,235,0.10)',
    color: 'var(--accent)',
    fontWeight: 600,
  },
  emptyState: {
    padding: '14px 18px',
    fontSize: 11,
    color: TOKENS.text.muted,
    textAlign: 'center',
    fontFamily: FONT_BODY_WF,
    letterSpacing: '-0.005em',
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

  const doDelete = useCallback(async () => {
    if (!mlActiveWorkflow) return;
    try {
      await api.mlDeletePipeline(mlActiveWorkflow.id);
      setMLActiveWorkflow(null);
      resetMLPipeline();
      await fetchWorkflows();
    } catch { /* silent */ }
  }, [mlActiveWorkflow, setMLActiveWorkflow, resetMLPipeline, fetchWorkflows]);
  const deleteConfirm = useConfirmAction(doDelete, { timeoutMs: 3500 });

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
    <div className="ml-workflow-bar" style={styles.bar} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* Left: eyebrow + workflow name + live dot */}
      <div style={styles.left}>
        <span style={styles.dot(hasCompleteStage)} title={hasCompleteStage ? 'Has completed stages' : 'New workflow'} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={styles.eyebrow}>Workflow</span>
          {mlActiveWorkflow ? (
            editing ? (
              <input
                ref={inputRef}
                style={styles.nameInput}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitName}
                onKeyDown={handleKeyDown}
                aria-label="Rename workflow"
              />
            ) : (
              <span
                style={styles.nameDisplay}
                onClick={startEditing}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-glass-subtle)';
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.14)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
                title="Click to rename"
              >
                {mlActiveWorkflow.name || 'Untitled'}
              </span>
            )
          ) : (
            <span style={{
              color: TOKENS.text.muted,
              fontSize: 13,
              fontFamily: FONT_BODY_WF,
              letterSpacing: '-0.005em',
            }}>
              No workflow selected
            </span>
          )}
        </div>
      </div>

      {/* Center: workflow selector dropdown */}
      <div style={styles.center} ref={dropdownRef}>
        <button
          style={styles.dropdownTrigger}
          onClick={() => setDropdownOpen((o) => !o)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-glass-strong)';
            e.currentTarget.style.borderColor = 'rgba(148,163,184,0.30)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface-glass-subtle)';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
          }}
          title="Switch workflow"
          aria-label="Switch workflow"
          aria-expanded={dropdownOpen}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Switch
          </span>
          {mlWorkflows.length > 0 && <span style={styles.countChip}>{mlWorkflows.length}</span>}
          <ChevronIcon open={dropdownOpen} />
        </button>

        {dropdownOpen && (
          <div style={styles.overlay}>
            {mlWorkflows.length === 0 ? (
              <div style={styles.emptyState}>No saved workflows yet — create one to get started</div>
            ) : (
              mlWorkflows.map((wf) => {
                const isActive = mlActiveWorkflow?.id === wf.id;
                return (
                  <button
                    key={wf.id}
                    style={{ ...styles.overlayItem, ...(isActive ? styles.overlayItemActive : {}) }}
                    onClick={() => handleLoad(wf.id)}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--surface-glass-subtle)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={styles.dot(
                      wf.stages && Object.values(wf.stages).some((s) => s.status === 'complete' || s.status === 'done')
                    )} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
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
          title="Create a new workflow"
          aria-label="New workflow"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(37,99,235,0.10)';
            e.currentTarget.style.borderColor = 'rgba(37,99,235,0.32)';
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface-glass-subtle)';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.color = TOKENS.text.secondary;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <PlusIcon /> New
        </button>

        <button
          style={{ ...styles.btn, opacity: mlActiveWorkflow ? 1 : 0.4, pointerEvents: mlActiveWorkflow ? 'auto' : 'none' }}
          onClick={handleSave}
          title="Save current workflow"
          aria-label="Save workflow"
          onMouseEnter={(e) => {
            if (!mlActiveWorkflow) return;
            e.currentTarget.style.background = 'rgba(37,99,235,0.10)';
            e.currentTarget.style.borderColor = 'rgba(37,99,235,0.32)';
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface-glass-subtle)';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.color = TOKENS.text.secondary;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <SaveIcon /> {saving ? 'Saving' : 'Save'}
        </button>

        {mlActiveWorkflow && (hovered || deleteConfirm.armed) && (
          <button
            style={{
              ...styles.btn,
              ...styles.btnDanger,
              ...(deleteConfirm.armed ? {
                background: 'linear-gradient(180deg, rgba(239,68,68,0.28), rgba(239,68,68,0.12))',
                color: '#fff',
                borderColor: 'rgba(239,68,68,0.60)',
                boxShadow: '0 10px 24px -10px rgba(239,68,68,0.55), 0 0 0 3px rgba(239,68,68,0.16)',
              } : {}),
            }}
            onClick={deleteConfirm.trigger}
            onBlur={deleteConfirm.reset}
            title={deleteConfirm.armed ? 'Click again to confirm delete' : 'Delete workflow'}
            aria-label={deleteConfirm.armed ? 'Confirm delete workflow' : 'Delete workflow'}
          >
            <TrashIcon />
            {deleteConfirm.armed && <span style={{ marginLeft: 2 }}>Confirm</span>}
          </button>
        )}
      </div>
    </div>
  );
}
