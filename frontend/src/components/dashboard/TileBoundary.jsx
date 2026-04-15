import { Component } from 'react';
import { TOKENS } from './tokens';

/**
 * TileBoundary — per-tile React error boundary.
 *
 * A single broken chart component can no longer crash the whole
 * dashboard. Each TileWrapper body is wrapped so a render-time
 * throw is caught at the tile level, shows a fallback card with
 * "Reload tile" action, and the rest of the dashboard keeps working.
 *
 * Dev mode (import.meta.env.DEV): still console.errors the raw error
 * with component stack so the developer sees it during `npm run dev`.
 * Production: silent recovery, the fallback card is the only UI signal.
 *
 * Reload tile simply clears the error state so the child re-renders.
 * If the underlying bug is still there it'll throw again and we land
 * right back in the fallback — no harm, no infinite loop.
 */
export default class TileBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[TileBoundary] Tile crashed:', error);
      console.error('[TileBoundary] Component stack:', info?.componentStack);
    }
    // In production we could forward to an error-reporting service here.
    // Intentionally silent for now — the audit trail will pick up tile_deleted
    // if the user gives up and removes the broken tile.
  }

  handleReload() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="relative h-full flex flex-col items-center justify-center"
        style={{
          padding: 20,
          gap: 10,
          background: 'var(--glass-bg-card)',
          border: '1px solid color-mix(in oklab, var(--status-danger) 28%, transparent)',
          borderRadius: 14,
          color: TOKENS.text.secondary,
          fontFamily: TOKENS.fontBody,
          textAlign: 'center',
          minHeight: 120,
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'color-mix(in oklab, var(--status-danger) 12%, transparent)',
            border: '1px solid color-mix(in oklab, var(--status-danger) 28%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-danger)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx={12} cy={12} r={10} />
            <path d="M12 8v5" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 650,
            color: TOKENS.text.primary,
            fontFamily: TOKENS.fontDisplay,
            letterSpacing: '-0.005em',
            lineHeight: 1.3,
          }}
        >
          This tile failed to render
        </div>
        <div
          style={{
            fontSize: 11,
            color: TOKENS.text.muted,
            maxWidth: 280,
            lineHeight: 1.45,
          }}
        >
          The rest of the dashboard is still working. Reload the tile to try again.
        </div>
        <button
          type="button"
          onClick={this.handleReload}
          className="tile-boundary__reload"
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9" />
            <path d="M3 4v5h5" />
          </svg>
          Reload tile
        </button>
      </div>
    );
  }
}
