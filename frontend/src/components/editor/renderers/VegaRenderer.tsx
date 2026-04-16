import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { VegaLite } from 'react-vega';
import MiniChartTooltip from '../onobject/MiniChartTooltip';
import {
  compileToVegaLite,
  globalInstancePool,
  globalFrameBudgetTracker,
  globalPerTileTracker,
  lttbRows,
  uniformSample,
  pixelMinMaxRows,
  aggregateBinRows,
  ArrowChunkReceiver,
  reportRenderTelemetry,
} from '../../../chart-ir';
import type {
  ChartSpec,
  RendererBackend,
  RenderStrategy,
} from '../../../chart-ir';
import type { ColorMap } from '../../../chart-ir/semantic/colorMap';
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

export interface DrillthroughEvent {
  targetTileId: string;
  filters: { field: string; value: unknown }[];
}

export interface VegaRendererProps {
  spec: ChartSpec;
  resultSet?: {
    columns: string[];
    rows: unknown[][];
  };
  rendererBackend?: RendererBackend;
  strategy?: RenderStrategy;
  /** Called with the Vega View instance when it's ready. Used by
   *  OnObjectOverlay for scenegraph hit-testing. */
  onViewReady?: (view: View) => void;
  colorMap?: ColorMap;
  /** Drillthrough callback — fired when the user clicks a data mark and
   *  the spec declares a matching `drillthrough` interaction. */
  onDrillthrough?: (event: DrillthroughEvent) => void;
  /**
   * Called when the user drags an interval brush selection on the chart.
   * Fires with (field, [lo, hi]) while a selection is active; fires with
   * (field, null) when the brush is cleared (empty array from Vega signal).
   *
   * Only wired when the compiled spec has at least one selection of
   * type 'interval'. Used by useTileLinking for brush-to-detail filtering.
   */
  onBrush?: (field: string, range: [number, number] | null) => void;
}

type Row = Record<string, unknown>;

const DEFAULT_CANVAS_SIZE = { width: 520, height: 320 };

async function decodeArrowChunk(base64Data: string, columns: string[]): Promise<Row[]> {
  const { tableFromIPC } = await import('apache-arrow');
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const table = tableFromIPC(bytes);
  const rows: Row[] = [];
  for (let i = 0; i < table.numRows; i++) {
    const row: Row = {};
    for (const col of columns) {
      const vec = table.getChild(col);
      row[col] = vec ? vec.get(i) : null;
    }
    rows.push(row);
  }
  return rows;
}

export default function VegaRenderer({
  spec,
  resultSet,
  rendererBackend = 'svg',
  strategy,
  onViewReady,
  colorMap,
  onDrillthrough,
  onBrush,
}: VegaRendererProps) {
  const compiled = useMemo(() => {
    try {
      if (spec.type !== 'cartesian') {
        return {
          ok: false as const,
          error: `VegaRenderer only handles cartesian, got ${spec.type}`,
        };
      }
      const vl = compileToVegaLite(spec, colorMap);
      return { ok: true as const, vl };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [spec, colorMap]);

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

  const viewRef = useRef<View | null>(null);
  const streamingRef = useRef(false);
  const [streamingComplete, setStreamingComplete] = useState(false);
  const [tooltipState, setTooltipState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    datum: Record<string, unknown> | null;
  }>({ visible: false, x: 0, y: 0, datum: null });
  const firstPaintTsRef = useRef<number>(0);
  const telemetryFiredRef = useRef(false);

  const isStreaming = strategy?.streaming?.enabled === true;

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
      globalPerTileTracker.removeTile(slotId);
    };
  }, [vegaBackend]);

  // Frame-budget callback: record the wall-clock gap between successive
  // onNewView invocations so the RSR can adapt the strategy on the next
  // render. Vega fires onNewView whenever the view is built/rebuilt, which
  // happens once per spec+data change pair — a reasonable proxy for paint
  // pressure during interactive editing.
  const lastViewTsRef = useRef<number>(0);
  const handleNewView = useCallback((view: View) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const prev = lastViewTsRef.current;
    if (prev > 0) {
      const frameDuration = now - prev;
      globalFrameBudgetTracker.recordFrameTime(frameDuration);
      globalPerTileTracker.recordTileFrame(slotIdRef.current, frameDuration);
    }
    lastViewTsRef.current = now;
    // Expose the view to OnObjectOverlay for scenegraph hit-testing.
    if (onViewReady) onViewReady(view);
  }, [onViewReady]);

  // Store the view from onNewView so the streaming hook can insert rows.
  // Also attaches the drillthrough click listener and brush signal listener
  // when the spec declares the relevant interactions / selections.
  const handleNewViewWrapped = useCallback((view: View) => {
    viewRef.current = view;
    if (!firstPaintTsRef.current) {
      firstPaintTsRef.current = performance.now();
    }
    handleNewView(view);

    // Drillthrough: listen for clicks on data marks and fire the callback
    // when the spec declares a matching interaction entry.
    view.addEventListener('click', (_event, item) => {
      if (!item?.datum || !spec.interactions?.length || !onDrillthrough) return;
      const drill = spec.interactions.find(i => i.type === 'drillthrough');
      if (!drill) return;
      const filters = drill.filterMappings.map(m => ({
        field: m.targetField,
        value: (item.datum as Record<string, unknown>)[m.sourceField],
      }));
      onDrillthrough({ targetTileId: drill.targetTileId, filters });
    });

    // Brush-to-detail: attach a Vega signal listener for the first interval
    // selection declared in the spec. When the user drags a brush, the signal
    // value is an array [lo, hi]; when cleared it is [] or undefined.
    // We report (field, [lo, hi]) for an active brush and (field, null) for clear.
    if (onBrush) {
      const selections = (spec as unknown as { selection?: { type?: string; name?: string }[] }).selection;
      if (Array.isArray(selections)) {
        const intervalSel = selections.find(s => s.type === 'interval');
        if (intervalSel?.name) {
          const signalName = `${intervalSel.name}_x`;
          const xField = (spec as { encoding?: { x?: { field?: string } } }).encoding?.x?.field ?? '';
          view.addSignalListener(signalName, (_name: string, value: unknown) => {
            if (Array.isArray(value) && value.length === 2) {
              onBrush(xField, value as [number, number]);
            } else {
              // Empty array or undefined = brush cleared.
              onBrush(xField, null);
            }
          });
        }
      }
    }
    // Viz-in-Tooltip: show a mini sparkline tooltip on data point hover.
    view.addEventListener('mouseover', (event: MouseEvent, item: { datum?: Record<string, unknown> } | null) => {
      if (item?.datum) {
        setTooltipState({ visible: true, x: event.clientX, y: event.clientY, datum: item.datum });
      }
    });
    view.addEventListener('mouseout', () => {
      setTooltipState(prev => ({ ...prev, visible: false }));
    });
  }, [handleNewView, spec, onDrillthrough, onBrush]);

  useEffect(() => {
    if (!isStreaming || !resultSet?.columns) return;

    const columns = resultSet.columns;
    streamingRef.current = true;
    setStreamingComplete(false);

    // Build the request body from the spec's encoding hints.
    const connId = (window as unknown as Record<string, string>).__askdb_active_conn_id ?? '';
    const body = {
      conn_id: connId,
      sql: (window as unknown as Record<string, string>).__askdb_last_sql ?? '',
      target_points: strategy?.downsample?.targetPoints ?? 4000,
      x_col: spec.encoding?.x?.field,
      y_col: spec.encoding?.y?.field,
      x_type: spec.encoding?.x?.type,
      y_type: spec.encoding?.y?.type,
      batch_rows: strategy?.streaming?.batchRows ?? 5000,
    };

    const receiver = new ArrowChunkReceiver({
      url: '/api/v1/agent/charts/stream',
      body,
      onChunk: async (base64Data) => {
        try {
          const newRows = await decodeArrowChunk(base64Data, columns);
          const view = viewRef.current;
          if (view && newRows.length > 0) {
            const changeset = (await import('vega')).changeset();
            view.change('askdb_data', changeset.insert(newRows)).run();
          }
        } catch (err) {
          console.warn('[VegaRenderer] streaming chunk decode error:', err);
        }
      },
      onDone: () => {
        streamingRef.current = false;
        setStreamingComplete(true);
      },
      onError: (msg) => {
        console.warn('[VegaRenderer] streaming error:', msg);
        streamingRef.current = false;
      },
    });

    receiver.start();
    return () => receiver.abort();
  }, [isStreaming, resultSet?.columns, spec, strategy]);

  useEffect(() => {
    if (telemetryFiredRef.current || !strategy) return;
    const timer = setTimeout(() => {
      if (telemetryFiredRef.current) return;
      telemetryFiredRef.current = true;
      const firstPaintMs = firstPaintTsRef.current
        ? performance.now() - firstPaintTsRef.current
        : 0;
      reportRenderTelemetry({
        session_id: String((window as unknown as Record<string, unknown>).__askdb_session_id ?? ''),
        tile_id: slotIdRef.current,
        tier: strategy.tier,
        renderer_family: strategy.rendererFamily,
        renderer_backend: strategy.rendererBackend,
        row_count: rowObjects.length,
        downsample_method: strategy.downsample?.method ?? 'none',
        target_points: strategy.downsample?.targetPoints ?? 0,
        first_paint_ms: Math.round(firstPaintMs),
        median_frame_ms: 0,
        p95_frame_ms: 0,
        escalations: [],
        evictions: 0,
        instance_pressure_at_mount: 0,
        gpu_tier: 'medium',
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [strategy, rowObjects.length]);

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

  const vegaData = isStreaming && !streamingComplete
    ? { askdb_data: [] as Row[] }
    : { askdb_data: downsampledRows };

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
          data={vegaData}
          renderer={vegaBackend}
          actions={false}
          onNewView={handleNewViewWrapped}
          onError={handleError}
          width={DEFAULT_CANVAS_SIZE.width}
          height={DEFAULT_CANVAS_SIZE.height}
        />
      </div>
      {typeof document !== 'undefined' && createPortal(
        <MiniChartTooltip
          x={tooltipState.x}
          y={tooltipState.y}
          visible={tooltipState.visible}
          datum={tooltipState.datum}
          seriesData={downsampledRows}
          xField={(spec as { encoding?: { x?: { field?: string } } }).encoding?.x?.field}
          yField={(spec as { encoding?: { y?: { field?: string } } }).encoding?.y?.field}
          label={
            tooltipState.datum?.[
              (spec as { encoding?: { color?: { field?: string }; x?: { field?: string } } })
                .encoding?.color?.field ||
              (spec as { encoding?: { x?: { field?: string } } }).encoding?.x?.field ||
              ''
            ] != null
              ? String(
                  tooltipState.datum[
                    (spec as { encoding?: { color?: { field?: string }; x?: { field?: string } } })
                      .encoding?.color?.field ||
                    (spec as { encoding?: { x?: { field?: string } } }).encoding?.x?.field ||
                    ''
                  ],
                )
              : ''
          }
        />,
        document.body,
      )}
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
