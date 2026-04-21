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
      <div className="text-xs mb-2" style={{ color: TOKENS.text.muted }}>Checking intelligence tiers...</div>
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
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: isHit ? tier.color : checked ? `${tier.color}40` : TOKENS.border.default }} />
              <span style={{ color: isHit ? tier.color : TOKENS.text.muted }}>{tier.label}</span>
              {isHit && <span style={{ color: tier.color, fontWeight: 600 }}>HIT</span>}
              {checked && !isHit && <span style={{ color: TOKENS.text.muted }}>miss</span>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
