// Plan A★ Phase 3 / Wave 2-BP — BoardPackLayout (cream tearsheet, wireframe 1).
//
// Bespoke React component that renders the Board Pack preset verbatim per
// wireframe 1. Region contract:
//   - Top bar           (AskDB logo, centered kicker, LIVE dot)
//   - Hero split 50/50  (+$478K display + narrative | 5-row KPI list)
//   - Mid split 70/30   (revenue trend figure | top-accounts aside)
//   - Bottom strip 3-up (churn histogram | cohort bars | insight card)
//
// Cream #f5f1e8 background, near-black #141414 text, muted red #c83e3e
// reserved for risk phrases, the red event dot on the trend, and the dashed
// forecast tail. Radius 0 everywhere, no card borders, no gradients, no
// drop shadows, no backdrop-filter — compliant with the impeccable-skill
// reflex-reject list. Inline `backgroundColor` mirror of the CSS rule
// keeps the invariant observable in jsdom where stylesheets aren't applied.
//
// Data is intentionally static (wireframe verbatim). No props; the wave
// scope is visual parity with the reference image, not data wiring —
// the dashboard ingestion pipeline will adapt later plans.

import './BoardPackLayout.css';

const KPIS = [
  { label: 'MRR', value: '$2.47M', delta: '+12.4%', warn: false },
  { label: 'ARR', value: '$29.6M', delta: '+8.7%', warn: false },
  { label: 'Churn', value: '2.31%', delta: '\u22120.4pp', warn: false },
  { label: 'LTV : CAC', value: '4.7\u00d7', delta: '+0.3', warn: false },
  { label: 'Payback', value: '14.2mo', delta: '+0.8', warn: true },
];

const ACCOUNTS = [
  { name: 'Amberline Logistics', value: '$124.8K', delta: '+18%', warn: false },
  { name: 'Northfield Biotech', value: '$108.4K', delta: '+11%', warn: false },
  { name: 'Waverly Capital', value: '$96.2K', delta: '\u22124%', warn: true },
  { name: 'Kestrel Aerospace', value: '$88.7K', delta: '+22%', warn: false },
  { name: 'Ordinance Retail', value: '$72.1K', delta: '+6%', warn: false },
];

/**
 * Revenue trend SVG.
 *
 * 560x220 viewbox. One black 1.5px line from lower-left climbing to the
 * upper-right. Filled underlay in #eeebe2 for volume context. Two event
 * dots: black near the middle of the trace, red near the top-right. Red
 * dashed tail extends from the red dot to x=560 to cue the forecast.
 */
function TrendChart() {
  // Smooth monotonic path chosen to land near the target dots.
  // Start: (0, 180) → steady rise → (560, 40).
  const linePath =
    'M0,180 C60,170 110,158 160,140 ' +
    'S260,108 320,90 S430,56 500,44 L560,40';
  const areaPath =
    'M0,180 C60,170 110,158 160,140 ' +
    'S260,108 320,90 S430,56 500,44 L560,40 L560,220 L0,220 Z';

  return (
    <svg
      className="bp-chart__svg"
      viewBox="0 0 560 220"
      role="img"
      aria-label="Revenue · twelve-month trend"
      preserveAspectRatio="none"
    >
      {/* Area fill under the line */}
      <path d={areaPath} fill="#eeebe2" stroke="none" />
      {/* Dashed red forecast tail — sits underneath the solid line so the
          solid line keeps crisp contrast where they overlap. */}
      <line
        x1="500"
        y1="44"
        x2="560"
        y2="24"
        stroke="#c83e3e"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      {/* Trend line */}
      <path d={linePath} fill="none" stroke="#141414" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Event dots */}
      <circle cx="260" cy="118" r="4" fill="#141414" />
      <circle cx="500" cy="44" r="4.5" fill="#c83e3e" />
    </svg>
  );
}

/** Churn-risk distribution — 10 bars, last two in red for the 85+ bucket. */
function ChurnHist() {
  const heights = [8, 14, 20, 28, 36, 30, 22, 16, 28, 34];
  return (
    <svg
      className="bp-strip__sparksvg"
      width="120"
      height="40"
      viewBox="0 0 120 40"
      role="img"
      aria-label="Churn risk histogram"
    >
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 12 + 1}
          y={40 - h}
          width={10}
          height={h}
          fill={i >= 8 ? '#c83e3e' : '#141414'}
        />
      ))}
    </svg>
  );
}

/** Cohort retention strip — 16 narrow bars, last one red to mark "best". */
function CohortStrip() {
  const count = 16;
  return (
    <svg
      className="bp-strip__sparksvg"
      width="120"
      height="8"
      viewBox="0 0 120 8"
      role="img"
      aria-label="Cohort retention strip"
    >
      {Array.from({ length: count }, (_, i) => (
        <rect
          key={i}
          x={i * 7.3}
          y={0}
          width={5}
          height={8}
          fill={i === count - 1 ? '#c83e3e' : '#141414'}
        />
      ))}
    </svg>
  );
}

export default function BoardPackLayout() {
  return (
    <div
      className="bp-layout"
      data-testid="layout-board-pack"
      data-preset="board-pack"
      // Inline background so jsdom tests (no external-stylesheet CSSOM) can
      // still observe the cream invariant. The CSS rule sets the same value
      // for non-test browsers; no conflict.
      style={{ backgroundColor: 'rgb(245, 241, 232)' }}
    >
      {/* --- TOP BAR --------------------------------------------------- */}
      <header className="bp-topbar">
        <div className="bp-topbar__brand">
          <span className="bp-topbar__glyph" aria-hidden="true" />
          <span className="bp-topbar__logo">AskDB</span>
        </div>
        <div className="bp-topbar__kicker">Q3 REVENUE &middot; BOARD PACK</div>
        <div className="bp-topbar__status">LIVE &middot; AUTO-REFRESH 2S</div>
      </header>

      {/* --- HERO (50 / 50) ------------------------------------------- */}
      <section className="bp-hero">
        <div className="bp-hero__left">
          <div className="bp-hero__kicker">Q3 2026 &middot; NET NEW MRR</div>
          <div className="bp-hero__number" data-testid="board-pack-hero-number">
            +$478<span className="bp-hero__unit">K</span>
          </div>
          <p className="bp-hero__prose">
            Three enterprise expansions in July together added{' '}
            <b className="bp-warn">$290K MRR</b> — 61% of net new. Mid-market
            added 47 logos. <b className="bp-warn">Watch:</b> enterprise Q4
            pipe at 2.1&times; coverage.
          </p>
        </div>

        <dl className="bp-kpi-list" data-testid="board-pack-kpi-list">
          {KPIS.map((k) => (
            <div className="bp-kpi" key={k.label}>
              <dt>{k.label}</dt>
              <dd>
                <span>{k.value}</span>
                <small className={k.warn ? 'bp-warn' : undefined}>{k.delta}</small>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* --- MID ROW (70 / 30) --------------------------------------- */}
      <section className="bp-mid">
        <figure className="bp-chart">
          <div className="bp-eyebrow">REVENUE &middot; 12MO</div>
          <h2 className="bp-title">Growth compounded in late Q3</h2>
          <p className="bp-caption">Forecast suggests $3.1M MRR by Oct &middot; dashed</p>
          <TrendChart />
          <div className="bp-axis">
            <span>AUG &rsquo;25</span>
            <span>JUL &rsquo;26 &middot; +12.4%</span>
          </div>
        </figure>

        <aside className="bp-accounts" data-testid="board-pack-accounts">
          <div className="bp-eyebrow">TOP ACCOUNTS &middot; MRR</div>
          <h2 className="bp-title">Five accounts = 41% of MRR</h2>
          <p className="bp-caption">Concentration risk &middot; monitor Waverly (&minus;4%)</p>
          <ul className="bp-accounts__list">
            {ACCOUNTS.map((a) => (
              <li className="bp-accounts__row" key={a.name}>
                <span className="bp-accounts__name">{a.name}</span>
                <span className="bp-accounts__value">
                  <span>{a.value}</span>
                  <span className={`bp-accounts__delta${a.warn ? ' bp-warn' : ''}`}>
                    {a.delta}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      {/* --- BOTTOM STRIP (3-up) ------------------------------------- */}
      <section className="bp-strip" data-testid="board-pack-bottom-strip">
        <div className="bp-strip__card">
          <div className="bp-eyebrow">CHURN RISK &middot; DIST.</div>
          <h3 className="bp-title">Tail is manageable</h3>
          <p className="bp-caption">12 accounts above 85 &middot; $340K MRR</p>
          <ChurnHist />
        </div>

        <div className="bp-strip__card">
          <div className="bp-eyebrow">COHORT &middot; JULY &rsquo;25</div>
          <h3 className="bp-title">Retention holds</h3>
          <p className="bp-caption">M12 retention = 92.1% &middot; best cohort YTD</p>
          <CohortStrip />
        </div>

        <div className="bp-strip__card">
          <div className="bp-eyebrow">INSIGHT</div>
          <h3 className="bp-title">Enterprise concentration is the Q4 lever</h3>
          <p className="bp-strip__body">
            Pipeline coverage 2.1&times; below target 3.0&times;.{' '}
            <b className="bp-warn">
              Accelerate Acme tier-up + 2 mid-market upsells
            </b>{' '}
            to hit Q4 expansion plan. Recommend QBR scheduled for Waverly
            before Oct 15.
          </p>
        </div>

        <div className="bp-strip__footer">AI &middot; REVIEWED 2MIN AGO</div>
      </section>
    </div>
  );
}
