/**
 * ArrowChunkReceiver — SSE client for progressive Arrow IPC chart streaming.
 *
 * Consumes Server-Sent Events from POST /api/v1/agent/charts/stream and
 * dispatches raw base64 Arrow IPC chunks to its consumer without decoding them.
 * Decoding is deliberately deferred to VegaRenderer (Task 5) so this module
 * stays dependency-free and unit-testable without a DOM or Arrow runtime.
 *
 * Why fetch + ReadableStream instead of EventSource?
 *   EventSource only supports GET. The chart stream endpoint requires a POST
 *   body (conn_id + sql), so we drive the SSE protocol manually over fetch.
 *
 * SSE wire format expected:
 *   event: chart_chunk
 *   data: <base64-encoded Arrow IPC record batch>
 *
 *   event: chart_done
 *   data: {"total_rows": N, "chunks_sent": N, "server_ms": N}
 *
 *   event: chart_error
 *   data: {"message": "..."}
 */

export interface ChunkEvent {
  /** Zero-based chunk sequence number. */
  index: number;
  /** Raw base64-encoded Arrow IPC record batch string. */
  data: string;
}

export interface DoneEvent {
  total_rows: number;
  chunks_sent: number;
  server_ms: number;
}

export interface ArrowChunkReceiverOptions {
  /** Endpoint URL — typically /api/v1/agent/charts/stream */
  url: string;
  /** POST body forwarded as JSON. */
  body: Record<string, unknown>;
  /**
   * Called for each chart_chunk event.
   * @param data  Raw base64 Arrow IPC string — do NOT decode here.
   * @param index Zero-based chunk sequence number.
   */
  onChunk: (data: string, index: number) => void;
  /** Called once when chart_done is received. */
  onDone: (event: DoneEvent) => void;
  /** Called when chart_error is received or the fetch itself rejects. */
  onError: (message: string) => void;
  /** Optional Bearer token. Defaults to undefined (no Authorization header). */
  token?: string;
}

/**
 * Parses a single SSE "block" (the text between two `\n\n` separators) into
 * an `{ event, data }` pair.  Returns null when the block carries no data line.
 */
function parseSSEBlock(block: string): { event: string; data: string } | null {
  let event = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data = line.slice('data:'.length).trim();
    }
  }
  return data ? { event, data } : null;
}

export class ArrowChunkReceiver {
  private options: ArrowChunkReceiverOptions;
  private controller: AbortController;

  constructor(options: ArrowChunkReceiverOptions) {
    this.options = options;
    this.controller = new AbortController();
  }

  /**
   * Open the SSE stream and process events until chart_done / chart_error or
   * the stream closes.  Resolves after the stream ends (success or error).
   */
  async start(): Promise<void> {
    const { url, body, onChunk, onDone, onError, token } = this.options;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: this.controller.signal,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      return;
    }

    if (!response.body) {
      onError('Response body is null');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkIndex = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE blocks are separated by double newlines.
        const blocks = buffer.split('\n\n');
        // The last element is either empty or an incomplete block — keep it.
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const trimmed = block.trim();
          if (!trimmed) continue;

          const parsed = parseSSEBlock(trimmed);
          if (!parsed) continue;

          const { event, data } = parsed;

          if (event === 'chart_chunk') {
            onChunk(data, chunkIndex++);
          } else if (event === 'chart_done') {
            try {
              onDone(JSON.parse(data) as DoneEvent);
            } catch {
              onError('Failed to parse chart_done payload');
            }
            return;
          } else if (event === 'chart_error') {
            try {
              const payload = JSON.parse(data) as { message?: string };
              onError(payload.message ?? data);
            } catch {
              onError(data);
            }
            return;
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        onError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** Cancel an in-flight stream. */
  abort(): void {
    this.controller.abort();
  }
}
