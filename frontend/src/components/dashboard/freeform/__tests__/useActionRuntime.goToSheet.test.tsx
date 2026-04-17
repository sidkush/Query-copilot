import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../../../../store';
import { useActionRuntime } from '../hooks/useActionRuntime';
import { publish } from '../lib/markEventBus';

function Host() {
  useActionRuntime();
  return <div data-zone="target-sheet" data-testid="target" />;
}

function HostNoTarget() {
  useActionRuntime();
  return <div />;
}

describe('useActionRuntime — goToSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'askdb/dashboard/v1',
        id: 'd1',
        name: 'T',
        archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [],
        parameters: [],
        sets: [],
        actions: [
          {
            id: 'a1',
            name: 'Jump',
            kind: 'goto-sheet',
            sourceSheets: ['src-sheet'],
            trigger: 'select',
            enabled: true,
            targetSheetId: 'target-sheet',
          },
        ],
      },
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('scrolls to the target and pulses for 1200ms', () => {
    const { getByTestId } = render(<Host />);
    const target = getByTestId('target');

    publish({
      sourceSheetId: 'src-sheet',
      trigger: 'select',
      markData: {},
      timestamp: Date.now(),
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
    expect(target.classList.contains('analyst-pro-zone-pulse')).toBe(true);

    vi.advanceTimersByTime(1200);
    expect(target.classList.contains('analyst-pro-zone-pulse')).toBe(false);
  });

  it('is a no-op when target data-zone is missing', () => {
    render(<HostNoTarget />);
    publish({
      sourceSheetId: 'src-sheet',
      trigger: 'select',
      markData: {},
      timestamp: Date.now(),
    });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
