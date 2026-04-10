const SIZE_MAP = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
};

export default function AskDBLogo({ size = 'md', className = '' }) {
  return (
    <span className={`font-poppins font-bold ${SIZE_MAP[size]} ${className}`}>
      <span className="text-slate-100">Ask</span>
      <span style={{ color: '#A855F7' }}>DB</span>
    </span>
  );
}
