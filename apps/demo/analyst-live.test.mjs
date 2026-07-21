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

test('timeline keeps each event description inside its own protected PhotoSlider frame', () => {
  assert.match(app, /PhotoSlider\.render\(photos/);
  assert.match(app, /function decorateAnalystSlides\(sliderMarkup, frames\)/);
  assert.match(app, /slide\.insertAdjacentHTML\('beforeend'/);
  assert.match(app, /class="analystFrameOverlay" data-analyst-caption="\$\{index\}" data-frame-id/);
  assert.match(app, /function updateAnalystTimeline[\s\S]*?AnalystTimeline\.findActiveIndex/);
  assert.doesNotMatch(app, /class="analystFrameCaption"/);
  assert.doesNotMatch(app, /caption\.hidden =/);
  assert.match(
    app,
    /analystFrameIndexStore\.set\(workerId, index, slides\[index\]\?\.dataset\.analystFrameId/,
  );
  assert.match(timeline, /Math\.min\(slideEnd, viewportEnd\)/);
  assert.match(slider, /data-photo-frame-index="\$\{index\}"/);
});

test('frame overlay carries title task time reasons facts and a soft lower gradient', () => {
  assert.match(app, /function renderAnalystFrameOverlay[\s\S]*?frame\.title/);
  assert.match(app, /analystFrameTask[\s\S]*?frame\.description/);
  assert.match(app, /analystFrameReason[\s\S]*?frame\.reason/);
  assert.match(app, /renderAnalystFrameFacts\(frame\)[\s\S]*?<time/);
  assert.match(css, /\.analystFrameOverlay \{[\s\S]*?position:\s*absolute/);
  assert.match(css, /min-height:\s*42%/);
  assert.match(css, /linear-gradient\([\s\S]*?rgb\(8 12 16 \/ 0%\)[\s\S]*?88%/);
  assert.match(css, /\.analystFrameOverlay \.analystFrameTask,[\s\S]*?-webkit-line-clamp:\s*2/);
});

test('events without photos use a neutral branded frame without a broken image', () => {
  assert.match(slider, /photo\.id \? '' : ' is-event-placeholder'/);
  assert.match(slider, /class="analystPhotoPlaceholder"/);
  assert.match(slider, /строит\.рф/);
  assert.match(css, /\.analystPhotoPlaceholder[\s\S]*?background:\s*var\(--bg\)/);
  assert.match(app, /decorateAnalystSlides\(sliderMarkup, frames\)/);
});

test('current frame is restored after polling and a new timeline defaults to latest', () => {
  assert.match(app, /const analystFrameIndexStore = AnalystTimeline\.createIndexStore\(\)/);
  assert.match(app, /if \(signature === analystLiveSignature\) return/);
  assert.match(
    app,
    /analystFrameIndexStore\.get\([\s\S]*?workerKey,[\s\S]*?frames\.map\(\(frame\) => frame\.id\)/,
  );
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

test('frame position stays below the slider without a separate description block', () => {
  assert.match(app, /\$\{slider\}<div class="analystFramePosition"/);
  assert.doesNotMatch(css, /\.analystFrameCaption/);
  assert.match(css, /\.analystFramePosition \{[\s\S]*?text-align:\s*center/);
});

test('task section start is a separate graphite and copper virtual slide', () => {
  assert.match(app, /TASK_SECTION_START/);
  assert.match(app, /class="analystTaskSectionCard \$\{returned/);
  assert.match(app, /Новая задача/);
  assert.match(app, /metadata\.objectName/);
  assert.match(app, /Ответственный:/);
  assert.match(css, /\.analystTaskSectionStart \{[\s\S]*?#181b20[\s\S]*?#6b3522/);
  assert.match(css, /background-image:[\s\S]*?linear-gradient[\s\S]*?background-size:\s*34px 34px/);
});

test('task summary is a green report slide with calculated task cost', () => {
  assert.match(app, /frame\.kind === 'TASK_SECTION_SUMMARY'/);
  assert.match(app, /analystSectionFacts analystSectionSummaryFacts/);
  assert.match(app, /✓ Готово/);
  assert.match(app, /Время:.*formatAnalystDuration/);
  assert.match(app, /Фотографий:/);
  assert.match(app, /Пауз:/);
  assert.match(app, /const cost = analystTaskCostLabel\(frame\)/);
  assert.match(css, /\.analystTaskSectionSummary \{[\s\S]*?#d9eddf[\s\S]*?#6fa582/);
});

test('task cost uses backend status and formats no more than two decimals', () => {
  const formatter = app.match(/function analystTaskCostLabel[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(formatter, /frame\.costStatus === 'CALCULATED'/);
  assert.match(formatter, /frame\.taskCostCoins/);
  assert.match(formatter, /maximumFractionDigits:\s*2/);
  assert.match(formatter, /RATE_NOT_AVAILABLE[\s\S]*?нет данных о тарифе/);
  assert.match(formatter, /DATA_INCOMPLETE[\s\S]*?недостаточно данных/);
  assert.doesNotMatch(formatter, /ожидает расчёта|0 монет/);
});

test('task summary uses one compact vertical column without changing other section cards', () => {
  assert.match(
    css,
    /\.analystSectionFacts \{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/,
  );
  assert.doesNotMatch(css, /\.analystSectionFacts \{[^}]*grid-template-columns/);
  assert.match(app, /Ответственный:[\s\S]*?Начало:[\s\S]*?Завершено:[\s\S]*?Время:[\s\S]*?Фотографий:[\s\S]*?Пауз:[\s\S]*?Стоимость:/);
});

test('virtual task cards are narrower while ordinary photo slides keep their width', () => {
  assert.match(app, /slide\.classList\.add\([\s\S]*?'is-virtual'/);
  assert.match(
    css,
    /\.analystTimeline \.photoSlide\.is-analyst-task-section \{[^}]*width:\s*clamp\(232px, 72%, 320px\)/,
  );
  assert.match(css, /\.photoSlide \{[^}]*width:\s*88%/);
  assert.doesNotMatch(slider, /is-virtual|is-analyst-task-section/);
});

test('completed photo has only a short completion status while full metrics stay in summary', () => {
  const overlay = app.match(/function renderAnalystFrameOverlay[\s\S]*?\n}/)?.[0] ?? '';
  const completedOverlay =
    overlay.match(/if \(frame\.kind === 'TASK_COMPLETED'\)[\s\S]*?return `[^`]+`;/)?.[0] ?? '';
  const facts = app.match(/function renderAnalystFrameFacts[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(completedOverlay, /frame\.kind === 'TASK_COMPLETED'/);
  assert.match(completedOverlay, /<strong>Задача выполнена<\/strong>/);
  assert.match(completedOverlay, /Время завершения:/);
  assert.doesNotMatch(completedOverlay, /frame\.description|Время выполнения:|Стоимость:/);
  assert.doesNotMatch(facts, /TASK_COMPLETED|Стоимость рассчитывается/);
  assert.match(app, /analystTaskSectionSummary[\s\S]*?Время:[\s\S]*?Фотографий:[\s\S]*?Пауз:[\s\S]*?Стоимость:/);
});

test('shift completion photo keeps only worker name and completion time', () => {
  const overlay = app.match(/function renderAnalystFrameOverlay[\s\S]*?\n}/)?.[0] ?? '';
  const completedOverlay =
    overlay.match(/if \(frame\.kind === 'SHIFT_COMPLETED'\)[\s\S]*?return `[^`]+`;/)?.[0] ?? '';
  assert.match(completedOverlay, /frame\.title/);
  assert.match(completedOverlay, /<time/);
  assert.doesNotMatch(
    completedOverlay,
    /Продолжительность|Выполнено задач|Завершено задач|Начислено|shiftCoinUnits/,
  );
});

test('daily shift summary is a final graphite virtual report with one-column facts', () => {
  assert.match(app, /SHIFT_SECTION_SUMMARY/);
  assert.match(app, /analystShiftSectionSummary/);
  assert.match(app, /Смена завершена/);
  assert.match(app, /formatAnalystShiftDate/);
  assert.match(app, /Продолжительность:/);
  assert.match(app, /Выполнено задач:/);
  assert.match(app, /Фотографий:/);
  assert.match(app, /Пауз:/);
  assert.match(app, /Начислено:/);
  assert.match(app, /shiftCoinUnits[\s\S]*?ожидает расчёта/);
  assert.match(
    css,
    /\.analystShiftSectionSummary \{[^}]*#15181d[^}]*#513025/,
  );
  assert.match(css, /\.analystSectionFacts \{[^}]*flex-direction:\s*column/);
});

test('daily summary is virtual, uses the shared frame counter and never opens an Artifact', () => {
  assert.match(
    app,
    /isAnalystTaskSection[\s\S]*?'SHIFT_SECTION_SUMMARY'[\s\S]*?\.includes\(frame\.kind\)/,
  );
  assert.match(app, /id: frame\.artifact\?\.id \?\? null/);
  assert.match(app, /из \$\{frames\.length\}/);
  assert.match(app, /isAnalystTaskSection\(frame\)[\s\S]*?analystPhotoPlaceholder.*remove/);
  assert.match(css, /width:\s*clamp\(232px, 72%, 320px\)/);
  assert.doesNotMatch(slider, /SHIFT_SECTION_SUMMARY/);
});

test('virtual frames participate in dots and counter without photo loading or fullscreen', () => {
  assert.match(app, /const photos = frames\.map/);
  assert.match(app, /id: frame\.artifact\?\.id \?\? null/);
  assert.match(app, /isAnalystTaskSection\(frame\)[\s\S]*?analystPhotoPlaceholder.*remove/);
  assert.match(app, /isAnalystTaskSection\(frame\)[\s\S]*?photoLockOverlay.*remove/);
  assert.match(app, /из \$\{frames\.length\}/);
  assert.doesNotMatch(app, /TASK_SECTION_(?:START|SUMMARY)[\s\S]{0,180}loadPreview/);
  assert.match(slider, /if \(!image \|\| image\.dataset\.photoLoading/);
  assert.match(slider, /const image = event\.target\.closest\('\[data-slider-photo-id\]'\)/);
});

test('task section cards clamp long content and fit a 320px viewport', () => {
  assert.match(css, /\.analystTaskSectionCard > strong \{[\s\S]*?-webkit-line-clamp:\s*3/);
  assert.match(css, /\.analystSectionPlace \{[\s\S]*?-webkit-line-clamp:\s*2/);
  assert.match(css, /@media \(max-width: 350px\)[\s\S]*?padding:\s*17px/);
  assert.match(css, /width:\s*clamp\(232px, 72%, 320px\)/);
  assert.match(css, /min-width:\s*0/);
});

test('live and history both render backend-provided task section frames', () => {
  assert.match(app, /renderAnalystWorkers[\s\S]*?renderAnalystWorkerCard/);
  assert.match(app, /loadAnalystShift[\s\S]*?renderAnalystWorkerCard\(detail/);
  assert.match(app, /renderAnalystTimeline\(frames, shift\.id, workerKey\)/);
});
