import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('api.executeUnderlying', () => {
  let api;
  let originalFetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    const payload = { columns: ['a'], rows: [[1]], limit: 10000, mark_selection: {}, row_count: 1 };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
      json: async () => payload,
    }));
    localStorage.setItem('token', 'jwt-test');
    ({ api } = await import('../api'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.resetModules();
  });

  it('POSTs to /api/v1/queries/underlying with body shape', async () => {
    const out = await api.executeUnderlying({
      connId: 'c1',
      sql: 'SELECT * FROM t',
      markSelection: { region: 'East' },
      limit: 500,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/v1/queries/underlying');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      conn_id: 'c1',
      sql: 'SELECT * FROM t',
      mark_selection: { region: 'East' },
      limit: 500,
    });
    expect(out.row_count).toBe(1);
  });

  it('omits limit when not provided', async () => {
    await api.executeUnderlying({
      connId: 'c1',
      sql: 'SELECT * FROM t',
      markSelection: {},
    });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('limit');
  });
});
