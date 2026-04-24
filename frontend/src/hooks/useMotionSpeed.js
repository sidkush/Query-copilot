import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener?.('change', cb);
  return () => mql.removeEventListener?.('change', cb);
}

function getSnapshot() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

// H22 — Returns motion speed in ms.
// prefers-reduced-motion: reduce forces 0 regardless of userPref.
export function useMotionSpeed({ userPref = 150 } = {}) {
  const reduced = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return reduced ? 0 : userPref;
}
