import React, { useState } from 'react';
import { useStore } from '../../../../store';

const MODES = [
  { id: 'off',  label: 'Off' },
  { id: 'x',    label: 'Drop to X axis' },
  { id: 'y',    label: 'Drop to Y axis' },
  { id: 'both', label: 'Both axes' },
];

const STYLES = [
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

export default function DropLinesDialog() {
  const ctx = useStore((s) => s.analystProDropLinesDialogCtx);
  const close = useStore((s) => s.closeDropLinesDialogAnalystPro);
  const setSpec = useStore((s) => s.setDropLinesAnalystPro);
  const existing = useStore((s) =>
    ctx ? s.getDropLinesForSheet(ctx.sheetId) : null,
  );

  const [mode, setMode] = useState(existing?.mode ?? 'off');
  const [color, setColor] = useState(existing?.color ?? '#888888');
  const [lineStyle, setLineStyle] = useState(existing?.line_style ?? 'dashed');

  if (!ctx) return null;

  const onSave = () => {
    setSpec(ctx.sheetId, { mode, color, line_style: lineStyle });
    close();
  };

  return (
    <div role="dialog" aria-label="Drop lines" className="ap-dialog">
      <h3>Drop Lines</h3>
      <p className="ap-dialog__help">
        Applies to every chart on this sheet.
      </p>

      <fieldset>
        <legend>Axis mode</legend>
        {MODES.map((m) => (
          <label key={m.id}>
            <input type="radio" name="drop_mode"
                   checked={mode === m.id}
                   onChange={() => setMode(m.id)} />
            {m.label}
          </label>
        ))}
      </fieldset>

      <label>Color <input type="color" value={color}
                          onChange={(e) => setColor(e.target.value)} /></label>

      <fieldset>
        <legend>Style</legend>
        {STYLES.map((s) => (
          <label key={s.id}>
            <input type="radio" name="drop_style"
                   checked={lineStyle === s.id}
                   onChange={() => setLineStyle(s.id)} />
            {s.label}
          </label>
        ))}
      </fieldset>

      <div className="ap-dialog__actions">
        <button type="button" onClick={close}>Cancel</button>
        <button type="button" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
