// Plan A* Phase 5 — SignalLayout (wireframe 3, modern dark SaaS).
// TSS Wave 2-B — literal values now route through <Slot> wrappers.

import './SignalLayout.css';
import './slots.css';
import Slot from './Slot.jsx';
import { renderNarrativeMarkdown } from './NarrativeSlot.jsx';

const PRESET_ID = 'signal';

const ACCENTS = {
  teal: '#4ecdc4',
  orange: '#e8864a',
  rose: '#d67a9a',
  indigo: '#7a82c2',
};

const KPI_META = [
  { slotId: 'sg.kpi-0', label: 'MRR', deltaTone: 'teal', sparkColor: ACCENTS.teal, sparkShape: 'growth' },
  { slotId: 'sg.kpi-1', label: 'ARR', deltaTone: 'orange', sparkColor: ACCENTS.orange, sparkShape: 'accel' },
  { slotId: 'sg.kpi-2', label: 'Gross Churn', deltaTone: 'warn', sparkColor: ACCENTS.rose, sparkShape: 'dip' },
  { slotId: 'sg.kpi-3', label: 'LTV : CAC', deltaTone: 'indigo', sparkColor: ACCENTS.indigo, sparkShape: 'wedge' },
];

const DEFAULT_KPI_SUBS = {
  'sg.kpi-0': 'vs $2.20M last Q',
  'sg.kpi-1': 'vs $27.2M',
  'sg.kpi-2': 'vs 2.72% last Q',
  'sg.kpi-3': 'healthy \u00b7 target 3.0\u00d7',
};

const DEFAULT_ACCOUNTS = [
  { rank: '01', name: 'Amberline Logistics', subtitle: 'Enterprise \u00b7 Logistics', value: '$124.8K' },
  { rank: '02', name: 'Northfield Biotech', subtitle: 'Enterprise \u00b7 Pharma', value: '$108.4K' },
  { rank: '03', name: 'Waverly Capital', subtitle: 'Enterprise \u00b7 Finance', value: '$96.2K' },
  { rank: '04', name: 'Kestrel Aerospace', subtitle: 'Enterprise \u00b7 Aero', value: '$88.7K' },
  { rank: '05', name: 'Ordinance Retail Co', subtitle: 'Mid-market \u00b7 Retail', value: '$72.1K' },
];

function Sparkline({ color, shape }) {
  const paths = {
    growth: '2,22 12,20 22,18 32,17 42,14 52,13 62,11 72,9 82,6 92,4 98,3',
    accel:  '2,24 12,23 22,22 32,21 42,19 52,17 62,14 72,10 82,7 92,4 98,2',
    dip:    '2,14 12,13 22,15 32,18 42,22 52,24 62,23 72,21 82,20 92,19 98,18',
    wedge:  '2,21 12,19 22,18 32,19 42,17 52,15 62,14 72,11 82,10 92,8 98,6',
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
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`${pts} 98,30 2,30`} fill={color} fillOpacity="0.12" stroke="none" />
    </svg>
  );
}

function StreamChart() {
  return (
    <svg
      className="sg-stream-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Revenue composition stacked-area chart"
    >
      <g stroke="rgba(255,255,255,0.04)" strokeWidth="0.4">
        <line x1="0" y1="25" x2="100" y2="25" />
        <line x1="0" y1="50" x2="100" y2="50" />
        <line x1="0" y1="75" x2="100" y2="75" />
      </g>
      <path
        d="M0,100 L0,95 C 10,95 25,94 50,93 S 80,92 100,91 L100,100 Z"
        fill={ACCENTS.indigo}
        fillOpacity="0.85"
      />
      <path
        d="M0,95 L0,86 C 15,86 30,85 50,83 S 80,80 100,77 L100,91 C 80,92 60,92 40,93 S 10,95 0,95 Z"
        fill={ACCENTS.rose}
        fillOpacity="0.82"
      />
      <path
        d="M0,86 L0,68 C 15,68 30,66 50,60 S 80,52 100,44 L100,77 C 85,79 70,81 50,83 S 15,86 0,86 Z"
        fill={ACCENTS.orange}
        fillOpacity="0.82"
      />
      <path
        d="M0,68 L0,36 C 15,34 30,30 50,22 S 80,10 100,6 L100,44 C 85,50 70,55 50,60 S 15,66 0,68 Z"
        fill={ACCENTS.teal}
        fillOpacity="0.85"
      />
    </svg>
  );
}

function splitUnit(text) {
  // Peel off a trailing %, ×, or mo so the typography can render it as <small>.
  const s = String(text);
  const m = s.match(/^(.*?)([%\u00d7]|mo)$/);
  if (m) return { head: m[1], unit: m[2] };
  return { head: s, unit: '' };
}

function KpiSlot({ meta, slotProps }) {
  return (
    <Slot id={meta.slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value, state }) => {
        const fb = state === 'fallback' || state === 'loading'
          ? /** @type {{ value?: string, delta?: string, spark?: string }} */ (value)
          : null;
        const bound = state === 'bound' && value && typeof value === 'object' ? value : null;
        const displayValue = bound?.value ?? fb?.value ?? '';
        const delta = bound?.delta ?? fb?.delta ?? '';
        const sub = DEFAULT_KPI_SUBS[meta.slotId] ?? '';
        const { head, unit } = splitUnit(displayValue);
        return (
          <div className="sg-kpi-card">
            <div className="sg-kpi-label">{meta.label}</div>
            <div className="sg-kpi-valuerow">
              <div className="sg-kpi-value">
                {head}
                {unit ? <small>{unit}</small> : null}
              </div>
              <div className={`sg-delta-pill sg-delta-${meta.deltaTone}`}>{delta}</div>
            </div>
            <div className="sg-kpi-sub">{sub}</div>
            <Sparkline color={meta.sparkColor} shape={meta.sparkShape} />
          </div>
        );
      }}
    </Slot>
  );
}

export default function SignalLayout({
  bindings,
  tileData,
  onSlotEdit,
  editable = true,
  tiles: _tiles,
  dashboardId: _dashboardId,
  dashboardName: _dashboardName,
} = {}) {
  const slotProps = { bindings, tileData, onEdit: onSlotEdit, editable };

  return (
    <div
      className="sg-layout"
      data-testid="layout-signal"
      data-preset="signal"
      style={{ backgroundColor: '#0b0f17', color: '#e7e9ef' }}
    >
      <header className="sg-header">
        <div className="sg-logo" aria-hidden="true" />
        <div className="sg-title-block">
          <h1 className="sg-title">
            Q3 <span className="sg-title-dim">&middot;</span> Revenue Review
          </h1>
          <div className="sg-crumb">Finance &middot; Board &middot; Q3 2026</div>
        </div>
      </header>

      <section className="sg-kpis" data-testid="signal-kpis">
        {KPI_META.map((m) => (
          <KpiSlot key={m.slotId} meta={m} slotProps={slotProps} />
        ))}
      </section>

      <div className="sg-main">
        <Slot id="sg.stream-chart" presetId={PRESET_ID} {...slotProps}>
          {() => (
            <section className="sg-card sg-stream">
              <div className="sg-card-head">
                <div>
                  <h2 className="sg-card-title">Revenue composition &middot; 12 months</h2>
                  <div className="sg-card-sub">Stacked by segment &middot; stream density</div>
                </div>
                <div className="sg-card-meta">
                  <span className="sg-live">&#9679; LIVE</span> &middot; REFRESH 2S
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
                <span>Aug &#39;25</span>
                <span>Nov</span>
                <span>Feb &#39;26</span>
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
          )}
        </Slot>

        <div className="sg-rail">
          <Slot id="sg.signal-card" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              const isFallback =
                state === 'fallback' ||
                typeof value !== 'string' ||
                value.length === 0;
              const sanitizedHtml = !isFallback
                ? { __html: renderNarrativeMarkdown(String(value)) }
                : null;
              return (
                <section className="sg-signal-card" data-testid="signal-signal-card">
                  {isFallback ? (
                    <>
                      <div className="sg-signal-kicker">
                        <span className="sg-signal-dot" aria-hidden="true" />
                        <span>Signal Detected &middot; 2 min ago</span>
                      </div>
                      <h3 className="sg-signal-title">
                        Enterprise expansion is concentrated in three accounts
                      </h3>
                      <p className="sg-signal-body">
                        Amberline, Beta-Axion, and Northfield together added{' '}
                        <span className="sg-accent">$290K MRR</span> &mdash; 61% of net new.
                        Pipeline coverage for Q4 enterprise is 2.1&times; (target 3&times;).{' '}
                        <span className="sg-accent">
                          Consider accelerating two mid-market conversions.
                        </span>
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="sg-signal-kicker">
                        <span className="sg-signal-dot" aria-hidden="true" />
                        <span>Signal Detected</span>
                      </div>
                      {/* eslint-disable-next-line react/no-danger */}
                      <p className="sg-signal-body" dangerouslySetInnerHTML={sanitizedHtml} />
                    </>
                  )}
                </section>
              );
            }}
          </Slot>

          <Slot id="sg.accounts" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              const rows =
                state === 'bound' && value && typeof value === 'object' && 'rows' in value
                  ? value.rows
                  : null;
              const display = rows && rows.length
                ? rows.slice(0, 5).map((r, i) => ({
                    rank: String(i + 1).padStart(2, '0'),
                    name: String(r.name ?? r.entity ?? `Row ${i + 1}`),
                    subtitle: String(r.subtitle ?? r.segment ?? ''),
                    value: String(r.value ?? r.mrr ?? ''),
                  }))
                : DEFAULT_ACCOUNTS;
              return (
                <section className="sg-accounts" data-testid="signal-accounts">
                  <div className="sg-accounts-head">
                    <h3 className="sg-accounts-title">Top accounts &middot; MRR</h3>
                    <span className="sg-accounts-badge">Q3</span>
                  </div>
                  {display.map((a) => (
                    <div className="sg-account-row" key={a.rank}>
                      <div className="sg-account-rank">{a.rank}</div>
                      <div className="sg-account-body">
                        <div className="sg-account-name">{a.name}</div>
                        <div className="sg-account-sub">{a.subtitle}</div>
                      </div>
                      <div className="sg-account-value">{a.value}</div>
                    </div>
                  ))}
                </section>
              );
            }}
          </Slot>
        </div>
      </div>

      <footer className="sg-footer">
        <div className="sg-footer-left">
          bigquery &middot; prod.finance_reports &middot; warehouse ok
        </div>
        <div className="sg-footer-center">
          render 156ms &middot; cache 94% hit &middot; tier 1
        </div>
        <div className="sg-footer-right">last refresh 09:42:14 UTC</div>
      </footer>
    </div>
  );
}
