export default function PageTransition({ children, className = "" }) {
  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${className}`}
      style={{
        animation: "page-enter 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
      }}
    >
      {children}
    </div>
  );
}
