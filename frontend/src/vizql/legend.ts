/**
 * Legend renderer — categorical color swatches + labels.
 */

import type { Ctx, ChartLayout } from './types';
import { AXIS_COLOR, LABEL_COLOR } from './palettes';

export function drawLegend(ctx: Ctx, layout: ChartLayout): void {
  if (!layout.legend) return;

  const { rect, title, entries } = layout.legend;
  const swatchSize = 8;
  const itemHeight = 14;
  const textOffset = swatchSize + 5;

  // Title — truncated
  ctx.font = 'bold 9px Inter, system-ui, sans-serif';
  ctx.fillStyle = AXIS_COLOR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const legendTitle = title.length > 12 ? title.slice(0, 11) + '…' : title;
  ctx.fillText(legendTitle, rect.x, rect.y);

  // Cap entries to fit in available height
  const availH = rect.height - 20;
  const maxEntries = Math.max(1, Math.floor(availH / itemHeight));
  const showEntries = entries.slice(0, maxEntries);
  const overflow = entries.length - showEntries.length;

  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < showEntries.length; i++) {
    const y = rect.y + 16 + i * itemHeight;

    // Color swatch (rounded)
    ctx.fillStyle = showEntries[i].color;
    ctx.beginPath();
    ctx.arc(rect.x + swatchSize / 2, y + swatchSize / 2, swatchSize / 2, 0, Math.PI * 2);
    ctx.fill();

    // Label — truncated
    ctx.fillStyle = LABEL_COLOR;
    const label = showEntries[i].label.length > 10
      ? showEntries[i].label.slice(0, 9) + '…'
      : showEntries[i].label;
    ctx.fillText(label, rect.x + textOffset, y + swatchSize / 2);
  }

  // Overflow indicator
  if (overflow > 0) {
    const y = rect.y + 16 + showEntries.length * itemHeight;
    ctx.fillStyle = LABEL_COLOR;
    ctx.globalAlpha = 0.5;
    ctx.fillText(`+${overflow} more`, rect.x, y + 4);
    ctx.globalAlpha = 1;
  }
}
