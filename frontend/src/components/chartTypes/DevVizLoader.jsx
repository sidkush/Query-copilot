/**
 * DevVizLoader — dev-time live-reloading chart host.
 *
 * Fetches a compiled chart bundle from a local dev server URL, renders it
 * inside IframeChartHost, and optionally connects a WebSocket for hot-reload
 * when the dev server pushes a 'reload' message.
 *
 * Props
 * ─────
 *   devUrl     URL to fetch the bundle JS from (plain text GET).
 *   data       Data payload forwarded to IframeChartHost.
 *   viewport   { width, height } forwarded to IframeChartHost.
 *   theme      ThemeTokens forwarded to IframeChartHost.
 *
 * Dev workflow
 * ────────────
 *   1. Navigate to /dev/chart-editor?dev-viz=http://localhost:7777/bundle.js
 *   2. Edit your chart source — your dev server rebuilds and sends 'reload' via WS.
 *   3. DevVizLoader re-fetches the bundle and remounts the iframe automatically.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import IframeChartHost from './IframeChartHost';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a WebSocket URL from the bundle HTTP URL.
 * e.g. http://localhost:7777/bundle.js → ws://localhost:7777/ws
 */
function deriveWsUrl(httpUrl) {
  try {
    return httpUrl.replace(/^http/, 'ws').replace(/\/[^/]*$/, '/ws');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * @param {object} props
 * @param {string} props.devUrl       - HTTP URL to fetch the bundle from.
 * @param {Record<string, unknown>} props.data
 * @param {{ width: number; height: number }} props.viewport
 * @param {Record<string, unknown>} props.theme
 */
export default function DevVizLoader({ devUrl, data, viewport, theme }) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Keep a stable ref to the fetch abort controller so we can cancel on unmount.
  const abortRef = useRef(null);

  // WebSocket ref — silently ignored if the dev server doesn't support it.
  const wsRef = useRef(null);

  // -------------------------------------------------------------------------
  // Bundle fetch
  // -------------------------------------------------------------------------

  const fetchBundle = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(devUrl, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      setBundle(text);
      setLoading(false);
    } catch (err) {
      if (err.name === 'AbortError') return; // unmount or re-fetch — ignore
      setError(err.message || String(err));
      setLoading(false);
    }
  }, [devUrl]);

  // -------------------------------------------------------------------------
  // Fetch on mount / devUrl change
  // -------------------------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    fetchBundle(controller.signal);
    return () => controller.abort();
  }, [fetchBundle]);

  // -------------------------------------------------------------------------
  // WebSocket hot-reload
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!devUrl) return;
    const wsUrl = deriveWsUrl(devUrl);
    if (!wsUrl) return;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      // Dev server may not expose WS — silently skip.
      return;
    }

    ws.onmessage = (event) => {
      if (event.data === 'reload') {
        // Re-fetch the bundle — a new AbortController will be created by the
        // effect above when fetchBundle identity changes, but here we fire an
        // ad-hoc fetch directly.
        const controller = new AbortController();
        abortRef.current = controller;
        fetchBundle(controller.signal);
      }
    };

    // All errors silently swallowed — WS is best-effort for dev ergonomics.
    ws.onerror = () => {};

    wsRef.current = ws;
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [devUrl, fetchBundle]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const containerStyle = {
    position: 'relative',
    width: '100%',
    height: '100%',
  };

  const badgeStyle = {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 10,
    background: '#eab308', // yellow-500
    color: '#000',
    fontSize: 10,
    fontWeight: 700,
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.08em',
    padding: '2px 6px',
    borderRadius: 3,
    pointerEvents: 'none',
    userSelect: 'none',
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-body, Inter, sans-serif)',
            fontSize: 13,
            color: 'var(--color-muted, rgba(255,255,255,0.5))',
          }}
        >
          Loading dev viz from {devUrl}...
        </span>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div
        style={{
          ...containerStyle,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          gap: '0.5rem',
          border: '2px dashed #f59e0b', // amber-400
          borderRadius: 8,
          background: 'rgba(245,158,11,0.06)',
          boxSizing: 'border-box',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-body, Inter, sans-serif)',
            fontSize: 13,
            fontWeight: 600,
            color: '#f59e0b',
          }}
        >
          Dev viz load error
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            color: 'var(--color-muted, rgba(255,255,255,0.5))',
            wordBreak: 'break-all',
            textAlign: 'center',
            maxWidth: '40ch',
          }}
        >
          {error}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            color: 'var(--color-muted, rgba(255,255,255,0.35))',
            wordBreak: 'break-all',
            textAlign: 'center',
          }}
        >
          {devUrl}
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Happy path — render IframeChartHost with the fetched bundle
  // -------------------------------------------------------------------------

  return (
    <div style={containerStyle}>
      <span style={badgeStyle} aria-label="Dev viz mode">DEV VIZ</span>
      <IframeChartHost
        bundle={bundle}
        data={data}
        viewport={viewport}
        theme={theme}
        config={{}}
        renderTimeout={10000}
      />
    </div>
  );
}
