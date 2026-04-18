// src/__fixtures__/operatorConsole/churnBins.ts
export interface ChurnBin { bin: string; count: number; gradientStop: number; }

// gradientStop ∈ [0, 1]: 0 = pure phosphor green, 1 = CRT red.
export const OPERATOR_CHURN_BINS: readonly ChurnBin[] = [
  { bin: '0-15',   count:  3, gradientStop: 0.00 },
  { bin: '16-30',  count:  7, gradientStop: 0.17 },
  { bin: '31-45',  count: 14, gradientStop: 0.34 },
  { bin: '46-60',  count: 22, gradientStop: 0.50 },
  { bin: '61-75',  count: 18, gradientStop: 0.67 },
  { bin: '76-90',  count:  9, gradientStop: 0.83 },
  { bin: '91+',    count:  4, gradientStop: 1.00 },
];
