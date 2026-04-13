import { useRef, useEffect } from 'react';
import { useStore } from '../../store';

/**
 * GrainGlowBg — Static grain texture + single radial ambient glow.
 * Glow follows mouse position with smooth easing. Ultra lightweight.
 * Adapts to light/dark theme.
 */
export default function GrainGlowBg({ className = '' }) {
  const glowRef = useRef(null);
  const posRef = useRef({ x: 0.5, y: 0.3 });
  const targetRef = useRef({ x: 0.5, y: 0.3 });
  const resolvedTheme = useStore((s) => s.resolvedTheme);
  const isLight = resolvedTheme === 'light';
  const animRef = useRef(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;

    const handleMove = (e) => {
      targetRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };

    const animate = () => {
      const lerp = 0.03;
      posRef.current.x += (targetRef.current.x - posRef.current.x) * lerp;
      posRef.current.y += (targetRef.current.y - posRef.current.y) * lerp;

      const x = posRef.current.x * 100;
      const y = posRef.current.y * 100;
      const color = isLight
        ? `radial-gradient(ellipse 600px 400px at ${x}% ${y}%, rgba(37, 99, 235, 0.06), transparent 70%)`
        : `radial-gradient(ellipse 600px 400px at ${x}% ${y}%, rgba(37, 99, 235, 0.08), transparent 70%)`;

      glow.style.background = color;
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    window.addEventListener('mousemove', handleMove, { passive: true });

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('mousemove', handleMove);
    };
  }, [isLight]);

  return (
    <>
      {/* Grain texture overlay */}
      <div
        className={`absolute inset-0 pointer-events-none ${className}`}
        aria-hidden="true"
        style={{
          opacity: isLight ? 0.03 : 0.02,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      {/* Ambient glow that follows cursor */}
      <div
        ref={glowRef}
        className={`absolute inset-0 pointer-events-none ${className}`}
        aria-hidden="true"
      />
    </>
  );
}
