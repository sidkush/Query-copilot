// frontend/src/components/dashboard/freeform/__tests__/DropIndicatorOverlay.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import DropIndicatorOverlay from '../DropIndicatorOverlay';
import { useStore } from '../../../../store';

type R = {
  zone: { id: string; type: string; children?: Array<{ id: string }> };
  x: number; y: number; width: number; height: number; depth: number;
};

function resolved(id: string, type: string, x: number, y: number, width: number, height: number, depth = 1, children?: Array<{ id: string }>): R {
  return { zone: { id, type, ...(children ? { children } : {}) }, x, y, width, height, depth };
}

describe('DropIndicatorOverlay', () => {
  beforeEach(() => {
    useStore.getState().setAnalystProDragState(null);
    cleanup();
  });

  it('renders nothing when dragState is null', () => {
    const { container } = render(<DropIndicatorOverlay resolvedList={[]} />);
    expect(container.querySelector('.analyst-pro-drop-indicator-bar')).toBeNull();
    expect(container.querySelector('.analyst-pro-drop-indicator-edge')).toBeNull();
  });

  it('renders a bar between siblings when targetContainerId + targetIndex are set', () => {
    useStore.getState().setAnalystProDragState({
      zoneId: 'src', parentId: 'rootP', dx: 0, dy: 0,
      targetContainerId: 'c1', targetIndex: 1, dropEdge: null, activeGuides: [],
    });
    const list = [
      resolved('c1', 'container-horz', 0, 0, 400, 200, 1, [{ id: 'A' }, { id: 'B' }]),
      resolved('A', 'worksheet', 0, 0, 200, 200, 2),
      resolved('B', 'worksheet', 200, 0, 200, 200, 2),
    ];
    const { container } = render(<DropIndicatorOverlay resolvedList={list} />);
    expect(container.querySelector('.analyst-pro-drop-indicator-bar')).not.toBeNull();
  });

  it('renders an edge highlight when dropEdge is set', () => {
    useStore.getState().setAnalystProDragState({
      zoneId: 'src', parentId: 'rootP', dx: 0, dy: 0,
      targetContainerId: 'B', targetIndex: null, dropEdge: 'right', activeGuides: [],
    });
    const list = [resolved('B', 'worksheet', 100, 100, 200, 100, 2)];
    const { container } = render(<DropIndicatorOverlay resolvedList={list} />);
    expect(container.querySelector('.analyst-pro-drop-indicator-edge')).not.toBeNull();
  });

  it('renders amber guide lines from activeGuides', () => {
    useStore.getState().setAnalystProDragState({
      zoneId: 'src', parentId: 'rootP', dx: 0, dy: 0,
      targetContainerId: null, targetIndex: null, dropEdge: null,
      activeGuides: [
        { axis: 'x', position: 100, start: 0, end: 300 },
        { axis: 'y', position: 150, start: 0, end: 400 },
      ],
    });
    const { container } = render(<DropIndicatorOverlay resolvedList={[]} />);
    expect(container.querySelectorAll('.analyst-pro-smart-guide').length).toBe(2);
  });

  it('renders a center ring when dropEdge === center', () => {
    useStore.getState().setAnalystProDragState({
      zoneId: 'src', parentId: 'rootP', dx: 0, dy: 0,
      targetContainerId: 'B', targetIndex: null, dropEdge: 'center', activeGuides: [],
    });
    const list = [resolved('B', 'worksheet', 100, 100, 200, 100, 2)];
    const { container } = render(<DropIndicatorOverlay resolvedList={list} />);
    expect(container.querySelector('.analyst-pro-drop-indicator-center')).not.toBeNull();
  });
});
