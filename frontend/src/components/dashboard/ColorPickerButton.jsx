import { useState, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { TOKENS } from './tokens';

export default function ColorPickerButton({ color, onChange, size = 28 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: size, height: size, borderRadius: 6,
          background: color || '#888', cursor: 'pointer',
          border: `2px solid ${open ? TOKENS.accent : 'rgba(255,255,255,0.12)'}`,
          transition: `border-color ${TOKENS.transition}`,
        }}
        title={color || 'Pick color'}
      />
      {open && (
        <div style={{
          position: 'absolute', top: size + 6, left: 0, zIndex: 200,
          background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.hover}`,
          borderRadius: 12, padding: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        }} onClick={(e) => e.stopPropagation()}>
          <HexColorPicker color={color || '#2563EB'} onChange={onChange} />
          <input
            type="text"
            value={color || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            style={{
              marginTop: 8, width: '100%', padding: '6px 8px', boxSizing: 'border-box',
              background: TOKENS.bg.deep, border: `1px solid ${TOKENS.border.default}`,
              borderRadius: 4, color: '#fff', fontSize: 12, fontFamily: 'monospace',
              outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}
