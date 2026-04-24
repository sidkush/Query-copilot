import { SealCheck, Clock, ChartPieSlice, Warning } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

const ICONS = {
  live:       SealCheck,
  turbo:      Clock,
  sample:     ChartPieSlice,
  unverified: Warning,
};

export default function ProvenanceChip({ chip }) {
  if (!chip) return null;
  const Icon = ICONS[chip.trust] || SealCheck;
  return (
    <motion.span
      className={`provenance-chip provenance-chip--${chip.trust}`}
      role="status"
      aria-live="polite"
      aria-label={`Result trust: ${chip.label}`}
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <Icon size={11} weight="regular" aria-hidden="true" />
      <span className="provenance-chip__label">{chip.label}</span>
    </motion.span>
  );
}
