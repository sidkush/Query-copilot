// src/__fixtures__/operatorConsole/revenueTrace.ts
export interface RevenueTick { t: number; mrr: number; }
export interface AnomalyRule { atTickIndex: number; label: string; }
export interface EventMarker { atTickIndex: number; label: string; delta: string; }

// 60 synthetic ticks — one per day over a 60-day operational band.
// Generator kept inline so the fixture is fully deterministic.
function makeTicks(): RevenueTick[] {
  const base = 2_180_000;
  const out: RevenueTick[] = [];
  for (let i = 0; i < 60; i++) {
    const trend = i * 5100;
    const wobble = Math.sin(i / 4.7) * 18_500;
    const spike  = i === 42 ? 120_000 : 0; // matches EVT marker below
    out.push({ t: i, mrr: base + trend + wobble + spike });
  }
  return out;
}

export const OPERATOR_REVENUE_TRACE: readonly RevenueTick[] = makeTicks();

export const OPERATOR_ANOMALY_RULE: AnomalyRule = {
  atTickIndex: 42,
  label: 'ANOMALY · +5.3σ',
};

export const OPERATOR_EVENT_MARKER: EventMarker = {
  atTickIndex: 42,
  label: 'EVT ▲ Beta-Axion',
  delta: '+$120K',
};
