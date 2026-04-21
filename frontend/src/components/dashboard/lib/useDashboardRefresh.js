import { useEffect, useRef, useState } from "react";

/**
 * useDashboardRefresh — Phase 4c hook for Live Ops auto-refresh.
 *
 * Opens an SSE connection to `/api/v1/dashboards/{dashboardId}/refresh-stream`
 * and returns `{ tick, lastSignal, connected, error }`. The endpoint
 * emits one JSON payload every `intervalMs` (clamped server-side to
 * 1–60s); each event increments `tick` so subscribers can re-render or
 * re-fetch per event.
 *
 * The hook degrades gracefully:
 *   - No `dashboardId` → returns static zero state (no connection).
 *   - EventSource unavailable → falls back to a `setInterval` tick every
 *     `intervalMs` so LiveOpsLayout still gets refresh signals in test
 *     environments (jsdom ships no EventSource).
 *   - Disconnect → auto-reconnect with a 2s backoff (up to 3 tries).
 *
 * JWT is injected via a URL query param (same pattern as the agent SSE
 * endpoint elsewhere in the app) because EventSource cannot set headers
 * natively. Backend reads the token via the existing Depends chain that
 * already accepts tokens via cookie/Authorization/query.
 */
export default function useDashboardRefresh(dashboardId, intervalMs = 5000) {
  const [tick, setTick] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [lastSignal, setLastSignal] = useState(null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (!dashboardId) {
      // async-init failure path — standard React pattern
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTick(0);
      setConnected(false);
      return undefined;
    }

    let cancelled = false;
    let source = null;
    let fallbackInterval = null;
    let reconnectTimer = null;

    const openFallback = () => {
      if (fallbackInterval) return;
      fallbackInterval = setInterval(() => {
        if (cancelled) return;
        setTick((t) => t + 1);
        setLastSignal({ ts: Date.now(), source: "fallback" });
      }, Math.max(1000, intervalMs));
    };

    const openSse = () => {
      if (cancelled) return;
      if (typeof EventSource === "undefined") {
        openFallback();
        return;
      }
      try {
        const token =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("token")
            : null;
        const intervalSec = Math.max(1, Math.round(intervalMs / 1000));
        const url =
          `/api/v1/dashboards/${encodeURIComponent(dashboardId)}/refresh-stream` +
          `?interval=${intervalSec}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
        source = new EventSource(url);
        source.addEventListener("refresh", (evt) => {
          if (cancelled) return;
          setConnected(true);
          setError(null);
          retryRef.current = 0;
          try {
            const data = JSON.parse(evt.data);
            setLastSignal({ ...data, source: "sse", ts: Date.now() });
            setTick((t) => t + 1);
          } catch {
            setTick((t) => t + 1);
          }
        });
        source.onopen = () => {
          if (cancelled) return;
          setConnected(true);
          setError(null);
        };
        source.onerror = () => {
          if (cancelled) return;
          setConnected(false);
          if (retryRef.current < 3) {
            retryRef.current += 1;
            try {
              source && source.close();
            } catch {
              /* noop */
            }
            source = null;
            reconnectTimer = setTimeout(openSse, 2000);
          } else {
            setError("refresh stream disconnected");
            openFallback();
          }
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        openFallback();
      }
    };

    openSse();

    return () => {
      cancelled = true;
      if (source) {
        try {
          source.close();
        } catch {
          /* noop */
        }
      }
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [dashboardId, intervalMs]);

  return { tick, connected, error, lastSignal };
}
