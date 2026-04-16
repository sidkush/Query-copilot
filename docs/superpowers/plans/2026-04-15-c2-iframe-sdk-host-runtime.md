# Sub-project C Phase C2 — iframe SDK + Host Runtime

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sandboxed iframe runtime for high-code custom chart types — user-written TypeScript/JavaScript that renders inside a CSP-sandboxed iframe, communicating with the host via a typed postMessage protocol. Power BI Custom Visuals parity.

**Architecture:** New `IframeChartBridge.ts` defines the typed postMessage protocol (Host→Guest: INIT/DATA/THEME/RESIZE/DESTROY; Guest→Host: READY/RENDER_COMPLETE/SELECT/TOOLTIP/ERROR). New `IframeChartHost.jsx` creates a sandboxed `<iframe srcdoc>`, injects user code as inline script, manages lifecycle + timeout guards. The IR router gains a code path for specs with `userTypeId` pointing to a Tier 2 (code-based) type. InstancePool gains `'custom-iframe'` kind.

**Tech Stack:** TypeScript (bridge protocol types), React (host component), existing InstancePool, existing IR router.

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-c-design.md`](../specs/2026-04-15-chart-system-sub-project-c-design.md) §2.3, §3, §8.2, §Phase C2.

**Depends on:** C0+C1 (composer + picker + agent), B's InstancePool.

---

## File Structure

### New frontend files
```
frontend/src/
  chart-ir/sdk/types.ts                             # IChartType, ChartCapabilities, DataRole, FormattingGroup, RenderContext, DataView
  chart-ir/sdk/bridge.ts                            # Typed postMessage protocol — message types + serialization
  chart-ir/__tests__/sdk/bridge.test.ts             # Protocol parsing tests
  components/chartTypes/IframeChartHost.jsx          # Sandboxed iframe host component
  components/chartTypes/IframeChartBridge.ts         # Host-side bridge implementation
  components/chartTypes/FormattingAutoRenderer.jsx   # Auto-render Inspector from capabilities.formatting
```

### Modified frontend files
```
frontend/src/
  chart-ir/perf/instancePool.ts                     # +custom-iframe kind
  chart-ir/index.ts                                 # +SDK type exports
  components/editor/EditorCanvas.jsx                # +IframeChartHost routing for Tier 2 types
```

---

## Task 1: SDK type definitions

**Files:**
- Create: `frontend/src/chart-ir/sdk/types.ts`
- Modify: `frontend/src/chart-ir/index.ts`

- [ ] **Step 1: Create SDK types**

```typescript
// frontend/src/chart-ir/sdk/types.ts
/**
 * IChartType SDK — type definitions for user-authored high-code chart types.
 *
 * Authors implement IChartType and register it inside the sandboxed iframe.
 * The host communicates via the postMessage bridge (bridge.ts).
 */

import type { SemanticType } from '../types';

/** Data role — a named data channel the chart needs. */
export interface DataRole {
  name: string;
  displayName: string;
  kind: 'dimension' | 'measure' | 'any';
  requiredType?: SemanticType;
  cardinality?: { min: number; max: number };
}

/** Formatting property auto-rendered in the Inspector. */
export interface FormattingProperty {
  name: string;
  displayName: string;
  type: 'color' | 'number' | 'text' | 'boolean' | 'select';
  default: unknown;
  options?: { value: string; label: string }[];
}

/** Formatting group — section in the Inspector. */
export interface FormattingGroup {
  name: string;
  displayName: string;
  properties: FormattingProperty[];
}

/** Chart capabilities — declares data needs, formatting schema, features, privileges. */
export interface ChartCapabilities {
  dataRoles: DataRole[];
  formatting?: FormattingGroup[];
  features?: {
    supportsSelection?: boolean;
    supportsTooltip?: boolean;
    supportsTheme?: boolean;
    supportsDrilldown?: boolean;
  };
  privileges?: {
    allowedOrigins?: string[];
    localStorage?: boolean;
  };
}

/** Data column in the DataView. */
export interface DataColumn {
  name: string;
  role: string;
  values: unknown[];
}

/** Typed data view passed to the chart on each update. */
export interface ChartDataView {
  columns: Record<string, DataColumn>;
  rowCount: number;
}

/** Theme tokens passed to the chart. */
export interface ThemeTokens {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  spacing: Record<string, number>;
  isDark: boolean;
}

/** Viewport dimensions. */
export interface Viewport {
  width: number;
  height: number;
}

/** The interface authors implement inside the iframe. */
export interface IChartType {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  getCapabilities(): ChartCapabilities;
  render(container: HTMLElement, ctx: ChartRenderContext): void;
  update(ctx: ChartRenderContext): void;
  destroy(): void;
}

/** Context passed to render() and update(). */
export interface ChartRenderContext {
  data: ChartDataView;
  viewport: Viewport;
  theme: ThemeTokens;
  config: Record<string, unknown>;
}
```

- [ ] **Step 2: Export from `chart-ir/index.ts`**

```typescript
// Sub-project C Phase C2 — Chart SDK types
export type {
  IChartType,
  ChartCapabilities,
  DataRole,
  FormattingGroup,
  FormattingProperty,
  ChartDataView,
  DataColumn,
  ThemeTokens,
  Viewport,
  ChartRenderContext,
} from './sdk/types';
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/sdk/types.ts frontend/src/chart-ir/index.ts && git commit -m "feat(c2): IChartType SDK type definitions — capabilities, data roles, formatting schema, render context"
```

---

## Task 2: postMessage bridge protocol

**Files:**
- Create: `frontend/src/chart-ir/sdk/bridge.ts`
- Create: `frontend/src/chart-ir/__tests__/sdk/bridge.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseGuestMessage,
  buildHostMessage,
  type HostMessageType,
  type GuestMessageType,
} from '../../sdk/bridge';

describe('buildHostMessage', () => {
  it('builds INIT message with correct shape', () => {
    const msg = buildHostMessage('INIT', { capabilities: {}, version: '1.0' });
    expect(msg.__askdb_bridge).toBe(true);
    expect(msg.type).toBe('INIT');
    expect(msg.payload.version).toBe('1.0');
  });

  it('builds DATA message', () => {
    const msg = buildHostMessage('DATA', { dataView: {}, viewport: { width: 400, height: 300 }, config: {}, theme: {} });
    expect(msg.type).toBe('DATA');
  });

  it('builds DESTROY message with empty payload', () => {
    const msg = buildHostMessage('DESTROY', {});
    expect(msg.type).toBe('DESTROY');
  });
});

describe('parseGuestMessage', () => {
  it('parses READY message', () => {
    const raw = { __askdb_bridge: true, type: 'READY', payload: { capabilities: {} } };
    const parsed = parseGuestMessage(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('READY');
  });

  it('returns null for non-bridge messages', () => {
    expect(parseGuestMessage({ type: 'something_else' })).toBeNull();
    expect(parseGuestMessage('not an object')).toBeNull();
    expect(parseGuestMessage(null)).toBeNull();
  });

  it('parses RENDER_COMPLETE message', () => {
    const raw = { __askdb_bridge: true, type: 'RENDER_COMPLETE', payload: {} };
    const parsed = parseGuestMessage(raw);
    expect(parsed!.type).toBe('RENDER_COMPLETE');
  });

  it('parses SELECT message with dataPoints', () => {
    const raw = { __askdb_bridge: true, type: 'SELECT', payload: { dataPoints: [0, 2, 5] } };
    const parsed = parseGuestMessage(raw);
    expect(parsed!.type).toBe('SELECT');
    expect(parsed!.payload.dataPoints).toEqual([0, 2, 5]);
  });

  it('parses ERROR message', () => {
    const raw = { __askdb_bridge: true, type: 'ERROR', payload: { title: 'Oops', message: 'broke' } };
    const parsed = parseGuestMessage(raw);
    expect(parsed!.type).toBe('ERROR');
    expect(parsed!.payload.message).toBe('broke');
  });
});
```

- [ ] **Step 2: Implement `bridge.ts`**

```typescript
// frontend/src/chart-ir/sdk/bridge.ts
/**
 * AskDB Chart SDK — postMessage bridge protocol.
 *
 * All messages carry `__askdb_bridge: true` as a discriminator so the
 * host can ignore unrelated postMessage traffic (browser extensions, etc).
 */

export type HostMessageType = 'INIT' | 'DATA' | 'THEME' | 'RESIZE' | 'DESTROY';
export type GuestMessageType = 'READY' | 'RENDER_COMPLETE' | 'SELECT' | 'TOOLTIP_SHOW' | 'TOOLTIP_HIDE' | 'ERROR' | 'CONFIG_REQUEST';

export interface BridgeMessage<T extends string = string> {
  __askdb_bridge: true;
  type: T;
  payload: Record<string, unknown>;
}

export function buildHostMessage(type: HostMessageType, payload: Record<string, unknown>): BridgeMessage<HostMessageType> {
  return { __askdb_bridge: true, type, payload };
}

export function parseGuestMessage(raw: unknown): BridgeMessage<GuestMessageType> | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  if (msg.__askdb_bridge !== true) return null;
  if (typeof msg.type !== 'string') return null;
  return {
    __askdb_bridge: true,
    type: msg.type as GuestMessageType,
    payload: (msg.payload as Record<string, unknown>) || {},
  };
}

/**
 * Generate the srcdoc HTML that bootstraps user code inside the iframe.
 *
 * The user's bundled JS is injected as an inline <script>. The bootstrap
 * script sets up the `askdb` global with `register()`, listens for host
 * messages, and dispatches to the registered IChartType implementation.
 */
export function buildSrcdoc(userBundle: string, csp?: string): string {
  const cspMeta = csp
    ? `<meta http-equiv="Content-Security-Policy" content="${csp}">`
    : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:;">`;

  return `<!DOCTYPE html>
<html>
<head>
  ${cspMeta}
  <style>html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }</style>
</head>
<body>
  <div id="chart-root" style="width:100%;height:100%"></div>
  <script>
    // AskDB Chart SDK bootstrap
    (function() {
      var _impl = null;
      var _container = document.getElementById('chart-root');

      window.askdb = {
        register: function(impl) {
          _impl = impl;
          parent.postMessage({
            __askdb_bridge: true,
            type: 'READY',
            payload: { capabilities: impl.getCapabilities ? impl.getCapabilities() : {} }
          }, '*');
        }
      };

      window.addEventListener('message', function(e) {
        var msg = e.data;
        if (!msg || !msg.__askdb_bridge) return;

        try {
          if (msg.type === 'INIT' && _impl && _impl.render) {
            _impl.render(_container, msg.payload);
          } else if (msg.type === 'DATA' && _impl && _impl.update) {
            _impl.update(msg.payload);
          } else if (msg.type === 'THEME' && _impl && _impl.update) {
            _impl.update(msg.payload);
          } else if (msg.type === 'RESIZE' && _impl && _impl.update) {
            _impl.update(msg.payload);
          } else if (msg.type === 'DESTROY' && _impl && _impl.destroy) {
            _impl.destroy();
          }
        } catch(err) {
          parent.postMessage({
            __askdb_bridge: true,
            type: 'ERROR',
            payload: { title: 'Runtime Error', message: String(err) }
          }, '*');
        }
      });

      window.onerror = function(msg, src, line, col, err) {
        parent.postMessage({
          __askdb_bridge: true,
          type: 'ERROR',
          payload: { title: 'Uncaught Error', message: msg + ' at line ' + line }
        }, '*');
      };
    })();
  </script>
  <script>${'${USER_BUNDLE}'}</script>
</body>
</html>`.replace('${USER_BUNDLE}', userBundle);
}
```

- [ ] **Step 3: Export from index.ts**

```typescript
export { buildHostMessage, parseGuestMessage, buildSrcdoc } from './sdk/bridge';
export type { BridgeMessage, HostMessageType, GuestMessageType } from './sdk/bridge';
```

- [ ] **Step 4: Run tests — expect 8 passed**

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/sdk/bridge.ts frontend/src/chart-ir/__tests__/sdk/bridge.test.ts frontend/src/chart-ir/index.ts && git commit -m "feat(c2): postMessage bridge protocol — typed host↔guest messaging for sandboxed chart SDK"
```

---

## Task 3: Extend InstancePool with `custom-iframe` kind

**Files:**
- Modify: `frontend/src/chart-ir/perf/instancePool.ts`

- [ ] **Step 1: Add `custom-iframe` to InstanceKind and WEIGHTS**

Change the type:
```typescript
export type InstanceKind = 'vega-svg' | 'vega-canvas' | 'maplibre' | 'deck' | 'three' | 'custom-iframe';
```

Add to WEIGHTS:
```typescript
'custom-iframe': { webglContext: 0, estimatedMb: 30 },
```

- [ ] **Step 2: Run existing pool tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/perf/instancePool.test.ts
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/perf/instancePool.ts && git commit -m "feat(c2): add custom-iframe kind to InstancePool — sandboxed chart iframes count against pool"
```

---

## Task 4: IframeChartHost component

**Files:**
- Create: `frontend/src/components/chartTypes/IframeChartHost.jsx`
- Create: `frontend/src/components/chartTypes/IframeChartBridge.ts`

- [ ] **Step 1: Create `IframeChartBridge.ts`**

Host-side bridge class that manages iframe lifecycle:

```typescript
// frontend/src/components/chartTypes/IframeChartBridge.ts
import { buildHostMessage, parseGuestMessage, buildSrcdoc } from '../../chart-ir/sdk/bridge';
import type { GuestMessageType } from '../../chart-ir/sdk/bridge';

export interface BridgeCallbacks {
  onReady: (capabilities: Record<string, unknown>) => void;
  onRenderComplete: () => void;
  onSelect: (dataPoints: number[]) => void;
  onError: (title: string, message: string) => void;
}

export class IframeChartBridgeHost {
  private iframe: HTMLIFrameElement | null = null;
  private callbacks: BridgeCallbacks;
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private renderTimeout: ReturnType<typeof setTimeout> | null = null;
  private renderTimeoutMs: number;

  constructor(callbacks: BridgeCallbacks, renderTimeoutMs = 5000) {
    this.callbacks = callbacks;
    this.renderTimeoutMs = renderTimeoutMs;
  }

  mount(container: HTMLElement, userBundle: string, csp?: string): void {
    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-scripts');
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    iframe.srcdoc = buildSrcdoc(userBundle, csp);
    container.appendChild(iframe);
    this.iframe = iframe;

    this.messageHandler = (e: MessageEvent) => {
      const msg = parseGuestMessage(e.data);
      if (!msg) return;
      this.handleGuestMessage(msg.type, msg.payload);
    };
    window.addEventListener('message', this.messageHandler);
  }

  sendData(payload: Record<string, unknown>): void {
    this.iframe?.contentWindow?.postMessage(buildHostMessage('DATA', payload), '*');
    this.startRenderTimeout();
  }

  sendTheme(tokens: Record<string, unknown>): void {
    this.iframe?.contentWindow?.postMessage(buildHostMessage('THEME', { tokens }), '*');
  }

  sendResize(width: number, height: number): void {
    this.iframe?.contentWindow?.postMessage(buildHostMessage('RESIZE', { width, height }), '*');
  }

  destroy(): void {
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    this.iframe?.contentWindow?.postMessage(buildHostMessage('DESTROY', {}), '*');
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }
    this.iframe?.remove();
    this.iframe = null;
  }

  private handleGuestMessage(type: GuestMessageType, payload: Record<string, unknown>): void {
    switch (type) {
      case 'READY':
        this.callbacks.onReady(payload.capabilities as Record<string, unknown> || {});
        break;
      case 'RENDER_COMPLETE':
        if (this.renderTimeout) clearTimeout(this.renderTimeout);
        this.callbacks.onRenderComplete();
        break;
      case 'SELECT':
        this.callbacks.onSelect((payload.dataPoints as number[]) || []);
        break;
      case 'ERROR':
        this.callbacks.onError(
          String(payload.title || 'Error'),
          String(payload.message || 'Unknown error'),
        );
        break;
    }
  }

  private startRenderTimeout(): void {
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    this.renderTimeout = setTimeout(() => {
      this.callbacks.onError('Render Timeout', `Chart did not complete rendering within ${this.renderTimeoutMs}ms`);
    }, this.renderTimeoutMs);
  }
}
```

- [ ] **Step 2: Create `IframeChartHost.jsx`**

```jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { IframeChartBridgeHost } from './IframeChartBridge';
import { globalInstancePool } from '../../chart-ir';

/**
 * IframeChartHost — sandboxed iframe host for Tier 2 custom chart types.
 *
 * Props:
 *   - bundle: string — the user's bundled JS code
 *   - data: { columns, rows } — query result data to send
 *   - viewport: { width, height }
 *   - theme: object — theme tokens
 *   - config: object — formatting property values
 *   - csp?: string — optional CSP override for privileged types
 *   - renderTimeout?: number — ms before showing timeout error (default 5000)
 *   - onSelect?: (dataPoints: number[]) => void
 */
export default function IframeChartHost({
  bundle,
  data,
  viewport,
  theme,
  config,
  csp,
  renderTimeout = 5000,
  onSelect,
}) {
  const containerRef = useRef(null);
  const bridgeRef = useRef(null);
  const slotIdRef = useRef(`custom-iframe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  // Mount iframe + bridge
  useEffect(() => {
    if (!containerRef.current || !bundle) return;

    const bridge = new IframeChartBridgeHost({
      onReady: () => setReady(true),
      onRenderComplete: () => {},
      onSelect: (pts) => onSelect?.(pts),
      onError: (title, msg) => setError(`${title}: ${msg}`),
    }, renderTimeout);

    bridge.mount(containerRef.current, bundle, csp);
    bridgeRef.current = bridge;

    // Acquire pool slot
    globalInstancePool.acquireSlot('custom-iframe', slotIdRef.current, () => {
      bridge.destroy();
    });

    return () => {
      bridge.destroy();
      globalInstancePool.releaseSlot(slotIdRef.current);
      bridgeRef.current = null;
      setReady(false);
      setError(null);
    };
  }, [bundle, csp, renderTimeout]);

  // Send data when ready or data changes
  useEffect(() => {
    if (!ready || !bridgeRef.current) return;
    bridgeRef.current.sendData({
      dataView: data,
      viewport: viewport || { width: 400, height: 300 },
      config: config || {},
      theme: theme || {},
    });
  }, [ready, data, viewport, config, theme]);

  // Send resize
  useEffect(() => {
    if (!ready || !bridgeRef.current || !viewport) return;
    bridgeRef.current.sendResize(viewport.width, viewport.height);
  }, [ready, viewport?.width, viewport?.height]);

  // Send theme changes
  useEffect(() => {
    if (!ready || !bridgeRef.current || !theme) return;
    bridgeRef.current.sendTheme(theme);
  }, [ready, theme]);

  if (error) {
    return (
      <div data-testid="iframe-chart-error" style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center',
        background: 'rgba(239, 68, 68, 0.06)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 8, color: '#f87171', fontSize: 13,
      }}>
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="iframe-chart-host"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/chartTypes/IframeChartHost.jsx frontend/src/components/chartTypes/IframeChartBridge.ts && git commit -m "feat(c2): IframeChartHost + IframeChartBridge — sandboxed iframe runtime for Tier 2 custom chart types"
```

---

## Task 5: FormattingAutoRenderer — Inspector from capabilities

**Files:**
- Create: `frontend/src/components/chartTypes/FormattingAutoRenderer.jsx`

- [ ] **Step 1: Create the component**

Auto-renders Inspector sections from a `ChartCapabilities.formatting` array. Each `FormattingGroup` becomes an accordion section, each `FormattingProperty` becomes a form control.

Props: `formatting: FormattingGroup[]`, `config: Record<string, unknown>`, `onConfigChange: (key, value) => void`

Property type mapping:
- `color` → `<input type="color">`
- `number` → `<input type="number">`
- `text` → `<input type="text">`
- `boolean` → toggle switch / checkbox
- `select` → `<select>` with options

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/chartTypes/FormattingAutoRenderer.jsx && git commit -m "feat(c2): FormattingAutoRenderer — auto-render Inspector controls from capabilities.formatting schema"
```

---

## Task 6: Wire IframeChartHost into EditorCanvas

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.jsx`

- [ ] **Step 1: Add routing for Tier 2 types**

In EditorCanvas, when the spec has a `userTypeId` that points to a Tier 2 (code-based) type, render `<IframeChartHost>` instead of `<VegaRenderer>`.

Check: read the current EditorCanvas to understand how it dispatches to renderers. The router (`chart-ir/router.ts`) maps spec.type → renderer. For Tier 2 types, the dispatch should check if the spec carries a `userTypeId` and the corresponding type entry has `tier: 'code'` and a `bundle` field.

The bundle comes from the backend (stored in chart_customization). For now, read it from the store or pass it as a prop.

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/EditorCanvas.jsx && git commit -m "feat(c2): route Tier 2 user types to IframeChartHost in EditorCanvas"
```

---

## Task 7: Phase C2 checkpoint

- [ ] **Step 1: Run bridge tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/sdk/bridge.test.ts 2>&1 | tail -10
```

- [ ] **Step 2: Run pool tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/perf/instancePool.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 4: Tag**

```bash
cd "QueryCopilot V1" && git tag c2-iframe-sdk
```
