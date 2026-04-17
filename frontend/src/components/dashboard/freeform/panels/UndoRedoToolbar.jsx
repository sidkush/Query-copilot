// frontend/src/components/dashboard/freeform/panels/UndoRedoToolbar.jsx
import { useStore } from '../../../../store';
import { useHistory } from '../hooks/useHistory';

const BTN_BASE = {
  padding: '6px 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
};

function btnStyle({ active = false, disabled = false }) {
  return {
    ...BTN_BASE,
    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
    color: active ? '#fff' : 'var(--text-primary)',
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

export default function UndoRedoToolbar() {
  const { undo, redo, canUndo, canRedo, pastLen, futureLen, lastOperation, nextOperation } =
    useHistory();
  const panelOpen = useStore((s) => s.analystProHistoryPanelOpen);
  const togglePanel = useStore((s) => s.toggleHistoryPanelAnalystPro);

  const undoLabel = `Undo ${pastLen} operation${pastLen === 1 ? '' : 's'}. Last: ${lastOperation ?? 'nothing'}`;
  const redoLabel = `Redo ${futureLen} operation${futureLen === 1 ? '' : 's'}. Next: ${nextOperation ?? 'nothing'}`;

  return (
    <>
      <button
        type="button"
        data-testid="undo-btn"
        onClick={() => undo()}
        disabled={!canUndo}
        className="premium-btn"
        style={btnStyle({ disabled: !canUndo })}
        aria-label={undoLabel}
        title={undoLabel}
      >
        ↶ Undo ({pastLen})
      </button>
      <button
        type="button"
        data-testid="redo-btn"
        onClick={() => redo()}
        disabled={!canRedo}
        className="premium-btn"
        style={btnStyle({ disabled: !canRedo })}
        aria-label={redoLabel}
        title={redoLabel}
      >
        ↷ Redo ({futureLen})
      </button>
      <button
        type="button"
        data-testid="history-toggle-btn"
        onClick={() => togglePanel()}
        className="premium-btn"
        style={btnStyle({ active: panelOpen })}
        aria-label={`Toggle history inspector (currently ${panelOpen ? 'open' : 'closed'})`}
        aria-pressed={panelOpen}
        title={`History inspector ${panelOpen ? 'open' : 'closed'} (Cmd+H)`}
      >
        🕓 History
      </button>
    </>
  );
}
