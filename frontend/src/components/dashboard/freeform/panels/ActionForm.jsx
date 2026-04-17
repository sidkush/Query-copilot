import React, { useState } from 'react';
import { useStore } from '../../../../store';

const KIND_LABEL = {
  filter: 'Filter',
  highlight: 'Highlight',
  url: 'URL',
  'goto-sheet': 'Go To Sheet',
  'change-parameter': 'Change Parameter',
  'change-set': 'Change Set',
};

export default function ActionForm({ initial, onSave, onCancel }) {
  const dashboard = useStore((s) => s.analystProDashboard);
  const worksheets = (dashboard?.worksheets || []).map((w) => ({ id: w.id, label: w.id }));

  const [draft, setDraft] = useState(initial);

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const addFieldMapping = () => {
    const mapping = [...(draft.fieldMapping || []), { source: '', target: '' }];
    patch({ fieldMapping: mapping });
  };

  const updateMapping = (idx, field, value) => {
    const mapping = (draft.fieldMapping || []).map((m, i) => (i === idx ? { ...m, [field]: value } : m));
    patch({ fieldMapping: mapping });
  };

  const handleKindChange = (kind) => {
    // Reset kind-specific fields
    const base = {
      id: draft.id, name: draft.name, sourceSheets: draft.sourceSheets, trigger: draft.trigger, enabled: draft.enabled, kind,
    };
    if (kind === 'filter') setDraft({ ...base, targetSheets: [], fieldMapping: [], clearBehavior: 'show-all' });
    else if (kind === 'highlight') setDraft({ ...base, targetSheets: [], fieldMapping: [] });
    else if (kind === 'url') setDraft({ ...base, template: '', urlTarget: 'new-tab' });
    else if (kind === 'goto-sheet') setDraft({ ...base, targetSheetId: '' });
    else if (kind === 'change-parameter') setDraft({ ...base, targetParameterId: '', fieldMapping: [] });
    else if (kind === 'change-set') setDraft({ ...base, targetSetId: '', fieldMapping: [], operation: 'replace' });
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(draft); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, fontSize: 12 }}
    >
      <label>
        Name
        <input type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} required />
      </label>
      <label>
        Type
        <select value={draft.kind} onChange={(e) => handleKindChange(e.target.value)}>
          {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>
        Trigger
        <select value={draft.trigger} onChange={(e) => patch({ trigger: e.target.value })}>
          <option value="hover">Hover</option>
          <option value="select">Select</option>
          <option value="menu">Menu</option>
        </select>
      </label>

      <fieldset>
        <legend>Source sheets</legend>
        {worksheets.length === 0
          ? <p style={{ opacity: 0.6 }}>No worksheets on this dashboard.</p>
          : worksheets.map((w) => (
            <label key={w.id}>
              <input
                type="checkbox"
                checked={draft.sourceSheets.includes(w.id)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...draft.sourceSheets, w.id]
                    : draft.sourceSheets.filter((id) => id !== w.id);
                  patch({ sourceSheets: next });
                }}
              />
              {w.label}
            </label>
          ))}
      </fieldset>

      {(draft.kind === 'filter' || draft.kind === 'highlight') && (
        <fieldset>
          <legend>Target sheets</legend>
          {worksheets.map((w) => (
            <label key={w.id}>
              <input
                type="checkbox"
                checked={(draft.targetSheets || []).includes(w.id)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...(draft.targetSheets || []), w.id]
                    : (draft.targetSheets || []).filter((id) => id !== w.id);
                  patch({ targetSheets: next });
                }}
              />
              {w.label}
            </label>
          ))}
        </fieldset>
      )}

      {draft.kind === 'url' && (
        <>
          <label>
            URL template
            <input type="text" value={draft.template || ''} onChange={(e) => patch({ template: e.target.value })} placeholder="https://example.com/{AccountId}" />
          </label>
          <label>
            Target
            <select value={draft.urlTarget || 'new-tab'} onChange={(e) => patch({ urlTarget: e.target.value })}>
              <option value="new-tab">New Tab</option>
              <option value="iframe">iFrame</option>
              <option value="current-tab">Current Tab</option>
            </select>
          </label>
        </>
      )}

      {(draft.kind === 'filter' || draft.kind === 'highlight' || draft.kind === 'change-parameter' || draft.kind === 'change-set') && (
        <fieldset>
          <legend>Field mapping</legend>
          {(draft.fieldMapping || []).map((m, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 4 }}>
              <input type="text" placeholder="source" value={m.source} onChange={(e) => updateMapping(idx, 'source', e.target.value)} aria-label={`Source field ${idx}`} />
              <input type="text" placeholder="target" value={m.target} onChange={(e) => updateMapping(idx, 'target', e.target.value)} aria-label={`Target field ${idx}`} />
            </div>
          ))}
          <button type="button" onClick={addFieldMapping}>+ Add mapping</button>
        </fieldset>
      )}

      {draft.kind === 'filter' && (
        <label>
          Clear behavior
          <select value={draft.clearBehavior || 'show-all'} onChange={(e) => patch({ clearBehavior: e.target.value })}>
            <option value="leave-filter">Leave filter</option>
            <option value="show-all">Show all</option>
            <option value="exclude-all">Exclude all</option>
          </select>
        </label>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
