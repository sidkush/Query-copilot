import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildDiagnosticsRunner, parseBackendError } from '../calcDiagnostics';

describe('parseBackendError', () => {
  it('maps ParseError with line/col to a Monaco marker', () => {
    const m = parseBackendError({ status: 400, detail: 'ParseError at line 2, col 3: unexpected ]' });
    expect(m).toEqual({
      severity: 'error',
      startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 4,
      message: 'unexpected ]',
    });
  });

  it('falls back to a whole-text marker when no position info', () => {
    const m = parseBackendError({ status: 400, detail: 'TypeError: cannot aggregate aggregate' });
    expect(m.severity).toBe('error');
    expect(m.startLineNumber).toBe(1);
    expect(m.message).toMatch(/cannot aggregate/);
  });
});

describe('buildDiagnosticsRunner', () => {
  let calls: any[] = [];
  beforeEach(() => { calls = []; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('debounces 300 ms and calls validateCalc once per burst', async () => {
    const validateCalc = vi.fn().mockResolvedValue({ valid: true, warnings: [] });
    const runner = buildDiagnosticsRunner({
      validateCalc: validateCalc as any,
      schemaRef: {}, schemaStats: {},
      onMarkers: (ms) => calls.push(ms),
      debounceMs: 300,
    });
    runner.update('SUM(');
    runner.update('SUM([');
    runner.update('SUM([Sales])');
    await vi.advanceTimersByTimeAsync(300);
    expect(validateCalc).toHaveBeenCalledTimes(1);
    expect(validateCalc).toHaveBeenCalledWith({ formula: 'SUM([Sales])', schema_ref: {}, schema_stats: {} });
  });

  it('maps valid=true + warnings[] to info markers for expensive_fixed_lod', async () => {
    const validateCalc = vi.fn().mockResolvedValue({
      valid: true,
      warnings: [{ kind: 'expensive_fixed_lod', estimate: 2_000_000, suggestion: 'Add to Context', details: {} }],
    });
    const runner = buildDiagnosticsRunner({
      validateCalc: validateCalc as any,
      schemaRef: {}, schemaStats: { Customer: 2_000_000 },
      onMarkers: (ms) => calls.push(ms),
      debounceMs: 10,
    });
    runner.update('{FIXED [Customer]: SUM([Sales])}');
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    const markers = calls.at(-1);
    expect(markers).toHaveLength(1);
    expect(markers[0].severity).toBe('warning');
    expect(markers[0].message).toMatch(/Add to Context/);
  });
});
