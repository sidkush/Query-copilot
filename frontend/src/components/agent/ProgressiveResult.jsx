import { lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import { TOKENS } from '../dashboard/tokens';
import { MD_COMPONENTS, REMARK_PLUGINS, FONT_BODY } from '../../lib/agentMarkdown';

const LegacyResultChart = lazy(() => import('../dashboard/lib/LegacyResultChart'));

export default function ProgressiveResult({ step, compact }) {
  let resultData = null;
  if (step.tool_result) {
    try { resultData = typeof step.tool_result === 'string' ? JSON.parse(step.tool_result) : step.tool_result; }
    catch { resultData = null; }
  }

  const hasChart = resultData?.chart_suggestion || step.chart_suggestion;
  const hasTable = resultData?.columns?.length > 0 && resultData?.rows?.length > 0;

  return (
    <div className="agent-bubble-assistant" style={{ borderRadius: 18, padding: compact ? '12px 14px' : '16px 18px' }}>
      {step.content && (
        <div className="agent-result-md" style={{
          fontSize: 13, color: TOKENS.text.primary,
          fontFamily: FONT_BODY, lineHeight: 1.65,
          letterSpacing: '-0.005em',
          wordBreak: 'break-word', overflowWrap: 'anywhere',
        }}>
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>{step.content}</ReactMarkdown>
        </div>
      )}
      {hasTable && (
        <div className="agent-table-shell" style={{ marginTop: 12 }}>
          <div className="agent-table-scroll" style={{ maxHeight: compact ? 220 : 420, overflowY: 'auto' }}>
            <table className="agent-table">
              <thead className="agent-table-head">
                <tr>
                  {resultData.columns.map(col => <th key={col}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {resultData.rows.slice(0, compact ? 5 : 20).map((row, i) => (
                  <tr key={i} className="agent-table-row">
                    {row.map((val, j) => {
                      const text = val === null ? '\u2014' : String(val);
                      const numeric = val !== null && /^-?[\d,.\s%$()]+$/.test(text.trim());
                      return <td key={j} data-numeric={numeric || undefined}>{text}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasChart && (
        <Suspense fallback={<div style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 10, fontFamily: FONT_BODY }}>Loading chart...</div>}>
          <div style={{ marginTop: 12, height: (compact ? 220 : 320) + 48 }}>
            <LegacyResultChart
              columns={resultData?.columns || []}
              rows={resultData?.rows || []}
              showTitleBar={false}
              hideToolbar={false}
            />
          </div>
        </Suspense>
      )}
    </div>
  );
}
