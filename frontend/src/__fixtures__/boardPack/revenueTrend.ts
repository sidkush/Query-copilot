export interface MonthlyRevenuePoint { month: string; mrr: number; forecast?: boolean; }

export const BOARD_PACK_REVENUE_TREND: readonly MonthlyRevenuePoint[] = [
  { month: '2025-10', mrr: 1_910_000 },
  { month: '2025-11', mrr: 1_988_000 },
  { month: '2025-12', mrr: 2_075_000 },
  { month: '2026-01', mrr: 2_120_000 },
  { month: '2026-02', mrr: 2_174_000 },
  { month: '2026-03', mrr: 2_240_000 },
  { month: '2026-04', mrr: 2_316_000 },
  { month: '2026-05', mrr: 2_402_000 },
  { month: '2026-06', mrr: 2_460_000 },
  { month: '2026-07', mrr: 2_602_000 },
  { month: '2026-08', mrr: 2_748_000 },
  { month: '2026-09', mrr: 2_938_000 },
  { month: '2026-10', mrr: 3_120_000, forecast: true },
  { month: '2026-11', mrr: 3_315_000, forecast: true },
];
