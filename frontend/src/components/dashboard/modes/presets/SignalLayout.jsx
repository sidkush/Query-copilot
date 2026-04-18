// Plan A★ Phase 5 — SignalLayout (wireframe 3, modern dark SaaS).
//
// Bespoke layout keyed to the Signal preset. Deep slate bg (#0b0f17),
// four accent hues (teal / orange / pink / indigo) plus a soft warn red.
// No glassmorphism, no drop shadows, no gradient text — subtle 1px
// borders on rounded 10px cards per the Wave 2-SG brief.
//
// The layout is intentionally self-contained: all data is hard-coded
// wireframe copy. A future pass will bind these regions to real
// worksheet refs.

import './SignalLayout.css';

const ACCENTS = {
  teal: '#4ecdc4',
  orange: '#e8864a',
  rose: '#d67a9a',
  indigo: '#7a82c2',
};

/**
 * Tiny inline sparkline — 4 per-KPI variations rendered as a monotone-ish
 * path with a light-opacity fill beneath. We hand-shape the points so each
 * sparkline has its own silhouette (growth / accel / decline / wedge).
 */
function Sparkline({ color, shape }) {
  // viewBox 0..100 wide, 0..30 tall. y grows downward in SVG.
  const paths = {
    growth:   '2,22 12,20 22,18 32,17 42,14 52,13 62,11 72,9 82,6 92,4 98,3',
    accel:    '2,24 12,23 22,22 32,21 42,19 52,17 62,14 72,10 82,7 92,4 98,2',
    dip:      '2,14 12,13 22,15 32,18 42,22 52,24 62,23 72,21 82,20 92,19 98,18',
    wedge:    '2,21 12,19 22,18 32,19 42,17 52,15 62,14 72,11 82,10 92,8 98,6',
  };
  const pts = paths[shape] ?? paths.growth;

  return (
    <svg
      className="sg-sparkline"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
      stroke={color}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={`${pts} 98,30 2,30`}
        fill={color}
        fillOpacity="0.12"
        stroke="none"
      />
    </svg>
  );
}

/**
 * Simplified stacked-area stream chart. Four layers (enterprise, mid-market,
 * SMB, self-serve) drawn as hand-shaped polygons growing left-to-right. The
 * SVG stretches via `preserveAspectRatio="none"`; real data binding lands
 * in a later phase.
 */
function StreamChart() {
  // Each layer is the cumulative top boundary, drawn bottom-up so the
  // visual stack order matches the legend (teal at top).
  // viewBox 0..100 × 0..100.  y = 0 at top.
  return (
    <svg
      className="sg-stream-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Revenue composition stacked-area chart"
    >
      {/* faint baseline rules */}
      <g stroke="rgba(255,255,255,0.04)" strokeWidth="0.4">
        <line x1="0" y1="25" x2="100" y2="25" />
        <line x1="0" y1="50" x2="100" y2="50" />
        <line x1="0" y1="75" x2="100" y2="75" />
      </g>

      {/* Indigo — self-serve (bottom layer, thin slice) */}
      <path
        d="M0,100 L0,95 C 10,95 25,94 50,93 S 80,92 100,91 L100,100 Z"
        fill={ACCENTS.indigo}
        fillOpacity="0.85"
      />
      {/* Rose — SMB */}
      <path
        d="M0,95 L0,86 C 15,86 30,85 50,83 S 80,80 100,77 L100,91 C 80,92 60,92 40,93 S 10,95 0,95 Z"
        fill={ACCENTS.rose}
        fillOpacity="0.82"
      />
      {/* Orange — mid-market */}
      <path
        d="M0,86 L0,68 C 15,68 30,66 50,60 S 80,52 100,44 L100,77 C 85,79 70,81 50,83 S 15,86 0,86 Z"
        fill={ACCENTS.orange}
        fillOpacity="0.82"
      />
      {/* Teal — enterprise (top, largest) */}
      <path
        d="M0,68 L0,36 C 15,34 30,30 50,22 S 80,10 100,6 L100,44 C 85,50 70,55 50,60 S 15,66 0,68 Z"
        fill={ACCENTS.teal}
        fillOpacity="0.85"
      />
    </svg>
  );
}

function KpiCard({ label, value, unit, delta, deltaTone, sub, sparkColor, sparkShape }) {
  return (
    <div className="sg-kpi-card">
      <div className="sg-kpi-label">{label}</div>
      <div className="sg-kpi-valuerow">
        <div className="sg-kpi-value">
          {value}
          {unit ? <small>{unit}</small> : null}
        </div>
        <div className={`sg-delta-pill sg-delta-${deltaTone}`}>{delta}</div>
      </div>
      <div className="sg-kpi-sub">{sub}</div>
      <Sparkline color={sparkColor} shape={sparkShape} />
    </div>
  );
}

function AccountRow({ rank, name, subtitle, value }) {
  return (
    <div className="sg-account-row">
      <div className="sg-account-rank">{rank}</div>
      <div className="sg-account-body">
        <div className="sg-account-name">{name}</div>
        <div className="sg-account-sub">{subtitle}</div>
      </div>
      <div className="sg-account-value">{value}</div>
    </div>
  );
}

export default function SignalLayout() {
  return (
    <div
      className="sg-layout"
      data-testid="layout-signal"
      data-preset="signal"
      style={{ backgroundColor: '#0b0f17', color: '#e7e9ef' }}
    >
      {/* ---------- header ---------- */}
      <header className="sg-header">
        <div className="sg-logo" aria-hidden="true" />
        <div className="sg-title-block">
          <h1 className="sg-title">
            Q3 <span className="sg-title-dim">·</span> Revenue Review
          </h1>
          <div className="sg-crumb">Finance · Board · Q3 2026</div>
        </div>
      </header>

      {/* ---------- KPI row ---------- */}
      <section className="sg-kpis" data-testid="signal-kpis">
        <KpiCard
          label="MRR"
          value="$2.47M"
          delta="+12.3%"
          deltaTone="teal"
          sub="vs $2.20M last Q"
          sparkColor={ACCENTS.teal}
          sparkShape="growth"
        />
        <KpiCard
          label="ARR"
          value="$29.6M"
          delta="+8.7%"
          deltaTone="orange"
          sub="vs $27.2M"
          sparkColor={ACCENTS.orange}
          sparkShape="accel"
        />
        <KpiCard
          label="Gross Churn"
          value="2.31"
          unit="%"
          delta="−0.4pp"
          deltaTone="warn"
          sub="vs 2.72% last Q"
          sparkColor={ACCENTS.rose}
          sparkShape="dip"
        />
        <KpiCard
          label="LTV : CAC"
          value="4.7"
          unit="×"
          delta="+0.3"
          deltaTone="indigo"
          sub="healthy · target 3.0×"
          sparkColor={ACCENTS.indigo}
          sparkShape="wedge"
        />
      </section>

      {/* ---------- main 70/30 ---------- */}
      <div className="sg-main">
        {/* left — stream chart */}
        <section className="sg-card sg-stream">
          <div className="sg-card-head">
            <div>
              <h2 className="sg-card-title">Revenue composition · 12 months</h2>
              <div className="sg-card-sub">Stacked by segment · stream density</div>
            </div>
            <div className="sg-card-meta">
              <span className="sg-live">● LIVE</span> · REFRESH 2S
            </div>
          </div>

          <div className="sg-stream-body">
            <div className="sg-stream-yaxis" aria-hidden="true">
              <span>$3.0M</span>
              <span>$2.0M</span>
              <span>$1.0M</span>
              <span>0</span>
            </div>
            <div className="sg-stream-plot">
              <StreamChart />
            </div>
          </div>

          <div className="sg-stream-xaxis" aria-hidden="true">
            <span>Aug '25</span>
            <span>Nov</span>
            <span>Feb '26</span>
            <span>May</span>
            <span>Jul</span>
          </div>

          <div className="sg-stream-legend" data-testid="signal-stream-legend">
            <span className="sg-legend-item">
              <span className="sg-legend-swatch sg-swatch-teal" />
              Enterprise 58%
            </span>
            <span className="sg-legend-item">
              <span className="sg-legend-swatch sg-swatch-orange" />
              Mid-market 22%
            </span>
            <span className="sg-legend-item">
              <span className="sg-legend-swatch sg-swatch-rose" />
              SMB 14%
            </span>
            <span className="sg-legend-item">
              <span className="sg-legend-swatch sg-swatch-indigo" />
              Self-serve 6%
            </span>
          </div>
        </section>

        {/* right rail */}
        <div className="sg-rail">
          <section className="sg-signal-card" data-testid="signal-signal-card">
            <div className="sg-signal-kicker">
              <span className="sg-signal-dot" aria-hidden="true" />
              <span>Signal Detected · 2 min ago</span>
            </div>
            <h3 className="sg-signal-title">
              Enterprise expansion is concentrated in three accounts
            </h3>
            <p className="sg-signal-body">
              Amberline, Beta-Axion, and Northfield together added{' '}
              <span className="sg-accent">$290K MRR</span> — 61% of net new.
              Pipeline coverage for Q4 enterprise is 2.1× (target 3×).{' '}
              <span className="sg-accent">
                Consider accelerating two mid-market conversions.
              </span>
            </p>
          </section>

          <section className="sg-accounts" data-testid="signal-accounts">
            <div className="sg-accounts-head">
              <h3 className="sg-accounts-title">Top accounts · MRR</h3>
              <span className="sg-accounts-badge">Q3</span>
            </div>
            <AccountRow
              rank="01"
              name="Amberline Logistics"
              subtitle="Enterprise · Logistics"
              value="$124.8K"
            />
            <AccountRow
              rank="02"
              name="Northfield Biotech"
              subtitle="Enterprise · Pharma"
              value="$108.4K"
            />
            <AccountRow
              rank="03"
              name="Waverly Capital"
              subtitle="Enterprise · Finance"
              value="$96.2K"
            />
            <AccountRow
              rank="04"
              name="Kestrel Aerospace"
              subtitle="Enterprise · Aero"
              value="$88.7K"
            />
            <AccountRow
              rank="05"
              name="Ordinance Retail Co"
              subtitle="Mid-market · Retail"
              value="$72.1K"
            />
          </section>
        </div>
      </div>

      {/* ---------- footer ---------- */}
      <footer className="sg-footer">
        <div className="sg-footer-left">
          bigquery · prod.finance_reports · warehouse ok
        </div>
        <div className="sg-footer-center">
          render 156ms · cache 94% hit · tier 1
        </div>
        <div className="sg-footer-right">last refresh 09:42:14 UTC</div>
      </footer>
    </div>
  );
}
