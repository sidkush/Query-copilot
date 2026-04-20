// Plan 8d T5 — debounced calc validation → Monaco markers.
// Mapping layer between the /api/v1/calcs/validate backend response and
// Monaco editor marker objects. Keeps network calls debounced so each
// keystroke in the Monaco calc editor does not trigger a request.

export type Severity = 'error' | 'warning' | 'info';

export interface CalcMarker {
  severity: Severity;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
}

export interface BackendError {
  status: number;
  detail: string;
}

/**
 * Convert a thrown backend error into a single Monaco marker.
 * Preferred format: `ParseError at line N, col M: <message>` → marker at
 * (N, M). Everything else falls back to a whole-line marker on line 1.
 */
export function parseBackendError(err: BackendError): CalcMarker {
  const detail = err.detail || 'unknown error';
  const m = detail.match(/^ParseError at line (\d+), col (\d+):\s*(.*)$/);
  if (m) {
    const ln = parseInt(m[1], 10);
    const col = parseInt(m[2], 10);
    return {
      severity: 'error',
      startLineNumber: ln,
      startColumn: col,
      endLineNumber: ln,
      endColumn: col + 1,
      message: m[3],
    };
  }
  return {
    severity: 'error',
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 2,
    message: detail,
  };
}

export interface ValidateResponse {
  valid: boolean;
  inferredType?: string;
  isAggregate?: boolean;
  errors?: string[];
  warnings?: {
    kind: string;
    estimate?: number;
    suggestion?: string;
    details?: unknown;
  }[];
}

export interface DiagnosticsRunnerArgs {
  validateCalc: (body: {
    formula: string;
    schema_ref: Record<string, string>;
    schema_stats: Record<string, number>;
  }) => Promise<ValidateResponse>;
  schemaRef: Record<string, string>;
  schemaStats: Record<string, number>;
  onMarkers: (markers: CalcMarker[]) => void;
  debounceMs?: number;
}

/**
 * Build a debounced runner that forwards the latest formula to the
 * backend `/calcs/validate` endpoint and maps the response (errors or
 * warnings) to Monaco markers via `onMarkers`.
 *
 * Returns `{ update, dispose }`. Call `update(formula)` on every
 * editor change; only the last value within `debounceMs` reaches the
 * network.
 */
export function buildDiagnosticsRunner(args: DiagnosticsRunnerArgs) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFormula = '';
  return {
    update(formula: string) {
      lastFormula = formula;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const res = await args.validateCalc({
            formula: lastFormula,
            schema_ref: args.schemaRef,
            schema_stats: args.schemaStats,
          });
          const markers: CalcMarker[] = (res.warnings ?? []).map((w) => ({
            severity: 'warning',
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: Math.max(2, lastFormula.length + 1),
            message: `${w.kind}: ${w.suggestion ?? ''} (est ${w.estimate ?? '?'} rows)`.trim(),
          }));
          args.onMarkers(markers);
        } catch (err) {
          args.onMarkers([parseBackendError(err as BackendError)]);
        }
      }, args.debounceMs ?? 300);
    },
    dispose() {
      if (timer) clearTimeout(timer);
    },
  };
}
