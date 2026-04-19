// src/components/dashboard/modes/presets/OperatorConsoleLayout.jsx
// Plan A* Phase 4 (Wave 2-OC) — CRT-terminal layout, wireframe 2.
// TSS2 T8 — hardcoded telemetry literals purged. Every data region now
// renders exclusively through its <Slot id="oc.*">; unbound slots fall
// back to the universal em-dash ('—') or an empty frame.

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

// Slot ids for the four CH.1 channel tiles. Labels/units/values all come
// from the bound descriptor (Slot fallback: { value: '—', … }) — the
// layout intentionally carries no fake "MRR / ARR / Churn / Payback"
// copy. Channel ids still drive the data-channel attribute so CSS can
// tint each slot deterministically.
const CHANNEL_SLOTS = [
  { slotId: 'oc.ch1a', id: 'ch1a' },
  { slotId: 'oc.ch1b', id: 'ch1b' },
  { slotId: 'oc.ch1c', id: 'ch1c' },
  { slotId: 'oc.ch1d', id: 'ch1d' },
];

// Y-axis ticks for the revenue-trace frame are pure chrome — they do
// not claim a data value, only the ruled baseline. Kept as abstract
// 1..5 ticks so the SVG retains its phosphor chrome without lying
// about a specific revenue scale.
const Y_TICKS = [
  { label: '', y: 36 },
  { label: '', y: 86 },
  { label: '', y: 136 },
  { label: '', y: 186 },
  { label: '', y: 236 },
];

function ChannelSlot({ meta, slotProps }) {
  return (
    <Slot id={meta.slotId} presetId={PRESET_ID} {...slotProps}>
      {({ value, state }) => {
        // Descriptor fallback is { value, unit, delta, footer, footerTone,
        // label }. Bound value is { value, delta?, label? } from formatValue.
        const fb = state === 'fallback' || state === 'loading'
          ? /** @type {{ value?: string, unit?: string, delta?: string, footer?: string, footerTone?: string, label?: string }} */ (value)
          : null;
        const bound = state === 'bound' && value && typeof value === 'object'
          ? value
          : null;
        const displayValue = bound?.value ?? fb?.value ?? '—';
        const unit = fb?.unit ?? '';
        const delta = bound?.delta ?? fb?.delta ?? '';
        const deltaTone = delta.startsWith('\u2212') || delta.startsWith('-')
          ? 'neg'
          : 'pos';
        const footer = fb?.footer ?? '—';
        const footerTone = fb?.footerTone ?? null;
        // Label is derived from the bound field (or '—' when unbound) —
        // we no longer hardcode "MRR · CH.1A" etc.
        const label = bound?.label ?? fb?.label ?? '—';
        return (
          <div className="oc-channel" data-channel={meta.id}>
            <div className="oc-channel__label">{label}</div>
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
        </div>
        <div className="oc-topstrip__right">
          <NarrativeSlot
            id="oc.metadata"
            presetId={PRESET_ID}
            slotProps={slotProps}
            as="span"
            className="oc-topstrip__dim oc-topstrip__metadata"
          />
        </div>
      </header>

      <section className="oc-ch1" data-testid="operator-console-ch1">
        <div className="oc-ch-header">
          <span>▶ CH.1</span>
        </div>
        <div className="oc-channels">
          {CHANNEL_SLOTS.map((c) => (
            <ChannelSlot key={c.id} meta={c} slotProps={slotProps} />
          ))}
        </div>
      </section>

      <section className="oc-ch2" data-testid="operator-console-ch2">
        <div className="oc-ch-header">
          <span>▶ CH.2 — TRACE</span>
        </div>

        <div className="oc-trace-wrap">
          <div className="oc-trace-live" aria-hidden="false">
            <span className="oc-dot" aria-hidden="true" />
            LIVE
          </div>

          <Slot id="oc.trace" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              // Bound path: value is { points: [[x,y], …] } from formatValue
              // (normalised to the 1000×260 viewbox). Fallback: no path.
              const points =
                state === 'bound' &&
                value &&
                typeof value === 'object' &&
                Array.isArray(value.points)
                  ? value.points
                  : [];
              const path = points.length
                ? points
                    .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
                    .join(' ')
                : '';
              return (
                <svg
                  className="oc-trace"
                  viewBox="0 0 1000 260"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Trace"
                >
                  {Y_TICKS.map((t, i) => (
                    <text
                      key={i}
                      className="oc-trace-axis-label"
                      x={4}
                      y={t.y}
                      textAnchor="start"
                    >
                      {t.label}
                    </text>
                  ))}
                  <line
                    x1={40}
                    x2={990}
                    y1={236}
                    y2={236}
                    stroke="#203520"
                    strokeWidth="1"
                  />
                  {path ? <path className="oc-trace-line" d={path} /> : null}
                </svg>
              );
            }}
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
            <span>▶ CH.3 — DISTRIBUTION</span>
          </div>
          <Slot id="oc.histogram" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              // Bound: value = { bins: [{ x, h, tone? }, …] } (h in [0,100]).
              // Fallback: empty frame — no hardcoded 13-bar churn histogram.
              const bins =
                state === 'bound' &&
                value &&
                typeof value === 'object' &&
                Array.isArray(value.bins)
                  ? value.bins
                  : [];
              return (
                <div className="oc-hist-wrap">
                  <div className="oc-hist">
                    {bins.map((b, i) => (
                      <div
                        key={`${b.x ?? i}-${i}`}
                        className="oc-hist__bar"
                        data-bin={b.tone ?? 'mid'}
                        style={{ height: `${b.h ?? 0}%` }}
                        title={b.x != null ? String(b.x) : ''}
                      />
                    ))}
                  </div>
                  <div className="oc-hist-axis" aria-hidden="true">
                    {bins.map((b, i) => (
                      <span key={`${b.x ?? i}-${i}`}>{b.x ?? ''}</span>
                    ))}
                  </div>
                </div>
              );
            }}
          </Slot>
        </section>

        <section className="oc-ch4" data-testid="operator-console-eventlog">
          <div className="oc-ch-header">
            <span>▶ CH.4 — EVENT LOG</span>
          </div>
          <Slot id="oc.event-log" presetId={PRESET_ID} {...slotProps}>
            {({ value, state }) => {
              // Bound: value = { rows: [{ time, status, msg }] }. Fallback:
              // empty <ul> — the old 8-row fake log (Warehouse ingest /
              // Waverly / Amberline / …) has been removed.
              const rows =
                state === 'bound' &&
                value &&
                typeof value === 'object' &&
                'rows' in value &&
                Array.isArray(value.rows)
                  ? value.rows
                  : [];
              const display = rows.slice(0, 8).map((r, i) => ({
                time: String(r.time ?? r.ts ?? ''),
                status: String(r.status ?? r.severity ?? 'ok').toLowerCase(),
                msg: String(r.msg ?? r.message ?? r.event ?? ''),
                key: `${r.time ?? i}-${i}`,
              }));
              return (
                <ul className="oc-log">
                  {display.map((e) => (
                    <li
                      key={e.key}
                      className="oc-log__row"
                      data-status={e.status}
                    >
                      <span className="oc-log__time">{e.time}</span>
                      <span className="oc-log__tag">
                        {e.status.toUpperCase()}
                      </span>
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
        <NarrativeSlot
          id="oc.footer"
          presetId={PRESET_ID}
          slotProps={slotProps}
          as="div"
          className="oc-footer__line"
        />
      </footer>
    </div>
  );
}
