import { useEffect, useCallback } from "react";
import { useStore } from "../store";
import { api } from "../api";
import AgentPanel from "../components/agent/AgentPanel";
import DatabaseSwitcher from "../components/DatabaseSwitcher";
import MLPipeline from "../components/ml/MLPipeline";
import WorkflowBar from "../components/ml/WorkflowBar";
import { TOKENS } from "../components/dashboard/tokens";
import useConfirmAction from "../lib/useConfirmAction";

const FONT_DISPLAY_PAGE = "'Outfit', system-ui, sans-serif";
const FONT_BODY_PAGE = "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif";
const FONT_MONO_PAGE = "'JetBrains Mono', ui-monospace, monospace";

/* ── Status badge helper ── */
function StatusBadge({ label, color }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 9999,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        background: `${color}1a`,
        color,
        border: `1px solid ${color}3a`,
        fontFamily: FONT_DISPLAY_PAGE,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/* ── Metric cell ── */
function MetricCell({ label, value }) {
  const formatted =
    typeof value === "number"
      ? value < 1
        ? `${(value * 100).toFixed(1)}%`
        : value.toFixed(2)
      : String(value ?? "—");
  return (
    <div>
      <span style={{
        display: 'block',
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: TOKENS.text.muted,
        fontFamily: FONT_DISPLAY_PAGE,
        marginBottom: 4,
      }}>
        {label}
      </span>
      <span style={{
        display: 'block',
        fontSize: 17,
        fontWeight: 800,
        color: TOKENS.text.primary,
        fontFamily: FONT_DISPLAY_PAGE,
        letterSpacing: '-0.025em',
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {formatted}
      </span>
    </div>
  );
}

/* ── Model card — neutral glass, task color as single role-restricted accent ── */
function ModelCard({ model, onDelete }) {
  const taskColor =
    model.task_type === "classification" ? '#a855f7' : '#06b6d4';
  const deleteConfirm = useConfirmAction(() => onDelete?.(model.model_id), { timeoutMs: 3500 });

  // Theme-aware shadows via CSS vars — light theme gets slate-tinted shadows
  const baseShadow =
    '0 1px 0 var(--glass-highlight) inset, 0 18px 36px -24px var(--shadow-deep), 0 4px 10px -8px var(--shadow-soft)';
  const hoverShadow =
    '0 1px 0 var(--glass-highlight) inset, 0 26px 46px -22px var(--shadow-deep), 0 8px 16px -10px var(--shadow-mid)';

  return (
    <div
      className="ml-model-card group"
      style={{
        position: 'relative',
        borderRadius: 20,
        padding: 0,
        background: 'var(--glass-bg-card)',
        border: '1px solid var(--glass-border)',
        boxShadow: baseShadow,
        transition: 'transform 380ms cubic-bezier(0.32,0.72,0,1), box-shadow 380ms cubic-bezier(0.32,0.72,0,1), border-color 380ms cubic-bezier(0.32,0.72,0,1)',
        overflow: 'hidden',
        backdropFilter: 'blur(14px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = hoverShadow;
        e.currentTarget.style.borderColor = 'var(--glass-border-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = baseShadow;
        e.currentTarget.style.borderColor = 'var(--glass-border)';
      }}
    >
      <div style={{
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Top accent line — single role-restricted hint of task color */}
        <div style={{
          position: 'absolute',
          top: 0, left: 14, right: 14, height: 1,
          background: `linear-gradient(90deg, transparent, ${taskColor}66 50%, transparent)`,
          borderRadius: 9999,
        }} />

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{
              display: 'block',
              fontSize: 8.5, fontWeight: 700,
              letterSpacing: '0.20em', textTransform: 'uppercase',
              color: TOKENS.text.muted,
              fontFamily: FONT_DISPLAY_PAGE,
              marginBottom: 5,
            }}>
              Trained model
            </span>
            <h4 style={{
              fontSize: 16,
              fontWeight: 700,
              color: TOKENS.text.primary,
              fontFamily: FONT_DISPLAY_PAGE,
              letterSpacing: '-0.022em',
              lineHeight: 1.2,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {model.model_name || model.model_id}
            </h4>
            {model.target_column && (
              <p style={{
                fontSize: 11.5, color: TOKENS.text.muted,
                marginTop: 4,
                fontFamily: FONT_BODY_PAGE,
                letterSpacing: '-0.005em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                Target — {model.target_column}
              </p>
            )}
          </div>
          <StatusBadge label={model.task_type || "model"} color={taskColor} />
        </div>

        {/* Metrics grid */}
        {model.metrics && Object.keys(model.metrics).length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '14px 16px',
            marginBottom: 14,
            paddingTop: 14,
            borderTop: `1px solid ${TOKENS.border.default}`,
          }}>
            {Object.entries(model.metrics).map(([key, val]) => (
              <MetricCell key={key} label={key} value={val} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 4,
        }}>
          <span style={{
            fontSize: 10.5,
            color: TOKENS.text.muted,
            fontFamily: FONT_MONO_PAGE,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {model.created_at
              ? new Date(model.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : ""}
          </span>
          <button
            onClick={deleteConfirm.trigger}
            onBlur={deleteConfirm.reset}
            className="ml-model-delete"
            data-armed={deleteConfirm.armed || undefined}
            aria-label={deleteConfirm.armed ? `Confirm delete model ${model.model_name || model.model_id}` : `Delete model ${model.model_name || model.model_id}`}
            title={deleteConfirm.armed ? "Click again to confirm — this cannot be undone" : "Delete this model"}
          >
            {deleteConfirm.armed ? "Confirm?" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Empty state — premium halo ── */
function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '64px 24px',
      gap: 22,
    }}>
      {/* Double-bezel halo */}
      <div style={{
        padding: 8, borderRadius: 32,
        background: 'linear-gradient(180deg, rgba(37,99,235,0.20), rgba(37,99,235,0.04))',
        border: '1px solid rgba(37,99,235,0.22)',
        boxShadow: '0 26px 60px -28px rgba(37,99,235,0.50), inset 0 1px 0 rgba(255,255,255,0.10)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 26,
          background: 'radial-gradient(120% 120% at 30% 20%, rgba(37,99,235,0.35), rgba(37,99,235,0.04) 70%)',
          border: '1px solid rgba(37,99,235,0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
          color: TOKENS.accent,
        }}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M5 14.5l-1.43 1.43a2.25 2.25 0 00-.32 2.817l.122.205a2.25 2.25 0 001.93 1.048h13.396a2.25 2.25 0 001.93-1.048l.122-.205a2.25 2.25 0 00-.32-2.817L19 14.5M5 14.5h14" />
          </svg>
        </div>
      </div>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400 }}>
        <span style={{
          fontSize: 9, fontWeight: 700,
          letterSpacing: '0.24em', textTransform: 'uppercase',
          color: TOKENS.text.muted,
          fontFamily: FONT_DISPLAY_PAGE,
        }}>
          Ready when you are
        </span>
        <div style={{
          fontSize: 22, fontWeight: 800,
          color: TOKENS.text.primary,
          fontFamily: FONT_DISPLAY_PAGE,
          letterSpacing: '-0.025em',
          lineHeight: 1.15,
        }}>
          Train your first model
        </div>
        <p style={{
          fontSize: 13, color: TOKENS.text.muted,
          lineHeight: 1.6,
          fontFamily: FONT_BODY_PAGE,
          letterSpacing: '-0.005em',
          margin: 0,
        }}>
          Start with <strong style={{ color: TOKENS.text.secondary, fontWeight: 600 }}>Data Ingest</strong> above, or ask the agent panel: <em>&ldquo;Train a model to predict {'{'}target{'}'}.&rdquo;</em>
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MLEngine — ML workspace page with agent panel
   ════════════════════════════════════════════════════════════════ */
export default function MLEngine() {
  const activeConnId = useStore((s) => s.activeConnId);
  const connections = useStore((s) => s.connections);
  const setActiveConnId = useStore((s) => s.setActiveConnId);
  const turboStatus = useStore((s) => s.turboStatus);
  const setAgentContext = useStore((s) => s.setAgentContext);
  const agentPanelOpen = useStore((s) => s.agentPanelOpen);
  const setAgentPanelOpen = useStore((s) => s.setAgentPanelOpen);
  const mlModels = useStore((s) => s.mlModels);
  const setMLModels = useStore((s) => s.setMLModels);
  const resetMLPipeline = useStore((s) => s.resetMLPipeline);
  const mlActiveWorkflow = useStore((s) => s.mlActiveWorkflow);
  const updatePipelineStage = useStore((s) => s.updatePipelineStage);

  const connId = activeConnId;
  const turbo = turboStatus[connId];

  /* Set agent context to ML on mount, reset pipeline on unmount */
  useEffect(() => {
    setAgentContext("ml");
    return () => {
      setAgentContext("query");
      resetMLPipeline();
    };
  }, [setAgentContext, resetMLPipeline]);

  /* Open agent panel when connection is available */
  useEffect(() => {
    if (connId) setAgentPanelOpen(true);
  }, [connId, setAgentPanelOpen]);

  /* Load models when connection changes */
  useEffect(() => {
    if (!connId) return;
    api
      .mlModels()
      .then((res) => {
        if (res?.models) setMLModels(res.models);
      })
      .catch(() => {});
  }, [connId, setMLModels]);

  /* Stage execution handler */
  const handleRunStage = useCallback(async (stageKey, config) => {
    if (!mlActiveWorkflow) return;
    updatePipelineStage(stageKey, { status: 'active' });
    try {
      const result = await api.mlRunStage(mlActiveWorkflow.id, stageKey, config);
      const output = result.output || {};
      let stageData = output;

      if (stageKey === 'ingest' && output.features) {
        stageData = {
          tables: [{ name: 'dataset', rows: output.row_count, columns: output.column_count }],
          rowCount: output.row_count,
          columnCount: output.column_count,
          totalFeatures: output.column_count,
          preview: (output.features || []).map(f => ({
            name: f.name,
            type: f.type || 'unknown',
            nullPct: f.missing_pct || 0,
            unique: f.unique_count || 0,
            mean: f.mean != null ? f.mean : null,
            min: f.min != null ? f.min : null,
            max: f.max != null ? f.max : null,
          })),
        };
      } else if (stageKey === 'clean') {
        stageData = {
          qualityScore: output.quality_score,
          imputationStrategy: output.imputation_strategy,
          missingValues: (output.missing_details || []).map(m => ({
            column: m.column,
            percent: m.percent,
            strategy: m.strategy || 'median',
          })),
          features: output.features || [],
          totalColumns: output.total_columns,
          missingColumns: output.missing_columns,
        };
      } else if (stageKey === 'features') {
        stageData = {
          features: (output.selected || []).map(f => ({
            name: f.name,
            type: f.type,
            include: true,
          })),
          totalFeatures: output.total_features,
          selectedFeatures: output.selected_features,
          excludedNames: output.excluded_names || [],
        };
      } else if (stageKey === 'train') {
        stageData = {
          models: (output.models || []).map(m => ({
            name: m.name || m.model_name,
            ...m.metrics,
          })),
          task_type: output.task_type,
        };
      } else if (stageKey === 'evaluate') {
        stageData = {
          metrics: (output.models || []).map(m => ({
            model: m.name || m.model_name,
            ...m.metrics,
          })),
          bestModel: output.best_model,
        };
      }

      updatePipelineStage(stageKey, {
        status: 'complete',
        data: stageData,
      });

      // Seed clean stage with feature data from ingest so it has column info
      if (stageKey === 'ingest' && output.features) {
        updatePipelineStage('clean', {
          status: 'idle',
          data: {
            features: stageData.preview,
            qualityScore: null,
          },
        });

        // Also seed features stage with feature data
        updatePipelineStage('features', {
          status: 'idle',
          data: {
            features: stageData.preview.map(f => ({
              name: f.name,
              type: f.type,
              nullPercent: f.nullPct || 0,
              include: f.type !== 'pii',
              unique: f.unique,
              mean: f.mean,
              min: f.min,
              max: f.max,
              isCustom: false,
            })),
          },
        });
      }

      const updated = await api.mlLoadPipeline(mlActiveWorkflow.id);
      useStore.getState().setMLActiveWorkflow(updated);
    } catch (err) {
      const errorMsg = err?.message || err?.detail || String(err);
      updatePipelineStage(stageKey, {
        status: 'error',
        data: { error: errorMsg },
      });
      console.error(`Stage ${stageKey} failed:`, err);
    }
  }, [mlActiveWorkflow, updatePipelineStage]);

  /* Delete handler */
  const handleDelete = useCallback(
    (modelId) => {
      api
        .mlDeleteModel(modelId)
        .then(() => {
          setMLModels(mlModels.filter((m) => m.model_id !== modelId));
        })
        .catch(() => {});
    },
    [mlModels, setMLModels]
  );

  /* ── Gate: no connection ── */
  if (!connId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center" style={{ maxWidth: 360 }}>
          <svg
            className="w-10 h-10 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.4}
            style={{ color: TOKENS.text.muted }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
            />
          </svg>
          <h2
            className="text-lg font-semibold mb-2"
            style={{ color: TOKENS.text.primary, fontFamily: TOKENS.tile.headerFont }}
          >
            ML Engine
          </h2>
          <p className="text-sm mb-5" style={{ color: TOKENS.text.secondary }}>
            Connect a database to start building ML models
          </p>
          <DatabaseSwitcher connections={connections} activeConnId={activeConnId} onSwitch={setActiveConnId} liveConnIds={new Set(connections.map(c => c.conn_id))} />
        </div>
      </div>
    );
  }

  const turboWarning = !turbo?.enabled;

  /* ── Main layout ── */
  return (
    <div className="flex h-full overflow-hidden">
      {/* ML Workspace */}
      <div className="flex-1 overflow-auto ml-engine-scroll" style={{ padding: 'clamp(18px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px) clamp(32px, 4vw, 52px)' }}>
        {/* Header — editorial hero with instrument-strip subtitle */}
        <div className="flex items-start justify-between mb-10 gap-6 flex-wrap">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, flex: 1 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.24em', textTransform: 'uppercase',
              color: TOKENS.text.muted,
              fontFamily: "'Outfit', system-ui, sans-serif",
            }}>
              <span className="eyebrow-dot" aria-hidden="true" />
              AskDB · AutoML Workspace
            </span>
            <h1
              style={{
                fontSize: 'clamp(26px, 4.2vw, 40px)',
                lineHeight: 1.0,
                fontWeight: 800,
                color: TOKENS.text.primary,
                fontFamily: "'Outfit', system-ui, sans-serif",
                letterSpacing: '-0.035em',
                margin: 0,
              }}
            >
              ML Engine
            </h1>
            {/* Mono instrument strip — shows the six-stage sequence at a glance */}
            <div className="ml-hero-strip" aria-hidden="true">
              {['01 Ingest', '02 Clean', '03 Features', '04 Train', '05 Eval', '06 Results'].map((label, i, arr) => (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span className="ml-hero-strip__item">{label}</span>
                  {i < arr.length - 1 && <span className="ml-hero-strip__sep" aria-hidden="true" />}
                </span>
              ))}
            </div>
            <p style={{
              fontSize: 13.5,
              color: TOKENS.text.muted,
              fontFamily: "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif",
              letterSpacing: '-0.005em',
              lineHeight: 1.55,
              maxWidth: 560,
              margin: '2px 0 0',
            }}>
              Walk each stage in order. Tune what you need, skip what you don\u2019t, and see every decision the model makes along the way.
            </p>
          </div>
          <DatabaseSwitcher connections={connections} activeConnId={activeConnId} onSwitch={setActiveConnId} liveConnIds={new Set(connections.map(c => c.conn_id))} />
        </div>

        {/* Workflow management bar */}
        <div style={{ marginBottom: 22 }}>
          <WorkflowBar connId={connId} />
        </div>

        {/* Turbo Mode warning banner */}
        {turboWarning && (
          <div className="ml-warning-banner" style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px',
            marginBottom: 22,
            borderRadius: 16,
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.22)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(245,158,11,0.16)',
              border: '1px solid rgba(245,158,11,0.32)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ color: TOKENS.warning }}>
                <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, color: TOKENS.warning,
                letterSpacing: '0.20em', textTransform: 'uppercase',
                fontFamily: "'Outfit', system-ui, sans-serif",
                marginBottom: 3,
              }}>
                Turbo Mode is off
              </div>
              <div style={{
                fontSize: 12.5, color: TOKENS.text.secondary,
                fontFamily: "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif",
                lineHeight: 1.5, letterSpacing: '-0.005em',
              }}>
                Training needs a Turbo twin on this connection. <a href="/dashboard" style={{ color: TOKENS.accent, textDecoration: 'none', borderBottom: '1px solid rgba(37,99,235,0.32)', paddingBottom: 1 }}>Enable it in the Dashboard</a>.
              </div>
            </div>
          </div>
        )}

        {/* ML Pipeline Visualization */}
        <MLPipeline onRunStage={handleRunStage} />

        {/* Models section */}
        {mlModels.length > 0 ? (
          <div style={{ marginTop: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span className="eyebrow-dot" aria-hidden="true" />
              <span style={{
                fontSize: 9, fontWeight: 700,
                letterSpacing: '0.24em', textTransform: 'uppercase',
                color: TOKENS.text.muted,
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}>
                Trained Models
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: '2px 9px', borderRadius: 9999,
                background: 'rgba(37,99,235,0.12)',
                color: TOKENS.accent,
                border: '1px solid rgba(37,99,235,0.28)',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontVariantNumeric: 'tabular-nums',
              }}>
                {mlModels.length}
              </span>
            </div>
            <div className="ml-model-bento">
              {mlModels.map((model, i) => (
                <div
                  key={model.model_id}
                  className="ml-model-bento__cell"
                  data-span={
                    /* Asymmetric pattern: 1st and 4th cell span two columns on wide viewports.
                       Creates a 1-2-1 / 2-1-1 rhythm instead of flat 3-col grid. */
                    (i % 5 === 0 || i % 5 === 3) ? 'wide' : 'narrow'
                  }
                >
                  <ModelCard model={model} onDelete={handleDelete} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Agent Panel — docked right */}
      {agentPanelOpen && (
        <AgentPanel
          connId={connId}
          defaultDock="right"
          onClose={() => setAgentPanelOpen(false)}
        />
      )}
    </div>
  );
}
