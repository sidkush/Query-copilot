import { describe, it, expect } from 'vitest';
import { shouldBypassZoneDrag } from '../lib/zoneDragBypass';

function makeEventOn(target: Element): { target: Element } {
  return { target };
}

function makeButtonTree() {
  const root = document.createElement('div');
  root.className = 'zone-body';
  const header = document.createElement('div');
  header.className = 'analyst-pro-zone-frame__header';
  const btn = document.createElement('button');
  btn.className = 'analyst-pro-zone-frame__action';
  btn.setAttribute('data-testid', 'zone-frame-z1-action-menu');
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = '...';
  btn.appendChild(icon);
  header.appendChild(btn);
  root.appendChild(header);
  return { root, btn, icon };
}

function makeBodyTree() {
  const root = document.createElement('div');
  root.className = 'zone-body';
  const chart = document.createElement('div');
  chart.className = 'chart';
  root.appendChild(chart);
  return { root, chart };
}

describe('shouldBypassZoneDrag — action-button click must not start drag/capture', () => {
  it('returns true when target is inside a title-bar action button', () => {
    const { btn, icon } = makeButtonTree();
    expect(shouldBypassZoneDrag(makeEventOn(icon) as unknown as PointerEvent)).toBe(true);
    expect(shouldBypassZoneDrag(makeEventOn(btn) as unknown as PointerEvent)).toBe(true);
  });

  it('returns false when target is the zone body itself', () => {
    const { root, chart } = makeBodyTree();
    expect(shouldBypassZoneDrag(makeEventOn(root) as unknown as PointerEvent)).toBe(false);
    expect(shouldBypassZoneDrag(makeEventOn(chart) as unknown as PointerEvent)).toBe(false);
  });

  it('returns false when target is null or not an Element', () => {
    expect(shouldBypassZoneDrag({ target: null } as unknown as PointerEvent)).toBe(false);
    expect(shouldBypassZoneDrag({} as unknown as PointerEvent)).toBe(false);
  });
});
