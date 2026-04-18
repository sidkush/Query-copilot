import type { DashboardPreset } from './types';
import type { Zone, ContainerZone, LeafZone } from '../freeform/lib/types';
import { _registerPreset } from './registry';
import './boardPack.css';

const BG = '#f5f1e8';
const FG = '#141414';
const ACCENT = '#141414';
const WARN = '#c83e3e';
const RULE = '#dad6cd';

const leaf = (id: string, type: LeafZone['type'], extras: Partial<LeafZone> = {}): LeafZone => ({
  id,
  type,
  w: 1,
  h: 1,
  innerPadding: 16,
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

const HERO_MARKDOWN = [
  '<div class="bp-hero-label">Q3 2026 · NET NEW MRR</div>',
  '',
  '# +$478K',
  '',
  "Q3 MRR expansion carried the quarter. Revenue compounded month-over-month, with enterprise renewals outperforming plan. <span class='bp-warn'>Watch: one late-stage pilot stalled on procurement, representing ~$82K of at-risk upside if it slips to Q4.</span>",
].join('\n');

const TOP_BAR_MARKDOWN = [
  '<div class="bp-topbar">',
  '  <span class="bp-topbar__logo">AskDB</span>',
  '  <span class="bp-topbar__kicker">Q3 REVENUE · BOARD PACK</span>',
  '  <span class="bp-topbar__status">LIVE · AUTO-REFRESH 2S</span>',
  '</div>',
].join('\n');

const KPI_MARKDOWN = [
  '<dl class="bp-kpi-list">',
  '  <div class="bp-kpi-row"><dt>MRR</dt><dd>$2.94M<small>+18.9%</small></dd></div>',
  '  <div class="bp-kpi-row"><dt>ARR</dt><dd>$35.3M<small>+22.4%</small></dd></div>',
  '  <div class="bp-kpi-row"><dt>Net Churn</dt><dd>2.1%<small class="bp-warn">+0.4pp</small></dd></div>',
  '  <div class="bp-kpi-row"><dt>LTV : CAC</dt><dd>4.8x<small>+0.3x</small></dd></div>',
  '  <div class="bp-kpi-row"><dt>Payback</dt><dd>11.2mo<small>−0.7mo</small></dd></div>',
  '</dl>',
].join('\n');

const TOP_ACCOUNTS_MARKDOWN = [
  '<div class="bp-accounts">',
  '  <div class="bp-accounts__head">Five accounts = 41% of MRR</div>',
  '  <ol class="bp-accounts__list">',
  '    <li><span>Meridian Global</span><span>$318K</span></li>',
  '    <li><span>Northwind Industries</span><span>$276K</span></li>',
  '    <li><span>Halcyon Capital</span><span>$241K</span></li>',
  '    <li><span>Ferro &amp; Pike</span><span>$214K</span></li>',
  '    <li><span>Clearwater Labs</span><span>$156K</span></li>',
  '  </ol>',
  '</div>',
].join('\n');

const INSIGHT_MARKDOWN = [
  "<span class='bp-warn'>Watch:</span> churn concentrates in the 91–180 day band. ",
  'Retention playbook proposal lands with the board next cycle.',
].join('');

const starterRoot: ContainerZone = col('bp-root', [
  row(
    'bp-top',
    [leaf('bp-top-text', 'text', { text: { markdown: TOP_BAR_MARKDOWN } })],
    { h: 0.06 },
  ),
  row(
    'bp-headline',
    [
      leaf('bp-hero', 'text', { text: { markdown: HERO_MARKDOWN }, w: 0.5 }),
      leaf('bp-kpis', 'text', { text: { markdown: KPI_MARKDOWN }, w: 0.5 }),
    ],
    { h: 0.38 },
  ),
  row(
    'bp-mid',
    [
      leaf('bp-chart-revenue', 'worksheet', {
        worksheetRef: 'bp:revenueTrend',
        displayName: 'Growth compounded in late Q3',
        w: 0.7,
      }),
      leaf('bp-top-accounts', 'text', { text: { markdown: TOP_ACCOUNTS_MARKDOWN }, w: 0.3 }),
    ],
    { h: 0.36 },
  ),
  row(
    'bp-strip',
    [
      leaf('bp-churn-hist', 'worksheet', { worksheetRef: 'bp:churnDist', w: 1 / 3 }),
      leaf('bp-cohort-bars', 'worksheet', { worksheetRef: 'bp:cohortRetention', w: 1 / 3 }),
      leaf('bp-insight-watch', 'text', { text: { markdown: INSIGHT_MARKDOWN }, w: 1 / 3 }),
    ],
    { h: 0.20 },
  ),
]);

export const boardPackPreset: DashboardPreset = {
  id: 'board-pack',
  name: 'Board Pack',
  tagline: 'Cream tearsheet, editorial. One red for risk.',
  scheme: 'light',
  tokens: {
    bg: BG,
    fg: FG,
    accent: ACCENT,
    accentWarn: WARN,
    border: RULE,
    fontDisplay: "'BoardPackDisplay', ui-sans-serif, system-ui, sans-serif",
    fontBody: "'BoardPackBody', ui-sans-serif, system-ui, sans-serif",
    fontMono: "ui-monospace, 'JetBrains Mono', monospace",
    density: 'spacious',
    radius: 0,
  },
  starter: {
    tiledRoot: starterRoot,
    floatingLayer: [],
  },
};

_registerPreset(boardPackPreset);
