import { memo, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { TOKENS } from '../dashboard/tokens';
import ThinkingBubble from './ThinkingBubble';
import AnimatedChecklist from './AnimatedChecklist';
import ToolCallCard from './ToolCallCard';
import TierWaterfall from './TierWaterfall';
import ProgressiveResult from './ProgressiveResult';
import PerformancePill from '../PerformancePill';
import AgentQuestion from './AgentQuestion';
import ReactMarkdown from 'react-markdown';

/* ── internal step types filtered from display ── */
const INTERNAL_TYPES = new Set([
  'phase_start',
  'phase_complete',
  'checklist_update',
  'verification',
]);

/* ── framer-motion variants for step entry/exit ── */
const STEP_VARIANTS = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

/* ── reusable markdown component config ── */
const MD_COMPONENTS = {
  h1: ({ children }) => (
    <div style={{ fontSize: 15, fontWeight: 700, color: TOKENS.text.primary, marginTop: 8, marginBottom: 4 }}>{children}</div>
  ),
  h2: ({ children }) => (
    <div style={{ fontSize: 14, fontWeight: 600, color: TOKENS.text.primary, marginTop: 6, marginBottom: 3 }}>{children}</div>
  ),
  h3: ({ children }) => (
    <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text.secondary, marginTop: 4, marginBottom: 2 }}>{children}</div>
  ),
  p: ({ children }) => <div style={{ marginBottom: 4, lineHeight: 1.5 }}>{children}</div>,
  strong: ({ children }) => <span style={{ fontWeight: 600, color: TOKENS.text.primary }}>{children}</span>,
  ul: ({ children }) => <ul style={{ paddingLeft: 16, margin: '4px 0' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 16, margin: '4px 0' }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 2, fontSize: 12 }}>{children}</li>,
  code: ({ children }) => (
    <span style={{ fontSize: 11, background: TOKENS.bg.base, padding: '1px 4px', borderRadius: 3, color: TOKENS.accentLight }}>{children}</span>
  ),
};

/* ── user query bubble (right-aligned) ── */
function UserBubble({ step }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '100%' }}>
      <div
        className="agent-bubble-user"
        style={{
          maxWidth: '92%',
          padding: '10px 14px',
          borderRadius: '14px',
          borderTopRightRadius: '4px',
          wordBreak: 'break-word',
        }}
      >
        <div style={{ fontSize: '13px', color: TOKENS.text.primary, fontWeight: 500 }}>
          {step.content}
        </div>
      </div>
    </div>
  );
}

/* ── error step ── */
function ErrorStep({ step }) {
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: TOKENS.radius.md,
      background: `${TOKENS.danger}0d`,
      border: `1px solid ${TOKENS.danger}33`,
    }}>
      <span style={{ fontSize: '12px', color: TOKENS.danger }}>{step.content}</span>
    </div>
  );
}

/* ── tier hit badge ── */
function TierHitBadge({ step }) {
  const TIER_LABELS = {
    schema: 'Answered from schema cache',
    memory: 'Answered from team knowledge',
    turbo: 'Answered from Turbo Mode',
    live: 'Querying live database',
  };
  const label = TIER_LABELS[step.tier] || `Tier: ${step.tier}`;
  const cacheAge = step.cache_age_seconds;

  return (
    <div>
      <span className="agent-status-pill agent-status-pill--hit">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12l5 5L20 7" />
        </svg>
        {label}
        {cacheAge > 0 && (
          <span style={{ color: TOKENS.text.muted, fontWeight: 400, marginLeft: 4 }}>
            ({cacheAge < 60
              ? `${cacheAge}s ago`
              : cacheAge < 3600
                ? `${Math.round(cacheAge / 60)}m ago`
                : `${Math.round(cacheAge / 3600)}h ago`})
          </span>
        )}
      </span>
      {step.metadata && (
        <PerformancePill
          queryMs={step.elapsed_ms || step.metadata?.query_ms}
          tierName={step.metadata?.tier_name || step.tier}
          rowsScanned={step.metadata?.row_count}
          arrowEnabled={step.metadata?.arrow_enabled}
        />
      )}
    </div>
  );
}

/* ── plan step with numbered task list ── */
function PlanStep({ step }) {
  const tasks = step.tool_input;
  const items = step.checklist;

  // If a checklist array is present, use AnimatedChecklist
  if (items && Array.isArray(items) && items.length > 0) {
    return <AnimatedChecklist items={items} />;
  }

  // Fallback: show numbered plan tasks
  if (!tasks || !Array.isArray(tasks)) {
    return step.content ? (
      <div className="agent-bubble-assistant" style={{ padding: '10px 14px', borderRadius: TOKENS.radius.md }}>
        <div className="text-sm" style={{ color: TOKENS.text.secondary }}>{step.content}</div>
      </div>
    ) : null;
  }

  return (
    <div className="agent-plan-card" style={{ fontSize: '12px', padding: '12px 14px', borderRadius: 12 }}>
      <div className="agent-step__label" style={{ marginBottom: 8 }}>
        <span className="eyebrow-dot" aria-hidden="true" />
        Plan
        <span style={{ opacity: 0.4 }}>&middot;</span>
        <span style={{ letterSpacing: '0.04em', textTransform: 'none', fontWeight: 500 }}>
          {tasks.length} step{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>
      {step.content && (
        <div style={{ color: TOKENS.text.secondary, marginBottom: 10, fontSize: 12, lineHeight: 1.55 }}>
          {step.content}
        </div>
      )}
      <ol style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: 0, padding: 0, listStyle: 'none' }}>
        {tasks.map((task, j) => (
          <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11.5, padding: '3px 0' }}>
            <span style={{
              flexShrink: 0, width: 18, height: 18, borderRadius: 9999,
              background: TOKENS.accentGlow, border: '1px solid rgba(37, 99, 235, 0.25)',
              color: TOKENS.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontVariantNumeric: 'tabular-nums',
            }}>
              {String(j + 1).padStart(2, '0')}
            </span>
            <span style={{ color: TOKENS.text.primary, flex: 1, lineHeight: 1.45 }}>
              {task.title || task}
            </span>
            {task.chart_type && (
              <span className="agent-tool-tag" style={{ flexShrink: 0 }}>{task.chart_type}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── progress bar step ── */
function ProgressStep({ step }) {
  return (
    <div style={{ fontSize: 12, color: TOKENS.text.secondary, padding: '6px 0' }}>
      <div style={{ marginBottom: 6, fontStyle: 'italic' }}>{step.content || 'Processing'}</div>
      {step.total_sub_queries > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="agent-progress agent-progress--success">
            <div
              className="agent-progress__fill"
              style={{ transform: `scaleX(${Math.min(1, ((step.sub_query_index || 0) + 1) / step.total_sub_queries)})` }}
            />
          </div>
          <span style={{
            fontSize: 10, color: TOKENS.text.muted,
            fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          }}>
            {(step.sub_query_index || 0) + 1}/{step.total_sub_queries}
          </span>
        </div>
      ) : step.estimated_total_ms > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="agent-progress">
            <div
              className="agent-progress__fill"
              style={{ transform: `scaleX(${Math.min(1, (step.elapsed_ms || 0) / step.estimated_total_ms)})` }}
            />
          </div>
          <span style={{
            fontSize: 10, color: TOKENS.text.muted,
            fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          }}>
            {Math.round((step.elapsed_ms || 0) / 1000)}s / ~{Math.round(step.estimated_total_ms / 1000)}s
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ── cached result step ── */
function CachedResultStep({ step, loading }) {
  const age = step.cache_age_seconds;
  const ageColor = age != null
    ? (age < 60 ? TOKENS.success : age < 300 ? TOKENS.warning : TOKENS.danger)
    : null;
  const ageLabel = age != null
    ? (age < 60 ? `Fresh (${Math.round(age)}s ago)` : age < 300 ? `Cached (${Math.round(age / 60)}m ago)` : `Stale (${Math.round(age / 60)}m ago)`)
    : null;
  const ageBg = ageColor === TOKENS.success ? 'rgba(34,197,94,0.1)' : ageColor === TOKENS.warning ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';

  return (
    <div style={{
      fontSize: '13px', color: TOKENS.text.primary,
      padding: '10px 14px', borderRadius: TOKENS.radius.sm,
      background: 'rgba(6, 182, 212, 0.06)',
      border: '1px solid rgba(6, 182, 212, 0.35)',
    }}>
      <div style={{
        fontSize: '11px', color: TOKENS.info, fontWeight: 600, marginBottom: '6px',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        Instant answer
        {ageColor && (
          <span style={{
            fontWeight: 500, color: ageColor, fontSize: '10px',
            padding: '1px 6px', borderRadius: '8px', background: ageBg,
          }}>
            {ageLabel}
          </span>
        )}
      </div>
      <div style={{ wordBreak: 'break-word' }}>{step.content}</div>
      <div style={{
        fontSize: '10px', color: TOKENS.text.muted, marginTop: '6px',
        display: 'flex', alignItems: 'center', gap: '4px',
      }}>
        {loading ? (
          <>
            <span className="animate-pulse" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: TOKENS.info, display: 'inline-block',
            }} />
            Verifying with live data...
          </>
        ) : (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={TOKENS.success} strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Verified
          </>
        )}
      </div>
    </div>
  );
}

/* ── live correction step ── */
function LiveCorrectionStep({ step }) {
  const isConfirmed = step.diff_summary && step.diff_summary.toLowerCase().startsWith('confirmed');
  const borderColor = isConfirmed ? 'rgba(34, 197, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)';
  const bgColor = isConfirmed ? 'rgba(34, 197, 94, 0.06)' : 'rgba(245, 158, 11, 0.06)';
  const labelColor = isConfirmed ? TOKENS.success : TOKENS.warning;

  return (
    <div style={{
      fontSize: '13px', color: TOKENS.text.primary,
      padding: '10px 14px', borderRadius: TOKENS.radius.sm,
      background: bgColor, border: `1px solid ${borderColor}`,
    }}>
      <div style={{
        fontSize: '11px', fontWeight: 600, marginBottom: '4px',
        color: labelColor, display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        {isConfirmed ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            Verified
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Updated
          </>
        )}
      </div>
      <div style={{ fontSize: '12px', color: TOKENS.text.secondary, marginBottom: step.content ? '6px' : 0 }}>
        {step.diff_summary}
      </div>
      {step.content && !isConfirmed && (
        <div style={{ wordBreak: 'break-word', fontSize: 12 }}>
          <ReactMarkdown components={{
            p: ({ children }) => <div style={{ marginBottom: 3, lineHeight: 1.4 }}>{children}</div>,
            strong: ({ children }) => <span style={{ fontWeight: 600, color: TOKENS.text.primary }}>{children}</span>,
            ul: ({ children }) => <ul style={{ paddingLeft: 14, margin: '3px 0' }}>{children}</ul>,
            li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
          }}>{step.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/* ── budget extension step ── */
function BudgetExtensionStep({ step }) {
  return (
    <div style={{
      fontSize: '11px', color: TOKENS.warning, fontStyle: 'italic',
      padding: '3px 8px', borderRadius: TOKENS.radius.sm,
      background: 'rgba(245, 158, 11, 0.06)',
    }}>
      {step.content || 'Tool budget extended'}
    </div>
  );
}

/* ── tier routing step ── */
function TierRoutingStep({ step, isActive }) {
  return (
    <span className="agent-status-pill agent-status-pill--routing">
      {isActive ? (
        <span className="agent-thinking__dots" aria-hidden="true">
          <span /><span /><span />
        </span>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.6 }}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      {step.content || 'Checked tiers'}
    </span>
  );
}

/* ── result step with markdown + performance pill ── */
function ResultStep({ step, verification }) {
  return (
    <div className="agent-bubble-assistant" style={{ borderRadius: TOKENS.radius.lg, padding: '10px 14px' }}>
      {step.content && (
        <div className="agent-result-md" style={{
          fontSize: '13px', color: TOKENS.text.primary,
          maxHeight: '400px', overflowY: 'auto', wordBreak: 'break-word',
        }}>
          <ReactMarkdown components={MD_COMPONENTS}>{step.content}</ReactMarkdown>
        </div>
      )}
      {verification && <VerificationBadge verification={verification} />}
      {step.metadata && (
        <PerformancePill
          queryMs={step.elapsed_ms || step.metadata?.query_ms}
          tierName={step.metadata?.tier_name}
          rowsScanned={step.metadata?.row_count}
          arrowEnabled={step.metadata?.arrow_enabled}
        />
      )}
    </div>
  );
}

/* ── verification badge ── */
function VerificationBadge({ verification }) {
  if (!verification) return null;
  const colors = { HIGH: TOKENS.success, MEDIUM: TOKENS.warning, LOW: TOKENS.danger };
  const icons = { HIGH: '\u2713', MEDIUM: '\u2139', LOW: '\u26A0' };
  const labels = {
    HIGH: 'Verified against data',
    MEDIUM: 'Partially verified',
    LOW: 'Discrepancy detected \u2014 review data',
  };
  const c = verification.confidence || 'MEDIUM';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginTop: 8,
      borderRadius: 8, border: `1px solid ${colors[c]}33`, background: `${colors[c]}0d`,
    }}>
      <span style={{ fontSize: 16, color: colors[c] }}>{icons[c]}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors[c] }}>{c} Confidence</div>
        <div style={{ fontSize: 12, color: TOKENS.text.secondary }}>{labels[c]}</div>
        {verification.summary && (
          <div style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 2 }}>{verification.summary}</div>
        )}
      </div>
    </div>
  );
}

/* ── thinking step (inline, adapts to active/complete) ── */
function ThinkingStep({ step, isActive }) {
  if (isActive) {
    return <ThinkingBubble content={step.brief_thinking || step.content} />;
  }
  return (
    <div style={{ display: 'flex' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.35rem 0.75rem', borderRadius: 9999,
        fontSize: 12, color: TOKENS.text.muted,
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ color: TOKENS.text.muted, opacity: 0.5, flexShrink: 0 }}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
        {step.content || 'Analyzed'}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  AgentStepRenderer — unified, context-agnostic step rendering
 * ════════════════════════════════════════════════════════════════ */
const AgentStepRenderer = memo(function AgentStepRenderer({
  steps = [],
  loading = false,
  waiting = null,
  waitingOptions = null,
  chatId = null,
  checklist = [],
  elapsedMs = 0,
  estimatedMs = 0,
  verification = null,
  compact = false,
}) {
  const updatePipelineStage = useStore((s) => s.updatePipelineStage);
  const agentContext = useStore((s) => s.agentContext);

  // Watch for ML tool steps and update pipeline
  useEffect(() => {
    if (agentContext !== 'ml' || steps.length === 0) return;

    // Scan all steps for ML tool calls and their results
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Case 1: tool_call step with tool_result on same step
      if (step.tool_name && step.tool_result) {
        let parsed = null;
        try {
          parsed = typeof step.tool_result === 'string' ? JSON.parse(step.tool_result) : step.tool_result;
        } catch { /* ignore */ }

        if (step.tool_name === 'ml_analyze_features' && parsed) {
          // Transform raw feature array into shapes expected by StageDetailPanel
          const features = Array.isArray(parsed) ? parsed : parsed?.features || parsed?.columns || [];
          const totalCols = features.length;
          const withMissing = features.filter(f => (f.missing_pct || 0) > 0);
          const qualityScore = totalCols > 0
            ? Math.round(100 - features.reduce((s, f) => s + (f.missing_pct || 0), 0) / totalCols)
            : 100;

          // Estimate row count from the first numeric feature's stats if available
          const firstNumeric = features.find(f => f.type === 'numeric' && f.unique_count);
          const estimatedRows = firstNumeric?.unique_count || features.length || 0;
          const ingestData = {
            tables: [{ name: 'dataset', rows: estimatedRows, columns: totalCols }],
            totalFeatures: totalCols,
            rowCount: estimatedRows,
            columnCount: totalCols,
          };
          const cleanData = {
            qualityScore,
            imputationStrategy: withMissing.length > 0 ? 'Median (numeric) / Mode (categorical)' : 'None needed',
            missingValues: withMissing.map(f => ({ column: f.name, percent: f.missing_pct, strategy: f.type === 'numeric' ? 'Median' : 'Mode' })),
          };
          const featuresData = {
            features: features.map(f => ({
              name: f.name,
              type: f.type || 'unknown',
              nullPercent: f.missing_pct || 0,
              include: f.type !== 'pii',
            })),
          };

          updatePipelineStage('ingest', { status: 'complete', data: ingestData });
          updatePipelineStage('clean', { status: 'complete', data: cleanData });
          updatePipelineStage('features', { status: 'complete', data: featuresData });
        } else if (step.tool_name === 'ml_train' && parsed) {
          const models = parsed?.models || (Array.isArray(parsed) ? parsed : []);
          const trainData = {
            models: models.map(m => ({
              name: m.model_name || m.name,
              learning_rate: 0.1,
              n_estimators: 100,
              max_depth: 6,
              ...m.metrics,
            })),
          };
          const evalData = {
            metrics: models.map(m => ({
              model: m.model_name || m.name,
              accuracy: m.metrics?.accuracy,
              precision: m.metrics?.precision,
              recall: m.metrics?.recall,
              f1: m.metrics?.f1,
            })),
          };
          updatePipelineStage('train', { status: 'complete', data: trainData });
          updatePipelineStage('evaluate', { status: 'complete', data: evalData });
        } else if (step.tool_name === 'ml_evaluate' && parsed) {
          const models = parsed?.models || [];
          updatePipelineStage('results', { status: 'complete', data: {
            bestModel: models[0] || {},
            allModels: models,
          }});
        }
      }

      // Case 2: tool_call step without result yet — mark active
      if (step.type === 'tool_call' && !step.tool_result) {
        if (step.tool_name === 'ml_analyze_features') {
          updatePipelineStage('ingest', { status: 'active' });
        } else if (step.tool_name === 'ml_train') {
          updatePipelineStage('train', { status: 'active' });
        } else if (step.tool_name === 'ml_evaluate') {
          updatePipelineStage('evaluate', { status: 'active' });
        }
      }
    }
  }, [steps, agentContext, updatePipelineStage]);

  // Filter visible steps
  const visibleSteps = steps.filter((s) => !INTERNAL_TYPES.has(s.type));

  // Dedup: skip result steps that duplicate a recent live_correction or cached_result
  const deduped = visibleSteps.filter((step, i) => {
    if (step.type === 'result' && step.content) {
      const recentStart = Math.max(0, i - 5);
      return !visibleSteps.slice(recentStart, i).some(
        (prev) =>
          (prev.type === 'live_correction' || prev.type === 'cached_result') &&
          prev.content === step.content,
      );
    }
    return true;
  });

  // Show connecting bubble when loading with no steps
  if (loading && deduped.length === 0) {
    return <ThinkingBubble content="Connecting..." />;
  }

  return (
    <>
      {/* Checklist at top when loading */}
      {loading && checklist.length > 0 && (
        <AnimatedChecklist items={checklist} elapsedMs={elapsedMs} estimatedMs={estimatedMs} />
      )}

      {/* Step list */}
      <AnimatePresence mode="popLayout" initial={false}>
        {deduped.map((step, i) => {
          const key = step.tool_use_id || `${step.type}-${i}`;
          const isLast = i === deduped.length - 1;
          const isActive = loading && isLast;

          return (
            <motion.div
              key={key}
              variants={STEP_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              layout
            >
              {step.type === 'user_query' && <UserBubble step={step} />}
              {step.type === 'thinking' && <ThinkingStep step={step} isActive={isActive} />}
              {step.type === 'tool_call' && <ToolCallCard step={step} compact={compact} />}
              {step.type === 'result' && <ResultStep step={step} verification={verification} />}
              {step.type === 'error' && <ErrorStep step={step} />}
              {step.type === 'tier_routing' && <TierRoutingStep step={step} isActive={isActive} />}
              {step.type === 'tier_hit' && <TierHitBadge step={step} />}
              {step.type === 'plan' && <PlanStep step={step} />}
              {step.type === 'progress' && <ProgressStep step={step} />}
              {step.type === 'cached_result' && <CachedResultStep step={step} loading={loading} />}
              {step.type === 'live_correction' && <LiveCorrectionStep step={step} />}
              {step.type === 'budget_extension' && <BudgetExtensionStep step={step} />}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Agent question at bottom when waiting */}
      {waiting && (
        <AgentQuestion question={waiting} options={waitingOptions} chatId={chatId} />
      )}
    </>
  );
});

export default AgentStepRenderer;
