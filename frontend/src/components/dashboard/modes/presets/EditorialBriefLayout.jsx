// EditorialBriefLayout — Plan TSS2 T10.
//
// Magazine-style preset. Every domain-specific literal has been
// purged: topbar stats, kicker, headline, byline, summary, trend /
// forecast series, event markers, top-accounts table, churn-risk
// histogram bins, analyst commentary. All rendered content now flows
// through <Slot> bindings; unbound slots render an em-dash ("—") /
// empty fallback. Narrative HTML payloads are sanitised by
// renderNarrativeMarkdown before reaching dangerouslySetInnerHTML.

import './EditorialBriefLayout.css';
import './slots.css';
import Slot from './Slot.jsx';
import { renderNarrativeMarkdown } from './NarrativeSlot.jsx';

const PRESET_ID = 'editorial-brief';

// Six topbar-metric slots. The old TOP_STATS finance fallback array
// (ARR / NRR / CHURN / LTV:CAC / PAYBACK / NEW LOGOS) is gone; the
// labels and values now come from bindings for eb.topbar-0..5.
const TOPBAR_SLOTS = [0, 1, 2, 3, 4, 5];

const KPI_META = [
  { slotId: 'eb.kpi-0', label: '\u2014' },
  { slotId: 'eb.kpi-1', label: '\u2014' },
  { slotId: 'eb.kpi-2', label: '\u2014' },
  { slotId: 'eb.kpi-3', label: '\u2014' },
];

const CHART_W = 640;
const CHART_H = 260;
const CHART_PAD = { top: 20, right: 24, bottom: 28, left: 48 };

function safeHtmlPayload(markdown) {
  // renderNarrativeMarkdown sanitises its input before returning HTML.
  return { __html: renderNarrativeMarkdown(markdown) };
}

function KpiBox({ meta, slotProps }) {
  return (
    <Slot id={meta.slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value, state }) => {
        const fb =
          state === 'fallback' || state === 'loading'
            ? /** @type {{ value?: string, delta?: string, label?: string }} */ (value)
            : null;
        const bound =
          state === 'bound' && value && typeof value === 'object' ? value : null;
        const displayValue = bound?.value ?? fb?.value ?? '\u2014';
        const delta = bound?.delta ?? fb?.delta ?? '';
        const deltaNeg = delta.startsWith('\u2212') || delta.startsWith('-');
        const label = bound?.label ?? fb?.label ?? meta.label;
        return (
          <div
            className="eb-kpi-box"
            style={{ border: '1px solid #d4cdbf', borderRadius: 2 }}
          >
            <div className="eb-kpi-box__head">
              <span className="eb-kpi-box__label">{label}</span>
              <span
                className={
                  'eb-kpi-box__delta' + (deltaNeg ? ' eb-kpi-box__delta--neg' : '')
                }
              >
                {delta}
              </span>
            </div>
            <div className="eb-kpi-box__value">{displayValue}</div>
            <div className="eb-kpi-box__sub" />
          </div>
        );
      }}
    </Slot>
  );
}

function TopbarStat({ index, slotProps }) {
  return (
    <Slot id={`eb.topbar-${index}`} presetId={PRESET_ID} {...slotProps}>
      {({ value, state }) => {
        const fb =
          state === 'fallback' || state === 'loading'
            ? /** @type {{ value?: string, delta?: string, label?: string }} */ (value)
            : null;
        const bound =
          state === 'bound' && value && typeof value === 'object' ? value : null;
        const label = bound?.label ?? fb?.label ?? '';
        const displayValue = bound?.value ?? fb?.value ?? '\u2014';
        const delta = bound?.delta ?? fb?.delta ?? '';
        return (
          <span className="eb-topbar__stat">
            {label ? `${label} ` : ''}
            <b>{displayValue}</b>
            {delta ? ` ${delta}` : ''}
            {index < TOPBAR_SLOTS.length - 1 ? (
              <span className="eb-topbar__stat-sep"> &middot; </span>
            ) : null}
          </span>
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
        </span>
        <span className="eb-topbar__stats">
          {TOPBAR_SLOTS.map((i) => (
            <TopbarStat key={i} index={i} slotProps={slotProps} />
          ))}
        </span>
        <span className="eb-topbar__meta" />
      </header>

      <Slot id="eb.kicker" presetId={PRESET_ID} {...slotProps}>
        {({ value, state }) => {
          const text =
            state === 'bound' && typeof value === 'string' && value.length > 0
              ? value
              : '';
          return <div className="eb-kicker">{text}</div>;
        }}
      </Slot>

      <article className="eb-masthead">
        <div className="eb-masthead__left">
          <Slot id="eb.headline-topic" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              const text =
                state === 'bound' && typeof value === 'string' && value.length > 0
                  ? value
                  : '';
              return <h1 className="eb-headline">{text}</h1>;
            }}
          </Slot>
          <Slot id="eb.byline" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              const text =
                state === 'bound' && typeof value === 'string' && value.length > 0
                  ? value
                  : '';
              return <p className="eb-byline">{text}</p>;
            }}
          </Slot>
        </div>
        <Slot id="eb.summary" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            if (state === 'bound' && typeof value === 'string' && value.length > 0) {
              // renderNarrativeMarkdown sanitises before HTML insert.
              // eslint-disable-next-line react/no-danger
              return (
                <p
                  className="eb-summary"
                  dangerouslySetInnerHTML={safeHtmlPayload(value)}
                />
              );
            }
            return <p className="eb-summary" />;
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
          {({ value, state }) => {
            const series =
              state === 'bound' && value && typeof value === 'object' && 'rows' in value
                ? /** @type {Array<{month?: string, label?: string, value?: number}>} */ (
                    value.rows
                  )
                : [];
            const xFor = (index, total) => {
              const inner = CHART_W - CHART_PAD.left - CHART_PAD.right;
              return CHART_PAD.left + (inner * index) / Math.max(1, total - 1);
            };
            const values = series
              .map((p) => Number(p?.value))
              .filter((n) => Number.isFinite(n));
            const yMin = values.length ? Math.min(...values) : 0;
            const yMax = values.length ? Math.max(...values) : 1;
            const yRange = yMax - yMin || 1;
            const yFor = (v) => {
              const inner = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
              return CHART_PAD.top + inner * (1 - (v - yMin) / yRange);
            };
            const points = series
              .map((p, i) => {
                const n = Number(p?.value);
                if (!Number.isFinite(n)) return null;
                return { x: xFor(i, series.length), y: yFor(n) };
              })
              .filter(Boolean);
            const linePath = (pts) =>
              pts
                .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                .join(' ');
            return (
              <figure className="eb-panel eb-chart" data-testid="editorial-brief-chart">
                <figcaption className="eb-panel__meta">
                  <span />
                  <span />
                </figcaption>
                <svg
                  viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  aria-label="Primary trace"
                >
                  <line
                    x1={CHART_PAD.left}
                    x2={CHART_W - CHART_PAD.right}
                    y1={CHART_H - CHART_PAD.bottom}
                    y2={CHART_H - CHART_PAD.bottom}
                    className="eb-axis-line"
                  />
                  {series.map((p, i) => {
                    const tick =
                      typeof p?.month === 'string'
                        ? p.month
                        : typeof p?.label === 'string'
                          ? p.label
                          : '';
                    if (!tick) return null;
                    return (
                      <text
                        key={`${tick}-${i}`}
                        x={xFor(i, series.length)}
                        y={CHART_H - CHART_PAD.bottom + 16}
                        textAnchor="middle"
                        className="eb-axis-tick"
                      >
                        {tick}
                      </text>
                    );
                  })}
                  {points.length > 1 ? (
                    <path d={linePath(points)} className="eb-line" />
                  ) : null}
                </svg>
              </figure>
            );
          }}
        </Slot>

        <Slot id="eb.accounts" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            const rows =
              state === 'bound' && value && typeof value === 'object' && 'rows' in value
                ? /** @type {Array<Record<string, unknown>>} */ (value.rows)
                : [];
            const display = rows.slice(0, 8).map((r, i) => ({
              rank: String(i + 1).padStart(2, '0'),
              name: String(r?.name ?? r?.entity ?? ''),
              mrr: String(r?.mrr ?? r?.value ?? ''),
              delta: String(r?.delta ?? ''),
              neg: !!r?.neg || String(r?.delta ?? '').startsWith('\u2212'),
            }));
            return (
              <section className="eb-panel eb-accounts">
                <header className="eb-panel__meta">
                  <span />
                  <span />
                </header>
                <table className="eb-accounts__table">
                  <thead>
                    <tr>
                      <th className="eb-accounts__rank">#</th>
                      <th>Entity</th>
                      <th className="eb-num">Value</th>
                      <th className="eb-num">&Delta;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {display.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="eb-accounts__empty">
                          {'\u2014'}
                        </td>
                      </tr>
                    ) : (
                      display.map((a) => (
                        <tr key={a.rank}>
                          <td className="eb-accounts__rank">{a.rank}</td>
                          <td>{a.name}</td>
                          <td className="eb-num">{a.mrr}</td>
                          <td
                            className={
                              'eb-num ' +
                              (a.neg
                                ? 'eb-accounts__delta--neg'
                                : 'eb-accounts__delta--pos')
                            }
                          >
                            {a.delta}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>
            );
          }}
        </Slot>
      </div>

      <div className="eb-lower">
        <Slot id="eb.histogram" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => {
            const bins =
              state === 'bound' && value && typeof value === 'object' && 'rows' in value
                ? /** @type {Array<{range?: string, count?: number, accent?: boolean}>} */ (
                    value.rows
                  )
                : [];
            const max = bins.reduce(
              (m, b) => Math.max(m, Number(b?.count) || 0),
              0,
            );
            return (
              <section className="eb-panel eb-churn-hist">
                <header className="eb-panel__meta">
                  <span />
                  <span />
                </header>
                <div
                  className="eb-hist"
                  role="img"
                  aria-label="Distribution histogram"
                >
                  {bins.map((bin, i) => {
                    const count = Number(bin?.count) || 0;
                    const height = max > 0 ? (count / max) * 100 : 0;
                    return (
                      <div
                        key={`${bin?.range ?? i}-${i}`}
                        className={
                          'eb-hist__bar' +
                          (bin?.accent ? ' eb-hist__bar--accent' : '')
                        }
                        style={{ height: `${height}%` }}
                        title={`${bin?.range ?? ''}: ${count}`}
                      />
                    );
                  })}
                </div>
                <div className="eb-hist__axis">
                  {bins.map((bin, i) => (
                    <span key={`${bin?.range ?? i}-axis-${i}`}>
                      {String(bin?.range ?? '')}
                    </span>
                  ))}
                </div>
              </section>
            );
          }}
        </Slot>

        <Slot id="eb.commentary" presetId={PRESET_ID} {...slotProps}>
          {({ value, state }) => (
            <section
              className="eb-panel eb-commentary"
              data-testid="editorial-brief-commentary"
            >
              <header className="eb-panel__meta">
                <span />
                <span />
              </header>
              <div className="eb-commentary__body">
                {state === 'bound' && typeof value === 'string' && value.length > 0 ? (
                  // renderNarrativeMarkdown sanitises before HTML insert.
                  // eslint-disable-next-line react/no-danger
                  <div dangerouslySetInnerHTML={safeHtmlPayload(value)} />
                ) : null}
              </div>
            </section>
          )}
        </Slot>
      </div>

      <footer className="eb-footer">
        <span className="eb-footer__left" />
        <span className="eb-footer__center" />
        <span className="eb-footer__right" />
      </footer>
    </div>
  );
}
