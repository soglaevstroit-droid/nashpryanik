import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const slider = await readFile(new URL('./public/photo-slider.js', import.meta.url), 'utf8');
const workerService = await readFile(
  new URL('../backend/src/worker/worker.service.ts', import.meta.url),
  'utf8',
);
const taskService = await readFile(
  new URL('../backend/src/tasks/task.service.ts', import.meta.url),
  'utf8',
);

test('accept is the single worker action that immediately refreshes backend state', () => {
  assert.match(app, /\['ASSIGNED', 'ACCEPTED'\]\.includes\(selectedTask\.status\)[\s\S]*?\? 'accept'/);
  assert.match(app, /`\/api\/v1\/tasks\/\$\{taskId\}\/accept`/);
  assert.match(app, /await loadWorkerObjects\(\)/);
  assert.match(app, /if \(activeWorkerTaskId\) await ensureActiveWorkerTaskOpen\(\)/);
  assert.doesNotMatch(app, /data-detail-task-action="start"/);
  assert.doesNotMatch(app, />Начать задачу</);
});

test('simple task cards and details omit empty step progress', () => {
  assert.match(app, /const progress = task\.steps\.length[\s\S]*?: ''/);
  assert.match(app, /task\.steps\.length \? ' has-steps' : ' is-simple-task'/);
  assert.match(app, /elements\.taskDetailProgress\.hidden = selectedTask\.steps\.length === 0/);
  assert.match(app, /elements\.stepTimelineCard\.hidden = selectedTask\.steps\.length === 0/);
  assert.doesNotMatch(app, /0 из 0 этапов/);
  assert.match(html, /id="taskDescriptionCard"/);
});

test('manager can deliberately create a shared task with no synthetic steps', () => {
  assert.match(app, /<option value="">Без ответственного<\/option>/);
  assert.match(app, /assigneeId: elements\.managerWorker\.value \|\| null/);
  assert.match(app, /const steps = \[\.\.\.elements\.managerSteps\.children\]\.map/);
  assert.doesNotMatch(app, /addManagerStep\(\{[^}]*Выполнить задачу/);
});

test('simple active task exposes completion only after backend-confirmed worker progress photo', () => {
  assert.match(app, /data-simple-task-photo[\s\S]*?>Сделать фото<\/button>/);
  assert.match(
    app,
    /selectedTask\.hasWorkerProgressPhoto \? `<button class="simpleTaskCompleteButton"[\s\S]*?>Завершить<\/button>` : ''/,
  );
  assert.match(workerService, /hasWorkerProgressPhoto: artifacts\.some\(/);
  assert.match(workerService, /artifact\.uploadedBy === user\.id/);
  assert.match(workerService, /!task\.startedAt \|\| artifact\.createdAt >= task\.startedAt/);
  assert.match(taskService, /progressPhotos < 1/);
  assert.match(taskService, /Сначала добавьте фотографию выполненной работы/);
  assert.match(app, /openShiftCamera\(completing \? 'TASK_COMPLETE' : 'TASK_PHOTO'\)/);
  assert.match(app, /`\/api\/v1\/tasks\/\$\{cameraAttempt\.taskId\}\/complete-with-photo`/);
  assert.match(app, /submittedMode === 'TASK_COMPLETE'[\s\S]*?clearActiveWorkerTaskState/);
  assert.match(css, /\.simpleTaskPhotoButton[\s\S]*?var\(--accent\)/);
  assert.match(css, /\.simpleTaskPhotoButton:only-child[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(css, /\.simpleTaskCompleteButton[\s\S]*?var\(--green/);
});

test('workspace refreshes are generation guarded and PhotoSlider implementation is untouched', () => {
  assert.match(app, /const requestId = \+\+managerTasksRequestId/);
  assert.match(app, /if \(requestId !== managerTasksRequestId\) return false/);
  assert.match(app, /const requestId = \+\+workerObjectsRequestId/);
  assert.match(app, /if \(requestId !== workerObjectsRequestId\) return false/);
  assert.match(app, /window\.addEventListener\('pageshow'/);
  assert.match(app, /document\.addEventListener\('visibilitychange'/);
  assert.match(slider, /class PhotoSlider/);
  assert.match(slider, /loadViewerOriginal/);
  assert.doesNotMatch(slider, /TASK_COMPLETE|completedWorkShiftId|managerSteps/);
});
