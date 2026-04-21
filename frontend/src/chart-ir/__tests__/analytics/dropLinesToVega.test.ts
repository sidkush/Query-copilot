import { describe, expect, it } from 'vitest';
import {
  compileDropLines,
  type DropLinesSpec,
  type ActiveMark,
} from '../../analytics/dropLinesToVega';

describe('dropLinesToVega', () => {
  const mark: ActiveMark = { x: 12, y: 340, xField: 'category', yField: 'sales' };

  it('emits 0 layers when mode=off', () => {
    const spec: DropLinesSpec = { mode: 'off', color: '#888', line_style: 'dashed' };
    expect(compileDropLines(spec, mark)).toEqual([]);
  });

  it('emits 1 layer for mode=x', () => {
    const spec: DropLinesSpec = { mode: 'x', color: '#888', line_style: 'dashed' };
    expect(compileDropLines(spec, mark)).toHaveLength(1);
  });

  it('emits 1 layer for mode=y', () => {
    const spec: DropLinesSpec = { mode: 'y', color: '#888', line_style: 'dashed' };
    expect(compileDropLines(spec, mark)).toHaveLength(1);
  });

  it('emits 2 layers for mode=both', () => {
    const spec: DropLinesSpec = { mode: 'both', color: '#888', line_style: 'dashed' };
    expect(compileDropLines(spec, mark)).toHaveLength(2);
  });

  it('applies dashed style by default', () => {
    const spec: DropLinesSpec = { mode: 'both', color: '#888', line_style: 'dashed' };
    const [first]: any = compileDropLines(spec, mark);
    expect(first.mark.strokeDash).toEqual([4, 3]);
    expect(first.mark.strokeWidth).toBe(1);
  });

  it('applies dotted style', () => {
    const spec: DropLinesSpec = { mode: 'both', color: '#888', line_style: 'dotted' };
    const [first]: any = compileDropLines(spec, mark);
    expect(first.mark.strokeDash).toEqual([1, 2]);
  });

  it('honours color', () => {
    const spec: DropLinesSpec = { mode: 'both', color: '#E45756', line_style: 'dashed' };
    const [first]: any = compileDropLines(spec, mark);
    expect(first.mark.color).toBe('#E45756');
  });
});
