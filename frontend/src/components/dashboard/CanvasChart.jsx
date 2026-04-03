import { lazy, Suspense, useMemo } from 'react';
import { TOKENS } from './tokens';
import { CHART_PALETTES } from './tokens';

// Lazy load ECharts to avoid bloating main bundle
const ReactECharts = lazy(() => import('echarts-for-react'));

export default function CanvasChart({ columns, rows, chartType = 'scatter', formatting = null }) {
  const palette = CHART_PALETTES[formatting?.colors?.palette] || CHART_PALETTES.default;

  const option = useMemo(() => {
    if (!columns?.length || !rows?.length) return {};

    const labelCol = columns[0];
    const numericCols = columns.filter((c, i) => i > 0 && rows.some(r => typeof r[c] === 'number' || !isNaN(Number(r[c]))));

    if (chartType === 'scatter' && numericCols.length >= 2) {
      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          backgroundColor: '#0f172a',
          borderColor: '#334155',
          textStyle: { color: '#e2e8f0', fontSize: 12 },
          formatter: (p) => `${labelCol}: ${p.data[2] ?? ''}<br/>${numericCols[0]}: ${p.data[0]}<br/>${numericCols[1]}: ${p.data[1]}`,
        },
        grid: { left: 60, right: 30, top: 30, bottom: 50 },
        xAxis: {
          type: 'value',
          name: numericCols[0],
          nameTextStyle: { color: '#94a3b8', fontSize: 11 },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
          axisLine: { lineStyle: { color: '#1e293b' } },
          splitLine: { lineStyle: { color: '#162032', type: 'dashed' } },
        },
        yAxis: {
          type: 'value',
          name: numericCols[1],
          nameTextStyle: { color: '#94a3b8', fontSize: 11 },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
          axisLine: { lineStyle: { color: '#1e293b' } },
          splitLine: { lineStyle: { color: '#162032', type: 'dashed' } },
        },
        series: [{
          type: 'scatter',
          data: rows.map(r => [Number(r[numericCols[0]]) || 0, Number(r[numericCols[1]]) || 0, r[labelCol]]),
          symbolSize: Math.max(4, Math.min(12, 800 / Math.sqrt(rows.length))),
          itemStyle: { color: palette[0], opacity: 0.7 },
          emphasis: { itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 1 } },
          large: rows.length > 2000,
          largeThreshold: 2000,
        }],
      };
    }

    if (chartType === 'heatmap') {
      const xValues = [...new Set(rows.map(r => String(r[columns[0]])))].slice(0, 100);
      const yValues = numericCols.length > 1 ? [...new Set(rows.map(r => String(r[columns[1]])))] .slice(0, 50) : ['value'];
      const measureCol = numericCols[numericCols.length - 1] || columns[columns.length - 1];
      const values = rows.map(r => Number(r[measureCol]) || 0);
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);

      const heatData = rows.map(r => {
        const xi = xValues.indexOf(String(r[columns[0]]));
        const yi = yValues.length > 1 ? yValues.indexOf(String(r[columns[1]])) : 0;
        return [xi, yi, Number(r[measureCol]) || 0];
      }).filter(d => d[0] >= 0 && d[1] >= 0);

      return {
        backgroundColor: 'transparent',
        tooltip: { position: 'top', backgroundColor: '#0f172a', borderColor: '#334155', textStyle: { color: '#e2e8f0', fontSize: 12 } },
        grid: { left: 80, right: 30, top: 20, bottom: 60 },
        xAxis: { type: 'category', data: xValues, axisLabel: { color: '#94a3b8', fontSize: 10, rotate: xValues.length > 20 ? 45 : 0 }, axisLine: { lineStyle: { color: '#1e293b' } } },
        yAxis: { type: 'category', data: yValues, axisLabel: { color: '#94a3b8', fontSize: 10 }, axisLine: { lineStyle: { color: '#1e293b' } } },
        visualMap: { min: minVal, max: maxVal, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#162032', palette[0]] }, textStyle: { color: '#94a3b8' } },
        series: [{ type: 'heatmap', data: heatData, emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 1 } } }],
      };
    }

    // Fallback: bar chart in Canvas mode (for any other type with lots of data)
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', backgroundColor: '#0f172a', borderColor: '#334155', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      grid: { left: 60, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: rows.map(r => r[labelCol]), axisLabel: { color: '#94a3b8', fontSize: 10 }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#1e293b' } }, splitLine: { lineStyle: { color: '#162032', type: 'dashed' } } },
      series: numericCols.slice(0, 5).map((col, i) => ({
        type: 'bar',
        name: col,
        data: rows.map(r => Number(r[col]) || 0),
        itemStyle: { color: palette[i % palette.length] },
      })),
      legend: { textStyle: { color: '#9ca3af', fontSize: 11 }, bottom: 0 },
    };
  }, [columns, rows, chartType, formatting, palette]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 160 }}>
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: TOKENS.text.muted, fontSize: 12 }}>
          Loading chart engine...
        </div>
      }>
        <ReactECharts option={option} style={{ width: '100%', height: '100%' }} opts={{ renderer: 'canvas' }} notMerge={true} />
      </Suspense>
    </div>
  );
}
