// Plan A* Phase 3 / Wave 2-BP - BoardPackLayout (cream tearsheet, wireframe 1).
// TSS2 T7 - every hardcoded finance literal (DEFAULT_KPIS labels,
// DEFAULT_ACCOUNTS, kicker, chart titles, insight copy, ChurnHist +
// CohortStrip arrays, top-bar strip) now resolves through <Slot> so
// the autogen pipeline drives the preset entirely from the bound
// connection. When no binding exists the preset collapses to neutral
// em-dash placeholders - no finance words, no wireframe rows.
//
// Region contract (unchanged from Plan A*):
//   - Top bar              (AskDB logo, centered kicker slot, LIVE dot)
//   - Top-bar metric strip (6 compact KPI slots, bp.topbar-0..5)
//   - Hero split 50/50     (hero number + narrative | 5-row KPI list)
//   - Mid split 70/30      (revenue trend figure | top-accounts aside)
//   - Bottom strip 3-up    (churn histogram | cohort bars | insight card)

import './BoardPackLayout.css';
import './slots.css';
import Slot from './Slot.jsx';
import NarrativeSlot from './NarrativeSlot.jsx';

const PRESET_ID = 'board-pack';

// KPI rows - labels/values come entirely from bound tiles. With no
// binding the Slot renders the descriptor fallback ({value: '-', ...})
// so the DOM contains em-dashes only, no finance terms.
const DEFAULT_KPIS = [
  { slotId: 'bp.kpi-0' },
  { slotId: 'bp.kpi-1' },
  { slotId: 'bp.kpi-2' },
  { slotId: 'bp.kpi-3' },
  { slotId: 'bp.kpi-4' },
];

const TOPBAR_SLOTS = [
  'bp.topbar-0',
  'bp.topbar-1',
  'bp.topbar-2',
  'bp.topbar-3',
  'bp.topbar-4',
  'bp.topbar-5',
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
      aria-label="Primary trend"
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

// ChurnHist reads bar heights from the bound tile. Unbound -> empty
// frame (no bars), no hardcoded silhouette.
function ChurnHist({ bins }) {
  const heights = Array.isArray(bins)
    ? bins
        .map((b) =>
          typeof b === 'number'
            ? b
            : b && typeof b === 'object' && typeof b.height === 'number'
              ? b.height
              : null,
        )
        .filter((h) => h != null)
    : [];
  return (
    <svg
      className="bp-strip__sparksvg"
      width="120"
      height="40"
      viewBox="0 0 120 40"
      role="img"
      aria-label="Distribution strip"
    >
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 12 + 1}
          y={40 - h}
          width={10}
          height={h}
          fill={i >= heights.length - 2 ? '#c83e3e' : '#141414'}
        />
      ))}
    </svg>
  );
}

// CohortStrip - bar count + heights from the bound tile. Unbound ->
// empty frame.
function CohortStrip({ bins }) {
  const count = Array.isArray(bins) ? bins.length : 0;
  return (
    <svg
      className="bp-strip__sparksvg"
      width="120"
      height="8"
      viewBox="0 0 120 8"
      role="img"
      aria-label="Cohort strip"
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

function KpiRow({ slotId, slotProps }) {
  return (
    <Slot id={slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value }) => {
        const kpi =
          value && typeof value === 'object'
            ? value
            : { value: '\u2014', delta: null, label: '\u2014' };
        const label = kpi.label ?? '\u2014';
        const warn = !!kpi.warn;
        return (
          <div className="bp-kpi">
            <dt>{label}</dt>
            <dd>
              <span>{kpi.value ?? '\u2014'}</span>
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

function TopbarKpi({ slotId, slotProps }) {
  return (
    <Slot id={slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value }) => {
        const kpi =
          value && typeof value === 'object'
            ? value
            : { value: '\u2014', delta: null, label: '\u2014' };
        return (
          <div className="bp-topbar__stat">
            <span className="bp-topbar__stat-label">{kpi.label ?? '\u2014'}</span>
            <span className="bp-topbar__stat-value">{kpi.value ?? '\u2014'}</span>
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
        <NarrativeSlot
          id="bp.kicker"
          presetId={PRESET_ID}
          slotProps={slotProps}
          as="div"
          className="bp-topbar__kicker"
        />
        <div className="bp-topbar__status">LIVE</div>
      </header>

      <section
        className="bp-topbar-strip"
        data-testid="board-pack-topbar-strip"
      >
        {TOPBAR_SLOTS.map((slotId) => (
          <TopbarKpi key={slotId} slotId={slotId} slotProps={slotProps} />
        ))}
      </section>

      <section className="bp-hero">
        <div className="bp-hero__left">
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
                  {head || '\u2014'}
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
            <KpiRow key={k.slotId} slotId={k.slotId} slotProps={slotProps} />
          ))}
        </dl>
      </section>

      <section className="bp-mid">
        <Slot id="bp.trend-chart" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            const title =
              state === 'bound' &&
              value &&
              typeof value === 'object' &&
              typeof value.title === 'string'
                ? value.title
                : '';
            return (
              <figure className="bp-chart">
                <h2 className="bp-title">{title || '\u2014'}</h2>
                <TrendChart />
              </figure>
            );
          }}
        </Slot>

        <Slot id="bp.accounts-list" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            const rows =
              state === 'bound' &&
              value &&
              typeof value === 'object' &&
              'rows' in value &&
              Array.isArray(value.rows)
                ? value.rows
                : [];
            const displayRows = rows.slice(0, 5).map((r, i) => ({
              key: String(r.name ?? r.entity ?? r.account ?? i),
              name: String(r.name ?? r.entity ?? r.account ?? '\u2014'),
              value: String(r.value ?? r.mrr ?? r.total ?? '\u2014'),
              delta: r.delta != null ? String(r.delta) : '',
              warn: !!r.warn,
            }));
            return (
              <aside className="bp-accounts" data-testid="board-pack-accounts">
                <ul className="bp-accounts__list">
                  {displayRows.length === 0 ? (
                    <li
                      className="bp-accounts__row bp-accounts__empty"
                      data-testid="board-pack-accounts-empty"
                    >
                      <span className="bp-accounts__name">{'\u2014'}</span>
                      <span className="bp-accounts__value">
                        <span>{'\u2014'}</span>
                        <span className="bp-accounts__delta" />
                      </span>
                    </li>
                  ) : (
                    displayRows.map((a) => (
                      <li className="bp-accounts__row" key={a.key}>
                        <span className="bp-accounts__name">{a.name}</span>
                        <span className="bp-accounts__value">
                          <span>{a.value}</span>
                          <span
                            className={`bp-accounts__delta${a.warn ? ' bp-warn' : ''}`}
                          >
                            {a.delta}
                          </span>
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </aside>
            );
          }}
        </Slot>
      </section>

      <section className="bp-strip" data-testid="board-pack-bottom-strip">
        <Slot id="bp.strip-churn" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            const bins =
              state === 'bound' &&
              value &&
              typeof value === 'object' &&
              Array.isArray(value.bins)
                ? value.bins
                : [];
            return (
              <div className="bp-strip__card">
                <ChurnHist bins={bins} />
              </div>
            );
          }}
        </Slot>

        <Slot id="bp.strip-cohort" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            const bins =
              state === 'bound' &&
              value &&
              typeof value === 'object' &&
              Array.isArray(value.bins)
                ? value.bins
                : [];
            return (
              <div className="bp-strip__card">
                <CohortStrip bins={bins} />
              </div>
            );
          }}
        </Slot>

        <NarrativeSlot
          id="bp.strip-insight"
          presetId={PRESET_ID}
          slotProps={slotProps}
          as="div"
          className="bp-strip__card bp-strip__card--insight"
        />
      </section>
    </div>
  );
}
