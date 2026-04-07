const SIZE_MAP = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
};

export default function DataLensLogo({ size = 'md', className = '' }) {
  return (
    <span className={`font-poppins font-bold ${SIZE_MAP[size]} ${className}`}>
      <span className="text-slate-100">Data</span>
      <span style={{ color: '#A855F7' }}>Lens</span>
    </span>
  );
}
