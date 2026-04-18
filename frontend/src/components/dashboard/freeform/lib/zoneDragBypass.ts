// Returns true when a pointerdown on a zone body should NOT initiate drag/pointer-capture,
// because the event originated inside a title-bar action button (menu/fit/close).
//
// Without this guard, the zone body wrapper calls canvas.setPointerCapture() on pointerdown,
// which redirects the subsequent click to the canvas — the button's onClick never fires and
// the UI appears frozen.
export function shouldBypassZoneDrag(event: { target?: unknown } | null | undefined): boolean {
  const target = event && (event as { target?: unknown }).target;
  if (!target || !(target instanceof Element)) return false;
  return target.closest('.analyst-pro-zone-frame__action') != null;
}
