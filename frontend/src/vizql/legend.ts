/**
 * Legend renderer — categorical color swatches + labels.
 */

import type { Ctx, ChartLayout } from './types';
import { AXIS_COLOR, LABEL_COLOR } from './palettes';

export function drawLegend(ctx: Ctx, layout: ChartLayout): void {
  if (!layout.legend) return;

  const { rect, title, entries } = layout.legend;
  const swatchSize = 10;
  const itemHeight = 18;
  const textOffset = swatchSize + 6;

  // Title
  ctx.font = 'bold 10px Inter, system-ui, sans-serif';
  ctx.fillStyle = AXIS_COLOR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, rect.x, rect.y);

  // Entries
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < entries.length; i++) {
    const y = rect.y + 20 + i * itemHeight;

    // Color swatch
    ctx.fillStyle = entries[i].color;
    ctx.fillRect(rect.x, y, swatchSize, swatchSize);

    // Label
    ctx.fillStyle = LABEL_COLOR;
    const label = entries[i].label.length > 14
      ? entries[i].label.slice(0, 13) + '…'
      : entries[i].label;
    ctx.fillText(label, rect.x + textOffset, y + swatchSize / 2);
  }
}
