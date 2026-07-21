import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const slider = await readFile(new URL('./public/photo-slider.js', import.meta.url), 'utf8');
const service = await readFile(
  new URL('../backend/src/task-messages/task-message.service.ts', import.meta.url),
  'utf8',
);

test('paused worker card and details offer Continue work only before manager STOP', () => {
  assert.match(app, /task\.status === 'PAUSED' && !task\.isWorkBlocked[\s\S]*?Продолжить работу/);
  assert.match(
    app,
    /selectedTask\.status === 'PAUSED' && !selectedTask\.isWorkBlocked[\s\S]*?'resume'/,
  );
  assert.match(styles, /\.taskResumeButton[\s\S]*?width:\s*100%/);
});

test('self-resume uses the existing modal with a mandatory reason', () => {
  assert.match(app, /function requestWorkerTaskResume/);
  assert.match(app, /Продолжить работу\?/);
  assert.match(app, /Укажите причину продолжения/);
  assert.match(app, /if \(!reason\)[\s\S]*?pauseReasonError\.hidden = false/);
  assert.match(app, /api\/v1\/worker\/tasks\/\$\{request\.taskId\}\/resume/);
  assert.match(app, /JSON\.stringify\(\{ message: reason }\)/);
});

test('successful resume reloads backend truth and opens the active task', () => {
  const confirm = app.match(/async function confirmWorkerTaskResume[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(confirm, /if \(!response\.ok\)[\s\S]*?return/);
  assert.match(confirm, /pendingTaskResume = null/);
  assert.match(confirm, /loadWorkerObjects\(\)/);
  assert.match(confirm, /ensureActiveWorkerTaskOpen\(\)/);
});

test('manager receives distinct pause and self-resume notifications with reasons', () => {
  assert.match(app, /Сотрудник поставил задачу на паузу\./);
  assert.match(app, /Сотрудник самостоятельно возобновил выполнение задачи\./);
  assert.match(app, /<b>Причина:<\/b>/);
  assert.match(service, /kind: \{ in: \['PAUSE_REQUEST', 'WORK_RESUMED', 'HELP_REQUEST'/);
});

test('history labels pause and resume chronologically and renders their reasons', () => {
  assert.match(app, /TASK_PAUSED: 'Поставил задачу на паузу'/);
  assert.match(app, /TASK_RESUMED: 'Работа продолжена'/);
  assert.match(app, /metadata\.reason/);
  assert.match(service, /reason: body/);
});

test('PhotoSlider and navigation implementation are not extended by self-resume', () => {
  const navigationStart = app.indexOf('function navigateSection');
  const navigationEnd = app.indexOf('\nfunction ', navigationStart + 1);
  const navigation = app.slice(navigationStart, navigationEnd);

  assert.doesNotMatch(slider, /WORK_RESUMED|TASK_RESUMED|pendingTaskResume/);
  assert.match(slider, /class PhotoSlider/);
  assert.doesNotMatch(navigation, /WORK_RESUMED|TASK_RESUMED|pendingTaskResume/);
});
