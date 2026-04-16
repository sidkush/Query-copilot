import { useStore } from '../../store';

export default function TierBadge({ strategy }) {
  const show = useStore((s) => s.showTierBadge);
  if (!show || !strategy) return null;

  const tier = strategy.tier || '?';
  const family = strategy.rendererFamily || '?';
  const backend = strategy.rendererBackend || '?';
  const reason = strategy.reason || '';
  const ds = strategy.downsample;
  const streaming = strategy.streaming?.enabled ? 'stream' : 'bulk';

  return (
    <div
      data-testid="tier-badge"
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        zIndex: 50,
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: 'monospace',
        lineHeight: 1.4,
        background: 'rgba(0, 0, 0, 0.75)',
        color: '#a0ffa0',
        border: '1px solid rgba(160, 255, 160, 0.2)',
        pointerEvents: 'none',
        maxWidth: 260,
        whiteSpace: 'pre-wrap',
      }}
    >
      {`${tier} · ${family}/${backend} · ${streaming}`}
      {ds?.enabled && `\n↓ ${ds.method} → ${ds.targetPoints}pts`}
      {reason && `\n${reason}`}
    </div>
  );
}
