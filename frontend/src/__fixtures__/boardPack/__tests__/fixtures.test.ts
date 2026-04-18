import { describe, it, expect } from 'vitest';
import { BOARD_PACK_KPIS } from '../kpis';
import { BOARD_PACK_REVENUE_TREND } from '../revenueTrend';
import { BOARD_PACK_TOP_ACCOUNTS } from '../topAccounts';
import { BOARD_PACK_CHURN_BINS } from '../churnDist';
import { BOARD_PACK_COHORTS } from '../cohortRetention';

describe('Board Pack fixtures', () => {
  it('has exactly 5 KPI rows matching the hero design', () => {
    expect(BOARD_PACK_KPIS).toHaveLength(5);
    expect(BOARD_PACK_KPIS.map(k => k.id))
      .toEqual(['mrr', 'arr', 'churn', 'ltvcac', 'payback']);
  });
  it('Q3 2026 net-new MRR equals the +$478K hero number', () => {
    const q3Start = BOARD_PACK_REVENUE_TREND.find(p => p.month === '2026-06')!.mrr;
    const q3End   = BOARD_PACK_REVENUE_TREND.find(p => p.month === '2026-09')!.mrr;
    expect(q3End - q3Start).toBe(478_000);
  });
  it('top accounts share sum is approximately 41%', () => {
    const sum = BOARD_PACK_TOP_ACCOUNTS
      .map(a => parseFloat(a.shareOfMrr))
      .reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThanOrEqual(40.5);
    expect(sum).toBeLessThanOrEqual(41.5);
  });
  it('churn bins + cohort retention both non-empty', () => {
    expect(BOARD_PACK_CHURN_BINS.length).toBeGreaterThan(0);
    expect(BOARD_PACK_COHORTS.length).toBeGreaterThan(0);
  });
});
