import React from 'react';
import { useStore } from '../../../../store';

const SHEET_MIME = 'application/askdb-analyst-pro-sheet+json';

/**
 * Plan 6c — lists workbook worksheets; drag one onto the canvas to insert
 * a floating worksheet zone. Keyboard-accessible via Enter/Space (inserts
 * at default offset, matching ObjectLibraryPanel convention).
 */
export default function SheetsInsertPanel() {
  const worksheets = useStore((s) => s.analystProDashboard?.worksheets || []);
  const insertObject = useStore((s) => s.insertObjectAnalystPro);

  const handleKeyInsert = (sheetId) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      insertObject({ type: 'worksheet', worksheetRef: sheetId, x: 40, y: 40 });
    }
  };

  if (worksheets.length === 0) {
    return (
      <div
        data-testid="sheets-insert-empty"
        style={{ padding: '6px 12px', fontSize: 11, opacity: 0.6 }}
      >
        No worksheets in this workbook.
      </div>
    );
  }

  return (
    <ul
      aria-label="Workbook sheets"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: '4px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {worksheets.map((w) => (
        <li
          key={w.id}
          data-testid={`sheet-row-${w.id}`}
          draggable
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyInsert(w.id)}
          onDragStart={(e) => {
            e.dataTransfer.setData(SHEET_MIME, JSON.stringify({ sheetId: w.id }));
            e.dataTransfer.effectAllowed = 'copy';
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 3,
            fontSize: 12,
            cursor: 'grab',
            color: 'var(--fg)',
          }}
        >
          <span aria-hidden="true" style={{ opacity: 0.7, flexShrink: 0 }}>{'\u{1F4CA}'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {w.id}
          </span>
        </li>
      ))}
    </ul>
  );
}
