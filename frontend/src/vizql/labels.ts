/**
 * Label collision avoidance — greedy placement with priority ranking.
 *
 * Ensures axis labels, data labels, and legend entries never overlap.
 * Uses a simple greedy algorithm: place labels in priority order,
 * skip any that would overlap an already-placed label.
 *
 * For axis labels: priority = closeness to a "nice" number.
 * For data labels: priority = mark size (larger marks get labels first).
 *
 * This matches Tableau's behavior: labels are suppressed rather than
 * overlapping, with the most important labels always shown.
 */

export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  priority: number;
}

/**
 * Filter labels to remove overlaps. Returns only non-overlapping labels,
 * keeping highest-priority ones.
 *
 * @param labels Array of candidate labels with bounding boxes
 * @param padding Extra pixels of spacing between labels (default 2)
 * @returns Filtered array of non-overlapping labels
 */
export function resolveCollisions(
  labels: LabelRect[],
  padding = 2,
): LabelRect[] {
  if (labels.length <= 1) return labels;

  // Sort by priority (highest first)
  const sorted = [...labels].sort((a, b) => b.priority - a.priority);
  const placed: LabelRect[] = [];

  for (const label of sorted) {
    const padded = {
      x: label.x - padding,
      y: label.y - padding,
      width: label.width + padding * 2,
      height: label.height + padding * 2,
    };

    let overlaps = false;
    for (const existing of placed) {
      if (rectsOverlap(padded, existing)) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      placed.push(label);
    }
  }

  return placed;
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/**
 * Filter axis tick labels to avoid overlap.
 * Keeps first and last tick always, suppresses middle ticks that collide.
 */
export function resolveAxisLabelCollisions(
  ticks: { pixel: number; label: string }[],
  isHorizontal: boolean,
  fontSize = 10,
  charWidth = 6,
): { pixel: number; label: string }[] {
  if (ticks.length <= 2) return ticks;

  const labels: LabelRect[] = ticks.map((t, i) => {
    const w = t.label.length * charWidth;
    const h = fontSize + 2;
    return {
      x: isHorizontal ? t.pixel - w / 2 : -w,
      y: isHorizontal ? 0 : t.pixel - h / 2,
      width: w,
      height: h,
      text: t.label,
      // First and last get highest priority, middle ticks by distance from edges
      priority: i === 0 || i === ticks.length - 1 ? 1000 : 500 - Math.abs(i - ticks.length / 2),
    };
  });

  const resolved = resolveCollisions(labels, 4);
  const resolvedTexts = new Set(resolved.map((l) => l.text));
  return ticks.filter((t) => resolvedTexts.has(t.label));
}
