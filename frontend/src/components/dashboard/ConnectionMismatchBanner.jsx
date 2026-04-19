import { useStore } from '../../store';
import './ConnectionMismatchBanner.css';

/**
 * ConnectionMismatchBanner — Typed-Seeking-Spring W2-C.
 *
 * Renders a non-dismissable inline banner directly under the TopBar
 * when the user's active connection is not the connection the
 * dashboard was saved against. The user must pick: either switch to
 * the bound connection or leave the dashboard — slots stay in their
 * fallback state until the connections match.
 *
 * Accessibility:
 *   - role="alert" + aria-live="polite" so screen readers announce on
 *     arrival without stealing focus.
 *   - The Switch button carries an explicit aria-label naming the
 *     target connection for screen-reader clarity.
 *
 * @param {{ boundConnId?: string }} props
 */
export default function ConnectionMismatchBanner({ boundConnId }) {
  const activeConnId = useStore((s) => s.activeConnId);
  const connections = useStore((s) => s.connections);
  const setActiveConnId = useStore((s) => s.setActiveConnId);

  // Nothing to show when there's no bound connection yet (new or migrating
  // dashboard) or when the connections already match. Returning null keeps
  // the shell layout height stable — no empty slot.
  if (!boundConnId) return null;
  if (activeConnId === boundConnId) return null;

  const boundConn = (connections || []).find((c) => c.conn_id === boundConnId);
  const boundName = boundConn?.name || 'the saved connection';
  const boundType = boundConn?.db_type || '';

  return (
    <div
      className="connection-mismatch-banner"
      role="alert"
      aria-live="polite"
      data-testid="connection-mismatch-banner"
    >
      <div className="connection-mismatch-banner__message">
        <span>
          This dashboard is bound to{' '}
          <span className="connection-mismatch-banner__name">{boundName}</span>
          {boundType ? (
            <>
              {' '}
              <span className="connection-mismatch-banner__dbtype">
                ({boundType})
              </span>
            </>
          ) : null}
          . Slots stay placeholder until you switch.
        </span>
      </div>
      <button
        type="button"
        className="connection-mismatch-banner__switch"
        aria-label={`Switch connection to ${boundName}`}
        onClick={() => setActiveConnId(boundConnId)}
      >
        Switch connection
      </button>
    </div>
  );
}
