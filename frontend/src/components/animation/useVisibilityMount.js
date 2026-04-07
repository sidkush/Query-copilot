import { useState, useEffect, useRef } from "react";

/**
 * IntersectionObserver hook that controls mount/unmount of heavy components
 * (e.g., Three.js Canvases) based on viewport proximity.
 *
 * Returns { ref, isVisible } — attach ref to the section wrapper.
 * The 3D component should only render when isVisible is true.
 *
 * @param {Object} options
 * @param {string} options.rootMargin — how far off-screen to pre-mount (default "200px")
 * @param {boolean} options.once — if true, stays mounted forever after first intersection
 */
export default function useVisibilityMount({ rootMargin = "200px", once = false } = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasBeenVisible = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          hasBeenVisible.current = true;
          if (once) observer.disconnect();
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, once]);

  return { ref, isVisible };
}
