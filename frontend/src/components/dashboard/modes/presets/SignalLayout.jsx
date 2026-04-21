// Plan A* Phase 5 — SignalLayout (wireframe 3, modern dark SaaS).
// TSS Wave 2-B — literal values now route through <Slot> wrappers.
// Plan TSS2 T9 — hardcoded SaaS fallbacks purged: KPI labels, stat
// subs, top-accounts list, stream-chart series, and legend copy all
// come from the slot binding system. Unbound slots render '\u2014'.

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

// Layout-only presentation metadata (NOT content): which slot id maps
// to which rendering lane (accent colour + sparkline shape). Labels /
// values / deltas come from the binding, never from this table.
const KPI_META = [
  { slotId: 'sg.kpi-0', deltaTone: 'teal', sparkColor: ACCENTS.teal, sparkShape: 'growth' },
  { slotId: 'sg.kpi-1', deltaTone: 'orange', sparkColor: ACCENTS.orange, sparkShape: 'accel' },
  { slotId: 'sg.kpi-2', deltaTone: 'warn', sparkColor: ACCENTS.rose, sparkShape: 'dip' },
  { slotId: 'sg.kpi-3', deltaTone: 'indigo', sparkColor: ACCENTS.indigo, sparkShape: 'wedge' },
];

const LEGEND_META = [
  { slotId: 'sg.legend-0', swatchClass: 'sg-swatch-teal' },
  { slotId: 'sg.legend-1', swatchClass: 'sg-swatch-orange' },
  { slotId: 'sg.legend-2', swatchClass: 'sg-swatch-rose' },
  { slotId: 'sg.legend-3', swatchClass: 'sg-swatch-indigo' },
];

// 11-point polyline templates — pure visual scaffolding so the KPI
// card reserves space for a sparkline even before data arrives.
const SPARK_PATHS = {
  growth: '2,22 12,20 22,18 32,17 42,14 52,13 62,11 72,9 82,6 92,4 98,3',
  accel:  '2,24 12,23 22,22 32,21 42,19 52,17 62,14 72,10 82,7 92,4 98,2',
  dip:    '2,14 12,13 22,15 32,18 42,22 52,24 62,23 72,21 82,20 92,19 98,18',
  wedge:  '2,21 12,19 22,18 32,19 42,17 52,15 62,14 72,11 82,10 92,8 98,6',
};

function Sparkline({ color, shape }) {
  const pts = SPARK_PATHS[shape] ?? SPARK_PATHS.growth;

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

function StreamChartPlaceholder() {
  // Empty chart frame shown when no tile is bound to sg.stream-chart.
  // A bound stream chart renders via the chart-spec renderer upstream
  // and never enters this branch. No hardcoded series here.
  return (
    <svg
      className="sg-stream-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Revenue composition chart placeholder"
    >
      <g stroke="rgba(255,255,255,0.04)" strokeWidth="0.4">
        <line x1="0" y1="25" x2="100" y2="25" />
        <line x1="0" y1="50" x2="100" y2="50" />
        <line x1="0" y1="75" x2="100" y2="75" />
      </g>
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

function resolveKpi(value, state) {
  // KPI slot descriptor fallback is
  //   { value: '\u2014', delta: null, spark: ..., label: '\u2014' }
  // formatValue() returns { value, delta? } when bound. Labels and
  // subs come from bindings (post-T6); unbound we surface em-dashes.
  if (state === 'bound' && value && typeof value === 'object') {
    return {
      label: typeof value.label === 'string' && value.label ? value.label : '',
      displayValue: typeof value.value === 'string' ? value.value : '',
      delta: typeof value.delta === 'string' ? value.delta : '',
      sub: typeof value.sub === 'string' ? value.sub : '',
    };
  }
  const fb = value && typeof value === 'object' ? value : {};
  return {
    label: typeof fb.label === 'string' ? fb.label : '\u2014',
    displayValue: typeof fb.value === 'string' ? fb.value : '\u2014',
    delta: '',
    sub: '',
  };
}

function KpiSlot({ meta, slotProps }) {
  return (
    <Slot id={meta.slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value, state }) => {
        const resolved = resolveKpi(value, state);
        const { head, unit } = splitUnit(resolved.displayValue);
        return (
          <div className="sg-kpi-card">
            <div className="sg-kpi-label">{resolved.label}</div>
            <div className="sg-kpi-valuerow">
              <div className="sg-kpi-value">
                {head}
                {unit ? <small>{unit}</small> : null}
              </div>
              {resolved.delta ? (
                <div className={`sg-delta-pill sg-delta-${meta.deltaTone}`}>{resolved.delta}</div>
              ) : null}
            </div>
            <div className="sg-kpi-sub">{resolved.sub}</div>
            <Sparkline color={meta.sparkColor} shape={meta.sparkShape} />
          </div>
        );
      }}
    </Slot>
  );
}

function LegendSlot({ meta, slotProps }) {
  return (
    <Slot id={meta.slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value, state }) => {
        // Legend slots (sg.legend-0..3) share the KPI descriptor
        // shape: { value, delta?, label } when bound, or descriptor
        // fallback otherwise. No hardcoded segment names.
        const bound = state === 'bound' && value && typeof value === 'object' ? value : null;
        const fb = !bound && value && typeof value === 'object' ? value : {};
        const label = bound?.label ?? fb.label ?? '\u2014';
        const bucket = bound?.value ?? fb.value ?? '';
        return (
          <span className="sg-legend-item">
            <span className={`sg-legend-swatch ${meta.swatchClass}`} />
            {label}
            {bucket ? <span className="sg-legend-value"> {bucket}</span> : null}
          </span>
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
                <div className="sg-stream-yaxis" aria-hidden="true" />
                <div className="sg-stream-plot">
                  <StreamChartPlaceholder />
                </div>
              </div>
              <div className="sg-stream-xaxis" aria-hidden="true" />
              <div className="sg-stream-legend" data-testid="signal-stream-legend">
                {LEGEND_META.map((m) => (
                  <LegendSlot key={m.slotId} meta={m} slotProps={slotProps} />
                ))}
              </div>
            </section>
          )}
        </Slot>

        <div className="sg-rail">
          <Slot id="sg.signal-card" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              const bound =
                state === 'bound' &&
                typeof value === 'string' &&
                value.length > 0;
              const sanitizedHtml = bound
                ? { __html: renderNarrativeMarkdown(String(value)) }
                : null;
              return (
                <section className="sg-signal-card" data-testid="signal-signal-card">
                  <div className="sg-signal-kicker">
                    <span className="sg-signal-dot" aria-hidden="true" />
                    <span>Signal Detected</span>
                  </div>
                  {bound ? (
                    <p className="sg-signal-body" dangerouslySetInnerHTML={sanitizedHtml} />
                  ) : (
                    <p className="sg-signal-body sg-signal-empty">&mdash;</p>
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
              const display =
                rows && rows.length
                  ? rows.slice(0, 5).map((r, i) => ({
                      rank: String(i + 1).padStart(2, '0'),
                      name: String(r.name ?? r.entity ?? ''),
                      subtitle: String(r.subtitle ?? r.segment ?? ''),
                      value: String(r.value ?? ''),
                    }))
                  : Array.from({ length: 5 }, (_, i) => ({
                      rank: String(i + 1).padStart(2, '0'),
                      name: '\u2014',
                      subtitle: '',
                      value: '',
                    }));
              return (
                <section className="sg-accounts" data-testid="signal-accounts">
                  <div className="sg-accounts-head">
                    <h3 className="sg-accounts-title">Top entities</h3>
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
