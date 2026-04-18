// src/__fixtures__/boardPack/kpis.ts
export interface BoardPackKpi {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaDir: 'up' | 'down' | 'flat';
}

export const BOARD_PACK_KPIS: readonly BoardPackKpi[] = [
  { id: 'mrr',     label: 'MRR',        value: '$2.94M', delta: '+18.9%', deltaDir: 'up' },
  { id: 'arr',     label: 'ARR',        value: '$35.3M', delta: '+22.4%', deltaDir: 'up' },
  { id: 'churn',   label: 'Net Churn',  value: '2.1%',   delta: '+0.4pp', deltaDir: 'down' },
  { id: 'ltvcac',  label: 'LTV : CAC',  value: '4.8x',   delta: '+0.3x',  deltaDir: 'up' },
  { id: 'payback', label: 'Payback',    value: '11.2mo', delta: '−0.7mo', deltaDir: 'up' },
];
