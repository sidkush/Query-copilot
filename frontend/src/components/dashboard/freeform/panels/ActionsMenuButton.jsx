import React from 'react';
import { useStore } from '../../../../store';

export default function ActionsMenuButton() {
  const setOpen = useStore((s) => s.setActionsDialogOpen);
  return (
    <button
      type="button"
      aria-label="Dashboard actions"
      title="Actions"
      onClick={() => setOpen(true)}
      style={{
        background: 'transparent',
        border: '1px solid var(--chrome-bar-border)',
        color: 'var(--fg)',
        padding: '4px 10px',
        cursor: 'pointer',
        fontSize: '12px',
        borderRadius: '4px',
      }}
    >
      ⚡ Actions
    </button>
  );
}
