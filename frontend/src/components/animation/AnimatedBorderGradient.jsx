/**
 * AnimatedBorderGradient — wraps children with a rotating conic-gradient border.
 * Uses the CSS @property animation defined in index.css (.animated-border).
 */
export default function AnimatedBorderGradient({ children, className = "", borderRadius = "1rem", active = true }) {
  if (!active) return <div className={className}>{children}</div>;

  return (
    <div
      className={`animated-border ${className}`}
      style={{ borderRadius }}
    >
      {children}
    </div>
  );
}
