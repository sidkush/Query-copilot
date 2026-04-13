import { useRef, useEffect, useMemo } from 'react';
import { useStore } from '../../store';

/**
 * AuroraBg — Bold flowing color bands like aurora borealis.
 * Pure Canvas, no Three.js. Premium, ambient, clearly visible.
 * Adapts to light/dark theme with appropriate intensity.
 */
export default function AuroraBg({ className = '' }) {
  const canvasRef = useRef(null);
  const resolvedTheme = useStore((s) => s.resolvedTheme);
  const isLight = resolvedTheme === 'light';
  const animRef = useRef(null);

  const bands = useMemo(() => [
    { r: 37, g: 99, b: 235, alpha: isLight ? 0.1 : 0.16, speed: 0.0003, amplitude: 90, yOffset: 0.25, width: 220 },
    { r: 6, g: 182, b: 212, alpha: isLight ? 0.07 : 0.12, speed: 0.0004, amplitude: 70, yOffset: 0.45, width: 180 },
    { r: 37, g: 99, b: 235, alpha: isLight ? 0.06 : 0.1, speed: 0.00025, amplitude: 110, yOffset: 0.65, width: 200 },
    { r: 6, g: 182, b: 212, alpha: isLight ? 0.04 : 0.08, speed: 0.00035, amplitude: 60, yOffset: 0.8, width: 140 },
  ], [isLight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = canvas.parentElement.offsetWidth;
    let height = canvas.parentElement.offsetHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const draw = (t) => {
      ctx.clearRect(0, 0, width, height);

      for (const band of bands) {
        const baseY = height * band.yOffset;

        // Create a gradient fill for depth
        const grad = ctx.createLinearGradient(0, baseY - band.width, 0, baseY + band.width);
        grad.addColorStop(0, `rgba(${band.r}, ${band.g}, ${band.b}, 0)`);
        grad.addColorStop(0.3, `rgba(${band.r}, ${band.g}, ${band.b}, ${band.alpha})`);
        grad.addColorStop(0.5, `rgba(${band.r}, ${band.g}, ${band.b}, ${band.alpha * 1.3})`);
        grad.addColorStop(0.7, `rgba(${band.r}, ${band.g}, ${band.b}, ${band.alpha})`);
        grad.addColorStop(1, `rgba(${band.r}, ${band.g}, ${band.b}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, baseY + band.width / 2);

        // Top edge
        for (let x = 0; x <= width; x += 4) {
          const y = baseY - band.width / 2
            + Math.sin(x * 0.003 + t * band.speed) * band.amplitude
            + Math.sin(x * 0.007 + t * band.speed * 1.4) * (band.amplitude * 0.4);
          ctx.lineTo(x, y);
        }

        // Bottom edge
        for (let x = width; x >= 0; x -= 4) {
          const y = baseY + band.width / 2
            + Math.sin(x * 0.004 + t * band.speed * 0.8 + 2) * (band.amplitude * 0.5)
            + Math.sin(x * 0.009 + t * band.speed * 1.2) * (band.amplitude * 0.3);
          ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    const handleResize = () => {
      width = canvas.parentElement.offsetWidth;
      height = canvas.parentElement.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [bands]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  );
}
