import { useRef, useEffect } from 'react';
import { useStore } from '../../store';

/**
 * SectionBg — Visible, distinctive Canvas backgrounds for landing page sections.
 * Each mode creates a clear visual presence. Bold enough to see, subtle enough not to distract.
 * All modes adapt to light/dark theme. Pure Canvas 2D, no Three.js.
 *
 * Modes: constellation | flowLines | pulseRings | particleRise | softWaves | gridDots
 */
export default function SectionBg({ mode = 'constellation', className = '' }) {
  const canvasRef = useRef(null);
  const resolvedTheme = useStore((s) => s.resolvedTheme);
  const isLight = resolvedTheme === 'light';
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;

    let w = parent.offsetWidth;
    let h = parent.offsetHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Bold, visible color values — dark mode uses brighter opacity since bg is dark
    const nodeAlpha = isLight ? 0.2 : 0.35;
    const lineAlpha = isLight ? 0.1 : 0.18;
    const fillAlpha = isLight ? 0.08 : 0.14;
    const accentRGB = '37, 99, 235';    // blue
    const accent2RGB = '6, 182, 212';    // cyan

    // ──── CONSTELLATION GRID ────
    if (mode === 'constellation') {
      const spacing = 70;
      const dots = [];
      for (let x = spacing / 2; x < w; x += spacing) {
        for (let y = spacing / 2; y < h; y += spacing) {
          dots.push({
            baseX: x, baseY: y, x, y,
            phase: Math.random() * Math.PI * 2,
            amp: 6 + Math.random() * 12,
            isCyan: Math.random() < 0.25,
          });
        }
      }

      const draw = (t) => {
        ctx.clearRect(0, 0, w, h);
        for (const d of dots) {
          d.x = d.baseX + Math.sin(t * 0.0006 + d.phase) * d.amp;
          d.y = d.baseY + Math.cos(t * 0.0005 + d.phase * 1.3) * d.amp;
        }
        // Lines between nearby dots
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const dx = dots[i].x - dots[j].x;
            const dy = dots[i].y - dots[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < spacing * 1.4) {
              const fade = 1 - dist / (spacing * 1.4);
              ctx.strokeStyle = `rgba(${accentRGB}, ${lineAlpha * fade})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(dots[i].x, dots[i].y);
              ctx.lineTo(dots[j].x, dots[j].y);
              ctx.stroke();
            }
          }
        }
        // Nodes
        for (const d of dots) {
          const rgb = d.isCyan ? accent2RGB : accentRGB;
          ctx.fillStyle = `rgba(${rgb}, ${nodeAlpha})`;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.isCyan ? 3 : 2, 0, Math.PI * 2);
          ctx.fill();
        }
        animRef.current = requestAnimationFrame(draw);
      };
      animRef.current = requestAnimationFrame(draw);
    }

    // ──── FLOW LINES ────
    else if (mode === 'flowLines') {
      const lineCount = 10;
      const lines = Array.from({ length: lineCount }, (_, i) => ({
        y: (h / (lineCount + 1)) * (i + 1),
        speed: 0.6 + Math.random() * 1.2,
        amplitude: 20 + Math.random() * 35,
        frequency: 0.002 + Math.random() * 0.004,
        phase: Math.random() * Math.PI * 2,
        width: 1.5 + Math.random() * 1.5,
        isCyan: i % 3 === 0,
      }));

      const draw = (t) => {
        ctx.clearRect(0, 0, w, h);
        for (const line of lines) {
          const rgb = line.isCyan ? accent2RGB : accentRGB;
          ctx.strokeStyle = `rgba(${rgb}, ${lineAlpha * 1.2})`;
          ctx.lineWidth = line.width;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 3) {
            const y = line.y
              + Math.sin(x * line.frequency + t * 0.0004 * line.speed + line.phase) * line.amplitude
              + Math.sin(x * line.frequency * 2.5 + t * 0.0003) * (line.amplitude * 0.35);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        animRef.current = requestAnimationFrame(draw);
      };
      animRef.current = requestAnimationFrame(draw);
    }

    // ──── PULSE RINGS ────
    else if (mode === 'pulseRings') {
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.max(w, h) * 0.6;
      const ringCount = 6;

      const draw = (t) => {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < ringCount; i++) {
          const phase = (t * 0.00025 + (i / ringCount)) % 1;
          const r = phase * maxR;
          const fade = (1 - phase);
          const alpha = fade * (isLight ? 0.15 : 0.22);
          const rgb = i % 2 === 0 ? accentRGB : accent2RGB;
          ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Center glow
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
        grad.addColorStop(0, `rgba(${accentRGB}, ${isLight ? 0.12 : 0.2})`);
        grad.addColorStop(1, `rgba(${accentRGB}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 60, 0, Math.PI * 2);
        ctx.fill();

        animRef.current = requestAnimationFrame(draw);
      };
      animRef.current = requestAnimationFrame(draw);
    }

    // ──── PARTICLE RISE ────
    else if (mode === 'particleRise') {
      const particles = Array.from({ length: 50 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        speed: 0.3 + Math.random() * 0.8,
        size: 1.5 + Math.random() * 3,
        isCyan: Math.random() < 0.3,
        drift: (Math.random() - 0.5) * 0.4,
      }));

      const draw = () => {
        ctx.clearRect(0, 0, w, h);
        for (const p of particles) {
          p.y -= p.speed;
          p.x += p.drift;
          if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
          if (p.x < 0) p.x = w;
          if (p.x > w) p.x = 0;

          const rgb = p.isCyan ? accent2RGB : accentRGB;
          ctx.fillStyle = `rgba(${rgb}, ${nodeAlpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        animRef.current = requestAnimationFrame(draw);
      };
      animRef.current = requestAnimationFrame(draw);
    }

    // ──── SOFT WAVES ────
    else if (mode === 'softWaves') {
      const waveCount = 4;
      const waves = Array.from({ length: waveCount }, (_, i) => ({
        yBase: h * (0.5 + i * 0.1),
        amplitude: 25 + i * 12,
        frequency: 0.003 - i * 0.0004,
        speed: 0.00025 + i * 0.00008,
        isCyan: i === 1 || i === 3,
      }));

      const draw = (t) => {
        ctx.clearRect(0, 0, w, h);
        for (const wave of waves) {
          const rgb = wave.isCyan ? accent2RGB : accentRGB;
          ctx.fillStyle = `rgba(${rgb}, ${fillAlpha})`;
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 3) {
            const y = wave.yBase + Math.sin(x * wave.frequency + t * wave.speed) * wave.amplitude;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fill();
        }
        animRef.current = requestAnimationFrame(draw);
      };
      animRef.current = requestAnimationFrame(draw);
    }

    // ──── GRID DOTS ────
    else if (mode === 'gridDots') {
      const gap = 35;
      const dots = [];
      for (let x = gap / 2; x < w; x += gap) {
        for (let y = gap / 2; y < h; y += gap) {
          dots.push({ x, y, phase: Math.random() * Math.PI * 2, isCyan: Math.random() < 0.2 });
        }
      }

      const draw = (t) => {
        ctx.clearRect(0, 0, w, h);
        for (const d of dots) {
          const shimmer = 0.4 + 0.6 * Math.sin(t * 0.0015 + d.phase);
          const alpha = (isLight ? 0.12 : 0.2) * shimmer + (isLight ? 0.06 : 0.08);
          const rgb = d.isCyan ? accent2RGB : accentRGB;
          ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.isCyan ? 2 : 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        animRef.current = requestAnimationFrame(draw);
      };
      animRef.current = requestAnimationFrame(draw);
    }

    const handleResize = () => {
      w = parent.offsetWidth;
      h = parent.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [mode, isLight]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  );
}
