/**
 * Fixture generator for 500-tile dashboard benchmark.
 *
 * Produces deterministic-ish tile data suitable for synthetic perf runs.
 * Each tile carries a minimal AskDB chart-spec (cartesian, bar/line/area)
 * plus 50 rows of random category+value data — enough to exercise the
 * VegaRenderer / InstancePool code paths without hitting a real database.
 */

const CATEGORIES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
const MARKS = ['bar', 'line', 'area'];

/**
 * Generate an array of synthetic tile descriptors.
 *
 * @param {number} count  Number of tiles to generate (default 500).
 * @returns {Array<{
 *   id: string,
 *   title: string,
 *   chart_spec: object,
 *   columns: string[],
 *   rows: Array<[string, number]>
 * }>}
 */
export function generateTileFixture(count = 500) {
  const tiles = [];

  for (let i = 0; i < count; i++) {
    const rows = [];
    for (let r = 0; r < 50; r++) {
      rows.push([
        CATEGORIES[r % CATEGORIES.length],
        Math.round(Math.random() * 1000),
      ]);
    }

    tiles.push({
      id: `bench-tile-${i}`,
      title: `Tile ${i}`,
      chart_spec: {
        $schema: 'askdb/chart-spec/v1',
        type: 'cartesian',
        mark: MARKS[i % MARKS.length],
        encoding: {
          x: { field: 'cat', type: 'nominal' },
          y: { field: 'val', type: 'quantitative', aggregate: 'sum' },
        },
      },
      columns: ['cat', 'val'],
      rows,
    });
  }

  return tiles;
}
