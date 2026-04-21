import { useRef, useEffect, useState } from "react";

/**
 * CursorGlow — Fixed-position radial gradient following the cursor.
 * Creates an ambient glow effect like dora.run's cursor tracking.
 * Disabled on touch devices. Uses rAF for smooth 60fps tracking.
 */
export default function CursorGlow({ size = 300, color = "99,102,241", opacity = 0.07 }) {
  const ref = useRef(null);
  const pos = useRef({ x: -500, y: -500 });
  const rafId = useRef(null);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    // Detect touch device
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      // pointer event listener writing to local state is the standard React pattern
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTouch(true);
      return;
    }

    const onMove = (e) => {
      pos.current.x = e.clientX;
      pos.current.y = e.clientY;
    };

    const update = () => {
      if (ref.current) {
        ref.current.style.transform = `translate(${pos.current.x - size / 2}px, ${pos.current.y - size / 2}px)`;
      }
      rafId.current = requestAnimationFrame(update);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    rafId.current = requestAnimationFrame(update);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(rafId.current);
    };
  }, [size]);

  if (isTouch) return null;

  return (
    <div
      ref={ref}
      className="fixed top-0 left-0 pointer-events-none z-[90] cursor-glow"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(${color},${opacity}) 0%, transparent 70%)`,
        willChange: "transform",
        transform: "translate(-500px, -500px)",
      }}
      aria-hidden="true"
    />
  );
}
