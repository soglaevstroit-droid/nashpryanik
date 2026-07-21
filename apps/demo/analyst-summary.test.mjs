import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const analystHeader = html.match(/<header class="analystTop"[\s\S]*?<\/header>/)?.[0] ?? '';

test('analyst header is informational and contains no worker shift or personal balance controls', () => {
  assert.match(analystHeader, /Добро пожаловать/);
  assert.match(analystHeader, /id="analystUserInfo"/);
  assert.doesNotMatch(analystHeader, /Начать работу|Закончить работу|data-shift-action/iu);
  assert.doesNotMatch(analystHeader, /Статус|Начислено|Ожидание|totalCoinBalance/);
  assert.match(css, /#workspaceScreen\.analyst-mode \.workerTop \{[\s\S]*?display:\s*none/);
  assert.match(css, /#workspaceScreen\.analyst-mode \.analystTop \{[\s\S]*?display:\s*grid/);
});

test('analyst header renders the three equal system aggregates from the summary API', () => {
  assert.match(analystHeader, /Общая сумма/);
  assert.match(analystHeader, /Остаток/);
  assert.match(analystHeader, /За сегодня/);
  assert.match(analystHeader, /id="analystTotalEarned"/);
  assert.match(analystHeader, /id="analystWorkerBalance"/);
  assert.match(analystHeader, /id="analystEarnedToday"/);
  assert.match(app, /apiFetch\('\/api\/v1\/analyst\/summary'\)/);
  assert.match(app, /summary\.totalEarnedCoins/);
  assert.match(app, /summary\.currentWorkerBalanceCoins/);
  assert.match(app, /projectedCoinUnits \/ 100/);
  assert.match(css, /\.analystSummaryGrid \{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
});

test('summary shares analyst polling and refresh lifecycle without accepting stale responses', () => {
  assert.match(
    app,
    /startAnalystPolling[\s\S]*?window\.setTimeout[\s\S]*?refreshCurrentWorkspace\(\)/,
  );
  assert.match(app, /addEventListener\('focus'[\s\S]*?refreshCurrentWorkspace\(\)/);
  assert.match(app, /addEventListener\('pageshow'[\s\S]*?refreshCurrentWorkspace\(\)/);
  assert.match(app, /visibilitychange[\s\S]*?refreshCurrentWorkspace\(\)/);
  assert.match(app, /if \(analystSummaryRequest\) return analystSummaryRequest/);
  assert.match(app, /generation !== analystSummaryGeneration/);
  assert.match(app, /calculatedAtMs <= analystSummaryCalculatedAtMs/);
});

test('coin formatting uses spaces, at most two decimals and a neutral error state', () => {
  const source = app.match(/function formatSystemCoins\(value\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const context = { Intl };
  vm.runInNewContext(`${source}; globalThis.formatSystemCoins = formatSystemCoins;`, context);
  assert.equal(context.formatSystemCoins(500000), '500 000');
  assert.equal(context.formatSystemCoins(1250430), '1 250 430');
  assert.equal(context.formatSystemCoins(12640.5), '12 640,5');
  assert.equal(context.formatSystemCoins(12640.567), '12 640,57');
  assert.equal(context.formatSystemCoins(0), '0');
  assert.equal(context.formatSystemCoins(null), '—');
  assert.equal(context.formatSystemCoins(Number.NaN), '—');
});

test('320px layout stays a minmax grid with bounded text and no horizontal scrolling rule', () => {
  assert.match(css, /\.analystSummaryGrid > div \{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.analystSummaryGrid strong \{[\s\S]*?font-size:\s*clamp\(14px,/);
  assert.match(css, /\.analystSummaryGrid strong \{[\s\S]*?white-space:\s*nowrap/);
  assert.doesNotMatch(css, /\.analystSummaryGrid[\s\S]{0,300}overflow-x:\s*(auto|scroll)/);
});

test('summary failure is isolated from the employees request and other role headers stay unchanged', () => {
  assert.match(app, /catch \{[\s\S]*?renderAnalystSummary\(null\)[\s\S]*?return false/);
  assert.match(
    app,
    /Promise\.all\(\[loadAnalystWorkers\(\{ initial: true \}\), loadAnalystSummary\(\)\]\)/,
  );
  assert.match(html, /<header class="workerTop">/);
  assert.match(html, /id="startWorkButton"/);
  assert.match(html, /id="totalCoinBalance"/);
});
