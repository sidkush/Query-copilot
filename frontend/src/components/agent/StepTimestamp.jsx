export default function StepTimestamp({ ms }) {
  if (!ms || ms < 500) return null;
  const formatted = ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
  return <span className="text-xs" style={{ opacity: 0.4 }}>{formatted}</span>;
}
