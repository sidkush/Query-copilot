// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { TOKENS } from '../dashboard/tokens';
import PipelineStage from './PipelineStage';
import StageDetailPanel from './StageDetailPanel';

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

/* ── Connector line with animated dot ──────────────────────── */

function Connector({ fromStatus, toStatus }) {
  const isFlowing = fromStatus === 'complete' && (toStatus === 'active' || toStatus === 'complete');

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: 32, position: 'relative', flexShrink: 0 }}>
      {/* Line */}
      <div style={{
        width: '100%',
        height: 2,
        background: isFlowing ? TOKENS.accent : TOKENS.border.default,
        borderRadius: 1,
        transition: `background ${TOKENS.transition}`,
      }} />

      {/* Animated dot */}
      {isFlowing && (
        <motion.div
          style={{
            position: 'absolute',
            top: '50%',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: TOKENS.accent,
            boxShadow: `0 0 6px ${TOKENS.accent}`,
            marginTop: -3,
          }}
          animate={{ left: [0, 26] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }}
        />
      )}

      {/* Arrow head */}
      <svg
        width={6}
        height={8}
        viewBox="0 0 6 8"
        style={{
          position: 'absolute',
          right: -1,
          top: '50%',
          marginTop: -4,
          opacity: 0.5,
        }}
      >
        <path
          d="M0 0l5 4-5 4"
          stroke={isFlowing ? TOKENS.accent : TOKENS.text.muted}
          strokeWidth={1.2}
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
      {/* Pipeline row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px 0',
        justifyContent: 'center',
      }}>
        {STAGES.map((stage, i) => {
          const stageData = mlPipelineStages[stage.key] || { status: 'idle', data: null };
          return (
            <div key={stage.key} style={{ display: 'flex', alignItems: 'center' }}>
              <PipelineStage
                icon={stage.icon}
                label={stage.label}
                status={stageData.status}
                data={stageData.data}
                isActive={activeStage === stage.key}
                onClick={() => handleStageClick(stage.key)}
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

        {/* Reset button */}
        <button
          onClick={resetPipeline}
          style={{
            marginLeft: 12,
            padding: '4px 10px',
            fontSize: 10,
            color: TOKENS.text.muted,
            background: 'transparent',
            border: `1px solid ${TOKENS.border.default}`,
            borderRadius: TOKENS.radius.sm,
            cursor: 'pointer',
            transition: `all ${TOKENS.transition}`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = TOKENS.danger;
            e.currentTarget.style.color = TOKENS.danger;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = TOKENS.border.default;
            e.currentTarget.style.color = TOKENS.text.muted;
          }}
        >
          Reset Pipeline
        </button>
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
