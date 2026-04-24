import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { TOKENS } from '../dashboard/tokens';
import { MD_COMPONENTS, REMARK_PLUGINS, FONT_BODY, FONT_DISPLAY, looksLikeRichMarkdown } from '../../lib/agentMarkdown';
import { useMotionSpeed } from '../../hooks/useMotionSpeed';

/**
 * Streaming "thinking" bubble.
 *
 * Two render modes:
 *  1. Compact pulse pill — short labels ("Analyzing...", "Thinking...")
 *  2. Live rich preview — when partial markdown content is streaming, render it
 *     through the same premium markdown components as the final result so the
 *     user sees a polished progressive draft instead of raw pipe-table text.
 */
export default function ThinkingBubble({ content }) {
  const isRich = looksLikeRichMarkdown(content);
  const speedMs = useMotionSpeed({ userPref: 420 });
  const reduced = speedMs === 0;

  if (isRich) {
    return (
      <motion.div
        role="status"
        aria-busy="true"
        aria-label="Agent thinking"
        initial={reduced ? false : { opacity: 0, y: 8, filter: 'blur(4px)' }}
        animate={reduced ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: reduced ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
        className="agent-bubble-assistant agent-thinking-card"
        style={{
          borderRadius: 18,
          padding: '14px 16px 16px',
          position: 'relative',
        }}
      >
        {/* Live indicator strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: `1px solid ${TOKENS.border.default}`,
        }}>
          <span className="agent-thinking-pulse" aria-hidden="true">
            <span className="agent-thinking-pulse__dot" />
            <span className="agent-thinking-pulse__ring" />
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: TOKENS.text.muted,
            fontFamily: FONT_DISPLAY,
          }}>
            Thinking
          </span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontSize: 9, fontWeight: 600,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            color: TOKENS.accent,
            fontFamily: FONT_DISPLAY,
            opacity: 0.75,
          }}>
            Live preview
          </span>
        </div>

        {/* Streaming markdown body */}
        <div style={{
          fontSize: 13, color: TOKENS.text.primary,
          maxHeight: 460, overflowY: 'auto', overflowX: 'hidden',
          wordBreak: 'break-word', overflowWrap: 'anywhere',
          fontFamily: FONT_BODY, lineHeight: 1.65,
          letterSpacing: '-0.005em',
        }} className="agent-result-md">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
            {content}
          </ReactMarkdown>
        </div>
      </motion.div>
    );
  }

  // Compact pulse pill for short status labels
  return (
    <motion.div
      role="status"
      aria-busy="true"
      aria-label={content || 'Agent thinking'}
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="agent-thinking"
    >
      <span className="agent-thinking__dots" aria-hidden="true">
        <span /><span /><span />
      </span>
      {content && <span style={{ color: TOKENS.text.secondary }}>{content}</span>}
    </motion.div>
  );
}
