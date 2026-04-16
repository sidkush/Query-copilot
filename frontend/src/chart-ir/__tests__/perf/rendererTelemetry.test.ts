/**
 * rendererTelemetry tests (vitest).
 */
import { reportRenderTelemetry } from '../../perf/rendererTelemetry';
import type { RenderTelemetryPayload } from '../../perf/rendererTelemetry';

const BASE_PAYLOAD: RenderTelemetryPayload = {
  session_id: 'sess-abc',
  tile_id: 'tile-1',
  tier: 'turbo',
  renderer_family: 'vega',
  renderer_backend: 'vega-canvas',
  row_count: 5000,
};

test('POSTs payload to correct URL', async () => {
  const mockFetch = vi.fn().mockResolvedValue({ status: 204 });
  vi.stubGlobal('fetch', mockFetch);

  await reportRenderTelemetry(BASE_PAYLOAD);

  expect(mockFetch).toHaveBeenCalledOnce();
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/v1/agent/perf/telemetry');
  expect(init.method).toBe('POST');
  const body = JSON.parse(init.body as string) as RenderTelemetryPayload;
  expect(body.tier).toBe('turbo');
  expect(body.row_count).toBe(5000);

  vi.unstubAllGlobals();
});

test('does not throw on network failure', async () => {
  const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', mockFetch);

  await expect(reportRenderTelemetry(BASE_PAYLOAD)).resolves.toBeUndefined();

  vi.unstubAllGlobals();
});

test('does not throw on non-204 response', async () => {
  const mockFetch = vi.fn().mockResolvedValue({ status: 500 });
  vi.stubGlobal('fetch', mockFetch);

  await expect(reportRenderTelemetry(BASE_PAYLOAD)).resolves.toBeUndefined();

  vi.unstubAllGlobals();
});
