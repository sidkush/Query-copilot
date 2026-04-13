import { motion, useScroll, useSpring } from "framer-motion";

/**
 * ScrollProgress — Fixed top bar showing total page scroll progress.
 * 2px height, blue accent gradient.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[2px] z-[80] origin-left scroll-progress-bar"
      style={{
        scaleX,
        background: "linear-gradient(90deg, #2563EB, #06b6d4, #3B82F6)",
      }}
      aria-hidden="true"
    />
  );
}
