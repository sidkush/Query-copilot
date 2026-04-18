// src/__fixtures__/operatorConsole/channels.ts
export interface OperatorChannel {
  id: string;
  code: string;       // "CH.1A"
  label: string;      // "MRR"
  value: string;      // "2.47M$"  — unit suffix required, small-caps via CSS
  delta: string;      // "+18.9%"
  deltaDir: 'up' | 'down' | 'flat';
  caption: string;    // micro secondary text, e.g. "vs 30d avg"
}

export const OPERATOR_CHANNELS: readonly OperatorChannel[] = [
  { id: 'ch1a', code: 'CH.1A', label: 'MRR',     value: '2.47M$', delta: '+18.9%', deltaDir: 'up',   caption: 'vs 30D avg' },
  { id: 'ch1b', code: 'CH.1B', label: 'ARR',     value: '29.6M$', delta: '+22.4%', deltaDir: 'up',   caption: 'run rate' },
  { id: 'ch1c', code: 'CH.1C', label: 'CHURN',   value: '2.31%',  delta: '+0.4pp', deltaDir: 'down', caption: 'rolling 30D' },
  { id: 'ch1d', code: 'CH.1D', label: 'PAYBACK', value: '14.2mo', delta: '−0.7mo', deltaDir: 'up',   caption: 'cohort blend' },
];
