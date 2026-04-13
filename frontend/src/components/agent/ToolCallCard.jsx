import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

const TOOL_ICONS = {
  find_relevant_tables: '\u{1F50D}',
  inspect_schema: '\u{1F4CA}',
  run_sql: '\u26A1',
  suggest_chart: '\u{1F4C8}',
  ask_user: '\u{1F4AC}',
  summarize_results: '\u{1F4DD}',
  list_dashboards: '\u{1F4CB}',
  create_dashboard_tile: '\u2795',
  update_dashboard_tile: '\u270F\uFE0F',
  delete_dashboard_tile: '\u{1F5D1}\uFE0F',
  ml_ingest_data: '\u{1F4E5}',
  ml_analyze_features: '\u{1F52C}',
  ml_prepare_data: '\u{1F9F9}',
  ml_train: '\u{1F3CB}\uFE0F',
  ml_evaluate: '\u{1F4CA}',
  ml_predict: '\u{1F3AF}',
};

const TOOL_LABELS = {
  find_relevant_tables: 'Scanning tables',
  inspect_schema: 'Inspecting schema',
  run_sql: 'Executing query',
  suggest_chart: 'Suggesting visualization',
  summarize_results: 'Analyzing results',
  ml_ingest_data: 'Ingesting data',
  ml_analyze_features: 'Analyzing features',
  ml_prepare_data: 'Preparing data',
  ml_train: 'Training model',
  ml_evaluate: 'Evaluating results',
  ml_predict: 'Running prediction',
};

export default function ToolCallCard({ step, compact }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[step.tool_name] || '\u{1F527}';
  const label = TOOL_LABELS[step.tool_name] || step.tool_name;

  let resultData = null;
  if (step.tool_result && step.tool_result !== 'null') {
    try { resultData = typeof step.tool_result === 'string' ? JSON.parse(step.tool_result) : step.tool_result; }
    catch { resultData = null; }
  }

  const hasColumns = resultData?.columns?.length > 0;
  const hasRows = resultData?.rows?.length > 0;

  return (
    <div style={{ borderRadius: TOKENS.radius.md, border: `1px solid ${TOKENS.border.default}`, overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left"
        style={{ padding: compact ? '6px 10px' : '8px 12px', background: TOKENS.bg.surface, cursor: 'pointer', border: 'none' }}
      >
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-medium flex-1" style={{ color: TOKENS.text.secondary }}>{label}</span>
        <motion.svg
          width={12} height={12} viewBox="0 0 12 12"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ opacity: 0.4 }}
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth={1.5} fill="none" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${TOKENS.border.default}` }}>
              {step.tool_input && (
                <pre className="text-xs" style={{ color: TOKENS.text.muted, whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                  {typeof step.tool_input === 'string' ? step.tool_input : JSON.stringify(step.tool_input, null, 2)}
                </pre>
              )}
              {hasColumns && hasRows && (
                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {resultData.columns.map(col => (
                          <th key={col} style={{ padding: '4px 8px', textAlign: 'left', borderBottom: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.muted }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resultData.rows.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          {row.map((val, j) => (
                            <td key={j} style={{ padding: '3px 8px', borderBottom: `1px solid ${TOKENS.border.default}` }}>
                              {val === null ? '\u2014' : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {resultData.rows.length > 10 && (
                    <div className="text-xs mt-1" style={{ color: TOKENS.text.muted }}>+{resultData.rows.length - 10} more rows</div>
                  )}
                </div>
              )}
              {!hasColumns && resultData && typeof resultData === 'object' && (
                <pre className="text-xs" style={{ color: TOKENS.text.secondary, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(resultData, null, 2).slice(0, 500)}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
