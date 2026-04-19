// Plan A* Phase 3 / Wave 2-BP — BoardPackLayout (cream tearsheet, wireframe 1).
// TSS Wave 2-B — every hardcoded literal now routes through a <Slot> so
// the dashboard autogen pipeline can bind real connection data, while
// the static demo values still render verbatim when no binding exists.
//
// Region contract (unchanged from Plan A*):
//   - Top bar           (AskDB logo, centered kicker, LIVE dot)
//   - Hero split 50/50  (+$478K display + narrative | 5-row KPI list)
//   - Mid split 70/30   (revenue trend figure | top-accounts aside)
//   - Bottom strip 3-up (churn histogram | cohort bars | insight card)

import './BoardPackLayout.css';
import './slots.css';
import Slot from './Slot.jsx';
import NarrativeSlot from './NarrativeSlot.jsx';

const PRESET_ID = 'board-pack';

const DEFAULT_KPIS = [
  { slotId: 'bp.kpi-0', label: 'MRR', warn: false },
  { slotId: 'bp.kpi-1', label: 'ARR', warn: false },
  { slotId: 'bp.kpi-2', label: 'Churn', warn: false },
  { slotId: 'bp.kpi-3', label: 'LTV : CAC', warn: false },
  { slotId: 'bp.kpi-4', label: 'Payback', warn: true },
];

const DEFAULT_ACCOUNTS = [
  { name: 'Amberline Logistics', value: '$124.8K', delta: '+18%', warn: false },
  { name: 'Northfield Biotech', value: '$108.4K', delta: '+11%', warn: false },
  { name: 'Waverly Capital', value: '$96.2K', delta: '\u22124%', warn: true },
  { name: 'Kestrel Aerospace', value: '$88.7K', delta: '+22%', warn: false },
  { name: 'Ordinance Retail', value: '$72.1K', delta: '+6%', warn: false },
];

function TrendChart() {
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
      aria-label="Revenue - twelve-month trend"
      preserveAspectRatio="none"
    >
      <path d={areaPath} fill="#eeebe2" stroke="none" />
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
      <path d={linePath} fill="none" stroke="#141414" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="260" cy="118" r="4" fill="#141414" />
      <circle cx="500" cy="44" r="4.5" fill="#c83e3e" />
    </svg>
  );
}

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

function KpiRow({ slotId, label, warn, slotProps }) {
  return (
    <Slot id={slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value }) => {
        const kpi = value && typeof value === 'object' ? value : { value: '', delta: null };
        return (
          <div className="bp-kpi">
            <dt>{label}</dt>
            <dd>
              <span>{kpi.value}</span>
              <small className={warn ? 'bp-warn' : undefined}>
                {kpi.delta ?? ''}
              </small>
            </dd>
          </div>
        );
      }}
    </Slot>
  );
}

export default function BoardPackLayout({
  bindings,
  tileData,
  onSlotEdit,
  editable = true,
  /* legacy props */
  tiles: _tiles,
  dashboardId: _dashboardId,
  dashboardName: _dashboardName,
} = {}) {
  const slotProps = { bindings, tileData, onEdit: onSlotEdit, editable };

  return (
    <div
      className="bp-layout"
      data-testid="layout-board-pack"
      data-preset="board-pack"
      style={{ backgroundColor: 'rgb(245, 241, 232)' }}
    >
      <header className="bp-topbar">
        <div className="bp-topbar__brand">
          <span className="bp-topbar__glyph" aria-hidden="true" />
          <span className="bp-topbar__logo">AskDB</span>
        </div>
        <div className="bp-topbar__kicker">Q3 REVENUE &middot; BOARD PACK</div>
        <div className="bp-topbar__status">LIVE &middot; AUTO-REFRESH 2S</div>
      </header>

      <section className="bp-hero">
        <div className="bp-hero__left">
          <div className="bp-hero__kicker">Q3 2026 &middot; NET NEW MRR</div>
          <Slot id="bp.hero-number" presetId={PRESET_ID} {...slotProps}>
            {({ value }) => {
              const raw =
                value && typeof value === 'object' && 'value' in value
                  ? String(value.value ?? '')
                  : '';
              const match = /^(.*?)([KMB%])?$/.exec(raw);
              const head = match?.[1] ?? raw;
              const unit = match?.[2] ?? '';
              return (
                <div
                  className="bp-hero__number"
                  data-testid="board-pack-hero-number"
                >
                  {head}
                  {unit ? <span className="bp-hero__unit">{unit}</span> : null}
                </div>
              );
            }}
          </Slot>
          <NarrativeSlot
            id="bp.hero-narrative"
            presetId={PRESET_ID}
            slotProps={slotProps}
            as="p"
            className="bp-hero__prose"
          />
        </div>

        <dl className="bp-kpi-list" data-testid="board-pack-kpi-list">
          {DEFAULT_KPIS.map((k) => (
            <KpiRow
              key={k.slotId}
              slotId={k.slotId}
              label={k.label}
              warn={k.warn}
              slotProps={slotProps}
            />
          ))}
        </dl>
      </section>

      <section className="bp-mid">
        <Slot id="bp.trend-chart" presetId={PRESET_ID} {...slotProps}>
          {() => (
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
          )}
        </Slot>

        <Slot id="bp.accounts-list" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            const rows =
              state === 'bound' && value && typeof value === 'object' && 'rows' in value
                ? value.rows
                : null;
            const displayRows =
              rows && rows.length
                ? rows.slice(0, 5).map((r, i) => ({
                    name: String(r.name ?? r.entity ?? r.account ?? `Row ${i + 1}`),
                    value: String(r.value ?? r.mrr ?? r.total ?? ''),
                    delta: r.delta != null ? String(r.delta) : '',
                    warn: !!r.warn,
                  }))
                : DEFAULT_ACCOUNTS;
            return (
              <aside className="bp-accounts" data-testid="board-pack-accounts">
                <div className="bp-eyebrow">TOP ACCOUNTS &middot; MRR</div>
                <h2 className="bp-title">Five accounts = 41% of MRR</h2>
                <p className="bp-caption">Concentration risk &middot; monitor Waverly (&minus;4%)</p>
                <ul className="bp-accounts__list">
                  {displayRows.map((a) => (
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
            );
          }}
        </Slot>
      </section>

      <section className="bp-strip" data-testid="board-pack-bottom-strip">
        <Slot id="bp.strip-churn" presetId={PRESET_ID} {...slotProps}>
          {() => (
            <div className="bp-strip__card">
              <div className="bp-eyebrow">CHURN RISK &middot; DIST.</div>
              <h3 className="bp-title">Tail is manageable</h3>
              <p className="bp-caption">12 accounts above 85 &middot; $340K MRR</p>
              <ChurnHist />
            </div>
          )}
        </Slot>

        <Slot id="bp.strip-cohort" presetId={PRESET_ID} {...slotProps}>
          {() => (
            <div className="bp-strip__card">
              <div className="bp-eyebrow">COHORT &middot; JULY &rsquo;25</div>
              <h3 className="bp-title">Retention holds</h3>
              <p className="bp-caption">M12 retention = 92.1% &middot; best cohort YTD</p>
              <CohortStrip />
            </div>
          )}
        </Slot>

        <Slot id="bp.strip-insight" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => (
            <div className="bp-strip__card">
              <div className="bp-eyebrow">INSIGHT</div>
              <h3 className="bp-title">Enterprise concentration is the Q4 lever</h3>
              {state === 'fallback' ? (
                <p className="bp-strip__body">
                  Pipeline coverage 2.1&times; below target 3.0&times;.{' '}
                  <b className="bp-warn">
                    Accelerate Acme tier-up + 2 mid-market upsells
                  </b>{' '}
                  to hit Q4 expansion plan. Recommend QBR scheduled for Waverly
                  before Oct 15.
                </p>
              ) : (
                <p className="bp-strip__body">
                  {typeof value === 'string' ? value : ''}
                </p>
              )}
            </div>
          )}
        </Slot>

        <div className="bp-strip__footer">AI &middot; REVIEWED 2MIN AGO</div>
      </section>
    </div>
  );
}
