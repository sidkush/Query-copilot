import { useRef, useState, useCallback } from "react";
import { motion, useSpring, useMotionValue } from "framer-motion";
import { useGPUTier } from "../../lib/gpuDetect";

/**
 * TiltCard — Dora.run-inspired 3D perspective card.
 * Tracks mouse within the card and applies rotateX/Y + spotlight gradient.
 * Falls back to simple hover:scale on low GPU tier.
 */
export default function TiltCard({ children, className = "", maxTilt = 8, spotlightOpacity = 0.08, style, ...props }) {
  const tier = useGPUTier();
  const cardRef = useRef(null);
  const [hovering, setHovering] = useState(false);

  // Motion values for smooth interpolation
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const spotlightX = useMotionValue(50);
  const spotlightY = useMotionValue(50);

  // Spring-smoothed rotation
  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 });

  const handleMouseMove = useCallback((e) => {
    if (tier === "low") return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;  // 0 to 1
    const y = (e.clientY - rect.top) / rect.height;   // 0 to 1

    // Tilt: center = 0, edges = ±maxTilt
    rotateX.set((y - 0.5) * -maxTilt * 2);
    rotateY.set((x - 0.5) * maxTilt * 2);

    // Spotlight position (percentage)
    spotlightX.set(x * 100);
    spotlightY.set(y * 100);
  }, [tier, maxTilt, rotateX, rotateY, spotlightX, spotlightY]);

  const handleMouseEnter = useCallback(() => setHovering(true), []);

  const handleMouseLeave = useCallback(() => {
    setHovering(false);
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  // Low tier: simple scale hover
  if (tier === "low") {
    return (
      <motion.div
        className={`tilt-card ${className}`}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        style={style}
        {...props}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      className={`tilt-card ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective: 1000,
        willChange: "transform",
        ...style,
      }}
      {...props}
    >
      <motion.div
        style={{
          rotateX: springRotateX,
          rotateY: springRotateY,
          position: "relative",
        }}
      >
        {children}

        {/* Spotlight gradient overlay */}
        {hovering && (
          <motion.div
            className="absolute inset-0 rounded-[inherit] pointer-events-none z-10"
            style={{
              background: `radial-gradient(circle at ${spotlightX.get()}% ${spotlightY.get()}%, rgba(99,102,241,${spotlightOpacity}), transparent 60%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
