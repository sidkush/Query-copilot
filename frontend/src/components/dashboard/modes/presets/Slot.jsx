// Typed-Seeking-Spring Phase 4 / Wave 2-B — universal slot wrapper.
//
// Every themed preset layout (Board Pack / Operator Console / Signal /
// Editorial Brief) wraps each data-driven region in a <Slot>. The
// wrapper reads the binding from its `bindings` prop, pulls the tile
// rows out of `tileData`, and forwards a resolved { value, state,
// binding } object to a render-prop child. Four states exist:
//
//   - 'bound'       : binding exists + tileData has rows for it
//   - 'loading'     : binding exists but no rows yet (autogen pending)
//   - 'fallback'    : no binding — render the slot descriptor's
//                     static demo value (wireframe parity)
//   - 'unresolved'  : slot id not found in the preset's manifest (bug)
//
// The wrapper also owns the hover-to-edit affordance: 1px dashed
// outline + tiny pencil glyph + click handler that fires onEdit(id,
// anchor). When editable=false it renders inert (no hover class, no
// click, no pencil).

import { useCallback, useState } from 'react';
import { getSlotDescriptor } from './slots.ts';
import { formatValue } from './formatValue.ts';

/**
 * @param {{
 *   id: string,
 *   presetId: string,
 *   bindings?: Record<string, import('./formatValue').TileBinding>,
 *   tileData?: Record<string, import('./formatValue').TileRows>,
 *   onEdit?: (slotId: string, anchor: HTMLElement) => void,
 *   editable?: boolean,
 *   children: (ctx: {
 *     value: unknown,
 *     state: 'bound' | 'fallback' | 'loading' | 'unresolved',
 *     binding?: import('./formatValue').TileBinding,
 *   }) => import('react').ReactNode,
 * }} props
 */
export default function Slot({
  id,
  presetId,
  bindings,
  tileData,
  onEdit,
  editable = true,
  children,
}) {
  const descriptor = getSlotDescriptor(presetId, id);
  const binding = bindings?.[id];
  const rows = binding && tileData ? tileData[binding.tileId] : undefined;

  let state;
  let value;
  if (!descriptor) {
    state = 'unresolved';
    value = null;
  } else if (!binding) {
    state = 'fallback';
    value = descriptor.fallback;
  } else if (!rows) {
    state = 'loading';
    value = descriptor.fallback;
  } else {
    state = 'bound';
    value = formatValue(binding, rows, descriptor.kind);
  }

  const [hovered, setHovered] = useState(false);

  const fireEdit = useCallback(
    (currentTarget) => {
      if (!editable || !onEdit) return;
      if (!(currentTarget instanceof HTMLElement)) return;
      onEdit(id, currentTarget);
    },
    [editable, onEdit, id]
  );

  const handleClick = useCallback(
    (e) => {
      if (!editable) return;
      fireEdit(e.currentTarget);
    },
    [editable, fireEdit]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (!editable) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fireEdit(e.currentTarget);
      }
    },
    [editable, fireEdit]
  );

  const handleMouseEnter = useCallback(() => {
    if (editable) setHovered(true);
  }, [editable]);

  const handleMouseLeave = useCallback(() => {
    if (editable) setHovered(false);
  }, [editable]);

  const className = 'slot' + (editable && hovered ? ' slot--hover' : '');

  return (
    <div
      data-slot={id}
      data-state={state}
      data-testid={`slot-${id}`}
      className={className}
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : -1}
      aria-label={
        editable && descriptor?.label ? `Edit ${descriptor.label}` : undefined
      }
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        // Keep the wrapper layout-neutral so layouts can drop <Slot>
        // around existing markup without reflowing the grid. We opt
        // into display:contents in CSS (see preset CSS files) — this
        // inline fallback guarantees jsdom behaviour too.
        position: 'relative',
        cursor: editable ? 'pointer' : 'default',
      }}
    >
      {children({ value, state, binding })}
    </div>
  );
}
