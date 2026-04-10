import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { useStore } from "../../store";

const DARK_ORBS = [
  { x: "15%", y: "20%", size: 400, color: "rgba(99,102,241,0.12)", speed: 0.6 },
  { x: "70%", y: "30%", size: 350, color: "rgba(139,92,246,0.10)", speed: 0.8 },
  { x: "40%", y: "70%", size: 300, color: "rgba(59,130,246,0.08)", speed: 0.5 },
  { x: "85%", y: "75%", size: 250, color: "rgba(168,85,247,0.09)", speed: 0.7 },
];

const LIGHT_ORBS = [
  { x: "15%", y: "20%", size: 400, color: "rgba(99,102,241,0.10)", speed: 0.6 },
  { x: "70%", y: "30%", size: 350, color: "rgba(139,92,246,0.08)", speed: 0.8 },
  { x: "40%", y: "70%", size: 300, color: "rgba(59,130,246,0.07)", speed: 0.5 },
  { x: "85%", y: "75%", size: 250, color: "rgba(168,85,247,0.08)", speed: 0.7 },
];

export default function AnimatedBackground({ className = "" }) {
  const prefersReduced = useReducedMotion();
  const resolvedTheme = useStore(s => s.resolvedTheme);
  const isLight = resolvedTheme === 'light';
  const ORBS = isLight ? LIGHT_ORBS : DARK_ORBS;
  const containerRef = useRef(null);
  const orbRefs = useRef([]);
  const animRef = useRef(null);

  useEffect(() => {
    if (prefersReduced || !containerRef.current) return;

    let time = 0;
    const animate = () => {
      time += 0.003;
      orbRefs.current.forEach((orb, i) => {
        if (!orb) return;
        const config = ORBS[i];
        const offsetX = Math.sin(time * config.speed + i) * 30;
        const offsetY = Math.cos(time * config.speed * 0.7 + i * 2) * 20;
        orb.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      });
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [prefersReduced, ORBS]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {ORBS.map((orb, i) => (
        <div
          key={i}
          ref={(el) => (orbRefs.current[i] = el)}
          className="absolute rounded-full will-change-transform"
          style={{
            left: orb.x,
            top: orb.y,
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: "blur(60px)",
          }}
        />
      ))}
    </div>
  );
}
