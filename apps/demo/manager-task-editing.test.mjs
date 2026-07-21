import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');

test('manager detail exposes editing without exposing it to the worker flow', () => {
  assert.match(app, /data-manager-edit>Редактировать задачу/);
  assert.match(app, /if \(!isManager\(\)\) return/);
  assert.match(app, /Завершённую задачу нельзя редактировать/);
  assert.match(app, /openManagerTaskForm\(selectedTask\)/);
});

test('the create composer is reused in explicit edit mode with current values', () => {
  assert.equal((html.match(/id="managerTaskModal"/g) ?? []).length, 1);
  assert.match(app, /managerFormMode = task \? 'edit' : 'create'/);
  assert.match(app, /Редактировать задачу/);
  assert.match(app, /Внесите необходимые изменения/);
  assert.match(app, /managerEditingTask = task \? JSON\.parse/);
  assert.match(app, /document\.querySelector\('#managerTitle'\)\.value = task\.title/);
});

test('completed steps are readonly while unfinished steps remain editable', () => {
  assert.match(app, /step\?\.status === 'COMPLETED' \? 'readonly' : ''/);
  assert.match(app, /Выполненный этап защищён от изменений/);
  assert.match(app, /removeButton\.hidden = isCompleted/);
  assert.match(css, /\.managerStepFields\.is-readonly/);
});

test('future steps can be reordered without moving completed or current steps', () => {
  assert.match(app, /data-move-manager-step="up"/);
  assert.match(app, /data-move-manager-step="down"/);
  assert.match(app, /\['COMPLETED', 'IN_PROGRESS'\]\.includes\(candidate\.dataset\.stepStatus\)/);
  assert.match(app, /function moveManagerStep\(step, direction\)/);
});

test('active tasks demand a reason and protect object or assignee as required', () => {
  assert.match(html, /id="managerEditReason"/);
  assert.match(html, /Причина изменений/);
  assert.match(app, /\['ACCEPTED', 'IN_PROGRESS', 'PAUSED'\]\.includes\(task\.status\)/);
  assert.match(app, /elements\.managerObject\.disabled = true/);
  assert.match(app, /task\.status === 'IN_PROGRESS'\) elements\.managerWorker\.disabled = true/);
});

test('existing reference photos are shown and worker step photos are excluded', () => {
  assert.match(app, /task\.photos\.filter\(\(photo\) => !photo\.taskStepId\)/);
  assert.match(app, /apiFetch\(`\/api\/v1\/artifacts\/\$\{photo\.id\}`\)/);
  assert.match(app, /data-remove-existing-photo/);
  assert.match(app, /managerRemovedPhotoIds/);
  assert.match(app, /URL\.revokeObjectURL\(url\)/);
});

test('edit confirmation lists only actual changes and skips an empty request', () => {
  assert.match(app, /function buildManagerEditChanges/);
  assert.match(app, /if \(managerFormMode === 'edit' && !editChanges\.length\)/);
  assert.match(app, /Изменений нет\./);
  assert.match(app, /Сохранить изменения\?/);
  assert.match(app, /editChanges\.map\(\(change\) => \['Изменение', change\]\)/);
});

test('edit uses multipart, optimistic version and an idempotency operation', () => {
  assert.match(app, /updatedAt: managerEditingTask\.updatedAt/);
  assert.match(app, /operationId: managerDraftOperationId/);
  assert.match(app, /\/manager\/tasks\/\$\{managerEditingTask\.id\}\/edit/);
  assert.match(app, /method: editing \? 'PATCH' : 'POST'/);
  assert.match(app, /data\.append\('photos', file\)/);
});

test('worker notification and manager history have dedicated rendering', () => {
  assert.match(app, /message\.kind === 'TASK_UPDATED' \? 'Задача изменена'/);
  assert.match(app, /worker\/messages\/\$\{message\.id\}\/read/);
  assert.match(app, /TASK_UPDATED: 'Изменил задачу'/);
  assert.match(app, /metadata\.reason/);
  assert.match(css, /\.messageCard\.is-unread/);
});

test('409 and successful refresh preserve conflict-safe behavior', () => {
  assert.match(app, /managerTaskApiError\(response\.status, body\)/);
  assert.match(app, /if \(editing && selectedTaskId\) await reloadTaskDetails\(\)/);
  assert.match(app, /Изменения сохранены\. Сотрудник уведомлён\./);
});
