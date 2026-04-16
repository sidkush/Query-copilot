/**
 * IframeChartBridge — host-side iframe lifecycle manager.
 *
 * Creates and manages a sandboxed `<iframe sandbox="allow-scripts">` that
 * hosts a user-supplied chart bundle. All communication with the guest happens
 * exclusively through the postMessage bridge protocol defined in
 * `../../chart-ir/sdk/bridge`.
 *
 * Responsibilities:
 *   - Build the srcdoc HTML from the user bundle and inject it into a new iframe.
 *   - Register / remove the window `message` event listener.
 *   - Send typed host messages (DATA, THEME, RESIZE, DESTROY) to the guest.
 *   - Parse guest messages (READY, RENDER_COMPLETE, SELECT, ERROR, …) and
 *     dispatch them to caller-provided callbacks.
 *   - Start a render timeout after `sendData`; fire `onError` if
 *     `RENDER_COMPLETE` does not arrive within `renderTimeoutMs`.
 *
 * Security notes:
 *   - The iframe uses `sandbox="allow-scripts"` only — no same-origin, no
 *     forms, no popups. This confines the guest to its own opaque origin.
 *   - `postMessage` origin is `'*'` toward the iframe (srcdoc has no origin to
 *     match against). Incoming messages are filtered by the `__askdb_bridge`
 *     discriminator via `parseGuestMessage`.
 */

import { buildHostMessage, parseGuestMessage, buildSrcdoc } from '../../chart-ir/sdk/bridge';
import type { GuestMessageType } from '../../chart-ir/sdk/bridge';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IframeChartBridgeCallbacks {
  /** Fired when the guest calls `window.askdb.register()` and signals READY. */
  onReady: () => void;
  /**
   * Fired when the guest posts RENDER_COMPLETE after processing a DATA,
   * THEME, or RESIZE message.
   */
  onRenderComplete: (triggerType: string) => void;
  /**
   * Fired when the guest posts a SELECT event (Phase C3+ brushing).
   * `payload` contains whatever the guest bundle chose to include.
   */
  onSelect: (payload: Record<string, unknown>) => void;
  /**
   * Fired on guest-reported errors (window.onerror, rejected promises, or
   * dispatch exceptions) and on host-side render timeouts.
   *
   * @param message  - Human-readable error description.
   * @param detail   - Full payload from the guest ERROR message, or an object
   *                   with `{ source: 'render-timeout' }` for timeouts.
   */
  onError: (message: string, detail: Record<string, unknown>) => void;
}

export interface IframeChartBridgeOptions {
  /** Milliseconds to wait for RENDER_COMPLETE after sendData. Default: 5000. */
  renderTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// IframeChartBridge
// ---------------------------------------------------------------------------

export class IframeChartBridge {
  private iframe: HTMLIFrameElement | null = null;
  private container: HTMLElement | null = null;
  private callbacks: IframeChartBridgeCallbacks;
  private renderTimeoutMs: number;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private destroyed = false;

  constructor(callbacks: IframeChartBridgeCallbacks, options: IframeChartBridgeOptions = {}) {
    this.callbacks = callbacks;
    this.renderTimeoutMs = options.renderTimeoutMs ?? 5000;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create the sandboxed iframe, inject the user bundle via srcdoc, append it
   * to `container`, and start listening for guest messages.
   *
   * @param container  - DOM node to append the iframe to. Must be mounted.
   * @param userBundle - Full text of the compiled user chart bundle (JS).
   * @param csp        - Optional custom Content-Security-Policy string.
   *                     Defaults to the bridge's built-in restrictive policy.
   */
  mount(container: HTMLElement, userBundle: string, csp?: string): void {
    if (this.destroyed) {
      throw new Error('IframeChartBridge: cannot mount after destroy()');
    }

    this.container = container;

    // Build the iframe element.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    iframe.srcdoc = buildSrcdoc(userBundle, csp);

    // Register the message listener before appending so we never miss READY.
    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener('message', this.messageHandler);

    container.appendChild(iframe);
    this.iframe = iframe;
  }

  /**
   * Send a DATA payload to the guest and start the render timeout timer.
   *
   * The timer is cleared when RENDER_COMPLETE arrives. If it fires before
   * that, `onError` is called with `source: 'render-timeout'`.
   */
  sendData(payload: Record<string, unknown>): void {
    this.postToGuest('DATA', payload);
    this.startRenderTimeout();
  }

  /** Send a THEME message carrying updated design tokens. */
  sendTheme(tokens: Record<string, unknown>): void {
    this.postToGuest('THEME', tokens);
  }

  /** Send a RESIZE message with new iframe dimensions. */
  sendResize(width: number, height: number): void {
    this.postToGuest('RESIZE', { width, height });
  }

  /**
   * Tear down: send DESTROY to the guest, remove the message listener, and
   * remove the iframe from the DOM.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.clearRenderTimeout();

    // Best-effort DESTROY signal — the guest may already be gone.
    try {
      this.postToGuest('DESTROY', {});
    } catch {
      // Swallow — iframe may have already been garbage-collected.
    }

    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }

    this.container = null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private postToGuest(
    type: 'DATA' | 'THEME' | 'RESIZE' | 'DESTROY' | 'INIT',
    payload: Record<string, unknown>,
  ): void {
    if (!this.iframe?.contentWindow) return;
    const msg = buildHostMessage(type, payload);
    this.iframe.contentWindow.postMessage(msg, '*');
  }

  private handleMessage(event: MessageEvent): void {
    if (this.destroyed) return;

    const parsed = parseGuestMessage(event.data);
    if (!parsed) return;

    const type = parsed.type as GuestMessageType;
    const payload = parsed.payload;

    switch (type) {
      case 'READY':
        this.callbacks.onReady();
        break;

      case 'RENDER_COMPLETE': {
        this.clearRenderTimeout();
        const triggerType = typeof payload['type'] === 'string' ? payload['type'] : 'unknown';
        this.callbacks.onRenderComplete(triggerType);
        break;
      }

      case 'SELECT':
        this.callbacks.onSelect(payload);
        break;

      case 'ERROR': {
        this.clearRenderTimeout();
        const message =
          typeof payload['message'] === 'string' ? payload['message'] : 'Unknown guest error';
        this.callbacks.onError(message, payload);
        break;
      }

      case 'TOOLTIP_SHOW':
      case 'TOOLTIP_HIDE':
      case 'CONFIG_REQUEST':
        // Handled in future phases — silently ignore for now.
        break;

      default:
        // Unknown guest message — silently ignore.
        break;
    }
  }

  private startRenderTimeout(): void {
    this.clearRenderTimeout();
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      if (!this.destroyed) {
        this.callbacks.onError('Render Timeout', {
          source: 'render-timeout',
          timeoutMs: this.renderTimeoutMs,
        });
      }
    }, this.renderTimeoutMs);
  }

  private clearRenderTimeout(): void {
    if (this.renderTimer !== null) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
  }
}
