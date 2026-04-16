/**
 * IframeChartHost — React wrapper for sandboxed user-authored chart iframes.
 *
 * Tier 2 (custom-iframe) rendering path for the Render Strategy Router.
 * Delegates the full iframe lifecycle to `IframeChartBridge` and acquires an
 * `InstancePool` slot so the global pool can apply LRU eviction when the
 * dashboard is dense with tiles.
 *
 * Props
 * ─────
 *   bundle         JS source text of the compiled user chart bundle.
 *   data           Data payload forwarded to the guest via sendData().
 *   viewport       { width, height } — sent via sendResize on change.
 *   theme          ThemeTokens — sent via sendTheme on change.
 *   config         User-configured formatting values (merged with defaults).
 *   csp            Optional custom CSP string (passed through to buildSrcdoc).
 *   renderTimeout  Override default 5000 ms render timeout per tile.
 *   onSelect       Called when the guest fires a SELECT event.
 *
 * Data-testids
 * ────────────
 *   "iframe-chart-host"   — rendered when the bridge is healthy (or initialising).
 *   "iframe-chart-error"  — rendered when the bridge has reported an error.
 *
 * Instance pool
 * ─────────────
 *   Kind 'custom-iframe' is registered in WEIGHTS with 0 WebGL contexts and
 *   ~30 MB estimated memory. The pool will LRU-evict older iframes when the
 *   dashboard is over-capacity; the eviction callback calls destroy() so the
 *   component's own unmount path is not required in that scenario.
 */

import { useEffect, useRef, useCallback, useState, useId } from 'react';
import { IframeChartBridge } from './IframeChartBridge';
import { globalInstancePool, reportRenderTelemetry } from '../../chart-ir';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * @param {object} props
 * @param {string} props.bundle              - Compiled user chart bundle JS source.
 * @param {Record<string, unknown>} props.data - Data payload for the guest.
 * @param {{ width: number; height: number }} props.viewport
 * @param {Record<string, unknown>} props.theme
 * @param {Record<string, unknown>} props.config
 * @param {string} [props.csp]               - Custom Content-Security-Policy.
 * @param {number} [props.renderTimeout]     - Render timeout in ms (default 5000).
 * @param {(payload: Record<string, unknown>) => void} [props.onSelect]
 */
export default function IframeChartHost({
  bundle,
  data,
  viewport,
  theme,
  config,
  csp,
  renderTimeout,
  onSelect,
}) {
  // Stable ID for InstancePool slot — survives re-renders.
  const instanceId = useId();

  // Ref to the host div that receives the iframe.
  const containerRef = useRef(null);

  // The active bridge instance (never stored in state to avoid re-render loops).
  const bridgeRef = useRef(null);

  // Track whether the guest has sent READY so we know when it is safe to send data.
  const readyRef = useRef(false);

  // Stable refs for reactive props so callbacks don't re-close over stale values.
  const dataRef = useRef(data);
  const viewportRef = useRef(viewport);
  const themeRef = useRef(theme);
  const configRef = useRef(config);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Timestamp (performance.now()) captured just before each DATA message is sent.
  // Read in onRenderComplete to compute custom_type_render_ms.
  const dataSentTimestampRef = useRef(0);

  // Error state — if set, render the error card instead of the iframe container.
  const [error, setError] = useState(null);

  // -------------------------------------------------------------------------
  // Bridge callbacks (stable — defined before mount effect)
  // -------------------------------------------------------------------------

  const handleReady = useCallback(() => {
    readyRef.current = true;
    // Send initial data as soon as the guest is ready.
    if (bridgeRef.current) {
      dataSentTimestampRef.current = performance.now();
      bridgeRef.current.sendData({
        data: dataRef.current,
        theme: themeRef.current,
        config: configRef.current,
        viewport: viewportRef.current,
      });
    }
  }, []);

  const handleRenderComplete = useCallback((_triggerType) => {
    const renderMs = performance.now() - dataSentTimestampRef.current;
    reportRenderTelemetry({
      session_id: '',
      tile_id: instanceId,
      tier: 'custom',
      renderer_family: 'iframe',
      renderer_backend: 'iframe',
      row_count: dataRef.current?.rows?.length || 0,
      custom_type_render_ms: renderMs,
    });
  }, [instanceId]);

  const handleSelect = useCallback((payload) => {
    if (typeof onSelectRef.current === 'function') {
      onSelectRef.current(payload);
    }
  }, []);

  const handleError = useCallback((message, detail) => {
    setError({ message, detail });
  }, []);

  // -------------------------------------------------------------------------
  // Mount / unmount — runs once per `bundle` change (new bundle = remount)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current || !bundle) return;

    // Reset state from any previous mount.
    setError(null);
    readyRef.current = false;

    const bridge = new IframeChartBridge(
      {
        onReady: handleReady,
        onRenderComplete: handleRenderComplete,
        onSelect: handleSelect,
        onError: handleError,
      },
      { renderTimeoutMs: renderTimeout ?? 5000 },
    );

    bridgeRef.current = bridge;

    // Acquire an InstancePool slot. The eviction callback destroys the bridge
    // if the pool needs to reclaim memory before our unmount runs.
    globalInstancePool.acquireSlot('custom-iframe', instanceId, () => {
      bridge.destroy();
      bridgeRef.current = null;
      readyRef.current = false;
    });

    bridge.mount(containerRef.current, bundle, csp);

    return () => {
      bridge.destroy();
      bridgeRef.current = null;
      readyRef.current = false;
      globalInstancePool.releaseSlot(instanceId);
    };
    // bundle and csp are structural — remount on change. Callbacks are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, csp, instanceId]);

  // -------------------------------------------------------------------------
  // Reactive data / config / theme — send DATA on change (after first READY)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!bridgeRef.current || !readyRef.current) return;
    dataSentTimestampRef.current = performance.now();
    bridgeRef.current.sendData({
      data,
      theme,
      config,
      viewport,
    });
  }, [data, config, theme, viewport]);

  // -------------------------------------------------------------------------
  // Reactive viewport — send RESIZE on change (after first READY)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!bridgeRef.current || !readyRef.current) return;
    bridgeRef.current.sendResize(viewport.width, viewport.height);
  }, [viewport]);

  // -------------------------------------------------------------------------
  // Reactive theme — send THEME on change (after first READY)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!bridgeRef.current || !readyRef.current) return;
    bridgeRef.current.sendTheme(theme);
  }, [theme]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div
        data-testid="iframe-chart-error"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: '1.5rem',
          gap: '0.5rem',
          background: 'var(--color-surface, #1a1a2e)',
          border: '1px solid var(--color-border, #2a2a4a)',
          borderRadius: '0.5rem',
          color: 'var(--color-foreground, #e2e8f0)',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontSize: '1.5rem',
            lineHeight: 1,
            userSelect: 'none',
          }}
          aria-hidden="true"
        >
          ⚠
        </span>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-body, Inter, sans-serif)',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--color-error, #f87171)',
          }}
        >
          Chart Error
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.75rem',
            color: 'var(--color-muted, #94a3b8)',
            maxWidth: '32ch',
            wordBreak: 'break-word',
          }}
        >
          {error.message}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="iframe-chart-host"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  );
}
