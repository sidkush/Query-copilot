import { useState, useMemo } from 'react';
import { TOKENS } from './dashboard/tokens';

/* ───────────────────────────────────────────────────────────────────
 *  TurboStatusPanel — premium per-table breakdown for Smart Twin
 *  Shows sync status, per-table strategy, storage usage, last sync.
 * ──────────────────────────────────────────────────────────────── */

const pill = (bg, fg) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '.03em',
  lineHeight: '16px',
  background: bg,
  color: fg,
  whiteSpace: 'nowrap',
});

function formatCount(n) {
  if (n == null) return '\u2014';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TurboStatusPanel({ status, onRefresh, onDisable }) {
  const [hovered, setHovered] = useState(null);

  const twin_info = status?.twin_info;
  const tables = useMemo(() => twin_info?.tables_detail || [], [twin_info?.tables_detail]);
  const { fullCopy, smartSample } = useMemo(() => {
    let fc = 0, ss = 0;
    for (const t of tables) {
      if (t.strategy === 'Full copy') fc++;
      else ss++;
    }
    return { fullCopy: fc, smartSample: ss };
  }, [tables]);

  if (!status?.enabled || !twin_info?.exists) return null;

  const aggCount = twin_info.aggregate_count || 0;
  const sizeMb = twin_info.size_mb?.toFixed(1) || '?';
  const maxMb = 500;
  const pct = twin_info.size_mb != null ? Math.min((twin_info.size_mb / maxMb) * 100, 100) : 0;
  const syncing = status.syncing;

  return (
    <div
      style={{
        borderRadius: TOKENS.radius.lg,
        border: `1px solid ${TOKENS.border.default}`,
        background: TOKENS.bg.surface,
        boxShadow: TOKENS.tile.shadow,
        overflow: 'hidden',
        transition: `box-shadow ${TOKENS.transition}`,
      }}
    >
      {/* ── Header ───────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${TOKENS.border.default}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: syncing
                ? TOKENS.warning
                : TOKENS.success,
              boxShadow: syncing
                ? `0 0 6px ${TOKENS.warning}`
                : `0 0 6px ${TOKENS.success}`,
              animation: syncing ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '.01em',
              color: TOKENS.text.primary,
              fontFamily: TOKENS.tile.headerFont,
            }}
          >
            Turbo Mode
          </span>
          {syncing && (
            <span style={pill(`${TOKENS.warning}18`, TOKENS.warning)}>SYNCING</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onRefresh}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: TOKENS.radius.sm,
              border: `1px solid ${TOKENS.border.default}`,
              background: 'transparent',
              color: TOKENS.accent,
              cursor: 'pointer',
              transition: `all ${TOKENS.transition}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = TOKENS.bg.hover; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            Refresh
          </button>
          <button
            onClick={onDisable}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: TOKENS.radius.sm,
              border: `1px solid ${TOKENS.danger}30`,
              background: 'transparent',
              color: TOKENS.danger,
              cursor: 'pointer',
              transition: `all ${TOKENS.transition}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${TOKENS.danger}10`; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            Disable
          </button>
        </div>
      </div>

      {/* ── Table breakdown ──────────────────────────────────── */}
      <div style={{ padding: '0 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Table', 'Source', 'In Twin', 'Strategy'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i === 0 ? 'left' : 'right',
                    padding: '10px 0 8px',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    color: TOKENS.text.muted,
                    borderBottom: `1px solid ${TOKENS.border.default}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => {
              const isHovered = hovered === t.name;
              const coverage =
                t.source_rows && t.twin_rows
                  ? Math.min((t.twin_rows / t.source_rows) * 100, 100)
                  : null;
              return (
                <tr
                  key={t.name}
                  onMouseEnter={() => setHovered(t.name)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    transition: `background ${TOKENS.transition}`,
                    background: isHovered ? TOKENS.bg.hover : 'transparent',
                    cursor: 'default',
                  }}
                >
                  <td
                    style={{
                      padding: '7px 0',
                      fontSize: 12,
                      fontWeight: 500,
                      color: TOKENS.text.primary,
                      borderBottom: `1px solid ${TOKENS.border.default}20`,
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.name}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      padding: '7px 0',
                      fontSize: 12,
                      fontVariantNumeric: 'tabular-nums',
                      color: TOKENS.text.muted,
                      borderBottom: `1px solid ${TOKENS.border.default}20`,
                    }}
                  >
                    {formatCount(t.source_rows)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      padding: '7px 0',
                      fontSize: 12,
                      fontVariantNumeric: 'tabular-nums',
                      color: TOKENS.text.primary,
                      borderBottom: `1px solid ${TOKENS.border.default}20`,
                    }}
                    title={coverage != null ? `${coverage.toFixed(0)}% coverage` : ''}
                  >
                    {formatCount(t.twin_rows)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      padding: '7px 4px 7px 0',
                      borderBottom: `1px solid ${TOKENS.border.default}20`,
                    }}
                  >
                    <span
                      style={pill(
                        t.strategy === 'Full copy' ? `${TOKENS.success}18` : `${TOKENS.accent}18`,
                        t.strategy === 'Full copy' ? TOKENS.success : TOKENS.accent,
                      )}
                    >
                      {t.strategy === 'Full copy' ? '\u2713 Full' : '\u26A1 Sample'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {tables.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: '16px 0',
                    textAlign: 'center',
                    fontSize: 12,
                    color: TOKENS.text.muted,
                    fontStyle: 'italic',
                  }}
                >
                  No tables synced yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer: storage bar + meta ───────────────────────── */}
      <div style={{ padding: '12px 16px 14px', borderTop: `1px solid ${TOKENS.border.default}` }}>
        {/* Storage progress bar */}
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: `${TOKENS.text.muted}20`,
            marginBottom: 10,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 2,
              width: `${pct}%`,
              background:
                pct > 85
                  ? `linear-gradient(90deg, ${TOKENS.warning}, ${TOKENS.danger})`
                  : `linear-gradient(90deg, ${TOKENS.accent}, ${TOKENS.accentLight})`,
              transition: `width ${TOKENS.transition}`,
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
                color: TOKENS.text.muted,
              }}
            >
              {sizeMb} / {maxMb} MB
            </span>
            {aggCount > 0 && (
              <span
                style={{
                  fontSize: 11,
                  color: TOKENS.text.muted,
                }}
              >
                {aggCount} aggregate{aggCount !== 1 ? 's' : ''}
              </span>
            )}
            <span style={{ fontSize: 11, color: TOKENS.text.muted }}>
              {fullCopy} full \u00B7 {smartSample} sampled
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              color: TOKENS.text.muted,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Synced {timeAgo(twin_info.last_sync)}
          </span>
        </div>
      </div>
    </div>
  );
}
