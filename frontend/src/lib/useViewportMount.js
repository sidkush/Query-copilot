import { useState, useEffect, useRef } from 'react';

/**
 * useViewportMount — IntersectionObserver-based lazy mount for
 * expensive chart engines (three.js, deck.gl, d3 force layouts).
 *
 * Usage:
 *   const { ref, mounted } = useViewportMount({ rootMargin: '200px' });
 *   return (
 *     <div ref={ref} style={{ height: 400 }}>
 *       {mounted ? <ExpensiveChart /> : <SkeletonPlaceholder />}
 *     </div>
 *   );
 *
 * 200px rootMargin default gives the chart a head-start to begin
 * compiling shaders / allocating buffers just before it scrolls into
 * view, so the user rarely sees a blank frame.
 *
 * Once mounted, the observer is disconnected — we don't un-mount when
 * scrolled away again. If you want true unload-on-scroll-away use a
 * different hook; this one is "lazy on first appearance" only.
 *
 * SSR-safe: falls back to mounted=true if IntersectionObserver isn't
 * available, preserving existing render behavior.
 */
export default function useViewportMount({ rootMargin = '200px' } = {}) {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(
    typeof window === 'undefined' || typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (mounted || !ref.current || typeof IntersectionObserver === 'undefined') return;

    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setMounted(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted, rootMargin]);

  return { ref, mounted };
}
