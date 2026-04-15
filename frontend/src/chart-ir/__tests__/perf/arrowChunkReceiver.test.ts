import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArrowChunkReceiver } from '../../perf/arrowChunkReceiver';

function makeSSEResponse(events: string[]): Response {
  const body = events.join('');
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('ArrowChunkReceiver', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses chart_done events and calls onDone', async () => {
    const doneData = JSON.stringify({ total_rows: 100, chunks_sent: 2, server_ms: 42 });
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse([`event: chart_done\ndata: ${doneData}\n\n`]),
    );
    const onDone = vi.fn();
    const receiver = new ArrowChunkReceiver({
      url: '/api/v1/charts/stream',
      body: { conn_id: 'test', sql: 'SELECT 1' },
      onChunk: vi.fn(),
      onDone,
      onError: vi.fn(),
    });
    await receiver.start();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ total_rows: 100 }));
  });

  it('calls onError for chart_error events', async () => {
    const errData = JSON.stringify({ message: 'bad sql' });
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse([`event: chart_error\ndata: ${errData}\n\n`]),
    );
    const onError = vi.fn();
    const receiver = new ArrowChunkReceiver({
      url: '/api/v1/charts/stream',
      body: { conn_id: 'test', sql: 'DROP TABLE x' },
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError,
    });
    await receiver.start();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('bad sql');
  });

  it('calls onChunk for chart_chunk events with raw data string', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse([
        `event: chart_chunk\ndata: AAAA\n\n`,
        `event: chart_done\ndata: {"total_rows":1,"chunks_sent":1,"server_ms":1}\n\n`,
      ]),
    );
    const onChunk = vi.fn();
    const receiver = new ArrowChunkReceiver({
      url: '/api/v1/charts/stream',
      body: { conn_id: 'test', sql: 'SELECT 1' },
      onChunk,
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    await receiver.start();
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith('AAAA', 0);
  });
});
