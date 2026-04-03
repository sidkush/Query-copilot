import { useEffect, useRef } from 'react';

export default function FluidGradient() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // A simple, very slow moving, elegant monochrome radial gradient shader-like effect
    const render = () => {
      time += 0.002;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Create a large, subtle moving orb
      const cx = w * 0.5 + Math.sin(time) * w * 0.2;
      const cy = h * 0.8 + Math.cos(time * 0.8) * h * 0.1;
      const radius = Math.max(w, h) * 0.8;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
      gradient.addColorStop(0.5, 'rgba(37, 99, 235, 0.015)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Second orb
      const cx2 = w * 0.3 + Math.cos(time * 1.2) * w * 0.3;
      const cy2 = h * 0.9 + Math.sin(time * 0.5) * h * 0.2;
      const gradient2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, radius * 0.9);
      gradient2.addColorStop(0, 'rgba(125, 211, 252, 0.02)');
      gradient2.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient2;
      ctx.fillRect(0, 0, w, h);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
