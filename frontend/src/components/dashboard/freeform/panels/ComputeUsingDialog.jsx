// frontend/src/components/dashboard/freeform/panels/ComputeUsingDialog.jsx
import { useState } from 'react';

const DIRECTIONS = [
  { value: 'across',   label: 'Table (Across)' },
  { value: 'down',     label: 'Table (Down)' },
  { value: 'pane',     label: 'Pane (Across)' },
  { value: 'pane_down', label: 'Pane (Down)' },
  { value: 'specific', label: 'Specific Dimensions' },
];

export default function ComputeUsingDialog({
  open, spec, fields, onSave, onCancel,
}) {
  const [draft, setDraft] = useState(spec);
  if (!open) return null;

  const setDirection = (value) => setDraft({ ...draft, direction: value });
  const toggleField = (fieldId) => {
    const has = draft.addressing.includes(fieldId);
    const addressing = has
      ? draft.addressing.filter(f => f !== fieldId)
      : [...draft.addressing, fieldId];
    const partitioning = fields
      .filter(f => !addressing.includes(f.id))
      .map(f => f.id);
    setDraft({ ...draft, addressing, partitioning });
  };

  return (
    <div role="dialog" aria-label="Compute Using" className="compute-using-dialog">
      <h3>Compute Using</h3>
      <fieldset>
        {DIRECTIONS.map(d => (
          <label key={d.value}>
            <input
              type="radio"
              name="direction"
              checked={draft.direction === d.value}
              onChange={() => setDirection(d.value)}
            />
            {d.label}
          </label>
        ))}
      </fieldset>

      {draft.direction === 'specific' && (
        <>
          <h4>At the level — addressing fields (in order)</h4>
          {fields.map(f => (
            <label key={f.id}>
              <input
                type="checkbox"
                aria-label={f.name}
                checked={draft.addressing.includes(f.id)}
                onChange={() => toggleField(f.id)}
              />
              {f.name}
            </label>
          ))}
          <h4>Restart every — partitioning fields (auto-derived)</h4>
          <ul>{draft.partitioning.map(p => <li key={p}>{p}</li>)}</ul>
          <label>
            Sort direction
            <select
              aria-label="Sort direction"
              value={draft.sort ?? 'asc'}
              onChange={e => setDraft({ ...draft, sort: e.target.value })}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </>
      )}

      <div className="compute-using-actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => onSave(draft)}>Save</button>
      </div>
    </div>
  );
}
