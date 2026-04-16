/**
 * Axis renderer — ticks, labels, titles, grid lines.
 */

import type { Ctx, ChartLayout, AxisLayout } from './types';
import { AXIS_COLOR, TICK_COLOR, LABEL_COLOR, GRID_COLOR } from './palettes';
import { resolveAxisLabelCollisions } from './labels';

// Font/fillStyle caching — ctx.font assignment is expensive even when unchanged
let _lastFont = '';
let _lastFill = '';
function setFont(ctx: Ctx, font: string) {
  if (font !== _lastFont) { ctx.font = font; _lastFont = font; }
}
function setFill(ctx: Ctx, color: string) {
  if (color !== _lastFill) { ctx.fillStyle = color; _lastFill = color; }
}
function resetCache() { _lastFont = ''; _lastFill = ''; }

/**
 * Draw grid lines in the plot area.
 */
export function drawGridLines(ctx: Ctx, layout: ChartLayout): void {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 0.5;

  // Horizontal grid lines from Y axis
  if (layout.yAxis) {
    ctx.beginPath();
    for (const px of layout.yAxis.gridLines) {
      const y = layout.plot.y + px;
      if (y >= layout.plot.y && y <= layout.plot.y + layout.plot.height) {
        ctx.moveTo(layout.plot.x, layout.plot.y + px);
        ctx.lineTo(layout.plot.x + layout.plot.width, layout.plot.y + px);
      }
    }
    ctx.stroke();
  }

  // Vertical grid lines from X axis
  if (layout.xAxis) {
    ctx.beginPath();
    for (const px of layout.xAxis.gridLines) {
      if (px >= 0 && px <= layout.plot.width) {
        ctx.moveTo(layout.plot.x + px, layout.plot.y);
        ctx.lineTo(layout.plot.x + px, layout.plot.y + layout.plot.height);
      }
    }
    ctx.stroke();
  }
}

/**
 * Draw X and Y axes with ticks and labels.
 */
export function drawAxes(ctx: Ctx, layout: ChartLayout): void {
  resetCache(); // fresh cache per render
  ctx.strokeStyle = AXIS_COLOR;
  ctx.lineWidth = 1;

  // X axis baseline
  if (layout.xAxis) {
    const axisY = layout.plot.y + layout.plot.height;
    ctx.beginPath();
    ctx.moveTo(layout.plot.x, axisY);
    ctx.lineTo(layout.plot.x + layout.plot.width, axisY);
    ctx.stroke();

    // Ticks and labels — with collision avoidance
    setFont(ctx, '9px Inter, system-ui, sans-serif');

    // Resolve overlapping labels before drawing
    const visibleXTicks = resolveAxisLabelCollisions(layout.xAxis.ticks, true, 10, 6);
    const visibleXSet = new Set(visibleXTicks.map(t => t.label));

    // Detect if labels need rotation (many long categorical labels)
    const maxLabelLen = Math.max(...layout.xAxis.ticks.map(t => t.label.length), 0);
    const tickSpacing = layout.xAxis.ticks.length > 1
      ? Math.abs(layout.xAxis.ticks[1].pixel - layout.xAxis.ticks[0].pixel) : 999;
    const shouldRotate = maxLabelLen > 6 && tickSpacing < 60;

    for (const tick of layout.xAxis.ticks) {
      const x = layout.plot.x + tick.pixel;

      ctx.strokeStyle = TICK_COLOR;
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + 4);
      ctx.stroke();

      if (visibleXSet.has(tick.label)) {
        setFill(ctx, LABEL_COLOR);
        const label = tick.label.length > 10 ? tick.label.slice(0, 9) + '…' : tick.label;

        if (shouldRotate) {
          ctx.save();
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.translate(x, axisY + 8);
          ctx.rotate(-Math.PI / 4);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(label, x, axisY + 6);
        }
      }
    }

    // Axis title
    if (layout.xAxis.title) {
      const titleLabel = layout.xAxis.title.length > 25
        ? layout.xAxis.title.slice(0, 24) + '…' : layout.xAxis.title;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillStyle = AXIS_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(
        titleLabel,
        layout.plot.x + layout.plot.width / 2,
        axisY + (shouldRotate ? 38 : 22),
      );
    }
  }

  // Y axis baseline
  if (layout.yAxis) {
    ctx.strokeStyle = AXIS_COLOR;
    ctx.beginPath();
    ctx.moveTo(layout.plot.x, layout.plot.y);
    ctx.lineTo(layout.plot.x, layout.plot.y + layout.plot.height);
    ctx.stroke();

    // Ticks and labels — with collision avoidance
    setFont(ctx, '9px Inter, system-ui, sans-serif');
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const visibleYTicks = resolveAxisLabelCollisions(layout.yAxis.ticks, false, 10, 6);
    const visibleYSet = new Set(visibleYTicks.map(t => t.label));

    // Format numbers compactly
    const formatYLabel = (label: string): string => {
      const num = Number(label);
      if (!isNaN(num) && Math.abs(num) >= 1000) {
        if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
        if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(1) + 'K';
      }
      return label.length > 8 ? label.slice(0, 7) + '…' : label;
    };

    for (const tick of layout.yAxis.ticks) {
      const y = layout.plot.y + tick.pixel;
      ctx.strokeStyle = TICK_COLOR;
      ctx.beginPath();
      ctx.moveTo(layout.plot.x - 4, y);
      ctx.lineTo(layout.plot.x, y);
      ctx.stroke();

      if (visibleYSet.has(tick.label)) {
        setFill(ctx, LABEL_COLOR);
        ctx.fillText(formatYLabel(tick.label), layout.plot.x - 6, y);
      }
    }

    // Axis title (rotated) — truncated
    if (layout.yAxis.title) {
      const titleLabel = layout.yAxis.title.length > 20
        ? layout.yAxis.title.slice(0, 19) + '…' : layout.yAxis.title;
      ctx.save();
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillStyle = AXIS_COLOR;
      ctx.textAlign = 'center';
      ctx.translate(12, layout.plot.y + layout.plot.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(titleLabel, 0, 0);
      ctx.restore();
    }
  }
}
