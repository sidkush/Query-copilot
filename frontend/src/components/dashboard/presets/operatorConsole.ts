import type { DashboardPreset } from './types';
import type { Zone, ContainerZone, LeafZone } from '../freeform/lib/types';
import { _registerPreset } from './registry';
import './operatorConsole.css';

const BG = '#0a140e';
const FG = '#b5d8a0';
const ACCENT = FG;
const WARN = '#d9a84a';
const RULE = '#203520';

const leaf = (id: string, type: LeafZone['type'], extras: Partial<LeafZone> = {}): LeafZone => ({
  id,
  type,
  w: 1,
  h: 1,
  innerPadding: 8,
  outerPadding: 0,
  showTitle: false,
  ...extras,
});

const row = (id: string, children: Zone[], extras: Partial<ContainerZone> = {}): ContainerZone => ({
  id,
  type: 'container-horz',
  w: 1,
  h: 1,
  innerPadding: 0,
  outerPadding: 0,
  children,
  ...extras,
});

const col = (id: string, children: Zone[], extras: Partial<ContainerZone> = {}): ContainerZone => ({
  id,
  type: 'container-vert',
  w: 1,
  h: 1,
  innerPadding: 0,
  outerPadding: 0,
  children,
  ...extras,
});

const starterRoot: ContainerZone = col('oc-root', [
  row('oc-status', [
    leaf('oc-status-left', 'text', {
      text: { markdown: 'LAB · LIVE · SYSTEM · PROD-EU-1 · RUN · Q3-2026-042 · OPERATOR · M.CHEN' },
      w: 0.62,
    }),
    leaf('oc-status-right', 'text', {
      text: { markdown: 'T+00:42:14  REV 2.8.1 · 0 ANOMALY · 3 WATCH' },
      w: 0.38,
    }),
  ], { h: 0.05 }),

  col('oc-ch1', [
    leaf('oc-ch1-header', 'text', {
      text: { markdown: '▶ CH.1 — REVENUE SIGNAL' },
      h: 0.25,
    }),
    row('oc-ch1-channels', [
      leaf('oc-ch1a', 'text', {
        text: { markdown: '<!-- CH.1A MRR — binds to OPERATOR_CHANNELS[0] -->' },
        w: 0.25,
      }),
      leaf('oc-ch1b', 'text', {
        text: { markdown: '<!-- CH.1B ARR — binds to OPERATOR_CHANNELS[1] -->' },
        w: 0.25,
      }),
      leaf('oc-ch1c', 'text', {
        text: { markdown: '<!-- CH.1C CHURN — binds to OPERATOR_CHANNELS[2] -->' },
        w: 0.25,
      }),
      leaf('oc-ch1d', 'text', {
        text: { markdown: '<!-- CH.1D PAYBACK — binds to OPERATOR_CHANNELS[3] -->' },
        w: 0.25,
      }),
    ], { h: 0.75 }),
  ], { h: 0.18 }),

  col('oc-ch2', [
    leaf('oc-ch2-header', 'text', {
      text: { markdown: '▶ CH.2 — REVENUE TRACE' },
      h: 0.10,
    }),
    leaf('oc-ch2-chart', 'worksheet', {
      worksheetRef: 'oc:revenueTrace',
      displayName: 'Revenue trace · 60D band',
      h: 0.90,
    }),
  ], { h: 0.38 }),

  row('oc-split', [
    col('oc-ch3', [
      leaf('oc-ch3-header', 'text', {
        text: { markdown: '▶ CH.3 — CHURN RISK DISTRIBUTION' },
        h: 0.12,
      }),
      leaf('oc-ch3-hist', 'worksheet', {
        worksheetRef: 'oc:churnBins',
        h: 0.88,
      }),
    ], { w: 0.5 }),
    col('oc-ch4', [
      leaf('oc-ch4-header', 'text', {
        text: { markdown: '▶ CH.4 — EVENT LOG' },
        h: 0.12,
      }),
      leaf('oc-ch4-log', 'text', {
        text: { markdown: '<!-- event log — binds to OPERATOR_EVENT_LOG -->' },
        h: 0.88,
      }),
    ], { w: 0.5 }),
  ], { h: 0.34 }),

  row('oc-footer', [
    leaf('oc-footer-left', 'text', {
      text: { markdown: 'BIGQUERY://PROD.FINANCE_REPORTS' },
      w: 0.38,
    }),
    leaf('oc-footer-center', 'text', {
      text: { markdown: 'SAMPLE 1/1D · BAND 30D · FILT NONE' },
      w: 0.28,
    }),
    leaf('oc-footer-right', 'text', {
      text: { markdown: 'CPU 8.4% · MEM 412M · UPLINK OK · RENDER 128MS' },
      w: 0.34,
    }),
  ], { h: 0.05 }),
]);

export const operatorConsolePreset: DashboardPreset = {
  id: 'operator-console',
  name: 'Operator Console',
  tagline: 'CRT phosphor. Mission-control ops terminal.',
  scheme: 'dark',
  tokens: {
    bg: BG,
    fg: FG,
    accent: ACCENT,
    accentWarn: WARN,
    border: RULE,
    fontDisplay: "'OperatorConsoleMono', ui-monospace, 'JetBrains Mono', monospace",
    fontBody: "'OperatorConsoleMono', ui-monospace, 'JetBrains Mono', monospace",
    fontMono: "'OperatorConsoleMono', ui-monospace, 'JetBrains Mono', monospace",
    density: 'compact',
    radius: 0,
  },
  starter: {
    tiledRoot: starterRoot,
    floatingLayer: [],
  },
};

_registerPreset(operatorConsolePreset);
