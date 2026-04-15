import { useEffect, useMemo, useRef, useCallback } from 'react';
import { VegaLite } from 'react-vega';
import {
  compileToVegaLite,
  globalInstancePool,
  globalFrameBudgetTracker,
  lttbRows,
  uniformSample,
  pixelMinMaxRows,
  aggregateBinRows,
} from '../../../chart-ir';
import type {
  ChartSpec,
  RendererBackend,
  RenderStrategy,
} from '../../../chart-ir';
import type { View } from 'vega';

/**
 * VegaRenderer — B2.2+ real react-vega mount.
 *
 * Phase 1 shipped as a stub that rendered the compiled VL JSON in a <pre>.
 * B2.2+ replaces the stub with an actual <VegaLite /> instance and wires
 * in the RSR `RenderStrategy` on top:
 *
 *   1. Backend selection. `strategy.rendererBackend` picks 'svg' or
 *      'canvas' for the Vega runtime. 'webgl' falls back to 'canvas'
 *      for cartesian specs (WebGL is deck.gl's lane).
 *   2. Downsampling. `strategy.downsample.enabled === true` routes rows
 *      through lttb / uniform / passthrough before they reach Vega.
 *      pixel_min_max / aggregate_bin are not yet implemented in the
 *      transforms module — they fall through to passthrough with a dev
 *      warning.
 *   3. Instance pooling. On mount we acquire a slot in the global
 *      InstancePool keyed by a per-render UUID; on unmount we release
 *      it. The pool LRU-evicts when over capacity.
 *   4. Frame budget feedback. Every Vega view commit records a frame
 *      time sample in the global FrameBudgetTracker via a timestamp
 *      delta on the `onNewView` callback. The next call to
 *      pickRenderStrategy sees the updated frame budget state.
 *
 * The componeent converts the resultSet's `rows` (array of arrays) into
 * the array-of-objects shape Vega expects, keyed by `resultSet.columns`.
 * The compiled spec references the named dataset `askdb_data` (see
 * `compiler/toVegaLite.ts`), so the conversion happens here, not in
 * EditorCanvas.
 */

export interface VegaRendererProps {
  spec: ChartSpec;
  resultSet?: {
    columns: string[];
    rows: unknown[][];
  };
  rendererBackend?: RendererBackend;
  strategy?: RenderStrategy;
}

type Row = Record<string, unknown>;

const DEFAULT_CANVAS_SIZE = { width: 520, height: 320 };

export default function VegaRenderer({
  spec,
  resultSet,
  rendererBackend = 'svg',
  strategy,
}: VegaRendererProps) {
  const compiled = useMemo(() => {
    try {
      if (spec.type !== 'cartesian') {
        return {
          ok: false as const,
          error: `VegaRenderer only handles cartesian, got ${spec.type}`,
        };
      }
      const vl = compileToVegaLite(spec);
      return { ok: true as const, vl };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [spec]);

  // Convert rows (array of arrays) to array of objects keyed by column name.
  // Memoized on resultSet identity so VegaLite's internal shallow-equal
  // skips re-renders when the spec changes but the data is stable.
  const rowObjects = useMemo<Row[]>(() => {
    if (!resultSet?.rows || !resultSet?.columns) return [];
    return rowsToObjects(resultSet.rows, resultSet.columns);
  }, [resultSet]);

  // Apply RSR downsample decision before handing the rows to Vega.
  const downsampledRows = useMemo<Row[]>(() => {
    const rows = rowObjects;
    const ds = strategy?.downsample;
    if (!ds || !ds.enabled || rows.length <= ds.targetPoints) {
      return rows;
    }
    return applyDownsample(rows, spec, ds.method, ds.targetPoints);
  }, [rowObjects, strategy, spec]);

  // Resolve the actual Vega backend: 'webgl' falls back to canvas because
  // Vega-Lite's runtime only supports svg|canvas. This keeps the RSR
  // strategy type honest — the routing layer is free to pick 'webgl'
  // for large cartesian specs, it just degrades gracefully here.
  const vegaBackend: 'svg' | 'canvas' = useMemo(() => {
    if (rendererBackend === 'svg') return 'svg';
    if (rendererBackend === 'webgl' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {

      console.warn(
        '[VegaRenderer] RSR picked webgl backend for a Vega-Lite spec — ' +
          'falling back to canvas (webgl is deck.gl only).',
      );
    }
    return 'canvas';
  }, [rendererBackend]);

  // Instance-pool slot lifecycle: acquire a unique slot on mount, release on
  // unmount. The pool auto-evicts LRU slots when capacity is exceeded, so a
  // dashboard full of editor tiles won't OOM the renderer process.
  const slotIdRef = useRef<string>('');
  if (!slotIdRef.current) {
    slotIdRef.current = `vega-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  }
  useEffect(() => {
    const slotId = slotIdRef.current;
    const kind = vegaBackend === 'svg' ? 'vega-svg' : 'vega-canvas';
    globalInstancePool.acquireSlot(kind, slotId, () => {
      // Eviction callback — VegaLite will unmount via React when its
      // container is removed; this hook is a no-op placeholder for the
      // future "eagerly tear down the view on eviction" flow.
    });
    return () => {
      globalInstancePool.releaseSlot(slotId);
    };
  }, [vegaBackend]);

  // Frame-budget callback: record the wall-clock gap between successive
  // onNewView invocations so the RSR can adapt the strategy on the next
  // render. Vega fires onNewView whenever the view is built/rebuilt, which
  // happens once per spec+data change pair — a reasonable proxy for paint
  // pressure during interactive editing.
  const lastViewTsRef = useRef<number>(0);
  const handleNewView = useCallback((_view: View) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const prev = lastViewTsRef.current;
    if (prev > 0) {
      globalFrameBudgetTracker.recordFrameTime(now - prev);
    }
    lastViewTsRef.current = now;
  }, []);

  const handleError = useCallback(
    (err: Error, _container: HTMLDivElement) => {
      // Swallow and log — render error UI via the compiled.ok === false path.
      if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {

        console.warn('[VegaRenderer] Vega error:', err.message);
      }
    },
    [],
  );

  if (!compiled.ok) {
    return (
      <div
        data-testid="vega-renderer-error"
        style={{
          padding: 12,
          borderRadius: 6,
          background: 'rgba(229, 62, 62, 0.08)',
          border: '1px solid rgba(229, 62, 62, 0.25)',
          color: '#f87171',
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        Compile error: {compiled.error}
      </div>
    );
  }

  const rowCount = rowObjects.length;
  const downsampledCount = downsampledRows.length;
  const tier = strategy?.tier ?? 't0';

  return (
    <div
      data-testid="vega-renderer"
      data-renderer-backend={rendererBackend}
      data-vega-backend={vegaBackend}
      data-strategy-tier={tier}
      data-row-count={rowCount}
      data-downsampled-to={downsampledCount}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        data-testid="vega-renderer-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--text-secondary, #b0b0b6)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
        }}
      >
        <span>
          Vega-Lite · tier <code>{tier}</code>
        </span>
        <span>
          backend: <code>{vegaBackend}</code> · rows:{' '}
          <code>{downsampledCount}</code>
          {downsampledCount !== rowCount && (
            <>
              {' '}
              (of <code>{rowCount}</code>)
            </>
          )}
        </span>
      </div>
      <div
        data-testid="vega-renderer-view"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          minHeight: DEFAULT_CANVAS_SIZE.height,
          overflow: 'auto',
        }}
      >
        <VegaLite
          spec={compiled.vl as unknown as Parameters<typeof VegaLite>[0]['spec']}
          data={{ askdb_data: downsampledRows }}
          renderer={vegaBackend}
          actions={false}
          onNewView={handleNewView}
          onError={handleError}
          width={DEFAULT_CANVAS_SIZE.width}
          height={DEFAULT_CANVAS_SIZE.height}
        />
      </div>
    </div>
  );
}

/** Convert array-of-arrays rows to array-of-objects keyed by column name. */
function rowsToObjects(rows: unknown[][], columns: string[]): Row[] {
  const out: Row[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const obj: Row = {};
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      if (col === undefined) continue;
      obj[col] = row[c];
    }
    out[i] = obj;
  }
  return out;
}

/**
 * Apply the RSR downsample decision to the row objects.
 *
 * Currently implemented:
 *   - lttb     : triangles-based downsampling via lttbRows()
 *   - uniform  : every-Nth sampling via uniformSample()
 *   - none     : passthrough
 *
 * Not yet implemented (fall through to passthrough with a dev warning):
 *   - pixel_min_max — needs per-pixel bucket + min/max aggregation. Phase B3.
 *   - aggregate_bin — Vega-Lite's own aggregate transform usually covers this
 *                     when spec.encoding.y.aggregate is set, so Phase B3 can
 *                     revisit whether we duplicate effort.
 */
function applyDownsample(
  rows: Row[],
  spec: ChartSpec,
  method: string,
  targetPoints: number,
): Row[] {
  if (method === 'none') return rows;
  const xField = spec.encoding?.x?.field;
  const yField = spec.encoding?.y?.field;

  if (method === 'lttb' && xField && yField) {
    return lttbRows(
      rows,
      (r, i) => {
        const v = r[xField];
        return typeof v === 'number' ? v : Number(v ?? i);
      },
      (r) => {
        const v = r[yField];
        return typeof v === 'number' ? v : Number(v ?? 0);
      },
      targetPoints,
    );
  }

  if (method === 'uniform') {
    return uniformSample(rows, targetPoints);
  }

  if (method === 'pixel_min_max' && xField && yField) {
    return pixelMinMaxRows(
      rows,
      (r) => {
        const v = r[xField];
        return typeof v === 'number' ? v : Number(v ?? 0);
      },
      (r) => {
        const v = r[yField];
        return typeof v === 'number' ? v : Number(v ?? 0);
      },
      { pixelWidth: 800 }, // sensible default until the renderer measures its own width
    );
  }

  if (method === 'aggregate_bin' && xField && yField) {
    const yAgg = spec.encoding?.y?.aggregate;
    const binAggregate = (yAgg && ['sum', 'avg', 'min', 'max', 'count'].includes(yAgg)
      ? yAgg
      : 'avg') as 'sum' | 'avg' | 'min' | 'max' | 'count';
    return aggregateBinRows(rows, {
      targetPoints,
      xField,
      yField,
      aggregate: binAggregate,
    });
  }

  if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {

    console.warn(
      `[VegaRenderer] downsample method '${method}' not yet implemented — passing through`,
    );
  }
  return rows;
}
