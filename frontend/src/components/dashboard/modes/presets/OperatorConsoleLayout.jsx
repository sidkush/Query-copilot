// src/components/dashboard/modes/presets/OperatorConsoleLayout.jsx
// Plan A* Phase 4 (Wave 2-OC) — bespoke CRT-terminal layout for the
// Operator Console preset. Renders wireframe 2 verbatim: mission-control
// top strip, four channel tiles (CH.1A–D), anomaly-annotated revenue
// trace, churn-risk histogram, OK/WARN/ERR-tagged event log, footer
// status strip.  Purely presentational — all fixture content inlined
// so the layout mounts standalone under vitest jsdom.

import './OperatorConsoleLayout.css';

// Critical theme tokens inlined on the root so the bespoke layout mounts
// with the correct phosphor palette even in environments that can't parse
// the imported stylesheet (jsdom/vitest). The class-based rules in
// OperatorConsoleLayout.css still drive the real-app visuals — this block
// just guarantees the TDD contract for computed bg/fg/font-family.
const ROOT_STYLE = Object.freeze({
  background: '#0a140e',
  color: '#b5d8a0',
  fontFamily:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});

/* ----------------------------- channel tiles ----------------------------- */
const CHANNELS = [
  {
    id: 'ch1a',
    label: 'MRR · CH.1A',
    value: '2.47',
    unit: 'M$',
    delta: '+12.4%',
    deltaTone: 'pos',
    footer: 'nom',
  },
  {
    id: 'ch1b',
    label: 'ARR · CH.1B',
    value: '29.6',
    unit: 'M$',
    delta: '+8.7%',
    deltaTone: 'pos',
    footer: 'nom',
  },
  {
    id: 'ch1c',
    label: 'CHURN · CH.1C',
    value: '2.31',
    unit: '%',
    delta: '−0.4pp',
    deltaTone: 'neg',
    footer: 'nom',
  },
  {
    id: 'ch1d',
    label: 'PAYBACK · CH.1D',
    value: '14.2',
    unit: 'mo',
    delta: '+0.8mo',
    deltaTone: 'neg',
    footer: 'WATCH',
    footerTone: 'warn',
  },
];

/* ------------------------- revenue trace geometry ------------------------ */
// SVG viewBox is 1000 × 260. Y=0 is top. Trace walks L→R with natural
// easing. Anomaly marker sits past the midline (x≈720) so the callout
// has room on the upper-right.
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

/* ------------------------ churn-risk distribution ------------------------ */
// 13 bins: 0,10,20,…,80,85,90,95+. Heights simulate a right-skew with
// tail bins in the red risk zone.
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

/* ------------------------------ event log -------------------------------- */
const EVENT_LOG = [
  { time: '09:42:14', status: 'ok',   msg: 'Warehouse ingest 247K rows · p95=148ms' },
  { time: '09:41:58', status: 'ok',   msg: 'Cache warmed · schema_hash=a3f91c' },
  { time: '09:41:12', status: 'warn', msg: 'Waverly flat 6wk · churn_score 87' },
  { time: '09:40:44', status: 'ok',   msg: 'Amberline expansion confirmed +18%' },
  { time: '09:40:02', status: 'warn', msg: 'Thornton adoption ↓40 after leader chg' },
  { time: '09:39:48', status: 'err',  msg: 'bigquery slot saturation (recovered 3s)' },
  { time: '09:39:12', status: 'ok',   msg: 'Beta-Axion seat expansion +48 seats' },
  { time: '09:38:44', status: 'ok',   msg: 'Q3 close report drafted · reviewed by d.park' },
];

/* ========================================================================= */

export default function OperatorConsoleLayout() {
  return (
    <div
      className="oc-layout"
      data-testid="layout-operator-console"
      data-preset="operator-console"
      style={ROOT_STYLE}
    >
      {/* 1. Mission-control top strip ---------------------------------- */}
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

      {/* 2. CH.1 — REVENUE SIGNAL -------------------------------------- */}
      <section className="oc-ch1" data-testid="operator-console-ch1">
        <div className="oc-ch-header">
          <span>▶ CH.1 — REVENUE SIGNAL</span>
          <span className="oc-ch-header__meta">
            Δ 12.4% · confidence 0.97 · sample n=842
          </span>
        </div>
        <div className="oc-channels">
          {CHANNELS.map((c) => (
            <div
              key={c.id}
              className="oc-channel"
              data-channel={c.id}
            >
              <div className="oc-channel__label">{c.label}</div>
              <div className="oc-channel__value">
                <span>{c.value}</span>
                <small>{c.unit}</small>
              </div>
              <div
                className={`oc-channel__delta oc-channel__delta--${c.deltaTone}`}
              >
                {c.delta}
              </div>
              <div
                className={
                  'oc-channel__footer' +
                  (c.footerTone === 'warn' ? ' oc-channel__footer--warn' : '')
                }
              >
                {c.footer}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. CH.2 — REVENUE TRACE --------------------------------------- */}
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

          <svg
            className="oc-trace"
            viewBox="0 0 1000 260"
            preserveAspectRatio="none"
            role="img"
            aria-label="Revenue trace with anomaly marker"
          >
            {/* Y-axis tick labels */}
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

            {/* Baseline hairline */}
            <line
              x1={40}
              x2={990}
              y1={236}
              y2={236}
              stroke="#203520"
              strokeWidth="1"
            />

            {/* Phosphor trace */}
            <path className="oc-trace-line" d={TRACE_PATH} />

            {/* Anomaly vertical dashed line */}
            <line
              className="oc-trace-anomaly-line"
              x1={ANOMALY_X}
              x2={ANOMALY_X}
              y1={16}
              y2={244}
            />

            {/* Anomaly dot */}
            <circle
              className="oc-trace-anomaly-dot"
              cx={ANOMALY_X}
              cy={ANOMALY_Y}
              r={4.5}
            />

            {/* Anomaly in-trace label — anchored END (right edge) and placed
                to the LEFT of the anomaly dot so it doesn't collide with the
                ANOMALY callout box sitting in the SVG's upper-right corner. */}
            <text
              className="oc-trace-anomaly-label"
              x={ANOMALY_X - 10}
              y={ANOMALY_Y - 8}
              textAnchor="end"
            >
              EVT ▲ BetaAxion <tspan>+$120K</tspan>
            </text>
          </svg>

          <div className="oc-anomaly-callout" role="note">
            <div className="oc-anomaly-callout__title">ANOMALY · T+498</div>
            <div className="oc-anomaly-callout__meta">
              ΔSlope 2.3σ above baseline
              <br />
              corr: acme_renewal · 0.89
            </div>
          </div>
        </div>
      </section>

      {/* 4. Bottom split: CH.3 + CH.4 ---------------------------------- */}
      <div className="oc-split">
        <section className="oc-ch3" data-testid="operator-console-ch3">
          <div className="oc-ch-header">
            <span>▶ CH.3 — CHURN RISK DISTRIBUTION</span>
            <span className="oc-ch-header__meta">n=842 · 30d</span>
          </div>
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
        </section>

        <section className="oc-ch4" data-testid="operator-console-eventlog">
          <div className="oc-ch-header">
            <span>▶ CH.4 — EVENT LOG</span>
            <span className="oc-ch-header__meta">tail · live</span>
          </div>
          <ul className="oc-log">
            {EVENT_LOG.map((e, i) => (
              <li
                key={`${e.time}-${i}`}
                className="oc-log__row"
                data-status={e.status}
              >
                <span className="oc-log__time">{e.time}</span>
                <span className="oc-log__tag">{e.status.toUpperCase()}</span>
                <span className="oc-log__msg">{e.msg}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 5. Footer status strip --------------------------------------- */}
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
