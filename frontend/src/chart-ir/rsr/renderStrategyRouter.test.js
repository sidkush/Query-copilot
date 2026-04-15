/**
 * RSR decision matrix tests. Every cell of the decision tree should hit.
 * If you add a new branch, add a test here first.
 *
 * Runs via `node --test` — no experimental flags required on .js files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRenderStrategy } from './renderStrategyRouter.js';

/** @returns {import('./strategy.js').RenderStrategyInput} */
function baseInput(overrides = {}) {
  return {
    spec: {
      type: 'cartesian',
      mark: 'line',
      encoding: {
        x: { field: 'date', type: 'temporal' },
        y: { field: 'revenue', type: 'quantitative' },
      },
    },
    resultProfile: {
      rowCount: 1000,
      markEligibleForDeck: true,
      xType: 'temporal',
      yType: 'quantitative',
    },
    gpuTier: 'medium',
    frameBudgetState: 'normal',
    instancePressure: { activeContexts: 0, max: 12, pressureRatio: 0 },
    ...overrides,
  };
}

test('T0 SVG for tiny line chart', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 500, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
  }));
  assert.equal(s.tier, 't0');
  assert.equal(s.rendererBackend, 'svg');
  assert.equal(s.downsample.enabled, false);
});

test('T1 Canvas for medium line chart', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 50_000, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
  }));
  assert.equal(s.tier, 't1');
  assert.equal(s.rendererBackend, 'canvas');
  assert.equal(s.rendererFamily, 'vega');
});

test('T2 deck.gl for large scatter', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 300_000, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
  }));
  assert.equal(s.tier, 't2');
  assert.equal(s.rendererFamily, 'deck');
  assert.equal(s.rendererBackend, 'webgl');
});

test('T3 streaming for huge time series', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 10_000_000, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
  }));
  assert.equal(s.tier, 't3');
  assert.equal(s.streaming.enabled, true);
  assert.equal(s.downsample.method, 'lttb');
});

test('Non-deck-eligible mark stays on Vega even at 500k rows', () => {
  const s = pickRenderStrategy(baseInput({
    spec: { type: 'cartesian', mark: 'boxplot', encoding: {} },
    resultProfile: { rowCount: 500_000, markEligibleForDeck: false, xType: 'quantitative', yType: 'quantitative' },
  }));
  assert.equal(s.rendererFamily, 'vega');
  assert.equal(s.downsample.enabled, true);
  assert.ok(s.downsample.targetPoints <= 4_000);
});

test('Low GPU tier clamps at T1', () => {
  const s = pickRenderStrategy(baseInput({
    gpuTier: 'low',
    resultProfile: { rowCount: 1_000_000, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
  }));
  assert.equal(s.tier, 't1');
  assert.equal(s.rendererFamily, 'vega');
  assert.equal(s.downsample.enabled, true);
});

test('High instance pressure downshifts one tier', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 300_000, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
    instancePressure: { activeContexts: 11, max: 12, pressureRatio: 0.92 },
  }));
  // Would have been t2; downshifted to t1
  assert.equal(s.tier, 't1');
});

test('Tight frame budget escalates one tier', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 50_000, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
    frameBudgetState: 'tight',
  }));
  // Would have been t1 Canvas; escalated to t2 deck
  assert.equal(s.tier, 't2');
});

test('Hint t2 honored for deck-eligible mark', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 1000, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
    hint: 't2',
  }));
  assert.equal(s.tier, 't2');
});

test('Hint t2 refused for non-deck-eligible mark', () => {
  const s = pickRenderStrategy(baseInput({
    spec: { type: 'cartesian', mark: 'boxplot', encoding: {} },
    resultProfile: { rowCount: 1000, markEligibleForDeck: false, xType: 'quantitative', yType: 'quantitative' },
    hint: 't2',
  }));
  assert.notEqual(s.tier, 't2');
  assert.match(s.reason, /refused/i);
});

test('Map spec.type always uses maplibre family regardless of rowCount', () => {
  const s = pickRenderStrategy(baseInput({
    spec: { type: 'map', mark: 'geoshape', encoding: {} },
    resultProfile: { rowCount: 50, markEligibleForDeck: false },
  }));
  assert.equal(s.rendererFamily, 'maplibre');
});

test('Creative spec.type always uses creative family', () => {
  const s = pickRenderStrategy(baseInput({
    spec: { type: 'creative', encoding: {} },
  }));
  assert.equal(s.rendererFamily, 'creative');
});

test('Streaming gate at exactly 200k+1 rows', () => {
  const s = pickRenderStrategy(baseInput({
    resultProfile: { rowCount: 200_001, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
  }));
  assert.equal(s.streaming.enabled, true);
});

test('Reason field is non-empty for every strategy', () => {
  const cases = [100, 50_000, 300_000, 5_000_000];
  for (const rowCount of cases) {
    const s = pickRenderStrategy(baseInput({
      resultProfile: { rowCount, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative' },
    }));
    assert.ok(s.reason.length > 0, `empty reason for rowCount=${rowCount}`);
  }
});
