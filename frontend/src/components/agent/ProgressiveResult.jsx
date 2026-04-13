import { lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import { TOKENS } from '../dashboard/tokens';

const ResultsChart = lazy(() => import('../ResultsChart'));

export default function ProgressiveResult({ step, compact }) {
  let resultData = null;
  if (step.tool_result) {
    try { resultData = typeof step.tool_result === 'string' ? JSON.parse(step.tool_result) : step.tool_result; }
    catch { resultData = null; }
  }

  const hasChart = resultData?.chart_suggestion || step.chart_suggestion;
  const hasTable = resultData?.columns?.length > 0 && resultData?.rows?.length > 0;

  return (
    <div className="agent-bubble-assistant" style={{ borderRadius: TOKENS.radius.lg, padding: compact ? '8px 10px' : '10px 14px' }}>
      {step.content && (
        <div className="agent-result-md text-sm">
          <ReactMarkdown>{step.content}</ReactMarkdown>
        </div>
      )}
      {hasTable && (
        <div style={{ maxHeight: compact ? 200 : 400, overflow: 'auto', marginTop: 8 }}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                {resultData.columns.map(col => (
                  <th key={col} style={{ padding: '4px 8px', textAlign: 'left', borderBottom: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.muted }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resultData.rows.slice(0, compact ? 5 : 20).map((row, i) => (
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
        </div>
      )}
      {hasChart && (
        <Suspense fallback={<div className="text-xs" style={{ color: TOKENS.text.muted }}>Loading chart...</div>}>
          <div style={{ marginTop: 8, height: compact ? 200 : 300 }}>
            <ResultsChart columns={resultData?.columns} rows={resultData?.rows} chartSuggestion={hasChart} />
          </div>
        </Suspense>
      )}
    </div>
  );
}
