import React, { useState } from 'react';
import { useStore } from '../../../../store';
import ActionForm from './ActionForm';
import { generateZoneId } from '../lib/zoneTree';

export default function ActionsDialog() {
  const open = useStore((s) => s.analystProActionsDialogOpen);
  const setOpen = useStore((s) => s.setActionsDialogOpen);
  const dashboard = useStore((s) => s.analystProDashboard);
  const addAction = useStore((s) => s.addActionAnalystPro);
  const updateAction = useStore((s) => s.updateActionAnalystPro);
  const deleteAction = useStore((s) => s.deleteActionAnalystPro);

  const [editing, setEditing] = useState(null); // null | 'new' | action object

  if (!open) return null;
  if (!dashboard) return null;

  const actions = dashboard.actions || [];

  const startCreate = () => setEditing({
    id: generateZoneId(),
    name: 'New Action',
    kind: 'filter',
    sourceSheets: [],
    targetSheets: [],
    fieldMapping: [],
    clearBehavior: 'show-all',
    trigger: 'select',
    enabled: true,
  });

  const startEdit = (action) => setEditing({ ...action });

  const save = (actionShape) => {
    const existing = actions.find((a) => a.id === actionShape.id);
    if (existing) {
      updateAction(actionShape.id, actionShape);
    } else {
      addAction(actionShape);
    }
    setEditing(null);
  };

  const cancel = () => setEditing(null);

  const close = () => {
    setEditing(null);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Actions"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{
        position: 'fixed', inset: 0, background: 'var(--modal-overlay, rgba(0,0,0,0.4))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--chrome-bar-bg)',
          color: 'var(--fg)',
          border: '1px solid var(--chrome-bar-border)',
          borderRadius: 8,
          padding: 16,
          width: 640,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>Actions</h2>
        {!editing && (
          <>
            <table style={{ width: '100%', marginTop: 12, fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--chrome-bar-border)' }}>
                  <th>Name</th><th>Type</th><th>Source</th><th>Target</th><th>Trigger</th><th>Enabled</th><th></th>
                </tr>
              </thead>
              <tbody>
                {actions.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 12, opacity: 0.6 }}>No actions yet. Click &quot;+ Add Action&quot; to create one.</td></tr>
                ) : actions.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--chrome-bar-border-subtle, transparent)' }}>
                    <td>{a.name}</td>
                    <td>{a.kind}</td>
                    <td>{(a.sourceSheets || []).join(', ')}</td>
                    <td>{a.targetSheets?.join(', ') || a.targetSheetId || a.targetParameterId || a.targetSetId || a.template || ''}</td>
                    <td>{a.trigger}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Enable ${a.name}`}
                        checked={a.enabled !== false}
                        onChange={(e) => updateAction(a.id, { enabled: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button type="button" onClick={() => startEdit(a)} aria-label={`Edit ${a.name}`}>Edit</button>
                      <button type="button" onClick={() => deleteAction(a.id)} aria-label={`Delete ${a.name}`}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={startCreate}>+ Add Action</button>
              <button type="button" onClick={close}>Close</button>
            </div>
          </>
        )}
        {editing && <ActionForm initial={editing} onSave={save} onCancel={cancel} />}
      </div>
    </div>
  );
}
