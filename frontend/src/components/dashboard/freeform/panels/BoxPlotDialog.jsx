import React, { useState } from 'react';
import { useStore } from '../../../../store';

const WHISKER_METHODS = [
  { id: 'tukey',      label: 'Tukey (1.5 × IQR)' },
  { id: 'min-max',    label: 'Min/Max' },
  { id: 'percentile', label: 'Custom percentile' },
];
const SCOPES = [
  { id: 'entire', label: 'Entire table' },
  { id: 'pane',   label: 'Per pane' },
  { id: 'cell',   label: 'Per cell' },
];

export default function BoxPlotDialog() {
  const ctx = useStore((s) => s.analystProBoxPlotDialogCtx);
  const close = useStore((s) => s.closeBoxPlotDialogAnalystPro);
  const add = useStore((s) => s.addBoxPlotAnalystPro);

  const [whiskerMethod, setWhiskerMethod] = useState('tukey');
  const [whiskerLo, setWhiskerLo] = useState(10);
  const [whiskerHi, setWhiskerHi] = useState(90);
  const [showOutliers, setShowOutliers] = useState(false);
  const [scope, setScope] = useState('entire');
  const [fillColor, setFillColor] = useState('#4C78A8');
  const [fillOpacity, setFillOpacity] = useState(0.3);

  if (!ctx) return null;

  const outliersDisabled = whiskerMethod === 'min-max';

  const onSave = () => {
    const spec = {
      axis: 'y',
      whisker_method: whiskerMethod,
      whisker_percentile:
        whiskerMethod === 'percentile' ? [whiskerLo, whiskerHi] : null,
      show_outliers: outliersDisabled ? false : showOutliers,
      fill_color: fillColor,
      fill_opacity: fillOpacity,
      scope,
    };
    add({ id: `bp_${Date.now()}`, spec, envelope: null });
    close();
  };

  return (
    <div role="dialog" aria-label="Box plot" className="ap-dialog">
      <h3>Box Plot</h3>

      <fieldset>
        <legend>Whisker method</legend>
        {WHISKER_METHODS.map((m) => (
          <label key={m.id}>
            <input type="radio" name="whisker_method"
                   checked={whiskerMethod === m.id}
                   onChange={() => setWhiskerMethod(m.id)} />
            {m.label}
          </label>
        ))}
      </fieldset>

      {whiskerMethod === 'percentile' && (
        <div className="ap-row">
          <label>Low  <input type="number" value={whiskerLo}
                             min={1}  max={49}
                             onChange={(e) => setWhiskerLo(Number(e.target.value))} /></label>
          <label>High <input type="number" value={whiskerHi}
                             min={51} max={99}
                             onChange={(e) => setWhiskerHi(Number(e.target.value))} /></label>
        </div>
      )}

      <label>
        <input type="checkbox" checked={showOutliers}
               disabled={outliersDisabled}
               onChange={(e) => setShowOutliers(e.target.checked)} />
        Show outliers
      </label>

      <fieldset>
        <legend>Scope</legend>
        {SCOPES.map((s) => (
          <label key={s.id}>
            <input type="radio" name="scope"
                   checked={scope === s.id}
                   onChange={() => setScope(s.id)} />
            {s.label}
          </label>
        ))}
      </fieldset>

      <label>Fill color <input type="color" value={fillColor}
                               onChange={(e) => setFillColor(e.target.value)} /></label>
      <label>Opacity
        <input type="range" min={0} max={1} step={0.05} value={fillOpacity}
               onChange={(e) => setFillOpacity(Number(e.target.value))} />
      </label>

      <div className="ap-dialog__actions">
        <button type="button" onClick={close}>Cancel</button>
        <button type="button" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
