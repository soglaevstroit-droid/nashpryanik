import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const workerService = await readFile(
  new URL('../backend/src/worker/worker.service.ts', import.meta.url),
  'utf8',
);

test('task header widens Back to 104px and keeps status flexible', () => {
  assert.match(html, /taskBackButton/);
  assert.match(css, /grid-template-columns: 104px minmax\(0, 1fr\)/);
  assert.match(css, /#taskDetailView \.taskBackButton[\s\S]*width: 104px/);
});

test('task island contains title, shared slider, location and real progress', () => {
  assert.match(html, /taskWorkspaceCard/);
  assert.match(html, /id="taskTitle"/);
  assert.match(html, /id="taskPhotos"/);
  assert.match(html, /id="taskObject"/);
  assert.match(html, /id="taskDetailProgressPercent"/);
  assert.match(app, /completedSteps \/ selectedTask\.steps\.length/);
});

test('work block has the approved name and simple centered arrows', () => {
  assert.match(html, /Этапы работ/);
  assert.doesNotMatch(html, /Этапы выполнения/);
  assert.match(app, /class="workStepArrow"/);
  assert.match(app, />↓</);
  assert.match(css, /\.workStepArrow/);
});

test('step labels strip technical prefixes and only current step expands', () => {
  assert.match(app, /function cleanStepTitle/);
  assert.match(app, /class="workStepCompact"/);
  assert.match(app, /class="currentStepBubble"/);
  assert.match(app, /step\.description/);
  assert.match(app, /steps\.find\(\(candidate\) => candidate\.status !== 'COMPLETED'\)/);
  assert.match(app, /step\.status === 'COMPLETED' && Boolean\(step\.completedAt\)/);
});

test('photos never render inside steps and camera targets only current step', () => {
  assert.doesNotMatch(app, /PhotoSlider\.render\(step\.photos/);
  assert.doesNotMatch(app, /data-delete-step-photo/);
  assert.match(app, /data-upload-detail-photo/);
  assert.match(app, /openShiftCamera\('TASK_STEP', stepId\)/);
  assert.match(workerService, /orderBy: \{ createdAt: 'desc' \}/);
});

test('two-photo validation opens a dedicated step confirmation', () => {
  assert.match(app, /step\.photos\?\.length \?\? 0\) < 2/);
  assert.match(app, /Загрузите минимум две фотографии/);
  assert.match(html, /id="completeStepModal"/);
  assert.match(html, /Да, завершить/);
});

test('pause and manager reply stay inside the current step', () => {
  assert.match(app, /Причина паузы/);
  assert.match(app, /Ответ руководителя/);
  assert.match(app, /Работы по задаче остановлены\. Выберите другую задачу/);
  assert.doesNotMatch(app, /stepBlockedState/);
});

test('last step opens separate task confirmation and success modal', () => {
  assert.match(app, /openModal\('completeTask'\)/);
  assert.match(html, /Все этапы выполнены/);
  assert.match(html, /Да, завершить/);
  assert.match(html, /Задача выполнена!/);
  assert.match(app, /function completeSelectedTask/);
});

test('mobile layout remains one column without a technical timeline', () => {
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /\.stepTimeline \.workStep/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /overflow-wrap: anywhere/);
});
