import { memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { TOKENS } from '../dashboard/tokens';
import ThinkingBubble from './ThinkingBubble';
import ToolCallCard from './ToolCallCard';
import TierWaterfall from './TierWaterfall';
import ProgressiveResult from './ProgressiveResult';
import PerformancePill from '../PerformancePill';
import AgentQuestion from './AgentQuestion';
import ReactMarkdown from 'react-markdown';
import { MD_COMPONENTS, REMARK_PLUGINS, FONT_BODY, FONT_DISPLAY, FONT_MONO } from '../../lib/agentMarkdown';

const EASE_OUT = [0.16, 1, 0.3, 1];

/* ── internal step types filtered from display ── */
const INTERNAL_TYPES = new Set([
  'phase_start',
  'phase_complete',
  'checklist_update',
  'verification',
]);

/* ── framer-motion variants for step entry/exit ── */
const STEP_VARIANTS = {
  initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -6, filter: 'blur(2px)' },
};

/* ── reasoning skeleton — editorial shimmer rows while waiting for first step ── */
function ReasoningSkeleton() {
  const rows = [
    { w: '72%', delay: 0.00, label: 'Reading your question' },
    { w: '58%', delay: 0.14, label: 'Resolving schema context' },
    { w: '44%', delay: 0.28, label: 'Planning retrieval path' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.42, ease: EASE_OUT }}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '14px 16px',
        borderRadius: 16,
        border: `1px solid ${TOKENS.border.default}`,
        background: 'color-mix(in oklab, var(--accent) 4%, transparent)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 10, fontWeight: 700,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: TOKENS.text.muted,
        fontFamily: FONT_DISPLAY,
      }}>
        <span className="agent-thinking-pulse" aria-hidden="true">
          <span className="agent-thinking-pulse__dot" />
          <span className="agent-thinking-pulse__ring" />
        </span>
        Warming up agent
      </div>
      {rows.map((r, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: r.delay, ease: EASE_OUT }}
          style={{ display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <motion.div
            aria-hidden="true"
            animate={{ opacity: [0.35, 0.85, 0.35] }}
            transition={{ duration: 1.8, delay: r.delay, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: TOKENS.accent,
              boxShadow: `0 0 0 3px color-mix(in oklab, var(--accent) 18%, transparent)`,
              flexShrink: 0,
            }}
          />
          <span style={{
            fontSize: 12, color: TOKENS.text.secondary,
            fontFamily: FONT_BODY, letterSpacing: '-0.005em',
            minWidth: 180,
          }}>
            {r.label}
          </span>
          <motion.div
            aria-hidden="true"
            animate={{
              backgroundPositionX: ['200%', '-200%'],
            }}
            transition={{ duration: 1.6, delay: r.delay, repeat: Infinity, ease: 'linear' }}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              maxWidth: r.w,
              background: `linear-gradient(90deg,
                color-mix(in oklab, var(--accent) 8%, transparent) 0%,
                color-mix(in oklab, var(--accent) 24%, transparent) 50%,
                color-mix(in oklab, var(--accent) 8%, transparent) 100%)`,
              backgroundSize: '200% 100%',
            }}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ── user query bubble (right-aligned) — agent panel "tactile intimate" tone ── */
function UserBubble({ step }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '100%' }}>
      <div
        className="agent-bubble-user"
        style={{
          maxWidth: '86%',
          padding: '10px 14px',
          borderRadius: 16,
          borderTopRightRadius: 5,
          wordBreak: 'break-word',
        }}
      >
        <div style={{
          fontSize: 12.5,
          color: TOKENS.text.primary,
          fontWeight: 500,
          lineHeight: 1.5,
          fontFamily: FONT_BODY,
          letterSpacing: '-0.005em',
        }}>
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

  if (!tasks || !Array.isArray(tasks)) {
    return step.content ? (
      <div className="agent-bubble-assistant" style={{ padding: '12px 16px', borderRadius: 16 }}>
        <div style={{ fontSize: 13, color: TOKENS.text.secondary, fontFamily: FONT_BODY, lineHeight: 1.55 }}>{step.content}</div>
      </div>
    ) : null;
  }

  return (
    <div className="agent-plan-card" style={{ padding: '14px 16px', borderRadius: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: TOKENS.text.muted,
        fontFamily: FONT_DISPLAY,
      }}>
        <span className="eyebrow-dot" aria-hidden="true" />
        Plan
        <span style={{ opacity: 0.35, fontWeight: 400 }}>·</span>
        <span style={{ color: TOKENS.text.secondary, fontWeight: 600 }}>
          {tasks.length} step{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>
      {step.content && (
        <div style={{
          color: TOKENS.text.secondary, marginBottom: 12, fontSize: 12.5,
          lineHeight: 1.6, fontFamily: FONT_BODY, letterSpacing: '-0.005em',
        }}>
          {step.content}
        </div>
      )}
      <ol style={{ display: 'flex', flexDirection: 'column', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
        {tasks.map((task, j) => (
          <li key={j} style={{
            display: 'flex', alignItems: 'center', gap: 11,
            fontSize: 12, padding: '4px 0',
            fontFamily: FONT_BODY,
          }}>
            <span style={{
              flexShrink: 0, width: 20, height: 20, borderRadius: 9999,
              background: 'linear-gradient(180deg, rgba(37,99,235,0.16), rgba(37,99,235,0.08))',
              border: '1px solid rgba(37, 99, 235, 0.28)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
              color: TOKENS.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, fontFamily: FONT_MONO,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {String(j + 1).padStart(2, '0')}
            </span>
            <span style={{ color: TOKENS.text.primary, flex: 1, lineHeight: 1.5, letterSpacing: '-0.005em' }}>
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
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>{step.content}</ReactMarkdown>
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
    <div className="agent-bubble-assistant" style={{ borderRadius: 16, padding: '14px 16px' }}>
      {step.content && (
        <div className="agent-result-md" style={{
          fontSize: 12.5, color: TOKENS.text.primary,
          maxHeight: 520, overflowY: 'auto', overflowX: 'hidden',
          wordBreak: 'break-word', overflowWrap: 'anywhere',
          fontFamily: FONT_BODY, lineHeight: 1.55,
          letterSpacing: '-0.005em',
        }}>
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>{step.content}</ReactMarkdown>
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

/* ── ask_user step (interactive if active, muted echo when done) ── */
function AskUserStep({ step, isActive, chatId }) {
  const options = Array.isArray(step.tool_input) ? step.tool_input : null;
  if (isActive) {
    return <AgentQuestion question={step.content} options={options} chatId={chatId} />;
  }
  return (
    <div
      style={{
        borderRadius: TOKENS.radius.md,
        padding: '10px 14px',
        background: 'rgba(37, 99, 235, 0.05)',
        border: '1px solid rgba(37, 99, 235, 0.18)',
      }}
    >
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: TOKENS.text.muted,
        fontFamily: FONT_DISPLAY, marginBottom: 6,
      }}>
        Agent asked
      </div>
      <div style={{
        fontSize: 12.5, color: TOKENS.text.primary,
        lineHeight: 1.55, fontFamily: FONT_BODY,
      }}>
        {step.content}
      </div>
      {options && options.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {options.map((opt, i) => (
            <span
              key={i}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                borderRadius: 9999,
                border: `1px solid ${TOKENS.border.default}`,
                color: TOKENS.text.muted,
                fontFamily: FONT_BODY,
              }}
            >
              {opt}
            </span>
          ))}
        </div>
      )}
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
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.35rem 0.85rem', borderRadius: 9999,
        fontSize: 11.5, color: TOKENS.text.muted,
        fontFamily: FONT_BODY, fontWeight: 500,
        letterSpacing: '0.005em',
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ color: TOKENS.success, opacity: 0.85, flexShrink: 0 }}>
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
            // Raw feature details for table preview
            preview: features.map(f => ({
              name: f.name,
              type: f.type || 'unknown',
              nullPct: f.missing_pct || 0,
              unique: f.unique_count || 0,
              mean: f.mean != null ? f.mean : null,
              min: f.min != null ? f.min : null,
              max: f.max != null ? f.max : null,
            })),
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

  // Merge duplicate tool_call steps sharing a tool_use_id.
  // Backend yields each tool_call twice — first without tool_result, then again
  // with it populated — so SQLite stores both. Collapse into one entry per
  // tool_use_id, keeping the version that has a result when available. Without
  // this, React sees duplicate keys and the ToolCallCard expand state
  // mis-associates, leaving most cards empty-looking when clicked.
  const mergedSteps = (() => {
    const byId = new Map();
    const out = [];
    for (const s of visibleSteps) {
      if (s.type === 'tool_call' && s.tool_use_id) {
        const prevIdx = byId.get(s.tool_use_id);
        if (prevIdx === undefined) {
          byId.set(s.tool_use_id, out.length);
          out.push(s);
        } else {
          const prev = out[prevIdx];
          const hasResult = (v) => v != null && v !== '' && v !== 'null';
          if (hasResult(s.tool_result) && !hasResult(prev.tool_result)) {
            out[prevIdx] = { ...prev, ...s };
          } else if (hasResult(prev.tool_result) && !hasResult(s.tool_result)) {
            // keep existing with result
          } else {
            out[prevIdx] = { ...prev, ...s };
          }
        }
      } else {
        out.push(s);
      }
    }
    return out;
  })();

  // Dedup: skip result steps that duplicate a recent live_correction or cached_result
  const deduped = mergedSteps.filter((step, i) => {
    if (step.type === 'result' && step.content) {
      const recentStart = Math.max(0, i - 5);
      return !mergedSteps.slice(recentStart, i).some(
        (prev) =>
          (prev.type === 'live_correction' || prev.type === 'cached_result') &&
          prev.content === step.content,
      );
    }
    return true;
  });

  // Premium reasoning skeleton — no dead spinner. Three shimmer rows
  // that mimic a real thinking step so the feed never looks inert before
  // the first backend event arrives.
  if (loading && deduped.length === 0) {
    return <ReasoningSkeleton />;
  }

  return (
    <>
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
              transition={{ duration: 0.42, ease: EASE_OUT }}
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
              {step.type === 'ask_user' && <AskUserStep step={step} isActive={isActive} chatId={chatId} />}
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
