/**
 * Bridge protocol tests (vitest).
 *
 * Covers buildHostMessage and parseGuestMessage per C2 Task 2 spec.
 * 8 tests total:
 *   1-3: buildHostMessage — INIT, DATA, DESTROY shape verification
 *   4-8: parseGuestMessage — READY, non-bridge null, RENDER_COMPLETE,
 *                            SELECT with dataPoints, ERROR
 */
import { describe, test, expect } from 'vitest';
import {
  buildHostMessage,
  parseGuestMessage,
} from '../../sdk/bridge';

// ---------------------------------------------------------------------------
// buildHostMessage (tests 1–3)
// ---------------------------------------------------------------------------

describe('buildHostMessage', () => {
  test('INIT message has correct shape', () => {
    const config = { width: 800, height: 600, theme: 'dark' };
    const msg = buildHostMessage('INIT', config);

    expect(msg.__askdb_bridge).toBe(true);
    expect(msg.type).toBe('INIT');
    expect(msg.payload).toEqual(config);
  });

  test('DATA message has correct shape', () => {
    const rows = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    const msg = buildHostMessage('DATA', { rows });

    expect(msg.__askdb_bridge).toBe(true);
    expect(msg.type).toBe('DATA');
    expect(msg.payload).toEqual({ rows });
  });

  test('DESTROY message has correct shape with empty payload', () => {
    const msg = buildHostMessage('DESTROY');

    expect(msg.__askdb_bridge).toBe(true);
    expect(msg.type).toBe('DESTROY');
    expect(msg.payload).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// parseGuestMessage (tests 4–8)
// ---------------------------------------------------------------------------

describe('parseGuestMessage', () => {
  test('READY message is parsed correctly', () => {
    const raw = { __askdb_bridge: true, type: 'READY', payload: {} };
    const result = parseGuestMessage(raw);

    expect(result).not.toBeNull();
    expect(result!.__askdb_bridge).toBe(true);
    expect(result!.type).toBe('READY');
    expect(result!.payload).toEqual({});
  });

  test('non-bridge message returns null', () => {
    const raw = { type: 'READY', payload: {} }; // missing __askdb_bridge
    expect(parseGuestMessage(raw)).toBeNull();

    // Also: wrong discriminator value
    expect(parseGuestMessage({ __askdb_bridge: false, type: 'READY', payload: {} })).toBeNull();

    // Primitive values
    expect(parseGuestMessage(null)).toBeNull();
    expect(parseGuestMessage('string')).toBeNull();
    expect(parseGuestMessage(42)).toBeNull();
    expect(parseGuestMessage(undefined)).toBeNull();
  });

  test('RENDER_COMPLETE message is parsed correctly', () => {
    const raw = {
      __askdb_bridge: true,
      type: 'RENDER_COMPLETE',
      payload: { durationMs: 120 },
    };
    const result = parseGuestMessage(raw);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('RENDER_COMPLETE');
    expect(result!.payload).toEqual({ durationMs: 120 });
  });

  test('SELECT message with dataPoints is parsed correctly', () => {
    const dataPoints = [{ row: 0, value: 42 }, { row: 1, value: 7 }];
    const raw = {
      __askdb_bridge: true,
      type: 'SELECT',
      payload: { dataPoints },
    };
    const result = parseGuestMessage(raw);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('SELECT');
    expect(result!.payload['dataPoints']).toEqual(dataPoints);
  });

  test('ERROR message is parsed correctly', () => {
    const raw = {
      __askdb_bridge: true,
      type: 'ERROR',
      payload: {
        message: 'Cannot read property of undefined',
        stack: 'Error: Cannot read property of undefined\n    at render (bundle.js:12)',
        source: 'bundle.js',
        lineno: 12,
        colno: 5,
      },
    };
    const result = parseGuestMessage(raw);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('ERROR');
    expect(result!.payload['message']).toBe('Cannot read property of undefined');
    expect(result!.payload['lineno']).toBe(12);
  });
});
