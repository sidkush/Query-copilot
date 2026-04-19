// EditorialBriefLayout - Plan A* Phase 6 (Wave 2-EB)
// TSS Wave 2-B - literals now route through <Slot> wrappers. Magazine
// typography + drop-cap + amber accents preserved verbatim via the
// fallback branches; bound values flow through the sanitiser in
// NarrativeSlot.

import './EditorialBriefLayout.css';
import './slots.css';
import Slot from './Slot.jsx';
import { renderNarrativeMarkdown } from './NarrativeSlot.jsx';

const PRESET_ID = 'editorial-brief';

const TOP_STATS = [
  ['ARR', '$29.6M', '+8.7%'],
  ['NRR', '117%', '+3pp'],
  ['Churn', '2.31%', '\u22120.4pp'],
  ['LTV:CAC', '4.7\u00d7', '+0.3'],
  ['Payback', '14.2mo', '+0.8'],
  ['New Logos', '47', null],
];

const KPI_META = [
  { slotId: 'eb.kpi-0', label: 'MRR' },
  { slotId: 'eb.kpi-1', label: 'ARR' },
  { slotId: 'eb.kpi-2', label: 'Gross Churn' },
  { slotId: 'eb.kpi-3', label: 'LTV : CAC' },
];

const DEFAULT_KPI_SUBS = {
  'eb.kpi-0': '\u25b2 vs $2.20M prior',
  'eb.kpi-1': '\u25b2 vs $27.2M prior',
  'eb.kpi-2': '\u25bc vs 2.72% prior',
  'eb.kpi-3': '\u25b2 vs 4.4\u00d7 prior',
};

const MRR_SERIES = [
  { month: 'Aug', value: 1.86 },
  { month: 'Sep', value: 1.92 },
  { month: 'Oct', value: 1.98 },
  { month: 'Nov', value: 2.06 },
  { month: 'Dec', value: 2.14 },
  { month: 'Jan', value: 2.20 },
  { month: 'Feb', value: 2.19 },
  { month: 'Mar', value: 2.27 },
  { month: 'Apr', value: 2.33 },
  { month: 'May', value: 2.40 },
  { month: 'Jun', value: 2.46 },
  { month: 'Jul', value: 2.47 },
];
const FORECAST_SERIES = [
  { month: 'Jul', value: 2.47 },
  { month: 'Aug', value: 2.55 },
  { month: 'Sep', value: 2.63 },
  { month: 'Oct', value: 2.72 },
];

const EVENT_MARKERS = [
  { month: 'Jan', value: 2.20, label: 'Acme renewal +$48K', side: 'above' },
  { month: 'Jul', value: 2.47, label: 'Beta-Axion expansion +$120K', side: 'above' },
];

const DEFAULT_TOP_ACCOUNTS = [
  { rank: '01', name: 'Amberline Logistics', mrr: '$124,800', delta: '+18%', neg: false },
  { rank: '02', name: 'Northfield Biotech', mrr: '$108,400', delta: '+11%', neg: false },
  { rank: '03', name: 'Waverly Capital', mrr: '$96,200', delta: '\u22124%', neg: true },
  { rank: '04', name: 'Kestrel Aerospace', mrr: '$88,700', delta: '+22%', neg: false },
  { rank: '05', name: 'Ordinance Retail Co', mrr: '$72,100', delta: '+6%', neg: false },
  { rank: '06', name: 'Thornton Medical', mrr: '$64,900', delta: '\u22121%', neg: true },
  { rank: '07', name: 'Sable Investment Trust', mrr: '$58,300', delta: '+14%', neg: false },
  { rank: '08', name: 'Quill Typography Ltd', mrr: '$51,700', delta: '+2%', neg: false },
];

const CHURN_BINS = [
  { range: '0',   count: 142, accent: false },
  { range: '10',  count: 168, accent: false },
  { range: '20',  count: 157, accent: false },
  { range: '30',  count: 121, accent: false },
  { range: '40',  count: 86,  accent: false },
  { range: '50',  count: 58,  accent: false },
  { range: '60',  count: 42,  accent: false },
  { range: '70',  count: 28,  accent: false },
  { range: '80',  count: 18,  accent: false },
  { range: '85',  count: 11,  accent: true },
  { range: '90',  count: 7,   accent: true },
  { range: '95+', count: 4,   accent: true },
];

const CHART_W = 640;
const CHART_H = 260;
const CHART_PAD = { top: 20, right: 24, bottom: 28, left: 48 };
const Y_MIN = 1.5;
const Y_MAX = 3.0;
const Y_TICKS = [3.0, 2.5, 2.0, 1.5];

function xFor(index, total) {
  const inner = CHART_W - CHART_PAD.left - CHART_PAD.right;
  return CHART_PAD.left + (inner * index) / Math.max(1, total - 1);
}
function yFor(value) {
  const inner = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  return CHART_PAD.top + inner * (1 - (value - Y_MIN) / (Y_MAX - Y_MIN));
}

function linePath(points) {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

const totalPoints = MRR_SERIES.length + FORECAST_SERIES.length - 1;
const solidPts = MRR_SERIES.map((m, i) => ({ x: xFor(i, totalPoints), y: yFor(m.value) }));
const forecastPts = FORECAST_SERIES.map((m, i) => ({
  x: xFor(MRR_SERIES.length - 1 + i, totalPoints),
  y: yFor(m.value),
}));
const eventPts = EVENT_MARKERS.map((e) => {
  const idx = MRR_SERIES.findIndex((m) => m.month === e.month);
  return {
    x: xFor(idx, totalPoints),
    y: yFor(e.value),
    label: e.label,
    side: e.side,
  };
});

const X_MONTHS = MRR_SERIES.map((m) => m.month);
const HIST_MAX = Math.max(...CHURN_BINS.map((b) => b.count));

function htmlPayload(markdown) {
  return { __html: renderNarrativeMarkdown(markdown) };
}

function KpiBox({ meta, slotProps }) {
  return (
    <Slot id={meta.slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value, state }) => {
        const fb = state === 'fallback' || state === 'loading'
          ? /** @type {{ value?: string, delta?: string }} */ (value)
          : null;
        const bound = state === 'bound' && value && typeof value === 'object' ? value : null;
        const displayValue = bound?.value ?? fb?.value ?? '';
        const delta = bound?.delta ?? fb?.delta ?? '';
        const deltaNeg = delta.startsWith('\u2212') || delta.startsWith('-');
        const sub = DEFAULT_KPI_SUBS[meta.slotId] ?? '';
        return (
          <div
            className="eb-kpi-box"
            style={{ border: '1px solid #d4cdbf', borderRadius: 2 }}
          >
            <div className="eb-kpi-box__head">
              <span className="eb-kpi-box__label">{meta.label}</span>
              <span
                className={
                  'eb-kpi-box__delta' + (deltaNeg ? ' eb-kpi-box__delta--neg' : '')
                }
              >
                {delta}
              </span>
            </div>
            <div className="eb-kpi-box__value">{displayValue}</div>
            <div className="eb-kpi-box__sub">{sub}</div>
          </div>
        );
      }}
    </Slot>
  );
}

export default function EditorialBriefLayout({
  bindings,
  tileData,
  onSlotEdit,
  editable = true,
  // eslint-disable-next-line no-unused-vars
  tiles: _tiles,
  // eslint-disable-next-line no-unused-vars
  dashboardId: _dashboardId,
  // eslint-disable-next-line no-unused-vars
  dashboardName: _dashboardName,
} = {}) {
  const slotProps = { bindings, tileData, onEdit: onSlotEdit, editable };

  return (
    <div
      className="eb-layout"
      data-testid="layout-editorial-brief"
      data-preset="editorial-brief"
      style={{
        backgroundColor: '#f4efe4',
        color: '#181613',
      }}
    >
      <header className="eb-topbar">
        <span className="eb-topbar__brand">
          <span className="eb-topbar__glyph" aria-hidden="true" />
          AskDB &middot; Q3 Review
        </span>
        <span className="eb-topbar__stats">
          {TOP_STATS.map(([label, value, delta], i) => (
            <span key={label} className="eb-topbar__stat">
              {label} <b>{value}</b>
              {delta ? ` ${delta}` : ''}
              {i < TOP_STATS.length - 1 ? (
                <span className="eb-topbar__stat-sep"> &middot; </span>
              ) : null}
            </span>
          ))}
        </span>
        <span className="eb-topbar__meta">17 Apr 2026 &middot; 09:42:14 UTC &middot; v2.8.1</span>
      </header>

      <div className="eb-kicker">Q3 2026 &middot; Board Pack</div>

      <article className="eb-masthead">
        <div className="eb-masthead__left">
          <Slot id="eb.headline-topic" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              if (state === 'fallback' || typeof value !== 'string' || value.length === 0) {
                return (
                  <h1 className="eb-headline">
                    The Quarter <em className="eb-italic-accent">Was Made</em> in July
                  </h1>
                );
              }
              return <h1 className="eb-headline">{value}</h1>;
            }}
          </Slot>
          <Slot id="eb.byline" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              if (state === 'fallback' || typeof value !== 'string' || value.length === 0) {
                return (
                  <p className="eb-byline">
                    by <b>M. Chen, CFO</b> &middot; reviewed by <b>D. Park</b> &middot; last refresh 02:14 UTC
                  </p>
                );
              }
              return <p className="eb-byline">{value}</p>;
            }}
          </Slot>
        </div>
        <Slot id="eb.summary" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            if (state === 'fallback' || typeof value !== 'string' || value.length === 0) {
              return (
                <p className="eb-summary">
                  Revenue <b className="eb-accent">$2.47M MRR</b> (+12.4% QoQ) driven by three
                  enterprise expansions in wk 27. Net revenue retention at{' '}
                  <b className="eb-accent">117%</b>, up from 114%. Gross margin held at{' '}
                  <b className="eb-accent">78.1%</b> despite infra expansion.
                  <br />
                  <br />
                  Risk: three accounts at &gt;85% churn-risk score together represent{' '}
                  <b className="eb-accent">$340K MRR</b> &mdash; noted in Risk section below.
                </p>
              );
            }
            // eslint-disable-next-line react/no-danger
            return <p className="eb-summary" dangerouslySetInnerHTML={htmlPayload(value)} />;
          }}
        </Slot>
      </article>

      <section className="eb-kpis">
        {KPI_META.map((m) => (
          <KpiBox key={m.slotId} meta={m} slotProps={slotProps} />
        ))}
      </section>

      <div className="eb-main">
        <Slot id="eb.trend" presetId={PRESET_ID} {...slotProps}>
          {() => (
            <figure className="eb-panel eb-chart" data-testid="editorial-brief-chart">
              <figcaption className="eb-panel__meta">
                <span>Revenue &middot; 12-Month Trace</span>
                <span>MRR &amp; Forecast &middot; Monthly</span>
              </figcaption>
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="12-month MRR trace with forecast"
              >
                {Y_TICKS.map((tick) => {
                  const y = yFor(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={CHART_PAD.left}
                        x2={CHART_W - CHART_PAD.right}
                        y1={y}
                        y2={y}
                        className="eb-axis-line"
                        strokeDasharray="2 3"
                        opacity="0.5"
                      />
                      <text
                        x={CHART_PAD.left - 8}
                        y={y + 3}
                        textAnchor="end"
                        className="eb-axis-tick"
                      >
                        {`$${tick.toFixed(1)}M`}
                      </text>
                    </g>
                  );
                })}
                <line
                  x1={CHART_PAD.left}
                  x2={CHART_W - CHART_PAD.right}
                  y1={CHART_H - CHART_PAD.bottom}
                  y2={CHART_H - CHART_PAD.bottom}
                  className="eb-axis-line"
                />
                {X_MONTHS.map((m, i) => (
                  <text
                    key={m}
                    x={xFor(i, totalPoints)}
                    y={CHART_H - CHART_PAD.bottom + 16}
                    textAnchor="middle"
                    className="eb-axis-tick"
                  >
                    {m}
                  </text>
                ))}
                <path d={linePath(solidPts)} className="eb-line" />
                <path d={linePath(forecastPts)} className="eb-line--forecast" />
                {eventPts.map((e) => (
                  <g key={e.label}>
                    <circle cx={e.x} cy={e.y} r="4.5" className="eb-event-dot" />
                    <text
                      x={e.x + 8}
                      y={e.y - 10}
                      className="eb-event-label"
                      textAnchor="start"
                    >
                      {e.label}
                    </text>
                  </g>
                ))}
              </svg>
            </figure>
          )}
        </Slot>

        <Slot id="eb.accounts" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            const rows =
              state === 'bound' && value && typeof value === 'object' && 'rows' in value
                ? value.rows
                : null;
            const display = rows && rows.length
              ? rows.slice(0, 8).map((r, i) => ({
                  rank: String(i + 1).padStart(2, '0'),
                  name: String(r.name ?? r.entity ?? `Row ${i + 1}`),
                  mrr: String(r.mrr ?? r.value ?? ''),
                  delta: String(r.delta ?? ''),
                  neg: !!r.neg || String(r.delta ?? '').startsWith('\u2212'),
                }))
              : DEFAULT_TOP_ACCOUNTS;
            return (
              <section className="eb-panel eb-accounts">
                <header className="eb-panel__meta">
                  <span>Top Accounts by MRR</span>
                  <span>Top 8 &middot; Q3</span>
                </header>
                <table className="eb-accounts__table">
                  <thead>
                    <tr>
                      <th className="eb-accounts__rank">#</th>
                      <th>Account</th>
                      <th className="eb-num">MRR</th>
                      <th className="eb-num">&Delta; QoQ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {display.map((a) => (
                      <tr key={a.rank}>
                        <td className="eb-accounts__rank">{a.rank}</td>
                        <td>{a.name}</td>
                        <td className="eb-num">{a.mrr}</td>
                        <td
                          className={
                            'eb-num ' +
                            (a.neg ? 'eb-accounts__delta--neg' : 'eb-accounts__delta--pos')
                          }
                        >
                          {a.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          }}
        </Slot>
      </div>

      <div className="eb-lower">
        <Slot id="eb.histogram" presetId={PRESET_ID} {...slotProps}>
          {() => (
            <section className="eb-panel eb-churn-hist">
              <header className="eb-panel__meta">
                <span>Churn Risk Distribution</span>
                <span>N=842 Active Accounts</span>
              </header>
              <div className="eb-hist" role="img" aria-label="Churn-risk-score distribution, 12 bins">
                {CHURN_BINS.map((bin) => (
                  <div
                    key={bin.range}
                    className={'eb-hist__bar' + (bin.accent ? ' eb-hist__bar--accent' : '')}
                    style={{ height: `${(bin.count / HIST_MAX) * 100}%` }}
                    title={`${bin.range}: ${bin.count}`}
                  />
                ))}
              </div>
              <div className="eb-hist__axis">
                {['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '95+'].map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </section>
          )}
        </Slot>

        <Slot id="eb.commentary" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => (
            <section
              className="eb-panel eb-commentary"
              data-testid="editorial-brief-commentary"
            >
              <header className="eb-panel__meta">
                <span>Analyst Commentary</span>
                <span className="eb-panel__meta--accent">AI-Drafted &middot; Reviewed</span>
              </header>
              <div className="eb-commentary__body">
                {state === 'fallback' || typeof value !== 'string' || value.length === 0 ? (
                  <>
                    <p className="eb-dropcap-para">
                      <span className="eb-dropcap">T</span>
                      hree enterprise expansions in July (Acme, Beta-Axion, and Amberline)
                      together added <b className="eb-accent">$290K</b> to MRR, accounting
                      for ~61% of the quarter&#39;s net new. The remaining growth came from 47
                      new logos weighted toward mid-market &mdash; encouraging on top-of-funnel
                      but the per-account contribution stayed modest at{' '}
                      <b className="eb-accent">$4.1K</b> ACV.
                    </p>
                    <p>
                      Churn improved to <b className="eb-accent">2.31%</b>, a 41-basis-point
                      improvement driven by the success-team reorganisation in April.
                      However, two enterprise renewals in Q4 carry elevated risk: Waverly
                      Capital&#39;s usage has flat-lined for 6 weeks, and Thornton Medical&#39;s
                      adoption score dropped below 40 after a leadership change.
                    </p>
                    <p className="eb-recommended">
                      Recommended Next: 1. Schedule QBR with Waverly before Oct 15 &middot; 2.
                      Assign AE to Thornton succession plan &middot; 3. Revisit pricing for
                      mid-market bucket (slope suggests headroom)
                    </p>
                  </>
                ) : (
                  // eslint-disable-next-line react/no-danger
                  <div dangerouslySetInnerHTML={htmlPayload(value)} />
                )}
              </div>
            </section>
          )}
        </Slot>
      </div>

      <footer className="eb-footer">
        <span className="eb-footer__left">
          <span className="eb-footer__dot" aria-hidden="true" />
          Live &middot; Warehouse OK &middot; Tier 1 &middot; 2.3s Refresh
        </span>
        <span className="eb-footer__center">
          bigquery://prod.finance_reports &middot; q3_review_v12 &middot; last-mod 09:42z
        </span>
        <span className="eb-footer__right">Render 128ms &middot; Cache 94%</span>
      </footer>
    </div>
  );
}
