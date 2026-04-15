import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import StoryLayout from '../../../components/dashboard/modes/StoryLayout';

const TILES = [
  {
    id: 'c1',
    title: 'Act 1 — The opening',
    annotation: 'Revenue was up in Q1.',
    chart_spec: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'q', type: 'nominal' },
        y: { field: 'rev', type: 'quantitative', aggregate: 'sum' },
      },
    },
  },
  {
    id: 'c2',
    title: 'Act 2 — The twist',
    annotation: 'Churn spiked mid-quarter.',
    chart_spec: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'line',
      encoding: {
        x: { field: 'week', type: 'temporal' },
        y: { field: 'churn', type: 'quantitative', aggregate: 'avg' },
      },
    },
  },
];

// IntersectionObserver stub that retains observed nodes so we can drive
// callback invocation manually from the test.
interface FakeEntry {
  target: Element;
  isIntersecting: boolean;
  intersectionRatio: number;
}

let lastCallback: ((entries: FakeEntry[]) => void) | null = null;
let lastObserver: FakeIntersectionObserver | null = null;

class FakeIntersectionObserver {
  callback: (entries: FakeEntry[]) => void;
  observed: Element[] = [];
  constructor(cb: (entries: FakeEntry[]) => void) {
    this.callback = cb;
    lastCallback = cb;
    lastObserver = this;
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  lastCallback = null;
  lastObserver = null;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  delete (globalThis as unknown as { IntersectionObserver?: unknown })
    .IntersectionObserver;
});

describe('StoryLayout', () => {
  it('renders a chapter section per tile with annotation + chart', () => {
    render(<StoryLayout tiles={TILES} />);
    expect(screen.getByTestId('layout-story-tile-c1')).toBeDefined();
    expect(screen.getByTestId('layout-story-tile-c2')).toBeDefined();
    expect(screen.getByTestId('dashboard-tile-canvas-c1')).toBeDefined();
    expect(screen.getByTestId('dashboard-tile-canvas-c2')).toBeDefined();
  });

  it('starts with the first chapter active', () => {
    render(<StoryLayout tiles={TILES} />);
    expect(
      screen.getByTestId('layout-story').getAttribute('data-active-chapter'),
    ).toBe('c1');
  });

  it('fires onChapterEnter when IntersectionObserver reports a new active chapter', () => {
    const onChapterEnter = vi.fn();
    render(<StoryLayout tiles={TILES} onChapterEnter={onChapterEnter} />);
    expect(lastCallback).toBeTruthy();

    // Fire the observer with c2 at 0.8 intersectionRatio, wrapped in act()
    // so React flushes the setActiveId → attribute update before assertion.
    const c2 = screen.getByTestId('layout-story-tile-c2');
    act(() => {
      lastCallback!([
        {
          target: c2,
          isIntersecting: true,
          intersectionRatio: 0.8,
        },
      ]);
    });
    expect(
      screen.getByTestId('layout-story').getAttribute('data-active-chapter'),
    ).toBe('c2');
    expect(onChapterEnter).toHaveBeenCalledWith('c2');
  });

  it('renders empty state when tiles are empty', () => {
    render(<StoryLayout tiles={[]} />);
    expect(screen.getByTestId('layout-story').textContent).toMatch(/Empty story/);
  });
});
