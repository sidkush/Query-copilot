/**
 * ObjectLibraryPanel — draggable zone-type palette for Analyst Pro freeform canvas.
 *
 * Renders a compact left-rail list of zone types the user can drag onto the
 * canvas. Uses HTML5 drag-and-drop with the custom MIME type
 * `application/askdb-analyst-pro-object+json`.
 *
 * Keyboard a11y (Plan 4e T10): each item is a `role="button"` with `tabIndex=0`
 * and an `onKeyDown` handler that inserts the object at a default offset when
 * Enter or Space is pressed — matching the drop behavior for keyboard users.
 *
 * Styling: CSS variables from index.css (same chrome-bar tokens used by
 * DashboardStatusBar / DashboardContextBar). Hover highlight via CSS class.
 */
import { useStore } from '../../../../store';

const OBJECTS = [
  { type: 'text',           label: 'Text',             icon: 'T'  },
  { type: 'image',          label: 'Image',             icon: '🖼' },
  { type: 'webpage',        label: 'Web Page',          icon: '🌐' },
  { type: 'blank',          label: 'Blank',             icon: '⬜' },
  { type: 'container-horz', label: 'Horz. Container',   icon: '▭' },
  { type: 'container-vert', label: 'Vert. Container',   icon: '▯' },
];

const MIME = 'application/askdb-analyst-pro-object+json';

export default function ObjectLibraryPanel() {
  const insertObject = useStore((s) => s.insertObjectAnalystPro);

  const handleKeyInsert = (type) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      insertObject({ type, x: 40, y: 40 });
    }
  };

  return (
    <aside
      className="analyst-pro-object-library"
      aria-label="Object library"
      style={{
        background: 'var(--chrome-bar-bg)',
        borderRight: '1px solid var(--chrome-bar-border)',
        padding: '12px',
        color: 'var(--fg)',
        fontSize: '12px',
        userSelect: 'none',
      }}
    >
      <h3
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.7,
          marginBottom: '8px',
          marginTop: 0,
          fontWeight: 600,
          color: 'var(--text-muted)',
        }}
      >
        Objects
      </h3>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {OBJECTS.map((o) => (
          <li
            key={o.type}
            draggable
            role="button"
            tabIndex={0}
            onKeyDown={handleKeyInsert(o.type)}
            className="analyst-pro-object-library__item"
            onDragStart={(e) => {
              e.dataTransfer.setData(MIME, JSON.stringify({ type: o.type }));
              e.dataTransfer.effectAllowed = 'copy';
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 8px',
              borderRadius: '4px',
              cursor: 'grab',
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 16, textAlign: 'center', flexShrink: 0 }}
            >
              {o.icon}
            </span>
            <span>{o.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
