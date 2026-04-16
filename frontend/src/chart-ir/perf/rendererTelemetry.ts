/**
 * rendererTelemetry — fire-and-forget chart render telemetry client.
 *
 * Reports renderer performance metrics to the backend for offline analysis.
 * All errors are swallowed — this must never throw or cause a chart to fail.
 * No auth header is attached; the endpoint is agent-router-scoped and
 * session_id / tile_id provide correlation context.
 *
 * Endpoint: POST /api/v1/agent/perf/telemetry
 */

import type { StrategyTier, RendererFamily, RendererBackend, DownsampleMethod, GpuTier } from '../rsr/strategy';

export interface RenderTelemetryPayload {
  /** Agent/chat session identifier. */
  session_id: string;
  /** Dashboard tile identifier. */
  tile_id: string;
  /** Waterfall strategy tier that produced the data. */
  tier: StrategyTier;
  /** High-level renderer family (vega, deck, creative, …). */
  renderer_family: RendererFamily;
  /** Specific renderer backend selected by the RSR. */
  renderer_backend: RendererBackend;
  /** Number of data rows rendered (after downsampling if applied). */
  row_count: number;

  // --- optional performance fields ---
  /** Downsampling algorithm applied, if any. */
  downsample_method?: DownsampleMethod;
  /** Target point count passed to the downsampler. */
  target_points?: number;
  /** Time from component mount to first visible paint (ms). */
  first_paint_ms?: number;
  /** Median frame time over the observation window (ms). */
  median_frame_ms?: number;
  /** p95 frame time over the observation window (ms). */
  p95_frame_ms?: number;
  /** Renderer escalations that occurred during this tile's lifetime. */
  escalations?: string[];
  /** Number of InstancePool evictions triggered by this tile. */
  evictions?: number;
  /** InstancePool pressure ratio at component mount (0–1). */
  instance_pressure_at_mount?: number;
  /** GPU tier detected at report time. */
  gpu_tier?: GpuTier;
}

/**
 * Send render telemetry to the backend. Fire-and-forget — never throws.
 */
export async function reportRenderTelemetry(payload: RenderTelemetryPayload): Promise<void> {
  try {
    await fetch('/api/v1/agent/perf/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Swallow all errors — telemetry must never break the chart render path.
  }
}
