/**
 * CollaborativeEditStub — placeholder for real-time collaborative
 * chart type editing. Full implementation requires WebSocket infra
 * (possibly via the existing voice WebSocket path).
 *
 * v1: shows a "Collaboration" section in the chart type editor with
 * a list of connected users (mocked) and a lock indicator.
 */
export default function CollaborativeEditStub({ typeId }) {
  return (
    <div data-testid="collab-edit-stub" style={{
      padding: 12, borderRadius: 8,
      border: '1px dashed rgba(255,255,255,0.15)',
      background: 'rgba(255,255,255,0.02)',
      fontSize: 12, color: 'var(--text-muted)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Collaboration</div>
      <div>Real-time editing requires WebSocket infrastructure.</div>
      <div style={{ marginTop: 8, fontSize: 11 }}>
        When enabled, multiple authors can edit <code>{typeId}</code> simultaneously
        with cursor presence, conflict resolution, and live preview sync.
      </div>
    </div>
  );
}
