import { useRef } from "react";
import { useInView } from "framer-motion";

/**
 * Returns { ref, isInView } for scroll-triggered reveal animations.
 * @param {Object} options
 * @param {boolean} [options.once=true] — animate only on first appearance
 * @param {string} [options.margin="-80px"] — rootMargin for trigger point
 * @param {number} [options.amount=0.2] — fraction of element visible to trigger
 */
export function useScrollReveal({ once = true, margin = "-80px", amount = 0.2 } = {}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin, amount });
  return { ref, isInView };
}
