// Typed-Seeking-Spring Phase 1 — slot registry for themed preset layouts.
//
// Each themed preset (Board Pack / Operator Console / Signal / Editorial
// Brief) declares the named regions its bespoke JSX can accept a data
// binding for. The autogen orchestrator walks this registry per-preset
// to fill bindings; the Slot.jsx wrapper reads it at render time to
// know how to format an unbound slot's fallback and what kind of
// popover to open on edit.
//
// Analyst Pro intentionally has no slot manifest — its autogen reuses
// the existing DASHBOARD_PROMPT + create_dashboard_tile freeform flow
// instead of a fixed slot contract.

export type SlotKind = 'kpi' | 'chart' | 'table' | 'narrative';

export type SlotChartType =
  | 'line'
  | 'bar'
  | 'area'
  | 'stream'
  | 'histogram'
  | 'stacked-area';

export type SlotSemanticType = 'quantitative' | 'temporal' | 'nominal';

export interface SlotDescriptor {
  id: string;
  kind: SlotKind;
  label: string;
  /** Fed into the LLM autogen prompt — describes *what this slot is
   *  for* so the model picks the right field. */
  hint: string;
  /** Rendered by the layout when no binding is attached (wireframe
   *  fallback). Shape depends on kind: KPIs → { value, delta }, tables
   *  → rows array, narrative → markdown string, etc. */
  fallback: unknown;
  chartType?: SlotChartType;
  accept?: SlotSemanticType[];
}

export type PresetId =
  | 'analyst-pro'
  | 'board-pack'
  | 'operator-console'
  | 'signal'
  | 'editorial-brief';

// ──────────────────────────────────────────────────────────────────
// Board Pack (cream editorial tearsheet, wireframe 1)
// ──────────────────────────────────────────────────────────────────
const BOARD_PACK_SLOTS: SlotDescriptor[] = [
  {
    id: 'bp.hero-number',
    kind: 'kpi',
    label: 'Hero number',
    hint: 'Primary headline KPI. A single dominant metric with a sign-aware delta (e.g. net new MRR for the quarter).',
    fallback: { value: '+$478K', delta: null },
    accept: ['quantitative'],
  },
  {
    id: 'bp.hero-narrative',
    kind: 'narrative',
    label: 'Hero narrative',
    hint: 'Two or three sentences explaining the hero number. Use {bp.hero-number}, {bp.accounts-list}, {bp.kpi-0} etc. as variables. End with a `Watch:` call-out for the primary risk.',
    fallback: 'Three enterprise expansions in July together added $290K MRR — 61% of net new. Mid-market added 47 logos. Watch: enterprise Q4 pipe at 2.1× coverage.',
  },
  { id: 'bp.kpi-0', kind: 'kpi', label: 'KPI 1 (MRR)', hint: 'Monthly recurring revenue — SUM of primary revenue metric over the current month.', fallback: { value: '$2.47M', delta: '+12.4%' }, accept: ['quantitative'] },
  { id: 'bp.kpi-1', kind: 'kpi', label: 'KPI 2 (ARR)', hint: 'Annual recurring revenue — SUM of revenue metric over the last 12 months.', fallback: { value: '$29.6M', delta: '+8.7%' }, accept: ['quantitative'] },
  { id: 'bp.kpi-2', kind: 'kpi', label: 'KPI 3 (Churn)', hint: 'A churn or attrition metric rendered as a percent. Lower = better; delta in pp.', fallback: { value: '2.31%', delta: '−0.4pp' }, accept: ['quantitative'] },
  { id: 'bp.kpi-3', kind: 'kpi', label: 'KPI 4 (LTV:CAC)', hint: 'A ratio metric (LTV/CAC, or any ratio you want on this row). Render with `×` suffix.', fallback: { value: '4.7×', delta: '+0.3' }, accept: ['quantitative'] },
  { id: 'bp.kpi-4', kind: 'kpi', label: 'KPI 5 (Payback)', hint: 'A duration metric (months to payback or similar). Red delta when direction is unfavourable.', fallback: { value: '14.2mo', delta: '+0.8' }, accept: ['quantitative'] },
  {
    id: 'bp.trend-chart',
    kind: 'chart',
    label: 'Revenue trend',
    hint: '12-month line trend of the revenue metric with a forecast tail. One event dot in-series + one at the latest actual point.',
    fallback: { series: 'wireframe' },
    chartType: 'line',
    accept: ['temporal', 'quantitative'],
  },
  {
    id: 'bp.accounts-list',
    kind: 'table',
    label: 'Top accounts',
    hint: 'Top 5 accounts (entity_name) ordered by primary revenue metric desc. Show name, value, and delta-vs-prior.',
    fallback: { rows: 'wireframe' },
    accept: ['nominal', 'quantitative'],
  },
  { id: 'bp.strip-churn', kind: 'chart', label: 'Churn distribution', hint: 'Risk-score histogram across the account base, with red bars for the top risk bucket.', fallback: { bins: 'wireframe' }, chartType: 'histogram', accept: ['quantitative'] },
  { id: 'bp.strip-cohort', kind: 'chart', label: 'Cohort retention', hint: 'Monthly retention strip for the most recent cohort.', fallback: { bins: 'wireframe' }, chartType: 'bar', accept: ['temporal', 'quantitative'] },
  {
    id: 'bp.strip-insight',
    kind: 'narrative',
    label: 'Bottom-strip insight',
    hint: 'One-paragraph business insight tying the trend + accounts list + churn histogram. End with a recommended next action.',
    fallback: 'Pipeline coverage 2.1× below target 3.0×. Accelerate Acme tier-up + 2 mid-market upsells to hit Q4 expansion plan. Recommend QBR scheduled for Waverly before Oct 15.',
  },
];

// ──────────────────────────────────────────────────────────────────
// Operator Console (CRT phosphor, wireframe 2)
// ──────────────────────────────────────────────────────────────────
const OPERATOR_CONSOLE_SLOTS: SlotDescriptor[] = [
  { id: 'oc.ch1a', kind: 'kpi', label: 'CH.1A — MRR channel', hint: 'Primary revenue metric rendered with unit suffix (M$, K, etc.).', fallback: { value: '2.47', unit: 'M$', delta: '+12.4%', footer: 'nom' }, accept: ['quantitative'] },
  { id: 'oc.ch1b', kind: 'kpi', label: 'CH.1B — ARR channel', hint: 'Annualised revenue metric.', fallback: { value: '29.6', unit: 'M$', delta: '+8.7%', footer: 'nom' }, accept: ['quantitative'] },
  { id: 'oc.ch1c', kind: 'kpi', label: 'CH.1C — Churn channel', hint: 'Percent churn / attrition. Negative deltas render amber.', fallback: { value: '2.31', unit: '%', delta: '−0.4pp', footer: 'nom' }, accept: ['quantitative'] },
  { id: 'oc.ch1d', kind: 'kpi', label: 'CH.1D — Payback channel', hint: 'A time-to-recovery metric (months). WATCH footer when regressing.', fallback: { value: '14.2', unit: 'mo', delta: '+0.8mo', footer: 'WATCH' }, accept: ['quantitative'] },
  { id: 'oc.trace', kind: 'chart', label: 'CH.2 — Revenue trace', hint: '12-month phosphor-green trace of the revenue metric. Pass timeGrain=day/week if available for smooth line.', fallback: { series: 'wireframe' }, chartType: 'line', accept: ['temporal', 'quantitative'] },
  { id: 'oc.trace-anomaly-callout', kind: 'narrative', label: 'Anomaly callout', hint: 'Short red-framed callout tied to the largest week-over-week change in the trace. Three lines: "ANOMALY · T+<delta>", the sigma value, and a correlation hint.', fallback: 'ANOMALY · T+498\nΔSlope 2.3σ above baseline\ncorr: acme_renewal · 0.89' },
  { id: 'oc.histogram', kind: 'chart', label: 'CH.3 — Risk histogram', hint: 'Gradient-green histogram over the 0–95+ risk-score range; top bins render red.', fallback: { bins: 'wireframe' }, chartType: 'histogram', accept: ['quantitative'] },
  {
    id: 'oc.event-log',
    kind: 'table',
    label: 'CH.4 — Event log',
    hint: 'Last 8 material events (account expansions, churn warnings, pipeline anomalies). Each row must carry one of OK / WARN / ERR.',
    fallback: { rows: 'wireframe' },
    accept: ['temporal', 'nominal'],
  },
];

// ──────────────────────────────────────────────────────────────────
// Signal (modern dark SaaS, wireframe 3)
// ──────────────────────────────────────────────────────────────────
const SIGNAL_SLOTS: SlotDescriptor[] = [
  { id: 'sg.kpi-0', kind: 'kpi', label: 'KPI 1 (MRR, teal)', hint: 'Primary MRR metric with a teal sparkline tracing the last 12 periods.', fallback: { value: '$2.47M', delta: '+12.3%', spark: 'growth' }, accept: ['temporal', 'quantitative'] },
  { id: 'sg.kpi-1', kind: 'kpi', label: 'KPI 2 (ARR, orange)', hint: 'Annualised revenue metric with an orange sparkline.', fallback: { value: '$29.6M', delta: '+8.7%', spark: 'accel' }, accept: ['temporal', 'quantitative'] },
  { id: 'sg.kpi-2', kind: 'kpi', label: 'KPI 3 (Churn, rose)', hint: 'Churn percent; rose sparkline; red delta pill.', fallback: { value: '2.31%', delta: '−0.4pp', spark: 'dip' }, accept: ['temporal', 'quantitative'] },
  { id: 'sg.kpi-3', kind: 'kpi', label: 'KPI 4 (LTV:CAC, indigo)', hint: 'A ratio metric with an indigo sparkline.', fallback: { value: '4.7×', delta: '+0.3', spark: 'wedge' }, accept: ['temporal', 'quantitative'] },
  { id: 'sg.stream-chart', kind: 'chart', label: 'Revenue composition stream', hint: 'Stacked-area chart of revenue broken down by primary dimension (segment/plan/region). 12 months, daily-to-monthly grain as fits.', fallback: { series: 'wireframe' }, chartType: 'stacked-area', accept: ['temporal', 'quantitative', 'nominal'] },
  { id: 'sg.signal-card', kind: 'narrative', label: 'Signal Detected card', hint: "A 'SIGNAL DETECTED · <minutes> AGO' card highlighting the single most notable change across the dashboard. Two sentences + a teal recommendation.", fallback: 'Enterprise expansion is concentrated in three accounts. Amberline, Beta-Axion, and Northfield together added $290K MRR — 61% of net new. Pipeline coverage for Q4 enterprise is 2.1× (target 3×). Consider accelerating two mid-market conversions.' },
  { id: 'sg.accounts', kind: 'table', label: 'Top accounts', hint: 'Top 5 accounts by primary revenue metric. Each row has rank, entity name, industry/segment subtitle, and value.', fallback: { rows: 'wireframe' }, accept: ['nominal', 'quantitative'] },
];

// ──────────────────────────────────────────────────────────────────
// Editorial Brief (magazine cream, wireframe 4)
// ──────────────────────────────────────────────────────────────────
const EDITORIAL_BRIEF_SLOTS: SlotDescriptor[] = [
  { id: 'eb.headline-topic', kind: 'narrative', label: 'Article headline', hint: 'A quarter-summary headline in the magazine voice. Format: "The Quarter [italic amber phrase] in [Month]". Italic phrase must reference the quarter\'s dominant story (expansion / retention / acquisition).', fallback: 'The Quarter Was Made in July' },
  { id: 'eb.byline', kind: 'narrative', label: 'Byline', hint: 'Author + reviewer line with a last-refresh timestamp.', fallback: 'by M. Chen, CFO · reviewed by D. Park · last refresh 02:14 UTC' },
  { id: 'eb.summary', kind: 'narrative', label: 'Summary paragraph', hint: 'Two short paragraphs. First summarises revenue + NRR + GM. Second flags risk accounts with amber highlights on every figure.', fallback: 'Revenue $2.47M MRR (+12.4% QoQ) driven by three enterprise expansions in wk 27. Net revenue retention at 117%, up from 114%. Gross margin held at 78.1% despite infra expansion.\n\nRisk: three accounts at >85% churn-risk score together represent $340K MRR — noted in Risk section below.' },
  { id: 'eb.kpi-0', kind: 'kpi', label: 'KPI 1 (MRR)', hint: 'Primary revenue metric, large serif numeral.', fallback: { value: '$2.47M', delta: '+12.4%' }, accept: ['quantitative'] },
  { id: 'eb.kpi-1', kind: 'kpi', label: 'KPI 2 (ARR)', hint: 'Annualised revenue.', fallback: { value: '$29.6M', delta: '+8.7%' }, accept: ['quantitative'] },
  { id: 'eb.kpi-2', kind: 'kpi', label: 'KPI 3 (Gross churn)', hint: 'Gross churn percent.', fallback: { value: '2.31%', delta: '−0.4pp' }, accept: ['quantitative'] },
  { id: 'eb.kpi-3', kind: 'kpi', label: 'KPI 4 (LTV:CAC)', hint: 'Ratio metric.', fallback: { value: '4.7×', delta: '+0.3' }, accept: ['quantitative'] },
  { id: 'eb.trend', kind: 'chart', label: 'Revenue 12-month trace', hint: 'Line chart with amber event markers on the two most notable month-over-month changes + a dashed forecast tail.', fallback: { series: 'wireframe' }, chartType: 'line', accept: ['temporal', 'quantitative'] },
  { id: 'eb.accounts', kind: 'table', label: 'Top accounts table', hint: 'Top 8 accounts by revenue with # / name / MRR / Δ QoQ columns.', fallback: { rows: 'wireframe' }, accept: ['nominal', 'quantitative'] },
  { id: 'eb.histogram', kind: 'chart', label: 'Churn risk distribution', hint: 'Near-black histogram across account churn-risk bins, with amber bars on the high-risk tail (85+/90+/95+).', fallback: { bins: 'wireframe' }, chartType: 'histogram', accept: ['quantitative'] },
  {
    id: 'eb.commentary',
    kind: 'narrative',
    label: 'Analyst commentary',
    hint: 'Two magazine-voice paragraphs. First paragraph starts with a drop-cap letter and covers the quarter\'s expansion story with amber inline highlights on figures. Second paragraph covers risk. Close with a small-caps "RECOMMENDED NEXT:" line listing 3 next actions.',
    fallback: 'Three enterprise expansions in July (Acme, Beta-Axion, and Amberline) together added $290K to MRR, accounting for ~61% of the quarter\'s net new. The remaining growth came from 47 new logos weighted toward mid-market — encouraging on top-of-funnel but the per-account contribution stayed modest at $4.1K ACV.\n\nChurn improved to 2.31%, a 41-basis-point improvement driven by the success-team reorganisation in April. However, two enterprise renewals in Q4 carry elevated risk: Waverly Capital\'s usage has flat-lined for 6 weeks, and Thornton Medical\'s adoption score dropped below 40 after a leadership change.\n\nRECOMMENDED NEXT: 1. Schedule QBR with Waverly before Oct 15 · 2. Assign AE to Thornton succession plan · 3. Revisit pricing for mid-market bucket (slope suggests headroom)',
  },
];

// ──────────────────────────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────────────────────────
export const PRESET_SLOTS: Record<PresetId, SlotDescriptor[]> = {
  'analyst-pro': [],
  'board-pack': BOARD_PACK_SLOTS,
  'operator-console': OPERATOR_CONSOLE_SLOTS,
  'signal': SIGNAL_SLOTS,
  'editorial-brief': EDITORIAL_BRIEF_SLOTS,
};

export function getSlotsForPreset(presetId: string): SlotDescriptor[] {
  return PRESET_SLOTS[presetId as PresetId] ?? [];
}

export function getSlotDescriptor(presetId: string, slotId: string): SlotDescriptor | undefined {
  return getSlotsForPreset(presetId).find((s) => s.id === slotId);
}
