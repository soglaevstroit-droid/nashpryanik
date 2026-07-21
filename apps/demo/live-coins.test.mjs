import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./public/live-coins.js', import.meta.url), 'utf8');
const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const { calculateStandardCoinUnits, createAnalystSnapshot, projectAnalystCoinUnits } =
  context.window.LiveCoins;
const policy = { coinUnitsPerSecond: 21, dailyStandardLimitCoinUnits: 700_000 };

test('worker and analyst share the existing whole-second capped live formula', () => {
  const startedAt = '2026-07-21T10:00:00.000Z';
  assert.equal(calculateStandardCoinUnits(startedAt, Date.parse(startedAt) + 999, policy), 0);
  assert.equal(calculateStandardCoinUnits(startedAt, Date.parse(startedAt) + 2_000, policy), 42);
  assert.equal(
    calculateStandardCoinUnits(startedAt, Date.parse(startedAt) + 86_400_000, policy),
    700_000,
  );
  assert.match(app, /LiveCoins\.calculateStandardCoinUnits\([\s\S]*?currentShift\.startedAt/);
});

test('analyst projection advances all open shifts without a backend request per second', () => {
  const calculatedAt = '2026-07-21T10:00:00.000Z';
  const summary = {
    earnedTodayCoins: 100,
    calculatedAt,
    live: {
      ...policy,
      activeShifts: [
        { startedAt: '2026-07-21T09:59:50.000Z' },
        { startedAt: '2026-07-21T09:59:55.000Z' },
      ],
    },
  };
  const snapshot = createAnalystSnapshot(summary, Date.parse(calculatedAt));
  assert.equal(projectAnalystCoinUnits(snapshot, Date.parse(calculatedAt)), 10_000);
  assert.equal(projectAnalystCoinUnits(snapshot, Date.parse(calculatedAt) + 1_000), 10_042);
  const ticker = app.match(/function startAnalystTodayTicker\(\)[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(ticker, /setInterval\(renderAnalystTodayCoins, 1_000\)/);
  assert.doesNotMatch(ticker, /fetch|apiFetch|loadAnalystSummary|refreshCurrentWorkspace/);
});

test('fresh server correction is continuous on receipt and converges in five seconds', () => {
  const calculatedAtMs = Date.parse('2026-07-21T10:00:00.000Z');
  const snapshot = createAnalystSnapshot(
    {
      earnedTodayCoins: 90,
      calculatedAt: new Date(calculatedAtMs).toISOString(),
      live: { ...policy, activeShifts: [] },
    },
    calculatedAtMs,
    10_000,
  );
  assert.equal(projectAnalystCoinUnits(snapshot, calculatedAtMs), 10_000);
  assert.equal(projectAnalystCoinUnits(snapshot, calculatedAtMs + 2_500), 9_500);
  assert.equal(projectAnalystCoinUnits(snapshot, calculatedAtMs + 5_000), 9_000);
});

test('hidden analyst tab stops both timers and focus performs an immediate server sync', () => {
  assert.match(
    app,
    /visibilitychange[\s\S]*?stopAnalystPolling\(\)[\s\S]*?stopAnalystTodayTicker\(\)/,
  );
  assert.match(app, /addEventListener\('focus'[\s\S]*?refreshCurrentWorkspace\(\)/);
  assert.match(app, /addEventListener\('pageshow'[\s\S]*?refreshCurrentWorkspace\(\)/);
  assert.match(app, /calculatedAtMs <= analystSummaryCalculatedAtMs/);
});

test('only earned today is projected locally', () => {
  const render = app.match(/function renderAnalystTodayCoins\(\)[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(render, /analystEarnedToday/);
  assert.doesNotMatch(render, /analystTotalEarned|analystWorkerBalance/);
});
