import { useEffect, useCallback } from "react";
import { useStore } from "../store";
import { api } from "../api";
import AgentPanel from "../components/agent/AgentPanel";
import DatabaseSwitcher from "../components/DatabaseSwitcher";
import MLPipeline from "../components/ml/MLPipeline";
import WorkflowBar from "../components/ml/WorkflowBar";
import { TOKENS } from "../components/dashboard/tokens";

/* ── Status badge helper ── */
function StatusBadge({ label, color }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: `${color}15`, color }}
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
      <span className="block text-xs" style={{ color: TOKENS.text.muted }}>
        {label}
      </span>
      <span
        className="block text-sm font-semibold tabular-nums"
        style={{ color: TOKENS.text.primary }}
      >
        {formatted}
      </span>
    </div>
  );
}

/* ── Model card ── */
function ModelCard({ model, onDelete }) {
  const taskColor =
    model.task_type === "classification" ? TOKENS.brandPurple : TOKENS.info;

  return (
    <div
      style={{
        borderRadius: TOKENS.radius.lg,
        border: `1px solid ${TOKENS.border.default}`,
        background: TOKENS.bg.surface,
        boxShadow: TOKENS.tile.shadow,
        transition: `box-shadow ${TOKENS.transition}, border-color ${TOKENS.transition}`,
        overflow: "hidden",
      }}
      className="group hover:shadow-lg"
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = TOKENS.tile.shadowHover;
        e.currentTarget.style.borderColor = TOKENS.border.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = TOKENS.tile.shadow;
        e.currentTarget.style.borderColor = TOKENS.border.default;
      }}
    >
      {/* Header strip */}
      <div
        style={{ height: 3, background: taskColor, opacity: 0.6 }}
        aria-hidden="true"
      />

      <div style={{ padding: 16 }}>
        {/* Title row */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h4
              className="text-sm font-semibold truncate"
              style={{
                color: TOKENS.text.primary,
                fontFamily: TOKENS.tile.headerFont,
              }}
            >
              {model.model_name || model.model_id}
            </h4>
            {model.target_column && (
              <p
                className="text-xs mt-0.5 truncate"
                style={{ color: TOKENS.text.muted }}
              >
                Target: {model.target_column}
              </p>
            )}
          </div>
          <StatusBadge label={model.task_type || "model"} color={taskColor} />
        </div>

        {/* Metrics grid */}
        {model.metrics && Object.keys(model.metrics).length > 0 && (
          <div
            className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3 pt-3"
            style={{ borderTop: `1px solid ${TOKENS.border.default}` }}
          >
            {Object.entries(model.metrics).map(([key, val]) => (
              <MetricCell key={key} label={key} value={val} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs" style={{ color: TOKENS.text.muted }}>
            {model.created_at
              ? new Date(model.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : ""}
          </span>
          <button
            onClick={() => onDelete?.(model.model_id)}
            className="text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            style={{
              color: TOKENS.danger,
              background: "transparent",
              border: "none",
            }}
            aria-label={`Delete model ${model.model_name || model.model_id}`}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Empty state ── */
function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-20"
      style={{ color: TOKENS.text.muted }}
    >
      {/* Beaker icon */}
      <svg
        className="w-12 h-12 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.2}
        style={{ opacity: 0.4 }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M5 14.5l-1.43 1.43a2.25 2.25 0 00-.32 2.817l.122.205a2.25 2.25 0 001.93 1.048h13.396a2.25 2.25 0 001.93-1.048l.122-.205a2.25 2.25 0 00-.32-2.817L19 14.5M5 14.5h14"
        />
      </svg>
      <p className="text-sm font-medium mb-1" style={{ color: TOKENS.text.secondary }}>
        No models trained yet
      </p>
      <p className="text-xs max-w-xs text-center">
        Use the agent panel to train ML models on your data. Ask something like
        &ldquo;Train a model to predict churn&rdquo;
      </p>
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
      <div className="flex-1 overflow-auto" style={{ padding: 24 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1
              className="text-xl font-semibold"
              style={{
                color: TOKENS.text.primary,
                fontFamily: TOKENS.tile.headerFont,
              }}
            >
              ML Engine
            </h1>
            <p className="text-xs mt-0.5" style={{ color: TOKENS.text.muted }}>
              Train and manage machine learning models on your data
            </p>
          </div>
          <DatabaseSwitcher connections={connections} activeConnId={activeConnId} onSwitch={setActiveConnId} liveConnIds={new Set(connections.map(c => c.conn_id))} />
        </div>

        {/* Workflow management bar */}
        <WorkflowBar connId={connId} />

        {/* Turbo Mode warning banner */}
        {turboWarning && (
          <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl" style={{
            background: `${TOKENS.warning}10`,
            border: `1px solid ${TOKENS.warning}30`,
          }}>
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: TOKENS.warning }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            <p className="text-xs" style={{ color: TOKENS.text.secondary }}>
              Enable <strong>Turbo Mode</strong> on your connection to train models. Go to the <a href="/dashboard" style={{ color: TOKENS.accent, textDecoration: 'underline' }}>Dashboard</a> to enable it.
            </p>
          </div>
        )}

        {/* ML Pipeline Visualization */}
        <MLPipeline onRunStage={handleRunStage} />

        {/* Models section */}
        {mlModels.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3
                className="text-sm font-medium"
                style={{ color: TOKENS.text.secondary }}
              >
                Trained Models
              </h3>
              <span
                className="text-xs tabular-nums px-1.5 py-0.5 rounded-md"
                style={{
                  background: TOKENS.bg.hover,
                  color: TOKENS.text.muted,
                }}
              >
                {mlModels.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mlModels.map((model) => (
                <ModelCard
                  key={model.model_id}
                  model={model}
                  onDelete={handleDelete}
                />
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
