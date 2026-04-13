/**
 * AskDBLogo — The Loop brand mark.
 *
 * Symbol: a round "A" built from a circle, a horizontal crossbar, and a
 * vertical stem. Conceptually: "ask + answer as one continuous path."
 * The round form is unusual for a tech brand — most use sharp triangles
 * or flat letters. That's what makes it distinctive and memorable.
 *
 * Design rules:
 *   - The logo always renders in `--text-primary` UNLESS an explicit `color`
 *     prop is passed. Earlier revisions used `currentColor` to inherit from
 *     the parent, but that produced inverted-contrast bugs when the parent
 *     color leaked from an unrelated cascade. Hard-locking to the text
 *     primary token guarantees "white on dark, dark on light" in every
 *     context. Callers that truly need a custom color (e.g. a colored CTA
 *     background) can pass `color` explicitly.
 *   - Wordmark uses "AskDB" (proper case), not lowercase.
 *
 * Props:
 *   - size: 'xs' | 'sm' | 'md' | 'lg'
 *   - variant: 'full' | 'symbol' | 'wordmark'
 *   - color: optional explicit color (defaults to var(--text-primary))
 *   - className: extra classes
 *   - gap: optional override for spacing between symbol and wordmark
 */

const SIZE = {
  xs: { text: 'text-sm',  symbol: 18, gap: 6 },
  sm: { text: 'text-base', symbol: 20, gap: 7 },
  md: { text: 'text-xl',   symbol: 24, gap: 9 },
  lg: { text: 'text-3xl',  symbol: 32, gap: 12 },
};

const DEFAULT_COLOR = 'var(--text-primary)';

/** The Loop symbol — round "A" made from circle + crossbar + stem. */
export function AskDBSymbol({ size = 24, className = '', color = DEFAULT_COLOR }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ color }}
      aria-hidden="true"
    >
      {/* Outer circle */}
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
      />
      {/* Crossbar */}
      <path
        d="M9.5 19 H22.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Vertical stem (the top part of the A) */}
      <path
        d="M16 4 V14"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Full logo: symbol + "AskDB" wordmark, locked to var(--text-primary) by default. */
export default function AskDBLogo({
  size = 'md',
  variant = 'full',
  color = DEFAULT_COLOR,
  className = '',
  gap: gapOverride,
}) {
  const cfg = SIZE[size] || SIZE.md;
  const gap = gapOverride ?? cfg.gap;

  if (variant === 'symbol') {
    return <AskDBSymbol size={cfg.symbol} className={className} color={color} />;
  }

  if (variant === 'wordmark') {
    return (
      <span
        className={`font-heading font-bold ${cfg.text} ${className}`}
        style={{ letterSpacing: '-0.025em', color }}
      >
        AskDB
      </span>
    );
  }

  // full
  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ gap, color }}
    >
      <AskDBSymbol size={cfg.symbol} color={color} />
      <span
        className={`font-heading font-bold ${cfg.text}`}
        style={{ letterSpacing: '-0.025em', color }}
      >
        AskDB
      </span>
    </span>
  );
}
