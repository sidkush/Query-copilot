import { lazy, Suspense } from 'react';
import { TOKENS } from '../tokens';

const CanvasChart = lazy(() => import('../CanvasChart'));

/**
 * Dense Heat Matrix — color-coded correlation / intensity grid.
 *
 * Thin adapter over the existing CanvasChart ECharts heatmap series
 * (which was already built but previously only reachable via direct
 * chartType='heatmap' routing). This tile gives the heat matrix a
 * first-class identity in the dense tile family so the chart picker
 * and Phase 1.8 routing can surface it alongside SparklineKPI /
 * ScorecardTable / HBarCard.
 *
 * Shape expectation: columns[0] = x-category, columns[1] = y-category
 * (optional), last numeric column = intensity. CanvasChart handles
 * the axis rendering, visualMap, and color interpolation.
 */
export default function HeatMatrix({ tile, formatting }) {
  const columns = tile?.columns || [];
  const rows = tile?.rows || [];
  const dense = TOKENS.dense;

  if (!rows.length || !columns.length) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{
          color: TOKENS.text.muted,
          fontSize: dense.labelSize,
          fontFamily: TOKENS.fontBody,
        }}
      >
        No matrix data
      </div>
    );
  }

  return (
    <div
      className="h-full w-full"
      style={{
        padding: dense.bodyPad,
        minHeight: 0,
        display: 'flex',
      }}
    >
      <Suspense
        fallback={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              color: TOKENS.text.muted,
              fontSize: dense.labelSize,
              fontFamily: TOKENS.fontBody,
            }}
          >
            Loading…
          </div>
        }
      >
        <CanvasChart
          columns={columns}
          rows={rows}
          chartType="heatmap"
          formatting={formatting || tile?.visualConfig}
        />
      </Suspense>
    </div>
  );
}
