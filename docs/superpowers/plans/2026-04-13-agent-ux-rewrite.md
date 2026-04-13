# Agent Chat Experience (Claude Code-Style UX) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use ultraflow skills for building. Use taste/impeccable/emil-design-eng skills for ALL frontend components.

**Goal:** Rewrite agent UX from dead-spinner experience to Claude Code-style progressive rendering with thinking bubbles, animated checklists, collapsible tool calls, and smooth transitions. Unified renderer across Chat, Dashboard, and ML Engine contexts.

**Architecture:** `AgentStepRenderer` becomes a context-agnostic shared component. `AgentPanel` becomes a thin docking wrapper. `AgentStepFeed` delegates all rendering to `AgentStepRenderer`. Backend enriches SSE steps with brief_thinking summaries and guaranteed checklists.

**Tech Stack:** React 19, Framer Motion, ECharts, Zustand, existing TOKENS design system

**Spec:** `docs/superpowers/specs/2026-04-13-askdb-global-comp-design.md` — Phase 2

---

## File Structure

### New Files
- `frontend/src/components/agent/AgentStepRenderer.jsx` — unified, context-agnostic step renderer
- `frontend/src/components/agent/ThinkingBubble.jsx` — animated thinking indicator with brief summary
- `frontend/src/components/agent/AnimatedChecklist.jsx` — progressive checklist with micro-animations
- `frontend/src/components/agent/ToolCallCard.jsx` — collapsible tool call with icon + detail
- `frontend/src/components/agent/TierWaterfall.jsx` — animated tier routing visualization
- `frontend/src/components/agent/ProgressiveResult.jsx` — table rows slide in, chart animates
- `frontend/src/components/agent/StepTimestamp.jsx` — elapsed time display for long operations

### Modified Files
- `frontend/src/components/agent/AgentStepFeed.jsx` — delegates to AgentStepRenderer
- `frontend/src/components/agent/AgentPanel.jsx` — thin wrapper rewrite (gut rendering logic)
- `frontend/src/components/agent/AgentQuestion.jsx` — polished card with suggested responses
- `frontend/src/pages/Chat.jsx` — integrate AgentStepRenderer directly for full-width experience
- `frontend/src/store.js` — add agentContext field ('query'|'dashboard'|'ml')
- `backend/agent_engine.py` — richer thinking steps, guaranteed checklist within 2s

---

## Task 1: AgentStepRenderer — Core Shared Component

**Files:**
- Create: `frontend/src/components/agent/AgentStepRenderer.jsx`

> **REQUIRED:** Invoke taste or impeccable skill before writing this component.

- [ ] **Step 1: Create AgentStepRenderer.jsx**

This is the core component that replaces all rendering logic in AgentStepFeed. It renders ANY step type identically regardless of context (chat/dashboard/ML). The backend decides what steps to emit — the renderer just renders.

```jsx
import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ThinkingBubble from './ThinkingBubble';
import AnimatedChecklist from './AnimatedChecklist';
import ToolCallCard from './ToolCallCard';
import TierWaterfall from './TierWaterfall';
import ProgressiveResult from './ProgressiveResult';
import StepTimestamp from './StepTimestamp';
import AgentQuestion from './AgentQuestion';
import PerformancePill from '../PerformancePill';
import { TOKENS } from '../dashboard/tokens';

const STEP_VARIANTS = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
};

function StepWrapper({ children, stepType }) {
  return (
    <motion.div
      layout
      variants={STEP_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      data-step-type={stepType}
    >
      {children}
    </motion.div>
  );
}

/**
 * Context-agnostic step renderer. Renders any step type the same way.
 * Backend decides what steps to emit based on context (query/dashboard/ML).
 * This component never checks which "mode" it's in.
 */
function AgentStepRenderer({ steps, loading, waiting, waitingOptions, chatId, checklist, elapsedMs, estimatedMs, verification, compact = false }) {
  const skippedTypes = new Set(['phase_start', 'phase_complete', 'checklist_update', 'verification']);

  const visibleSteps = steps.filter(s => !skippedTypes.has(s.type));

  return (
    <div
      className="flex flex-col gap-3"
      style={{ padding: compact ? '8px 10px' : '12px 14px' }}
      aria-live="polite"
    >
      {/* Animated checklist at top when loading */}
      {loading && checklist && checklist.length > 0 && (
        <AnimatedChecklist items={checklist} elapsedMs={elapsedMs} estimatedMs={estimatedMs} />
      )}

      <AnimatePresence mode="popLayout">
        {visibleSteps.map((step, i) => (
          <StepWrapper key={step.id || `step-${i}`} stepType={step.type}>
            {renderStep(step, { compact, verification })}
          </StepWrapper>
        ))}
      </AnimatePresence>

      {/* Ask user question at bottom */}
      {waiting && (
        <StepWrapper stepType="ask_user">
          <AgentQuestion question={waiting} options={waitingOptions} chatId={chatId} />
        </StepWrapper>
      )}

      {/* Subtle pulse when loading and no steps yet */}
      {loading && visibleSteps.length === 0 && !checklist?.length && (
        <ThinkingBubble content="Connecting..." />
      )}
    </div>
  );
}

function renderStep(step, { compact, verification }) {
  switch (step.type) {
    case 'user_query':
      return (
        <div className="flex justify-end">
          <div className="agent-bubble-user" style={{ background: `${TOKENS.accent}18`, borderRadius: TOKENS.radius.lg, padding: '10px 14px', maxWidth: '80%' }}>
            {step.content}
          </div>
        </div>
      );

    case 'thinking':
      return <ThinkingBubble content={step.brief_thinking || step.content} />;

    case 'tool_call':
      return <ToolCallCard step={step} compact={compact} />;

    case 'result':
      return (
        <div>
          <ProgressiveResult step={step} compact={compact} />
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

    case 'error':
      return (
        <div style={{ color: TOKENS.colors.danger, padding: '8px 12px', borderRadius: TOKENS.radius.md, background: `${TOKENS.colors.danger}10` }}>
          {step.content}
        </div>
      );

    case 'tier_routing':
      return <TierWaterfall step={step} />;

    case 'tier_hit':
      return (
        <div className="flex items-center gap-2">
          <PerformancePill
            queryMs={step.elapsed_ms}
            tierName={step.metadata?.tier_name}
            rowsScanned={step.metadata?.row_count}
            arrowEnabled={step.metadata?.arrow_enabled}
          />
        </div>
      );

    case 'plan':
      return <AnimatedChecklist items={step.checklist || []} />;

    case 'progress':
      return (
        <div className="agent-progress" style={{ height: 4, borderRadius: 2, background: `${TOKENS.accent}20`, overflow: 'hidden' }}>
          <motion.div
            className="agent-progress__fill"
            style={{ height: '100%', background: TOKENS.accent, borderRadius: 2 }}
            initial={{ width: '0%' }}
            animate={{ width: `${Math.min((step.elapsed_ms / (step.estimated_total_ms || 1)) * 100, 100)}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      );

    case 'cached_result':
      return (
        <div>
          <div className="text-xs opacity-60 mb-1">Cached result (verifying...)</div>
          <ProgressiveResult step={step} compact={compact} />
        </div>
      );

    case 'live_correction':
      return (
        <div>
          <div className="text-xs mb-1" style={{ color: TOKENS.colors.success }}>Live verification complete</div>
          <ProgressiveResult step={step} compact={compact} />
        </div>
      );

    case 'budget_extension':
      return (
        <div className="text-xs" style={{ color: TOKENS.colors.warning, padding: '6px 10px' }}>
          {step.content}
        </div>
      );

    default:
      return null;
  }
}

export default memo(AgentStepRenderer);
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run build
```

Expected: Build succeeds (sub-components don't exist yet — will be stubs)

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/agent/AgentStepRenderer.jsx
git commit -m "feat: add AgentStepRenderer — unified context-agnostic step renderer"
```

---

## Task 2: ThinkingBubble Component

**Files:**
- Create: `frontend/src/components/agent/ThinkingBubble.jsx`

> **REQUIRED:** Invoke taste or impeccable skill.

- [ ] **Step 1: Create ThinkingBubble.jsx**

```jsx
import { motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

export default function ThinkingBubble({ content }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-start gap-2"
      style={{ padding: '8px 12px', borderRadius: TOKENS.radius.md }}
    >
      {/* Animated dots */}
      <div className="flex items-center gap-1 mt-1 shrink-0">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            style={{ width: 4, height: 4, borderRadius: '50%', background: TOKENS.accent }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      {/* Brief thinking text */}
      {content && (
        <span className="text-sm italic" style={{ color: `${TOKENS.text}80` }}>
          {content}
        </span>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/agent/ThinkingBubble.jsx
git commit -m "feat: add ThinkingBubble — animated thinking indicator with brief summary"
```

---

## Task 3: AnimatedChecklist Component

**Files:**
- Create: `frontend/src/components/agent/AnimatedChecklist.jsx`

> **REQUIRED:** Invoke taste or impeccable skill.

- [ ] **Step 1: Create AnimatedChecklist.jsx**

```jsx
import { motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

const CHECK_VARIANTS = {
  pending: { scale: 1, opacity: 0.4 },
  active: { scale: 1.05, opacity: 1 },
  done: { scale: 1, opacity: 1 },
};

export default function AnimatedChecklist({ items, elapsedMs, estimatedMs }) {
  if (!items || items.length === 0) return null;

  const doneCount = items.filter(it => it.status === 'done').length;
  const progress = items.length > 0 ? (doneCount / items.length) * 100 : 0;

  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: TOKENS.radius.md,
      background: `${TOKENS.accent}08`,
      border: `1px solid ${TOKENS.accent}15`,
    }}>
      {/* Progress bar */}
      <div style={{ height: 3, borderRadius: 2, background: `${TOKENS.accent}15`, marginBottom: 10, overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', background: TOKENS.accent, borderRadius: 2 }}
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Checklist items */}
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <motion.div
            key={item.label || i}
            className="flex items-center gap-2 text-xs"
            variants={CHECK_VARIANTS}
            animate={item.status}
          >
            {/* Checkbox icon */}
            {item.status === 'done' ? (
              <motion.svg
                width={14} height={14} viewBox="0 0 14 14"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                <circle cx={7} cy={7} r={6} fill={TOKENS.colors.success} opacity={0.15} />
                <path d="M4 7l2 2 4-4" stroke={TOKENS.colors.success} strokeWidth={1.5} fill="none" strokeLinecap="round" />
              </motion.svg>
            ) : item.status === 'active' ? (
              <motion.div
                style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${TOKENS.accent}` }}
                animate={{ borderColor: [TOKENS.accent, `${TOKENS.accent}40`, TOKENS.accent] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            ) : (
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${TOKENS.text}30` }} />
            )}

            {/* Label */}
            <span style={{
              color: item.status === 'done' ? TOKENS.colors.success : item.status === 'active' ? TOKENS.text : `${TOKENS.text}50`,
              textDecoration: item.status === 'done' ? 'line-through' : 'none',
            }}>
              {item.label}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Elapsed time */}
      {elapsedMs > 0 && (
        <div className="text-xs mt-2" style={{ color: `${TOKENS.text}50` }}>
          {(elapsedMs / 1000).toFixed(1)}s elapsed
          {estimatedMs > 0 && ` / ~${(estimatedMs / 1000).toFixed(0)}s estimated`}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/agent/AnimatedChecklist.jsx
git commit -m "feat: add AnimatedChecklist — progressive checklist with micro-animations"
```

---

## Task 4: ToolCallCard Component

**Files:**
- Create: `frontend/src/components/agent/ToolCallCard.jsx`

> **REQUIRED:** Invoke taste or impeccable skill.

- [ ] **Step 1: Create ToolCallCard.jsx**

Collapsible card showing tool name, brief description, and expandable detail. Reuses RunSqlStepRenderer logic from existing AgentStepFeed for `run_sql` tools.

```jsx
import { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

const ResultsChart = lazy(() => import('../ResultsChart'));

const TOOL_ICONS = {
  find_relevant_tables: '🔍',
  inspect_schema: '📊',
  run_sql: '⚡',
  suggest_chart: '📈',
  ask_user: '💬',
  summarize_results: '📝',
  list_dashboards: '📋',
  create_dashboard_tile: '➕',
  update_dashboard_tile: '✏️',
  delete_dashboard_tile: '🗑️',
  ml_ingest_data: '📥',
  ml_analyze_features: '🔬',
  ml_prepare_data: '🧹',
  ml_train: '🏋️',
  ml_evaluate: '📊',
  ml_predict: '🎯',
};

const TOOL_LABELS = {
  find_relevant_tables: 'Scanning tables',
  inspect_schema: 'Inspecting schema',
  run_sql: 'Executing query',
  suggest_chart: 'Suggesting visualization',
  summarize_results: 'Analyzing results',
  ml_ingest_data: 'Ingesting data',
  ml_analyze_features: 'Analyzing features',
  ml_prepare_data: 'Preparing data',
  ml_train: 'Training model',
  ml_evaluate: 'Evaluating results',
  ml_predict: 'Running prediction',
};

export default function ToolCallCard({ step, compact }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[step.tool_name] || '🔧';
  const label = TOOL_LABELS[step.tool_name] || step.tool_name;

  const hasResult = step.tool_result && step.tool_result !== 'null';
  let resultData = null;
  if (hasResult) {
    try { resultData = typeof step.tool_result === 'string' ? JSON.parse(step.tool_result) : step.tool_result; }
    catch { resultData = null; }
  }

  const hasColumns = resultData?.columns?.length > 0;
  const hasRows = resultData?.rows?.length > 0;

  return (
    <div
      style={{
        borderRadius: TOKENS.radius.md,
        border: `1px solid ${TOKENS.text}10`,
        overflow: 'hidden',
      }}
    >
      {/* Header — always visible, clickable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left"
        style={{
          padding: compact ? '6px 10px' : '8px 12px',
          background: `${TOKENS.text}04`,
          cursor: 'pointer',
        }}
      >
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-medium flex-1" style={{ color: `${TOKENS.text}90` }}>
          {label}
        </span>
        <motion.svg
          width={12} height={12} viewBox="0 0 12 12"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ opacity: 0.4 }}
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth={1.5} fill="none" />
        </motion.svg>
      </button>

      {/* Expandable detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${TOKENS.text}08` }}>
              {/* Tool input */}
              {step.tool_input && (
                <pre className="text-xs" style={{ color: `${TOKENS.text}60`, whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                  {typeof step.tool_input === 'string' ? step.tool_input : JSON.stringify(step.tool_input, null, 2)}
                </pre>
              )}

              {/* Result table */}
              {hasColumns && hasRows && (
                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {resultData.columns.map(col => (
                          <th key={col} style={{ padding: '4px 8px', textAlign: 'left', borderBottom: `1px solid ${TOKENS.text}10`, color: `${TOKENS.text}60` }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resultData.rows.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          {row.map((val, j) => (
                            <td key={j} style={{ padding: '3px 8px', borderBottom: `1px solid ${TOKENS.text}06` }}>
                              {val === null ? '—' : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {resultData.rows.length > 10 && (
                    <div className="text-xs mt-1" style={{ color: `${TOKENS.text}40` }}>
                      +{resultData.rows.length - 10} more rows
                    </div>
                  )}
                </div>
              )}

              {/* Text result */}
              {!hasColumns && resultData && typeof resultData === 'object' && (
                <pre className="text-xs" style={{ color: `${TOKENS.text}70`, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(resultData, null, 2).slice(0, 500)}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/agent/ToolCallCard.jsx
git commit -m "feat: add ToolCallCard — collapsible tool call with icon, label, expandable detail"
```

---

## Task 5: TierWaterfall + ProgressiveResult + StepTimestamp

**Files:**
- Create: `frontend/src/components/agent/TierWaterfall.jsx`
- Create: `frontend/src/components/agent/ProgressiveResult.jsx`
- Create: `frontend/src/components/agent/StepTimestamp.jsx`

> **REQUIRED:** Invoke taste or impeccable skill.

- [ ] **Step 1: Create TierWaterfall.jsx**

```jsx
import { motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

const TIERS = [
  { key: 'schema', label: 'Schema Cache', color: '#a78bfa' },
  { key: 'memory', label: 'Query Memory', color: '#60a5fa' },
  { key: 'turbo', label: 'Turbo Mode', color: '#34d399' },
  { key: 'live', label: 'Live Query', color: '#fbbf24' },
];

export default function TierWaterfall({ step }) {
  const tiersChecked = step.metadata?.tiers_checked || [];
  const hitTier = step.metadata?.tier_name;

  return (
    <div style={{ padding: '8px 12px' }}>
      <div className="text-xs mb-2" style={{ color: `${TOKENS.text}60` }}>Checking intelligence tiers...</div>
      <div className="flex flex-col gap-1">
        {TIERS.map((tier, i) => {
          const checked = tiersChecked.includes(tier.key) || (hitTier === tier.key);
          const isHit = hitTier === tier.key;
          return (
            <motion.div
              key={tier.key}
              className="flex items-center gap-2 text-xs"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: checked ? 1 : 0.3, x: 0 }}
              transition={{ delay: i * 0.15, duration: 0.2 }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: isHit ? tier.color : checked ? `${tier.color}40` : `${TOKENS.text}20` }} />
              <span style={{ color: isHit ? tier.color : `${TOKENS.text}60` }}>{tier.label}</span>
              {isHit && <span style={{ color: tier.color, fontWeight: 600 }}>HIT</span>}
              {checked && !isHit && <span style={{ color: `${TOKENS.text}30` }}>miss</span>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ProgressiveResult.jsx**

```jsx
import { lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import { TOKENS } from '../dashboard/tokens';

const ResultsChart = lazy(() => import('../ResultsChart'));
const ResultsTable = lazy(() => import('../ResultsTable'));

export default function ProgressiveResult({ step, compact }) {
  let resultData = null;
  if (step.tool_result) {
    try { resultData = typeof step.tool_result === 'string' ? JSON.parse(step.tool_result) : step.tool_result; }
    catch { resultData = null; }
  }

  const hasChart = resultData?.chart_suggestion || step.chart_suggestion;
  const hasTable = resultData?.columns?.length > 0 && resultData?.rows?.length > 0;

  return (
    <div className="agent-bubble-assistant" style={{ borderRadius: TOKENS.radius.lg, padding: compact ? '8px 10px' : '10px 14px' }}>
      {/* Markdown content */}
      {step.content && (
        <div className="agent-result-md text-sm">
          <ReactMarkdown>{step.content}</ReactMarkdown>
        </div>
      )}

      {/* Table */}
      {hasTable && (
        <Suspense fallback={<div className="text-xs" style={{ color: `${TOKENS.text}40` }}>Loading table...</div>}>
          <div style={{ maxHeight: compact ? 200 : 400, overflow: 'auto', marginTop: 8 }}>
            <ResultsTable columns={resultData.columns} rows={resultData.rows} />
          </div>
        </Suspense>
      )}

      {/* Chart */}
      {hasChart && (
        <Suspense fallback={<div className="text-xs" style={{ color: `${TOKENS.text}40` }}>Loading chart...</div>}>
          <div style={{ marginTop: 8, height: compact ? 200 : 300 }}>
            <ResultsChart
              columns={resultData?.columns}
              rows={resultData?.rows}
              chartSuggestion={hasChart}
            />
          </div>
        </Suspense>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create StepTimestamp.jsx**

```jsx
export default function StepTimestamp({ ms }) {
  if (!ms || ms < 500) return null;
  const formatted = ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
  return <span className="text-xs" style={{ opacity: 0.4 }}>{formatted}</span>;
}
```

- [ ] **Step 4: Verify frontend builds**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run build
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/agent/TierWaterfall.jsx frontend/src/components/agent/ProgressiveResult.jsx frontend/src/components/agent/StepTimestamp.jsx
git commit -m "feat: add TierWaterfall, ProgressiveResult, StepTimestamp components"
```

---

## Task 6: Rewrite AgentStepFeed to Delegate to AgentStepRenderer

**Files:**
- Modify: `frontend/src/components/agent/AgentStepFeed.jsx`

- [ ] **Step 1: Rewrite AgentStepFeed.jsx**

Keep the error boundary and scroll logic. Replace all step rendering with AgentStepRenderer.

Read the current `AgentStepFeed.jsx` first. Then replace the inner rendering (lines ~566-1004) with:

```jsx
import AgentStepRenderer from './AgentStepRenderer';

// Inside AgentStepFeedInner, replace the steps.map() + all step type blocks with:
<AgentStepRenderer
  steps={agentSteps}
  loading={agentLoading}
  waiting={agentWaiting}
  waitingOptions={agentWaitingOptions}
  chatId={agentChatId}
  checklist={agentChecklist}
  elapsedMs={agentElapsedMs}
  estimatedMs={agentEstimatedMs}
  verification={agentVerification}
/>
```

Keep: `StepFeedErrorBoundary`, scroll refs, auto-scroll effects, empty state message.
Remove: `ChecklistPanel`, `VerificationBadge`, `StepIcon`, `ChatBubble`, `RunSqlStepRenderer`, all step type rendering blocks.

- [ ] **Step 2: Verify frontend builds**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run build
```

- [ ] **Step 3: Run lint**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run lint
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/agent/AgentStepFeed.jsx
git commit -m "refactor: AgentStepFeed delegates to AgentStepRenderer — remove 700+ lines"
```

---

## Task 7: Rewrite AgentPanel as Thin Wrapper

**Files:**
- Modify: `frontend/src/components/agent/AgentPanel.jsx`

- [ ] **Step 1: Gut rendering logic, keep docking + resize**

Read current `AgentPanel.jsx`. Keep:
- All docking logic (float/right/bottom/left positioning)
- All resize handlers (edge resize, float resize, drag)
- SSE streaming initiation (handleSubmit)
- Session save/load
- Input field + send button
- Header with dock controls + close button

Replace: Any direct step rendering with `<AgentStepFeed />` (which now delegates to AgentStepRenderer).

The component should be ~300-400 lines of docking/resize/SSE code + `<AgentStepFeed />` in the body. No step rendering logic at all.

- [ ] **Step 2: Add compact prop passthrough**

Pass `compact={true}` to AgentStepFeed when panel width < 400px:

```jsx
<AgentStepFeed compact={agentPanelWidth < 400} />
```

AgentStepFeed passes this through to AgentStepRenderer.

- [ ] **Step 3: Verify frontend builds + lint**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run build && npm run lint
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/agent/AgentPanel.jsx
git commit -m "refactor: AgentPanel is thin docking wrapper — rendering delegated to AgentStepRenderer"
```

---

## Task 8: Store Updates + Agent Context

**Files:**
- Modify: `frontend/src/store.js`

- [ ] **Step 1: Add agentContext to store**

In `frontend/src/store.js`, add to agent slice (around line 194):

```javascript
agentContext: 'query', // 'query' | 'dashboard' | 'ml'
setAgentContext: (ctx) => set({ agentContext: ctx }),
```

This tells the backend what tool set to load. Not used by AgentStepRenderer (which is context-agnostic).

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/store.js
git commit -m "feat: add agentContext to store — query/dashboard/ml context switching"
```

---

## Task 9: Backend — Richer Thinking Steps + Guaranteed Checklist

**Files:**
- Modify: `backend/agent_engine.py`

- [ ] **Step 1: Add brief_thinking to AgentStep dataclass**

Find `AgentStep` dataclass (line ~309). Add field:

```python
brief_thinking: Optional[str] = None  # 1-2 sentence summary for UI
```

- [ ] **Step 2: Extract brief thinking from Claude's response**

In the agent loop where thinking content is emitted (find where `type="thinking"` steps are created), add brief extraction:

```python
# When emitting thinking step:
brief = content.split('.')[0] + '.' if content and '.' in content else content
if brief and len(brief) > 150:
    brief = brief[:147] + '...'
yield AgentStep(type="thinking", content=content, brief_thinking=brief, ...)
```

- [ ] **Step 3: Guarantee checklist emission within first 2 seconds**

In the agent loop, after the system prompt is built but before the first Claude API call, emit a default checklist:

```python
# Default checklist for all queries (emitted immediately)
default_checklist = [
    {"label": "Understanding question", "status": "active"},
    {"label": "Finding relevant tables", "status": "pending"},
    {"label": "Generating SQL", "status": "pending"},
    {"label": "Executing query", "status": "pending"},
    {"label": "Analyzing results", "status": "pending"},
]
yield AgentStep(type="plan", content="", checklist=default_checklist)
```

- [ ] **Step 4: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/agent_engine.py
git commit -m "feat: richer thinking steps with brief_thinking + guaranteed checklist emission"
```

---

## Task 10: Integration — Chat Page Agent + Final Verification

**Files:**
- Modify: `frontend/src/pages/Chat.jsx`

- [ ] **Step 1: Integrate AgentStepRenderer into Chat page**

Read current `Chat.jsx`. If agent is not yet integrated (it uses `AgentElapsedTimer` only), add the full agent experience. Import and render `AgentStepFeed` in the chat message area, wired to the same store state.

If agent IS already integrated via AgentPanel, verify the panel now uses the rewritten AgentStepRenderer. No additional work needed.

- [ ] **Step 2: Full build + lint verification**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run lint && npm run build
```

- [ ] **Step 3: Full backend test suite**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 4: Commit + push**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add -A
git commit -m "feat: agent UX rewrite complete — Claude Code-style progressive rendering"
git push origin askdb-global-comp
```
