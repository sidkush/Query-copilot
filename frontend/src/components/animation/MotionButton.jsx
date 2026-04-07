import { useRef, useCallback } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * MotionButton — Spring-animated button with magnetic hover behavior.
 * When mouse is within ~80px of button center, the button subtly shifts
 * toward the cursor (max 4px), creating a "magnetic" feel.
 */
export default function MotionButton({
  children,
  className = "",
  onClick,
  disabled = false,
  type = "button",
  magnetic = true,
  ...props
}) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  const handleMouseMove = useCallback((e) => {
    if (!magnetic || disabled) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Only apply within 80px radius, max 4px shift
    if (dist < 80) {
      const strength = (1 - dist / 80) * 4;
      x.set((dx / dist) * strength);
      y.set((dy / dist) * strength);
    }
  }, [magnetic, disabled, x, y]);

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={disabled ? {} : { scale: 1.04 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      style={{ x: springX, y: springY }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
