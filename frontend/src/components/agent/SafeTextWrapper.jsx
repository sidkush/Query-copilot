import React from 'react';

/**
 * Phase L — SafeTextWrapper. Wraps agent-emitted tokens.
 * Props: text: string, origin: "tool_result"|"synthesis"|"plan"|null, knownErrorPhrases: string[]
 */
const ERROR_TRIGGER = /\b(database|connection|connectivity)\s+(error|issue|problem|failure)\b/i;

export default function SafeTextWrapper({ text, origin, knownErrorPhrases = [] }) {
  if (!text) return null;
  if (origin === null || origin === undefined) {
    return <span className="safe-text safe-text--blocked">[blocked]</span>;
  }
  const hasTrigger = ERROR_TRIGGER.test(text);
  const matchesKnown = knownErrorPhrases.some((p) => text.toLowerCase().includes(p.toLowerCase()));
  if (hasTrigger && !matchesKnown) {
    return <span className="safe-text safe-text--blocked">[blocked]</span>;
  }
  return <span className="safe-text">{text}</span>;
}
