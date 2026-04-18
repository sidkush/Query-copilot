// Hardening Iteration 2 — follow-up probes from iter-1 residual risks.
//
//   #22  Extend memo-wrapper grep to forwardRef / observer / withErrorBoundary
//        — any HOC that takes an inline `function Name(...)` argument.
//   #23  useViewportMount transition: once=false (unmount-on-scroll) works
//        independently of a sibling tile with once=true (mount-once).
//   #24  useAnalystProAutosave payload contract: every field the hook sends
//        must appear in the backend UpdateDashboardBody Pydantic schema.
//   #25  ZoneFrame action cluster is rendered for worksheet AND non-worksheet
//        zones (container types should NOT show the cluster because they are
//        not user-interactable leaves).
//   #26  capColorCardinality threshold enforcement: exactly 21 distinct
//        values → dropped; 20 values → kept (boundary test).
//   #27  repairSpec preserves spec.mark when it's a non-string non-object
//        (e.g. accidentally an array). Should never crash.

import { describe, it, expect } from 'vitest';
import { capColorCardinality, repairSpec } from '../components/dashboard/freeform/lib/specPromotion';

describe('Hardening #22 — no HOC(function …) inline wrappers in src/components', () => {
  it('memo / forwardRef / observer / withErrorBoundary never wrap an inline function directly in default export', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = fileURLToPath(import.meta.url);
    const root = path.resolve(here, '..', '..', 'components');
    const glob = (dir: string, acc: string[] = []): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '__tests__' || e.name === 'dist') continue;
          glob(full, acc);
        } else if (/\.(jsx|tsx)$/.test(e.name)) acc.push(full);
      }
      return acc;
    };
    const files = glob(root);
    const offenders: string[] = [];
    const HOCS = ['memo', 'forwardRef', 'observer', 'withErrorBoundary'];
    const re = new RegExp(`export\\s+default\\s+(?:${HOCS.join('|')})\\s*\\(\\s*function\\s+\\w+\\s*\\(`);
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      if (re.test(src)) offenders.push(path.relative(root, f));
    }
    expect(offenders).toEqual([]);
  });
});

describe('Hardening #23 — useViewportMount once=true vs once=false coexist', () => {
  it('two hook instances with different `once` values do not share state', async () => {
    const React = (await import('react')).default;
    const { render, act } = await import('@testing-library/react');
    const useViewportMount = (await import('../lib/useViewportMount')).default;
    // Stub IntersectionObserver — jsdom does not ship with one.
    const callbacks: Array<(entries: IntersectionObserverEntry[]) => void> = [];
    const origIO = (globalThis as any).IntersectionObserver;
    (globalThis as any).IntersectionObserver = class {
      constructor(cb: (entries: IntersectionObserverEntry[]) => void) { callbacks.push(cb); }
      observe() {}
      disconnect() {}
    };

    // Wrap each hook in a real component so the ref attaches to a DOM node;
    // useViewportMount's effect only subscribes when `ref.current` is truthy.
    let onceMounted: boolean | null = null;
    let persistentMounted: boolean | null = null;
    function OnceHost() {
      const { ref, mounted } = useViewportMount({ once: true });
      onceMounted = mounted;
      return React.createElement('div', { ref });
    }
    function PersistentHost() {
      const { ref, mounted } = useViewportMount({ once: false });
      persistentMounted = mounted;
      return React.createElement('div', { ref });
    }

    try {
      render(React.createElement('div', null,
        React.createElement(OnceHost),
        React.createElement(PersistentHost),
      ));
      expect(callbacks.length).toBe(2);
      expect(onceMounted).toBe(false);
      expect(persistentMounted).toBe(false);
      act(() => {
        callbacks.forEach((cb) => cb([{ isIntersecting: true } as IntersectionObserverEntry]));
      });
      expect(onceMounted).toBe(true);
      expect(persistentMounted).toBe(true);
      act(() => {
        callbacks.forEach((cb) => cb([{ isIntersecting: false } as IntersectionObserverEntry]));
      });
      // once=true → stays mounted; once=false → unmounts.
      expect(onceMounted).toBe(true);
      expect(persistentMounted).toBe(false);
    } finally {
      (globalThis as any).IntersectionObserver = origIO;
    }
  });
});

describe('Hardening #24 — autosave payload fields all accepted by backend UpdateDashboardBody', () => {
  it('every key the hook sends appears in the backend Pydantic schema', async () => {
    // Mirror of the hook's payload keys — keep in sync with
    // frontend/src/components/dashboard/freeform/hooks/useAnalystProAutosave.js
    const PAYLOAD_KEYS = ['schemaVersion', 'archetype', 'size', 'tiledRoot', 'floatingLayer'];
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = fileURLToPath(import.meta.url);
    // Walk up to repo root, then backend/routers/dashboard_routes.py
    const repoRoot = path.resolve(here, '..', '..', '..', '..');
    const routesPath = path.join(repoRoot, 'backend', 'routers', 'dashboard_routes.py');
    if (!fs.existsSync(routesPath)) {
      // If the backend isn't checked out alongside (e.g. CI split), skip.
      return;
    }
    const src = fs.readFileSync(routesPath, 'utf8');
    // Find class UpdateDashboardBody: until next class.
    const m = src.match(/class UpdateDashboardBody[\s\S]*?(?=\nclass |\Z)/);
    expect(m).not.toBeNull();
    const body = m![0];
    const missing = PAYLOAD_KEYS.filter((k) => !body.includes(`${k}:`));
    expect(missing).toEqual([]);
  });
});

describe('Hardening #25 — ZoneFrame action cluster presence by zone type', () => {
  it('container-* zones never render a user-facing action cluster in their frame body', async () => {
    // This asserts the CURRENT contract: only LEAF zones render a ZoneFrame
    // at all; containers are rendered by ZoneRenderer without a frame.
    // Regression guard against an accidental future change that mounts
    // ZoneFrame around a container (would put ⋯ / ⛶ / × on every row).
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = fileURLToPath(import.meta.url);
    const rendererPath = path.resolve(here, '..', '..', 'components', 'dashboard', 'freeform', 'ZoneRenderer.jsx');
    const src = fs.readFileSync(rendererPath, 'utf8');
    // Container branch must NOT call renderLeaf; it must only recurse into children.
    // Specifically: inside `if (isContainer(zone)) { ... }` block there should be
    // no `renderLeaf(zone, resolved)` call.
    const containerBlock = src.match(/if \(isContainer\(zone\)\) \{[\s\S]*?^\s{2}\}/m);
    expect(containerBlock).not.toBeNull();
    expect(containerBlock![0]).not.toMatch(/renderLeaf\s*\(\s*zone\b/);
  });
});

describe('Hardening #26 — capColorCardinality boundary at 20 vs 21', () => {
  const makeSpec = (n: number) => ({
    mark: 'bar',
    data: { values: Array.from({ length: n }, (_, i) => ({ k: 'cat_' + i })) },
    encoding: {
      x: { field: 'k', type: 'nominal' },
      color: { field: 'k', type: 'nominal' },
    },
  });

  it('exactly 20 distinct values → color channel KEPT (identity ref)', () => {
    const spec = makeSpec(20);
    expect(capColorCardinality(spec)).toBe(spec);
  });

  it('exactly 21 distinct values → color channel DROPPED', () => {
    const out = capColorCardinality(makeSpec(21)) as any;
    expect(out.encoding.color).toBeUndefined();
  });
});

describe('Hardening #27 — repairSpec on exotic mark types', () => {
  it('spec with mark = [array] (invalid) is not crashed; identity fallback', () => {
    const spec = { mark: ['bar'] as any, encoding: { x: { field: 'a', type: 'nominal' } } };
    expect(() => repairSpec(spec)).not.toThrow();
  });

  it('spec with mark = number (invalid) is not crashed', () => {
    const spec = { mark: 42 as any, encoding: { x: { field: 'a', type: 'nominal' } } };
    expect(() => repairSpec(spec)).not.toThrow();
  });
});
