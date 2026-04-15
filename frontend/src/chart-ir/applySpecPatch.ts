/**
 * applySpecPatch — minimal RFC 6902 JSON Patch helper scoped to ChartSpec
 * mutations for the Marks card + on-object editing flows.
 *
 * This is intentionally a small, fit-for-purpose subset (not a full RFC 6902
 * implementation):
 *   - Supported ops: `add`, `remove`, `replace`, `move`, `copy`
 *   - Not supported: `test` (no verification-first flow in the editor)
 *   - Paths follow RFC 6901 JSON Pointer (`/encoding/color`, `/mark`, etc.)
 *   - Array indices are supported (`/layer/0/mark`)
 *   - Root replacement via path `""` is supported for `replace`
 *
 * Every apply returns a NEW ChartSpec — the input is never mutated. This
 * preserves the Zustand reducer contract + lets the history stack keep
 * independent snapshots without defensive deep-clones at every layer.
 *
 * The implementation uses structured-clone so nested field refs and
 * transform arrays are safely isolated from the original.
 */
import type { ChartSpec } from './types';

export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }
  | { op: 'copy'; from: string; path: string };

export type Patch = PatchOp[];

export class PatchError extends Error {
  constructor(message: string, public readonly op: PatchOp) {
    super(message);
    this.name = 'PatchError';
  }
}

/** Apply a JSON Patch to a ChartSpec. Pure — input is not mutated. */
export function applySpecPatch(spec: ChartSpec, patch: Patch): ChartSpec {
  if (!Array.isArray(patch)) {
    throw new TypeError('applySpecPatch: patch must be an array of operations');
  }
  if (patch.length === 0) return spec;

  let current: unknown = deepClone(spec);
  for (const op of patch) {
    current = applyOp(current, op);
  }
  return current as ChartSpec;
}

/** Apply a single operation to a cloned-once working doc. */
function applyOp(doc: unknown, op: PatchOp): unknown {
  switch (op.op) {
    case 'add':
      return setAtPointer(doc, parsePointer(op.path), deepClone(op.value), 'add', op);
    case 'remove':
      return removeAtPointer(doc, parsePointer(op.path), op);
    case 'replace':
      return setAtPointer(doc, parsePointer(op.path), deepClone(op.value), 'replace', op);
    case 'move': {
      const from = parsePointer(op.from);
      const value = getAtPointer(doc, from, op);
      const afterRemove = removeAtPointer(doc, from, op);
      return setAtPointer(afterRemove, parsePointer(op.path), value, 'add', op);
    }
    case 'copy': {
      const from = parsePointer(op.from);
      const value = deepClone(getAtPointer(doc, from, op));
      return setAtPointer(doc, parsePointer(op.path), value, 'add', op);
    }
    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      throw new PatchError(`Unsupported op: ${(op as PatchOp).op}`, op);
    }
  }
}

/** RFC 6901 JSON Pointer parse. `""` → [], `/a/b` → ['a', 'b']. */
export function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new PatchError(`JSON Pointer must start with '/' or be empty, got: ${pointer}`, {
      op: 'replace',
      path: pointer,
      value: undefined,
    });
  }
  return pointer
    .slice(1)
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Traverse a document along a parsed pointer. Throws if any segment is missing. */
function getAtPointer(doc: unknown, path: string[], op: PatchOp): unknown {
  let cur: unknown = doc;
  for (const seg of path) {
    if (cur === null || cur === undefined) {
      throw new PatchError(`Path segment '${seg}' is unreachable on null/undefined`, op);
    }
    if (Array.isArray(cur)) {
      const idx = seg === '-' ? cur.length : Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        throw new PatchError(`Array index out of bounds: ${seg}`, op);
      }
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      throw new PatchError(`Cannot traverse into non-object at segment '${seg}'`, op);
    }
  }
  return cur;
}

/** Set a value at a pointer, returning a new root. `mode`: 'add' inserts, 'replace' errors on missing. */
function setAtPointer(
  doc: unknown,
  path: string[],
  value: unknown,
  mode: 'add' | 'replace',
  op: PatchOp,
): unknown {
  if (path.length === 0) {
    return value;
  }
  if (doc === null || doc === undefined || typeof doc !== 'object') {
    throw new PatchError(`Cannot set on non-object root`, op);
  }

  // Walk down, cloning as we go to preserve immutability along the path.
  const [head, ...rest] = path;
  if (head === undefined) {
    throw new PatchError(`Empty pointer segment`, op);
  }

  if (Array.isArray(doc)) {
    const cloned = [...doc];
    const idx = head === '-' ? cloned.length : Number(head);
    if (!Number.isInteger(idx) || idx < 0) {
      throw new PatchError(`Array index invalid: ${head}`, op);
    }
    if (rest.length === 0) {
      if (mode === 'replace' && (idx >= cloned.length)) {
        throw new PatchError(`Cannot replace missing array index ${idx}`, op);
      }
      if (mode === 'add' && idx > cloned.length) {
        throw new PatchError(`Cannot add at array index ${idx} (beyond length)`, op);
      }
      if (mode === 'add' && idx < cloned.length) {
        cloned.splice(idx, 0, value);
      } else if (mode === 'add') {
        cloned.push(value);
      } else {
        cloned[idx] = value;
      }
      return cloned;
    }
    if (idx >= cloned.length) {
      throw new PatchError(`Array index out of bounds while traversing: ${idx}`, op);
    }
    cloned[idx] = setAtPointer(cloned[idx], rest, value, mode, op);
    return cloned;
  }

  // Plain object
  const cloned: Record<string, unknown> = { ...(doc as Record<string, unknown>) };
  if (rest.length === 0) {
    if (mode === 'replace' && !(head in cloned)) {
      throw new PatchError(`Cannot replace missing key '${head}'`, op);
    }
    cloned[head] = value;
    return cloned;
  }
  const next = cloned[head];
  if (next === undefined) {
    // Auto-create intermediate objects for `add` to support nested channel paths
    // like /encoding/color when /encoding doesn't exist yet.
    if (mode === 'add') {
      cloned[head] = setAtPointer({}, rest, value, mode, op);
      return cloned;
    }
    throw new PatchError(`Cannot traverse into missing key '${head}'`, op);
  }
  cloned[head] = setAtPointer(next, rest, value, mode, op);
  return cloned;
}

/** Remove a value at a pointer. Returns a new root. */
function removeAtPointer(doc: unknown, path: string[], op: PatchOp): unknown {
  if (path.length === 0) {
    throw new PatchError(`Cannot remove root`, op);
  }
  if (doc === null || doc === undefined || typeof doc !== 'object') {
    throw new PatchError(`Cannot remove from non-object root`, op);
  }

  const [head, ...rest] = path;
  if (head === undefined) {
    throw new PatchError(`Empty pointer segment`, op);
  }

  if (Array.isArray(doc)) {
    const cloned = [...doc];
    const idx = Number(head);
    if (!Number.isInteger(idx) || idx < 0 || idx >= cloned.length) {
      throw new PatchError(`Array index out of bounds: ${head}`, op);
    }
    if (rest.length === 0) {
      cloned.splice(idx, 1);
      return cloned;
    }
    cloned[idx] = removeAtPointer(cloned[idx], rest, op);
    return cloned;
  }

  const cloned: Record<string, unknown> = { ...(doc as Record<string, unknown>) };
  if (rest.length === 0) {
    if (!(head in cloned)) {
      throw new PatchError(`Cannot remove missing key '${head}'`, op);
    }
    delete cloned[head];
    return cloned;
  }
  const next = cloned[head];
  if (next === undefined) {
    throw new PatchError(`Cannot traverse into missing key '${head}'`, op);
  }
  cloned[head] = removeAtPointer(next, rest, op);
  return cloned;
}

/** Deep-clone via structuredClone with a JSON fallback for older runtimes. */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
