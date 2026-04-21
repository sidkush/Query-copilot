import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { TOKENS } from '../dashboard/tokens';
import PipelineStage from './PipelineStage';
import StageDetailPanel from './StageDetailPanel';
import useConfirmAction from '../../lib/useConfirmAction';

/* ── Inline SVG icons (24x24, currentColor) ────────────────── */

const IconDatabase = (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx={12} cy={5} rx={8} ry={3} />
    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
  </svg>
);

const IconBroom = (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 21h4l2-7H7l-2 7z" />
    <path d="M11 14l1-4 4-6" />
    <path d="M16 4l2 2-5 7" />
    <path d="M7 14l4-1" />
  </svg>
);

const IconMicroscope = (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx={12} cy={7} r={3} />
    <path d="M12 10v6" />
    <path d="M8 21h8" />
    <path d="M12 16l-3 5" />
    <path d="M12 16l3 5" />
    <path d="M6 18h12" />
  </svg>
);

const IconCog = (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx={12} cy={12} r={3} />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

const IconChart = (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x={3} y={12} width={4} height={9} rx={1} />
    <rect x={10} y={7} width={4} height={14} rx={1} />
    <rect x={17} y={3} width={4} height={18} rx={1} />
  </svg>
);

const IconTrophy = (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M7 4h10v5a5 5 0 01-10 0V4z" />
    <path d="M17 5h2a2 2 0 012 2v1a4 4 0 01-4 4" />
    <path d="M7 5H5a2 2 0 00-2 2v1a4 4 0 004 4" />
  </svg>
);

const STAGES = [
  { key: 'ingest',   label: 'Data Ingest',    icon: IconDatabase },
  { key: 'clean',    label: 'Data Cleaning',   icon: IconBroom },
  { key: 'features', label: 'Feature Eng.',    icon: IconMicroscope },
  { key: 'train',    label: 'Training',        icon: IconCog },
  { key: 'evaluate', label: 'Evaluation',      icon: IconChart },
  { key: 'results',  label: 'Results',         icon: IconTrophy },
];

/* ── Connector — gradient beam with traveling light dot ───── */

function Connector({ fromStatus, toStatus }) {
  const isComplete = fromStatus === 'complete';
  const isFlowing = isComplete && (toStatus === 'active' || toStatus === 'complete');
  const lineColor = isComplete
    ? 'linear-gradient(90deg, rgba(34,197,94,0.65), rgba(96,165,250,0.70))'
    : 'linear-gradient(90deg, rgba(148,163,184,0.30), rgba(148,163,184,0.16))';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      width: 48,
      position: 'relative',
      flexShrink: 0,
      height: 116,
    }}>
      {/* Gradient line */}
      <div style={{
        width: '100%',
        height: 1.5,
        background: lineColor,
        borderRadius: 9999,
        boxShadow: isComplete ? '0 0 12px rgba(96,165,250,0.35)' : 'none',
        transition: 'background 480ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 480ms cubic-bezier(0.32, 0.72, 0, 1)',
      }} />

      {/* Tick marks */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        width: 4, height: 4,
        marginLeft: -2, marginTop: -2,
        borderRadius: '50%',
        background: isComplete ? '#60a5fa' : 'rgba(148,163,184,0.25)',
        boxShadow: isComplete ? '0 0 8px rgba(96,165,250,0.6)' : 'none',
        transition: 'all 480ms cubic-bezier(0.32, 0.72, 0, 1)',
      }} />

      {/* Traveling light beam */}
      {isFlowing && (
        <motion.div
          style={{
            position: 'absolute',
            top: '50%',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #60a5fa 0%, rgba(96,165,250,0.4) 50%, transparent 100%)',
            boxShadow: '0 0 14px rgba(96,165,250,0.85)',
            marginTop: -4,
          }}
          animate={{ left: [-4, 44] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: [0.32, 0.72, 0, 1], repeatDelay: 0.4 }}
        />
      )}

      {/* Arrow head */}
      <svg
        width={6}
        height={9}
        viewBox="0 0 6 9"
        style={{
          position: 'absolute',
          right: -2,
          top: '50%',
          marginTop: -4.5,
        }}
      >
        <path
          d="M0 0l5 4.5L0 9"
          stroke={isComplete ? '#60a5fa' : 'rgba(148,163,184,0.42)'}
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* ── Main pipeline container ───────────────────────────────── */

export default function MLPipeline({ onRunStage }) {
  const mlPipelineStages = useStore((s) => s.mlPipelineStages);
  const activeStage = useStore((s) => s.mlPipelineActiveStage);
  const setActiveStage = useStore((s) => s.setMLPipelineActiveStage);
  const updateStage = useStore((s) => s.updatePipelineStage);
  const resetPipeline = useStore((s) => s.resetMLPipeline);
  const mlActiveWorkflow = useStore((s) => s.mlActiveWorkflow);
  const resetConfirm = useConfirmAction(resetPipeline, { timeoutMs: 3500 });

  // Auto-open first stage when workflow is active but no stage selected
  useEffect(() => {
    if (mlActiveWorkflow && !activeStage) {
      setActiveStage('ingest');
    }
  }, [mlActiveWorkflow, activeStage, setActiveStage]);

  const handleStageClick = (key) => {
    setActiveStage(activeStage === key ? null : key);
  };

  const handleClose = () => setActiveStage(null);

  const handleApplyChanges = (changes) => {
    if (activeStage) {
      updateStage(activeStage, { data: { ...mlPipelineStages[activeStage]?.data, ...changes } });
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Pipeline rail — gradient ring outer + inner glass core */}
      <div className="ml-pipeline-rail">
        <div className="ml-pipeline-rail__inner">
          {/* Horizontal-scroll track preserves the pipeline metaphor even on
              narrow viewports. Never wraps mid-flow. Falls back to vertical
              scroll-hint below md:768. */}
          <div className="ml-pipeline-track" role="list">
            {STAGES.map((stage, i) => {
              const stageData = mlPipelineStages[stage.key] || { status: 'idle', data: null };
              return (
                <div key={stage.key} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }} role="listitem">
                  <PipelineStage
                    icon={stage.icon}
                    label={stage.label}
                    status={stageData.status}
                    data={stageData.data}
                    isActive={activeStage === stage.key}
                    onClick={() => handleStageClick(stage.key)}
                    stageNumber={i + 1}
                  />
                  {i < STAGES.length - 1 && (
                    <Connector
                      fromStatus={stageData.status}
                      toStatus={mlPipelineStages[STAGES[i + 1].key]?.status || 'idle'}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer row — hint + reset action */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            marginTop: 18,
            paddingTop: 16,
            borderTop: `1px solid ${TOKENS.border.default}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{
                fontSize: 12.5, color: TOKENS.text.secondary,
                fontFamily: "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif",
                letterSpacing: '-0.005em', lineHeight: 1.45,
                fontWeight: 500,
              }}>
                {activeStage
                  ? `Editing ${STAGES.find(s => s.key === activeStage)?.label || activeStage}`
                  : 'Tap a stage to configure and run it'}
              </span>
            </div>
            <button
              onClick={resetConfirm.trigger}
              onBlur={resetConfirm.reset}
              className="ml-pipeline-reset"
              data-armed={resetConfirm.armed || undefined}
              aria-label={resetConfirm.armed ? "Confirm reset pipeline" : "Reset pipeline"}
              title={resetConfirm.armed ? "Click again to confirm — this clears every stage" : "Reset pipeline"}
            >
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9" />
                <path d="M3 4v5h5" />
              </svg>
              {resetConfirm.armed ? "Confirm reset" : "Reset"}
            </button>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <StageDetailPanel
        stage={activeStage}
        data={activeStage ? mlPipelineStages[activeStage]?.data : null}
        onClose={handleClose}
        onApplyChanges={handleApplyChanges}
        onRunStage={onRunStage}
      />
    </div>
  );
}
