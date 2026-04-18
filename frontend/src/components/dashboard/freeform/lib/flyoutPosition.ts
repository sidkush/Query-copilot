// Submenu flyout placement with viewport-aware flipping.
//
// Context-menu submenus were clipped on the right: they always opened at
// `parentRect.right + 2` with no overflow handling. When a zone near the
// right edge of the canvas was right-clicked, the submenu rendered past
// the viewport and the right half of its labels were cut off.
//
// This helper places the flyout to the right when there is room, flips to
// the left when the right placement would overflow, and clamps vertically
// if the flyout would extend past the viewport bottom.

export type Rect = { left: number; right: number; top: number; bottom: number };
export type Size = { width: number; height: number };
export type Viewport = { width: number; height: number };

const GAP = 2;

export function computeFlyoutPosition(
  parentRect: Rect,
  flyoutSize: Size,
  viewport: Viewport,
): { x: number; y: number } {
  const rightPlacement = parentRect.right + GAP;
  const leftPlacement = parentRect.left - GAP - flyoutSize.width;

  let x: number;
  if (rightPlacement + flyoutSize.width <= viewport.width) {
    x = rightPlacement;
  } else if (leftPlacement >= 0) {
    x = leftPlacement;
  } else {
    x = 0;
  }

  let y = parentRect.top;
  if (y + flyoutSize.height > viewport.height) {
    y = Math.max(0, viewport.height - flyoutSize.height);
  }
  if (y < 0) y = 0;

  return { x, y };
}
