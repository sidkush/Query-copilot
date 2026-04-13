import { useRef, useEffect, useMemo } from 'react';
import { useStore } from '../../store';

/**
 * DataMeshBg — Animated network of nodes connected by lines.
 * Looks like a live schema/data visualization. Pure Canvas, no Three.js.
 * Adapts to light/dark theme.
 */
export default function DataMeshBg({ className = '' }) {
  const canvasRef = useRef(null);
  const resolvedTheme = useStore((s) => s.resolvedTheme);
  const isLight = resolvedTheme === 'light';
  const animRef = useRef(null);

  const config = useMemo(() => ({
    nodeCount: 40,
    connectionDistance: 160,
    nodeSpeed: 0.3,
    nodeColor: isLight ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.15)',
    lineColor: isLight ? 'rgba(37, 99, 235, 0.06)' : 'rgba(37, 99, 235, 0.08)',
    nodeRadius: isLight ? 2 : 2.5,
    pulseNodes: 5,
    pulseColor: isLight ? 'rgba(37, 99, 235, 0.25)' : 'rgba(37, 99, 235, 0.3)',
  }), [isLight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = canvas.parentElement.offsetWidth;
    let height = canvas.parentElement.offsetHeight;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Initialize nodes
    const nodes = Array.from({ length: config.nodeCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * config.nodeSpeed,
      vy: (Math.random() - 0.5) * config.nodeSpeed,
      pulse: Math.random() < config.pulseNodes / config.nodeCount,
      phase: Math.random() * Math.PI * 2,
    }));

    const draw = (t) => {
      ctx.clearRect(0, 0, width, height);

      // Update positions
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
        node.x = Math.max(0, Math.min(width, node.x));
        node.y = Math.max(0, Math.min(height, node.y));
      }

      // Draw connections
      ctx.strokeStyle = config.lineColor;
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < config.connectionDistance) {
            const alpha = 1 - dist / config.connectionDistance;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      ctx.globalAlpha = 1;
      for (const node of nodes) {
        const r = node.pulse
          ? config.nodeRadius + Math.sin(t * 0.002 + node.phase) * 1.5
          : config.nodeRadius;
        ctx.fillStyle = node.pulse ? config.pulseColor : config.nodeColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    const handleResize = () => {
      width = canvas.parentElement.offsetWidth;
      height = canvas.parentElement.offsetHeight;
      canvas.width = width * devicePixelRatio;
      canvas.height = height * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [config]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  );
}
