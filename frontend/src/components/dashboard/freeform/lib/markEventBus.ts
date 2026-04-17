import type { MarkEvent } from './actionTypes';

type Listener = (event: MarkEvent) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publish(event: MarkEvent): void {
  for (const l of listeners) l(event);
}

/** Test-only helper: clear all listeners. */
export function _resetForTests(): void {
  listeners.clear();
}
