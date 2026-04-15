import { useMemo } from 'react';
import { compileToVegaLite } from '../../../chart-ir';
import type { ChartSpec } from '../../../chart-ir';
import type { RendererBackend } from '../../../chart-ir';

/**
 * VegaRenderer — Phase 1 STUB.
 *
 * Phase 1: compiles the ChartSpec to a Vega-Lite spec via compileToVegaLite()
 * and renders the result JSON inside a <pre> block. NO react-vega mount yet.
 *
 * Phase 2 (task A2.6 per plan): wires the compiled VL spec into
 * react-vega's `<Vega />` component, attaches the resultSet rows as the
 * named data source (`askdb_data`), and handles theme/density via
 * config patches.
 *
 * The `rendererBackend` prop is threaded through from EditorCanvas (derived
 * from RSR pickRenderStrategy). Phase 2 uses it to pick between `'svg'`
 * and `'canvas'` on the underlying Vega runtime.
 */
export interface VegaRendererProps {
  spec: ChartSpec;
  resultSet?: {
    columns: string[];
    rows: unknown[][];
  };
  rendererBackend?: RendererBackend;
}

export default function VegaRenderer({
  spec,
  resultSet,
  rendererBackend = 'svg',
}: VegaRendererProps) {
  const compiled = useMemo(() => {
    try {
      if (spec.type !== 'cartesian') {
        return { ok: false as const, error: `VegaRenderer only handles cartesian, got ${spec.type}` };
      }
      const vl = compileToVegaLite(spec);
      return { ok: true as const, vl };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [spec]);

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

  const rowCount = resultSet?.rows?.length ?? 0;

  return (
    <div
      data-testid="vega-renderer"
      data-renderer-backend={rendererBackend}
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
        <span>Compiled Vega-Lite JSON (stub — Phase 2 mounts react-vega)</span>
        <span>
          backend: <code>{rendererBackend}</code> · rows: <code>{rowCount}</code>
        </span>
      </div>
      <pre
        data-testid="vega-renderer-json"
        style={{
          flex: 1,
          margin: 0,
          padding: 12,
          borderRadius: 6,
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          color: '#c7d2fe',
          fontSize: 11,
          lineHeight: 1.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(compiled.vl, null, 2)}
      </pre>
    </div>
  );
}
