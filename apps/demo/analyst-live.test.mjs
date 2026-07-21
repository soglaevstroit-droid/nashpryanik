import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const slider = await readFile(new URL('./public/photo-slider.js', import.meta.url), 'utf8');
const timeline = await readFile(new URL('./public/analyst-timeline.js', import.meta.url), 'utf8');

test('analyst has a dedicated employees start page instead of maintenance', () => {
  assert.match(html, /id="analystLiveView"[\s\S]*?<h1>Сотрудники<\/h1>/);
  assert.match(app, /if \(isAnalyst\(\)\)[\s\S]*?openView\('analystLive'\)/);
  assert.match(app, /\/api\/v1\/analyst\/workers\/live/);
});

test('resting workers render without an empty PhotoSlider', () => {
  const renderer = app.match(/function renderAnalystWorkerCard[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(renderer, /shift[\s\S]*?renderAnalystTimeline/);
  assert.match(renderer, /Смена не начата/);
  assert.match(css, /\.analystNoShift[\s\S]*?min-height:\s*116px/);
});

test('timeline uses the protected PhotoSlider pipeline and keeps captions aligned', () => {
  assert.match(app, /PhotoSlider\.render\(photos/);
  assert.match(app, /data-analyst-caption="\$\{index\}" data-frame-id/);
  assert.match(app, /function updateAnalystTimeline[\s\S]*?AnalystTimeline\.findActiveIndex/);
  assert.match(app, /caption\.hidden = Number\(caption\.dataset\.analystCaption\) !== index/);
  assert.match(app, /analystFrameIndexStore\.set\(workerId, index\)/);
  assert.match(timeline, /Math\.min\(slideEnd, viewportEnd\)/);
  assert.match(slider, /data-photo-frame-index="\$\{index\}"/);
});

test('events without photos use a neutral branded frame without a broken image', () => {
  assert.match(slider, /photo\.id \? '' : ' is-event-placeholder'/);
  assert.match(slider, /class="analystPhotoPlaceholder"/);
  assert.match(slider, /строит\.рф/);
  assert.match(css, /\.analystPhotoPlaceholder[\s\S]*?background:\s*var\(--bg\)/);
});

test('current frame is restored after polling and a new timeline defaults to latest', () => {
  assert.match(app, /const analystFrameIndexStore = AnalystTimeline\.createIndexStore\(\)/);
  assert.match(app, /if \(signature === analystLiveSignature\) return/);
  assert.match(app, /analystFrameIndexStore\.get\(workerKey, frames\.length\)/);
  assert.match(app, /data-initial-frame="\$\{selectedIndex\}"/);
});

test('polling is bounded, pauses while hidden and refreshes on focus and pageshow', () => {
  assert.match(
    app,
    /analystLiveRequest[\s\S]*?if \(analystLiveRequest\) return analystLiveRequest/,
  );
  assert.match(app, /window\.setTimeout\([\s\S]*?20_000/);
  assert.match(app, /if \(!isAnalyst\(\) \|\| document\.hidden\) return/);
  assert.match(app, /visibilitychange[\s\S]*?stopAnalystPolling/);
  assert.match(app, /addEventListener\('focus'[\s\S]*?refreshCurrentWorkspace/);
  assert.match(app, /addEventListener\('pageshow'[\s\S]*?refreshCurrentWorkspace/);
});

test('analyst history lists finished shifts and opens a saved timeline', () => {
  assert.match(app, /\/api\/v1\/analyst\/shifts\/history/);
  assert.match(app, /\/api\/v1\/analyst\/shifts\/\$\{encodeURIComponent\(shiftId\)\}/);
  assert.match(app, /data-analyst-shift-id/);
  assert.match(app, /data-analyst-history-back/);
});

test('analyst UI contains no mutation controls and existing role screens remain present', () => {
  const view = html.match(/<section id="analystLiveView"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.doesNotMatch(view, /data-manager|data-worker-task-action|data-shift-action/);
  assert.match(html, /id="myWorkView"/);
  assert.match(html, /id="managerTaskForm"/);
});

test('responsive analyst islands remain single-column on phones and bounded on desktop', () => {
  assert.match(css, /\.analystWorkersList \{[\s\S]*?display:\s*grid[\s\S]*?gap:\s*18px/);
  assert.match(
    css,
    /@media \(min-width: 760px\)[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(css, /\.analystWorkerCard,[\s\S]*?min-width:\s*0/);
});

test('existing PhotoSlider preview, original, scheduler and fullscreen remain intact', () => {
  assert.match(slider, /this\.loadPreview/);
  assert.match(slider, /this\.loadOriginal/);
  assert.match(slider, /startSlider\(slider\)/);
  assert.match(slider, /loadViewerOriginal\(image\)/);
  assert.match(css, /\.photoCarousel[\s\S]*?touch-action:\s*pan-x pan-y pinch-zoom/);
});
