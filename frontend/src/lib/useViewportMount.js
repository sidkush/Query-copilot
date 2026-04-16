import { useState, useEffect, useRef } from 'react';

/**
 * useViewportMount — IntersectionObserver-based mount/unmount for
 * expensive chart renderers on dashboard tiles.
 *
 * Bidirectional: mounts when scrolled into view (with rootMargin head-start),
 * unmounts when scrolled fully out of view. This lets InstancePool reclaim
 * slots from off-screen tiles on 500-tile dashboards.
 *
 * Options:
 *   rootMargin: string  — IntersectionObserver rootMargin (default '200px')
 *   once: boolean       — if true, revert to mount-once behavior (never unmount)
 *
 * Usage:
 *   const { ref, mounted } = useViewportMount();
 *   return (
 *     <div ref={ref} style={{ height: 400 }}>
 *       {mounted ? <ExpensiveChart /> : <SkeletonPlaceholder />}
 *     </div>
 *   );
 */
export default function useViewportMount({ rootMargin = '200px', once = false } = {}) {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(
    typeof window === 'undefined' || typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !ref.current) return;

    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setMounted(true);
            if (once) {
              observer.disconnect();
            }
          } else if (!once) {
            setMounted(false);
          }
        }
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, once]);

  return { ref, mounted };
}
