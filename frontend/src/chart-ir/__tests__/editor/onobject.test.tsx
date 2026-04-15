import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import AxisPopover from '../../../components/editor/onobject/AxisPopover';
import LegendPopover from '../../../components/editor/onobject/LegendPopover';
import SeriesPopover from '../../../components/editor/onobject/SeriesPopover';
import TitleInlineEditor from '../../../components/editor/onobject/TitleInlineEditor';
import { SIMPLE_BAR, TIME_SERIES_LINE } from '../fixtures/canonical-charts';
import type { ChartSpec } from '../../types';

describe('AxisPopover', () => {
  it('renders the current axis field and title input', () => {
    render(
      <AxisPopover
        x={100}
        y={100}
        spec={SIMPLE_BAR}
        meta={{ orient: 'bottom' }}
        onSpecChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('on-object-popover')).toBeDefined();
    expect(screen.getByTestId('axis-popover-field').textContent).toBe('category');
    expect(screen.getByTestId('axis-popover-title-input')).toBeDefined();
  });

  it('dispatches a replace patch on title blur', () => {
    const onSpecChange = vi.fn();
    render(
      <AxisPopover
        x={100}
        y={100}
        spec={SIMPLE_BAR}
        meta={{ orient: 'bottom' }}
        onSpecChange={onSpecChange}
        onClose={() => {}}
      />,
    );
    const input = screen.getByTestId('axis-popover-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Category title' } });
    fireEvent.blur(input);
    expect(onSpecChange).toHaveBeenCalled();
    const nextSpec = onSpecChange.mock.calls[0]?.[0] as ChartSpec;
    expect(nextSpec.encoding?.x?.title).toBe('Category title');
  });

  it('picks x for bottom/top orient and y for left/right', () => {
    const { unmount } = render(
      <AxisPopover
        x={0}
        y={0}
        spec={SIMPLE_BAR}
        meta={{ orient: 'left' }}
        onSpecChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('axis-popover-field').textContent).toBe('value');
    unmount();

    render(
      <AxisPopover
        x={0}
        y={0}
        spec={SIMPLE_BAR}
        meta={{ orient: 'bottom' }}
        onSpecChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('axis-popover-field').textContent).toBe('category');
  });
});

describe('LegendPopover', () => {
  it('finds the color channel and offers orient buttons', () => {
    render(
      <LegendPopover
        x={0}
        y={0}
        spec={TIME_SERIES_LINE}
        onSpecChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('legend-popover-toggle')).toBeDefined();
    expect(screen.getByTestId('legend-popover-orient-top')).toBeDefined();
    expect(screen.getByTestId('legend-popover-orient-left')).toBeDefined();
  });

  it('sets legend.orient on orient click', () => {
    const onSpecChange = vi.fn();
    render(
      <LegendPopover
        x={0}
        y={0}
        spec={TIME_SERIES_LINE}
        onSpecChange={onSpecChange}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('legend-popover-orient-top'));
    expect(onSpecChange).toHaveBeenCalled();
    const nextSpec = onSpecChange.mock.calls[0]?.[0] as ChartSpec;
    const color = nextSpec.encoding?.color as { legend?: { orient?: string } } | undefined;
    expect(color?.legend?.orient).toBe('top');
  });

  it('sets legend:null when toggled off', () => {
    const onSpecChange = vi.fn();
    render(
      <LegendPopover
        x={0}
        y={0}
        spec={TIME_SERIES_LINE}
        onSpecChange={onSpecChange}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('legend-popover-toggle'));
    const nextSpec = onSpecChange.mock.calls[0]?.[0] as ChartSpec;
    const color = nextSpec.encoding?.color as { legend?: unknown } | undefined;
    expect(color?.legend).toBeNull();
  });
});

describe('SeriesPopover', () => {
  it('writes scheme on color channel when scheme picked', () => {
    const onSpecChange = vi.fn();
    render(
      <SeriesPopover
        x={0}
        y={0}
        spec={TIME_SERIES_LINE}
        meta={{ name: 'Americas' }}
        onSpecChange={onSpecChange}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('series-popover-scheme-viridis'));
    const nextSpec = onSpecChange.mock.calls[0]?.[0] as ChartSpec;
    const color = nextSpec.encoding?.color as { scheme?: string } | undefined;
    expect(color?.scheme).toBe('viridis');
  });

  it('renders a stub when no color channel bound', () => {
    const onSpecChange = vi.fn();
    render(
      <SeriesPopover
        x={0}
        y={0}
        spec={SIMPLE_BAR}
        meta={{}}
        onSpecChange={onSpecChange}
        onClose={() => {}}
      />,
    );
    // No scheme buttons when there is no color channel — only the stub copy.
    expect(screen.queryByTestId('series-popover-scheme-viridis')).toBeNull();
  });
});

describe('TitleInlineEditor', () => {
  it('enters edit mode on click and commits on blur', () => {
    const onSpecChange = vi.fn();
    render(<TitleInlineEditor spec={SIMPLE_BAR} onSpecChange={onSpecChange} />);
    const span = screen.getByTestId('title-inline-editor');
    fireEvent.click(span);
    expect(span.getAttribute('data-editing')).toBe('true');

    act(() => {
      span.textContent = 'My chart';
    });
    fireEvent.blur(span);
    const nextSpec = onSpecChange.mock.calls[0]?.[0] as ChartSpec;
    expect(nextSpec.title).toBe('My chart');
  });

  it('emits remove patch when title is cleared', () => {
    const onSpecChange = vi.fn();
    const spec: ChartSpec = { ...SIMPLE_BAR, title: 'existing' };
    render(<TitleInlineEditor spec={spec} onSpecChange={onSpecChange} />);
    const span = screen.getByTestId('title-inline-editor');
    fireEvent.click(span);
    act(() => {
      span.textContent = '';
    });
    fireEvent.blur(span);
    const nextSpec = onSpecChange.mock.calls[0]?.[0] as ChartSpec;
    expect(nextSpec.title).toBeUndefined();
  });
});
