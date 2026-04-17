import { useState, useCallback, useMemo } from 'react';
import { TOKENS } from './tokens';
import { BreathingDot } from './motion';

/**
 * InsightTile — AI-generated narrative summary card.
 *
 * SP-3a: Wireframe 4 reference — "INSIGHT SUMMARY · AI GENERATED" eyebrow,
 * narrative paragraph with bold key metrics, linked tile references,
 * refresh button to regenerate, cache-aware (timestamp shown).
 *
 * Tile shape:
 *   {
 *     id, chartType: "insight",
 *     insightText: "Revenue is up $478K (24.7%) ...",
 *     insightGeneratedAt: "2026-04-16T...",
 *     linkedTileIds: ["tile1", "tile2"],
 *     title?: "Revenue Summary"
 *   }
 *
 * Security: insightText comes from backend LLM generation (trusted).
 * highlightMetrics only wraps regex-matched numerics in <strong> — no
 * arbitrary HTML injection. sanitizeInsight strips any script/event vectors.
 */

function relativeTime(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Strip any dangerous HTML from LLM-generated text before rendering
function sanitizeInsight(text) {
  if (!text) return '';
  let safe = text;
  // Remove script/iframe/style tags
  safe = safe.replace(/<(script|iframe|object|embed|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  safe = safe.replace(/<(script|iframe|object|embed|style)\b[^>]*\/?>/gi, '');
  // Remove event handlers
  safe = safe.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Remove javascript: in hrefs
  safe = safe.replace(/href\s*=\s*["']?\s*javascript:/gi, 'href="');
  return safe;
}

// Highlight numbers in the narrative text — wraps dollar amounts,
// percentages, and large numbers in <strong> tags for visual emphasis.
function highlightMetrics(text) {
  if (!text) return '';
  // First escape HTML entities from raw text
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Match: $478K, 24.7%, 1,234,567, 0.4 points, 52%, etc.
  escaped = escaped.replace(
    /(\$[\d,.]+[KMBT]?|\d+[\d,.]*%|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+\s+(?:points?|pts?))/g,
    '<strong style="color: var(--text-primary, #e7e7ea)">$1</strong>'
  );
  return sanitizeInsight(escaped);
}

export default function InsightTile({ tile, onRefresh, onLinkedTileClick, index = 0 }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  const insightText = tile?.insightText || tile?.content || '';
  const generatedAt = tile?.insightGeneratedAt;
  const linkedTiles = tile?.linkedTileIds || [];
  const hasContent = Boolean(insightText);

  // "Fresh" = generated within the last 5 minutes. Drives the breathing
  // accent dot on the eyebrow label.
  const isFresh = useMemo(() => {
    if (!generatedAt) return false;
    const age = Date.now() - new Date(generatedAt).getTime();
    return age < 5 * 60 * 1000;
  }, [generatedAt]);

  return (
    <div
      data-testid="insight-tile"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 24px 18px',
        fontFamily: TOKENS.fontBody,
        overflow: 'auto',
        '--mount-index': index,
      }}
    >
      {/* Eyebrow label — unified eyebrow spec (see TOKENS.tile.eyebrow*).
          Accent color kept on the primary eyebrow to mark this as AI-generated. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {isFresh && <BreathingDot color="var(--accent, #2563EB)" size={4} />}
        <span
          style={{
            fontSize: TOKENS.tile.eyebrowSize,
            fontWeight: 700,
            letterSpacing: TOKENS.tile.eyebrowLetterSpacing,
            textTransform: 'uppercase',
            color: TOKENS.accent,
            fontFamily: TOKENS.fontDisplay,
          }}
        >
          Insight Summary
        </span>
        <span
          style={{
            fontSize: TOKENS.tile.eyebrowSize,
            fontWeight: 700,
            letterSpacing: TOKENS.tile.eyebrowLetterSpacing,
            textTransform: 'uppercase',
            color: TOKENS.text.muted,
            fontFamily: TOKENS.fontDisplay,
          }}
        >
          &middot; AI Generated
        </span>

        <div style={{ flex: 1 }} />

        {/* Refresh button */}
        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="insight-refresh-btn"
            style={{
              background: 'transparent',
              border: `1px solid ${TOKENS.border.default}`,
              borderRadius: 6,
              color: TOKENS.text.muted,
              cursor: refreshing ? 'wait' : 'pointer',
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              transition: `color ${TOKENS.transition}, border-color ${TOKENS.transition}`,
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{
                animation: refreshing ? 'spin 1s linear infinite' : 'none',
              }}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            {refreshing ? 'Generating...' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Narrative body — rendered as text with highlighted numerics */}
      {hasContent ? (
        <div
          className="insight-narrative"
          style={{
            fontSize: 14,
            lineHeight: 1.75,
            color: TOKENS.text.secondary,
            fontFamily: TOKENS.fontBody,
            letterSpacing: '-0.008em',
            flex: 1,
          }}
          dangerouslySetInnerHTML={{ __html: highlightMetrics(insightText) }}
        />
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: TOKENS.text.muted,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <span style={{ fontSize: 12, fontStyle: 'italic' }}>
            {onRefresh ? 'Click Refresh to generate an AI insight' : 'No insight generated yet'}
          </span>
        </div>
      )}

      {/* Footer — generated timestamp + linked tiles */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 14,
          paddingTop: 10,
          borderTop: `1px solid ${TOKENS.border.default}`,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {generatedAt && (
          <span
            style={{
              fontSize: 10,
              color: TOKENS.text.muted,
              fontFamily: TOKENS.fontMono,
              letterSpacing: '0.02em',
            }}
          >
            Generated {relativeTime(generatedAt)}
          </span>
        )}

        {linkedTiles.length > 0 && (
          <>
            <span style={{ fontSize: 10, color: TOKENS.text.muted }}>|</span>
            <span style={{ fontSize: 10, color: TOKENS.text.muted }}>Based on:</span>
            {linkedTiles.map((tid) => (
              <button
                key={tid}
                type="button"
                onClick={() => onLinkedTileClick?.(tid)}
                style={{
                  // Fallback first, then color-mix for modern browsers.
                  // Accent-tinted translucent chip — adapts to theme accent var.
                  background: 'rgba(99,102,241,0.1)',
                  backgroundImage: 'linear-gradient(color-mix(in oklab, var(--accent) 12%, transparent), color-mix(in oklab, var(--accent) 12%, transparent))',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: 4,
                  color: TOKENS.accent,
                  cursor: 'pointer',
                  padding: '1px 6px',
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: TOKENS.fontMono,
                }}
              >
                {tid}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
