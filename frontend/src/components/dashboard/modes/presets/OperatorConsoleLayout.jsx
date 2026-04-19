// src/components/dashboard/modes/presets/OperatorConsoleLayout.jsx
// Plan A* Phase 4 (Wave 2-OC) — CRT-terminal layout, wireframe 2.
// TSS Wave 2-B — literals now route through <Slot> wrappers so the
// autogen pipeline can bind real telemetry while the static fixture
// still renders verbatim under the wireframe fallback.

import './OperatorConsoleLayout.css';
import './slots.css';
import Slot from './Slot.jsx';
import NarrativeSlot from './NarrativeSlot.jsx';

const PRESET_ID = 'operator-console';

const ROOT_STYLE = Object.freeze({
  background: '#0a140e',
  color: '#b5d8a0',
  fontFamily:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});

const CHANNEL_META = [
  { slotId: 'oc.ch1a', id: 'ch1a', label: 'MRR · CH.1A' },
  { slotId: 'oc.ch1b', id: 'ch1b', label: 'ARR · CH.1B' },
  { slotId: 'oc.ch1c', id: 'ch1c', label: 'CHURN · CH.1C' },
  { slotId: 'oc.ch1d', id: 'ch1d', label: 'PAYBACK · CH.1D' },
];

// Revenue trace geometry (unchanged from Plan A*).
const TRACE_POINTS = [
  [40, 200], [120, 188], [200, 170], [280, 178], [360, 152],
  [440, 136], [520, 126], [600, 108], [680, 82], [720, 64],
  [760, 98], [840, 82], [920, 60], [980, 48],
];
const TRACE_PATH = TRACE_POINTS
  .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
  .join(' ');

const ANOMALY_X = 720;
const ANOMALY_Y = 64;

const Y_TICKS = [
  { label: '3.0M', y: 36 },
  { label: '2.5M', y: 86 },
  { label: '2.0M', y: 136 },
  { label: '1.5M', y: 186 },
  { label: '1.0M', y: 236 },
];

const HIST_BINS = [
  { x: '0',   h: 18, tone: 'low'  },
  { x: '10',  h: 28, tone: 'low'  },
  { x: '20',  h: 42, tone: 'low'  },
  { x: '30',  h: 56, tone: 'mid'  },
  { x: '40',  h: 68, tone: 'mid'  },
  { x: '50',  h: 78, tone: 'mid'  },
  { x: '60',  h: 84, tone: 'high' },
  { x: '70',  h: 74, tone: 'high' },
  { x: '80',  h: 58, tone: 'high' },
  { x: '85',  h: 46, tone: 'risk' },
  { x: '90',  h: 32, tone: 'risk' },
  { x: '95+', h: 22, tone: 'risk' },
  { x: '99',  h: 12, tone: 'risk' },
];

const DEFAULT_EVENT_LOG = [
  { time: '09:42:14', status: 'ok',   msg: 'Warehouse ingest 247K rows · p95=148ms' },
  { time: '09:41:58', status: 'ok',   msg: 'Cache warmed · schema_hash=a3f91c' },
  { time: '09:41:12', status: 'warn', msg: 'Waverly flat 6wk · churn_score 87' },
  { time: '09:40:44', status: 'ok',   msg: 'Amberline expansion confirmed +18%' },
  { time: '09:40:02', status: 'warn', msg: 'Thornton adoption ↓40 after leader chg' },
  { time: '09:39:48', status: 'err',  msg: 'bigquery slot saturation (recovered 3s)' },
  { time: '09:39:12', status: 'ok',   msg: 'Beta-Axion seat expansion +48 seats' },
  { time: '09:38:44', status: 'ok',   msg: 'Q3 close report drafted · reviewed by d.park' },
];

function ChannelSlot({ meta, slotProps }) {
  return (
    <Slot id={meta.slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value, state }) => {
        // Descriptor fallback is { value, unit, delta, footer, footerTone }.
        // Bound value is { value, delta? } from formatValue.
        const fb = state === 'fallback' || state === 'loading'
          ? /** @type {{ value?: string, unit?: string, delta?: string, footer?: string, footerTone?: string }} */ (value)
          : null;
        const bound = state === 'bound' && value && typeof value === 'object'
          ? value
          : null;
        const displayValue = bound?.value ?? fb?.value ?? '';
        const unit = fb?.unit ?? '';
        const delta = bound?.delta ?? fb?.delta ?? '';
        const deltaTone = delta.startsWith('\u2212') || delta.startsWith('-')
          ? 'neg'
          : 'pos';
        const footer = fb?.footer ?? 'nom';
        const footerTone = fb?.footerTone ?? null;
        return (
          <div className="oc-channel" data-channel={meta.id}>
            <div className="oc-channel__label">{meta.label}</div>
            <div className="oc-channel__value">
              <span>{displayValue}</span>
              <small>{unit}</small>
            </div>
            <div className={`oc-channel__delta oc-channel__delta--${deltaTone}`}>
              {delta}
            </div>
            <div
              className={
                'oc-channel__footer' +
                (footerTone === 'warn' ? ' oc-channel__footer--warn' : '')
              }
            >
              {footer}
            </div>
          </div>
        );
      }}
    </Slot>
  );
}

export default function OperatorConsoleLayout({
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
      className="oc-layout"
      data-testid="layout-operator-console"
      data-preset="operator-console"
      style={ROOT_STYLE}
    >
      <header className="oc-topstrip">
        <div className="oc-topstrip__left">
          <span className="oc-topstrip__bright">
            <span className="oc-dot" aria-hidden="true" />
            LAB
          </span>
          <span className="oc-topstrip__dim">·</span>
          <span className="oc-topstrip__bright">LIVE</span>
          <span className="oc-topstrip__dim">·</span>
          <span className="oc-topstrip__bright">SYSTEM</span>
          <span className="oc-topstrip__dim">· PROD-EU-1 · RUN · Q3-2026-042 · OPERATOR · M.CHEN</span>
        </div>
        <div className="oc-topstrip__right">
          <span className="oc-topstrip__dim">T+00:42:14</span>
          <span className="oc-topstrip__dim">·</span>
          <span className="oc-topstrip__dim">REV 2.8.1</span>
          <span className="oc-topstrip__dim">·</span>
          <span className="oc-topstrip__dim">0 ANOMALY</span>
          <span className="oc-topstrip__dim">·</span>
          <span className="oc-topstrip__warn">3 WATCH</span>
        </div>
      </header>

      <section className="oc-ch1" data-testid="operator-console-ch1">
        <div className="oc-ch-header">
          <span>▶ CH.1 — REVENUE SIGNAL</span>
          <span className="oc-ch-header__meta">
            Δ 12.4% · confidence 0.97 · sample n=842
          </span>
        </div>
        <div className="oc-channels">
          {CHANNEL_META.map((c) => (
            <ChannelSlot key={c.id} meta={c} slotProps={slotProps} />
          ))}
        </div>
      </section>

      <section className="oc-ch2" data-testid="operator-console-ch2">
        <div className="oc-ch-header">
          <span>▶ CH.2 — REVENUE TRACE</span>
          <span className="oc-ch-header__meta">
            12mo · bandwidth 30d · sampling 1/day
          </span>
        </div>

        <div className="oc-trace-wrap">
          <div className="oc-trace-live" aria-hidden="false">
            <span className="oc-dot" aria-hidden="true" />
            LIVE
          </div>

          <Slot id="oc.trace" presetId={PRESET_ID} {...slotProps}>
            {() => (
              <svg
                className="oc-trace"
                viewBox="0 0 1000 260"
                preserveAspectRatio="none"
                role="img"
                aria-label="Revenue trace with anomaly marker"
              >
                {Y_TICKS.map((t) => (
                  <text
                    key={t.label}
                    className="oc-trace-axis-label"
                    x={4}
                    y={t.y}
                    textAnchor="start"
                  >
                    {t.label}
                  </text>
                ))}
                <line x1={40} x2={990} y1={236} y2={236} stroke="#203520" strokeWidth="1" />
                <path className="oc-trace-line" d={TRACE_PATH} />
                <line
                  className="oc-trace-anomaly-line"
                  x1={ANOMALY_X}
                  x2={ANOMALY_X}
                  y1={16}
                  y2={244}
                />
                <circle
                  className="oc-trace-anomaly-dot"
                  cx={ANOMALY_X}
                  cy={ANOMALY_Y}
                  r={4.5}
                />
                <text
                  className="oc-trace-anomaly-label"
                  x={ANOMALY_X - 10}
                  y={ANOMALY_Y - 8}
                  textAnchor="end"
                >
                  EVT ▲ BetaAxion <tspan>+$120K</tspan>
                </text>
              </svg>
            )}
          </Slot>

          <NarrativeSlot
            id="oc.trace-anomaly-callout"
            presetId={PRESET_ID}
            slotProps={slotProps}
            as="div"
            className="oc-anomaly-callout"
            fallbackRender={(text) => {
              const [title, ...body] = (text || '').split('\n');
              return (
                <>
                  <div className="oc-anomaly-callout__title">{title}</div>
                  <div className="oc-anomaly-callout__meta">
                    {body.map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < body.length - 1 ? <br /> : null}
                      </span>
                    ))}
                  </div>
                </>
              );
            }}
          />
        </div>
      </section>

      <div className="oc-split">
        <section className="oc-ch3" data-testid="operator-console-ch3">
          <div className="oc-ch-header">
            <span>▶ CH.3 — CHURN RISK DISTRIBUTION</span>
            <span className="oc-ch-header__meta">n=842 · 30d</span>
          </div>
          <Slot id="oc.histogram" presetId={PRESET_ID} {...slotProps}>
            {() => (
              <div className="oc-hist-wrap">
                <div className="oc-hist">
                  {HIST_BINS.map((b) => (
                    <div
                      key={b.x}
                      className="oc-hist__bar"
                      data-bin={b.tone}
                      style={{ height: `${b.h}%` }}
                      title={`churn score ${b.x}`}
                    />
                  ))}
                </div>
                <div className="oc-hist-axis" aria-hidden="true">
                  {HIST_BINS.map((b) => (
                    <span key={b.x}>{b.x}</span>
                  ))}
                </div>
              </div>
            )}
          </Slot>
        </section>

        <section className="oc-ch4" data-testid="operator-console-eventlog">
          <div className="oc-ch-header">
            <span>▶ CH.4 — EVENT LOG</span>
            <span className="oc-ch-header__meta">tail · live</span>
          </div>
          <Slot id="oc.event-log" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              const rows =
                state === 'bound' && value && typeof value === 'object' && 'rows' in value
                  ? value.rows
                  : null;
              const display = rows && rows.length
                ? rows.slice(0, 8).map((r, i) => ({
                    time: String(r.time ?? r.ts ?? ''),
                    status: String(r.status ?? r.severity ?? 'ok').toLowerCase(),
                    msg: String(r.msg ?? r.message ?? r.event ?? ''),
                    key: `${r.time ?? i}-${i}`,
                  }))
                : DEFAULT_EVENT_LOG.map((e, i) => ({ ...e, key: `${e.time}-${i}` }));
              return (
                <ul className="oc-log">
                  {display.map((e) => (
                    <li
                      key={e.key}
                      className="oc-log__row"
                      data-status={e.status}
                    >
                      <span className="oc-log__time">{e.time}</span>
                      <span className="oc-log__tag">{e.status.toUpperCase()}</span>
                      <span className="oc-log__msg">{e.msg}</span>
                    </li>
                  ))}
                </ul>
              );
            }}
          </Slot>
        </section>
      </div>

      <footer className="oc-footer">
        <div className="oc-footer__left">
          <span className="oc-footer__glyph">▶</span>
          BIGQUERY://PROD.FINANCE_REPORTS
        </div>
        <div className="oc-footer__center">
          SAMPLE 1/1D · BAND 30D · FILT NONE
        </div>
        <div className="oc-footer__right">
          CPU 8.4% · MEM 412M ·{' '}
          <span className="oc-bright">UPLINK OK</span>
          {' · '}RENDER 128MS
        </div>
      </footer>
    </div>
  );
}
