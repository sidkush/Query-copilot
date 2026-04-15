import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Two-stage confirm pattern for destructive actions.
 *
 * First click arms the button (state flips to "armed"). Second click within
 * `timeoutMs` fires `onConfirm`. If the user does nothing, the armed state
 * auto-resets so a stray click can't destroy their work.
 *
 * Usage:
 *   const confirm = useConfirmAction(() => store.resetPipeline(), { timeoutMs: 3500 });
 *   <button onClick={confirm.trigger}>
 *     {confirm.armed ? 'Confirm?' : 'Reset'}
 *   </button>
 *
 * Returns:
 *   - armed: boolean — whether the button is primed to confirm
 *   - trigger: () => void — wire to onClick; first call arms, second call fires
 *   - reset: () => void — cancel the armed state manually (e.g. blur handler)
 */
export default function useConfirmAction(onConfirm, { timeoutMs = 3500 } = {}) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef(null);
  const onConfirmRef = useRef(onConfirm);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setArmed(false);
  }, [clearTimer]);

  const trigger = useCallback(() => {
    if (armed) {
      clearTimer();
      setArmed(false);
      onConfirmRef.current?.();
      return;
    }
    setArmed(true);
    clearTimer();
    timerRef.current = setTimeout(() => {
      setArmed(false);
      timerRef.current = null;
    }, timeoutMs);
  }, [armed, clearTimer, timeoutMs]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { armed, trigger, reset };
}
