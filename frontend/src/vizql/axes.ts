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
    setFont(ctx, '10px Inter, system-ui, sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Resolve overlapping labels before drawing
    const visibleXTicks = resolveAxisLabelCollisions(layout.xAxis.ticks, true, 10, 6);
    const visibleXSet = new Set(visibleXTicks.map(t => t.label));

    for (const tick of layout.xAxis.ticks) {
      const x = layout.plot.x + tick.pixel;

      // Always draw tick mark
      ctx.strokeStyle = TICK_COLOR;
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + 5);
      ctx.stroke();

      // Only draw label if it passed collision check
      if (visibleXSet.has(tick.label)) {
        setFill(ctx, LABEL_COLOR);
        const label = tick.label.length > 12 ? tick.label.slice(0, 11) + '…' : tick.label;
        ctx.fillText(label, x, axisY + 7);
      }
    }

    // Axis title
    if (layout.xAxis.title) {
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = AXIS_COLOR;
      ctx.textAlign = 'center';
      ctx.fillText(
        layout.xAxis.title,
        layout.plot.x + layout.plot.width / 2,
        axisY + 30,
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
    setFont(ctx, '10px Inter, system-ui, sans-serif');
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const visibleYTicks = resolveAxisLabelCollisions(layout.yAxis.ticks, false, 10, 6);
    const visibleYSet = new Set(visibleYTicks.map(t => t.label));

    for (const tick of layout.yAxis.ticks) {
      const y = layout.plot.y + tick.pixel;
      ctx.strokeStyle = TICK_COLOR;
      ctx.beginPath();
      ctx.moveTo(layout.plot.x - 5, y);
      ctx.lineTo(layout.plot.x, y);
      ctx.stroke();

      if (visibleYSet.has(tick.label)) {
        setFill(ctx, LABEL_COLOR);
        ctx.fillText(tick.label, layout.plot.x - 8, y);
      }
    }

    // Axis title (rotated)
    if (layout.yAxis.title) {
      ctx.save();
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = AXIS_COLOR;
      ctx.textAlign = 'center';
      ctx.translate(15, layout.plot.y + layout.plot.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(layout.yAxis.title, 0, 0);
      ctx.restore();
    }
  }
}
