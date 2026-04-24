import { useEffect, useState } from 'react';

// H22 — Returns motion speed in ms.
// prefers-reduced-motion: reduce forces 0 regardless of userPref.
export function useMotionSpeed({ userPref = 150 } = {}) {
  const [speed, setSpeed] = useState(() => {
    if (typeof window === 'undefined') return userPref;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : userPref;
  });

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mql) return;
    const onChange = () => setSpeed(mql.matches ? 0 : userPref);
    setSpeed(mql.matches ? 0 : userPref);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [userPref]);

  return speed;
}
