import { useRef } from "react";
import { useScroll, useTransform, useSpring } from "framer-motion";

/**
 * Scroll-linked parallax hook.
 * Attach `ref` to the section element, use the returned motion values
 * to drive `style={{ y: parallaxY }}` on background layers.
 *
 * @param {Object} options
 * @param {number} options.speed — parallax multiplier (0 = static, 1 = normal scroll, <1 = slower)
 * @param {[string,string]} options.offset — scroll detection range (default: section enters to exits)
 */
export default function useScrollParallax({ speed = 0.3, offset } = {}) {
  const ref = useRef(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: offset || ["start end", "end start"],
  });

  // Map scroll progress [0,1] to pixel translation
  const range = 80 * speed; // max pixel shift
  const rawY = useTransform(scrollYProgress, [0, 1], [range, -range]);
  const rawScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.97, 1, 0.97]);

  // Smooth spring for silky parallax
  const parallaxY = useSpring(rawY, { stiffness: 100, damping: 30, mass: 0.5 });
  const parallaxScale = useSpring(rawScale, { stiffness: 100, damping: 30, mass: 0.5 });

  return { ref, scrollYProgress, parallaxY, parallaxScale };
}
