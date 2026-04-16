/**
 * AskDB Chart SDK — postMessage bridge protocol.
 *
 * Typed host↔guest messaging for the sandboxed chart iframe SDK.
 * All messages carry `__askdb_bridge: true` as a discriminator so they
 * can be distinguished from any other postMessage traffic on the page.
 *
 * Host = the AskDB application that embeds the <iframe>.
 * Guest = the user-supplied chart bundle running inside the iframe sandbox.
 *
 * Message flow:
 *   Host → Guest:  INIT → DATA / THEME / RESIZE → DESTROY
 *   Guest → Host:  READY → RENDER_COMPLETE | SELECT | TOOLTIP_SHOW |
 *                          TOOLTIP_HIDE | ERROR | CONFIG_REQUEST
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HostMessageType = 'INIT' | 'DATA' | 'THEME' | 'RESIZE' | 'DESTROY';

export type GuestMessageType =
  | 'READY'
  | 'RENDER_COMPLETE'
  | 'SELECT'
  | 'TOOLTIP_SHOW'
  | 'TOOLTIP_HIDE'
  | 'ERROR'
  | 'CONFIG_REQUEST';

/**
 * Base shape for all bridge messages (host or guest direction).
 * The `__askdb_bridge` discriminator enables safe filtering in
 * window.addEventListener('message', …) handlers.
 */
export interface BridgeMessage<T extends HostMessageType | GuestMessageType> {
  __askdb_bridge: true;
  type: T;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Host → Guest helpers
// ---------------------------------------------------------------------------

/**
 * Build a typed host message ready to post into the guest iframe.
 *
 * @example
 *   iframe.contentWindow?.postMessage(
 *     buildHostMessage('DATA', { rows, columns }),
 *     '*',
 *   );
 */
export function buildHostMessage(
  type: HostMessageType,
  payload: Record<string, unknown> = {},
): BridgeMessage<HostMessageType> {
  return { __askdb_bridge: true, type, payload };
}

// ---------------------------------------------------------------------------
// Guest → Host helpers
// ---------------------------------------------------------------------------

/**
 * Parse an unknown value received in a `message` event and return a typed
 * `BridgeMessage<GuestMessageType>` if it passes all structural checks.
 * Returns `null` for any value that is not a valid AskDB bridge message —
 * including messages from third-party libraries sharing the same origin.
 */
export function parseGuestMessage(raw: unknown): BridgeMessage<GuestMessageType> | null {
  if (raw === null || typeof raw !== 'object') return null;

  const msg = raw as Record<string, unknown>;

  // Discriminator check — must be exactly `true`
  if (msg['__askdb_bridge'] !== true) return null;

  // Type check — must be a recognised guest message type
  const GUEST_TYPES: ReadonlySet<string> = new Set<GuestMessageType>([
    'READY',
    'RENDER_COMPLETE',
    'SELECT',
    'TOOLTIP_SHOW',
    'TOOLTIP_HIDE',
    'ERROR',
    'CONFIG_REQUEST',
  ]);

  const type = msg['type'];
  if (typeof type !== 'string' || !GUEST_TYPES.has(type)) return null;

  // Payload must be a plain object (may be empty)
  const payload = msg['payload'];
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;

  return {
    __askdb_bridge: true,
    type: type as GuestMessageType,
    payload: payload as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Srcdoc generation
// ---------------------------------------------------------------------------

/**
 * Default Content Security Policy applied when the caller does not supply
 * a custom one. Restricts the sandboxed iframe to the minimum surface:
 * - No network requests (default-src 'none').
 * - Inline scripts allowed (required for the bootstrap + user bundle).
 * - Inline styles allowed (chart libraries often inject stylesheets).
 * - No external connections whatsoever.
 */
const DEFAULT_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';";

/**
 * Generate the full HTML `srcdoc` string for the sandboxed chart iframe.
 *
 * The returned document:
 * 1. Applies a Content Security Policy meta tag.
 * 2. Provides a `<div id="chart-root">` mount point.
 * 3. Sets up `window.askdb.register(impl)` — the entry-point that user
 *    bundles call to hand over their `{ render, update, destroy }` impl.
 * 4. Installs a `message` listener on `window` that dispatches incoming
 *    host messages to the appropriate `impl` method.
 * 5. Installs a `window.onerror` handler that forwards uncaught exceptions
 *    back to the host as ERROR messages.
 * 6. Injects the `userBundle` as a second `<script>` tag so it executes
 *    after the bootstrap is ready.
 *
 * @param userBundle - The full text of the compiled user chart bundle (JS).
 * @param csp        - Optional custom CSP string. Defaults to `DEFAULT_CSP`.
 */
export function buildSrcdoc(userBundle: string, csp: string = DEFAULT_CSP): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #chart-root { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="chart-root"></div>

  <!-- Bootstrap: sets up window.askdb registry + message dispatcher -->
  <script>
    (function () {
      'use strict';

      // ----------------------------------------------------------------
      // Helpers
      // ----------------------------------------------------------------

      /** Send a typed bridge message to the host frame. */
      function postToHost(type, payload) {
        parent.postMessage(
          { __askdb_bridge: true, type: type, payload: payload || {} },
          '*'
        );
      }

      // ----------------------------------------------------------------
      // window.onerror — forward uncaught exceptions as ERROR messages
      // ----------------------------------------------------------------
      window.onerror = function (message, source, lineno, colno, error) {
        postToHost('ERROR', {
          message: String(message),
          source: source || '',
          lineno: lineno || 0,
          colno: colno || 0,
          stack: (error && error.stack) ? error.stack : '',
        });
        // Prevent the browser from logging the error again
        return true;
      };

      window.onunhandledrejection = function (event) {
        var reason = event.reason;
        postToHost('ERROR', {
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error && reason.stack ? reason.stack : '',
          source: 'unhandledrejection',
          lineno: 0,
          colno: 0,
        });
      };

      // ----------------------------------------------------------------
      // window.askdb registry
      // ----------------------------------------------------------------

      var _impl = null;

      window.askdb = {
        /**
         * Called by the user bundle to register their chart implementation.
         * @param {Object} impl - { render(payload), update(payload), destroy() }
         */
        register: function (impl) {
          if (!impl || typeof impl.render !== 'function') {
            postToHost('ERROR', {
              message: 'window.askdb.register() requires an object with a render() method.',
              source: 'bootstrap',
              lineno: 0,
              colno: 0,
              stack: '',
            });
            return;
          }
          _impl = impl;
          // Signal to the host that the guest is ready to receive messages
          postToHost('READY', {});
        },
      };

      // ----------------------------------------------------------------
      // Host message dispatcher
      // ----------------------------------------------------------------
      window.addEventListener('message', function (event) {
        var data = event.data;

        // Ignore non-bridge messages
        if (!data || data.__askdb_bridge !== true) return;

        var type = data.type;
        var payload = data.payload || {};

        if (!_impl) {
          // Bundle hasn't called register() yet — queue or ignore
          return;
        }

        try {
          switch (type) {
            case 'INIT':
              // INIT carries initial config; delegate to render for first paint
              if (typeof _impl.render === 'function') {
                _impl.render(payload);
                postToHost('RENDER_COMPLETE', { type: 'INIT' });
              }
              break;

            case 'DATA':
              if (typeof _impl.update === 'function') {
                _impl.update(payload);
                postToHost('RENDER_COMPLETE', { type: 'DATA' });
              } else if (typeof _impl.render === 'function') {
                _impl.render(payload);
                postToHost('RENDER_COMPLETE', { type: 'DATA' });
              }
              break;

            case 'THEME':
              if (typeof _impl.update === 'function') {
                _impl.update({ theme: payload });
                postToHost('RENDER_COMPLETE', { type: 'THEME' });
              }
              break;

            case 'RESIZE':
              if (typeof _impl.update === 'function') {
                _impl.update({ resize: payload });
                postToHost('RENDER_COMPLETE', { type: 'RESIZE' });
              }
              break;

            case 'DESTROY':
              if (typeof _impl.destroy === 'function') {
                _impl.destroy();
              }
              _impl = null;
              break;

            default:
              // Unknown host message type — silently ignore
              break;
          }
        } catch (err) {
          postToHost('ERROR', {
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error && err.stack ? err.stack : '',
            source: 'dispatch:' + type,
            lineno: 0,
            colno: 0,
          });
        }
      });
    })();
  </script>

  <!-- User-supplied chart bundle -->
  <script>
${userBundle}
  </script>
</body>
</html>`;
}
