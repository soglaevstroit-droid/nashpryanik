import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const slider = await readFile(new URL('./public/photo-slider.js', import.meta.url), 'utf8');
const workerService = await readFile(
  new URL('../backend/src/worker/worker.service.ts', import.meta.url),
  'utf8',
);
const demoBootstrap = await readFile(
  new URL('../backend/src/database/bootstrap-demo-worker.ts', import.meta.url),
  'utf8',
);

test('only one available backend IN_PROGRESS task is accepted as active', () => {
  const finder = app.match(/function findConfirmedActiveWorkerTask[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(finder, /task\?\.status === 'IN_PROGRESS'/);
  assert.match(finder, /task\.accessStatus === 'OPEN'/);
  assert.match(finder, /!task\.deletedAt/);
  assert.match(finder, /activeTasks\.length === 1/);
  assert.doesNotMatch(finder, /ASSIGNED|ACCEPTED|PAUSED|COMPLETED|CANCELLED/);
});

test('opening a shift synchronizes backend tasks and never falls back to the first card', () => {
  assert.match(app, /else await restoreWorkerWorkspace\(\)/);
  assert.match(
    app,
    /restoreWorkerWorkspace[\s\S]*?await loadWorkerObjects\(\)[\s\S]*?hasActiveWorkerTask\(\)[\s\S]*?ensureActiveWorkerTaskOpen\(\)[\s\S]*?openView\('myWork'/,
  );
  assert.doesNotMatch(app, /activeWorkerTaskId\s*=\s*tasks\[0\]/);
  assert.match(app, /return isWorker\(\) && isShiftOpen\(\) && Boolean\(activeWorkerTaskId\)/);
});

test('local bootstrap provisions users only and cannot resurrect demo work', () => {
  assert.match(demoBootstrap, /ensureUser/);
  assert.doesNotMatch(demoBootstrap, /database\.(task|taskStep|event|artifact)\./);
  assert.doesNotMatch(
    demoBootstrap,
    /ArtifactStorageService|seedWorkerDemo|seedPhotoSliderDemoData/,
  );
});

test('accept action opens only the active id returned by a fresh worker list', () => {
  assert.match(app, /await loadWorkerObjects\(\);/);
  assert.match(app, /if \(activeWorkerTaskId\) await ensureActiveWorkerTaskOpen\(\)/);
  assert.doesNotMatch(app, /selectedTaskId\s*=\s*taskId[\s\S]*?activeWorkerTaskId\s*=\s*taskId/);
});

test('Back requests the existing pause modal only while backend-confirmed work is active', () => {
  assert.match(
    app,
    /if \(backToTasksButton\)[\s\S]*?hasActiveWorkerTask\(\)[\s\S]*?requestActiveTaskExit\(\)[\s\S]*?openView\('myWork'/,
  );
  assert.match(app, /requestSelectedTaskPause\(\)/);
  assert.match(app, /Поставить задачу на паузу\?/);
  assert.match(app, /elements\.pauseReasonField\.hidden = false/);
});

test('successful pause clears every navigation state before refreshing and opening the list', () => {
  const pause = app.match(/async function confirmSelectedTaskPause[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(pause, /if \(!response\.ok\)[\s\S]*?return/);
  assert.match(pause, /selectedTask\.status = 'PAUSED'/);
  assert.match(pause, /clearActiveWorkerTaskState\(\{ clearSelection: true }\)/);
  assert.match(pause, /closeModal\(\)/);
  assert.match(pause, /await Promise\.all\(\[loadWorkerObjects\(\), loadHistory\(true\)\]\)/);
  assert.match(pause, /openView\('myWork'/);
  assert.doesNotMatch(pause, /reloadTaskDetails\(\)/);

  const reset = app.match(/function clearActiveWorkerTaskState[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(reset, /workerObjectsRequestId \+= 1/);
  assert.match(reset, /setActiveWorkerTask\(null\)/);
  assert.match(reset, /pendingTaskPause = null/);
  assert.match(reset, /clearSelectedWorkerTask\(\)/);
});

test('pause API failure keeps the active task, modal state and green control available', () => {
  const pause = app.match(/async function confirmSelectedTaskPause[\s\S]*?\n}/)?.[0] ?? '';
  const failureIndex = pause.indexOf('if (!response.ok)');
  const resetIndex = pause.indexOf('clearActiveWorkerTaskState');
  assert.ok(failureIndex >= 0 && resetIndex > failureIndex);
  assert.match(pause.slice(failureIndex, resetIndex), /showMessage[\s\S]*?return/);
  assert.match(app, /IN_PROGRESS:[\s\S]*?'is-working'/);
});

test('stale list and detail responses cannot reactivate a paused task', () => {
  assert.match(app, /const requestId = \+\+workerObjectsRequestId/);
  assert.match(app, /if \(requestId !== workerObjectsRequestId\) return false/);
  assert.match(app, /const navigationRevision = workerNavigationRevision/);
  assert.match(app, /navigationRevision !== workerNavigationRevision/);
  const render = app.match(/function renderSelectedTask\(\)[\s\S]*?\n}/)?.[0] ?? '';
  assert.doesNotMatch(render, /activeWorkerTaskId = selectedTask\.id/);
});

test('unavailable non-active details return to the list while confirmed active details keep retry', () => {
  const reconcile =
    app.match(/async function reconcileUnavailableWorkerTask[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(reconcile, /await loadWorkerObjects\(\)/);
  assert.match(reconcile, /if \(activeWorkerTaskId === taskId\)[\s\S]*?renderTaskDetailError/);
  assert.match(reconcile, /clearSelectedWorkerTask\(\)[\s\S]*?openView\('myWork'/);
  assert.match(app, /\[403, 404\]\.includes\(response\.status\)/);
});

test('reload, bfcache and visibility always recheck backend state', () => {
  assert.match(app, /window\.addEventListener\('pageshow'/);
  assert.match(
    app,
    /document\.addEventListener\('visibilitychange'[\s\S]*?restoreWorkerWorkspace\(\)/,
  );
  assert.match(app, /restoreWorkerWorkspace[\s\S]*?loadWorkerObjects\(\)/);
  assert.match(app, /setActiveWorkerTask\(activeTask\?\.id \?\? null\)/);
});

test('backend cross-task protection and photo implementation remain untouched', () => {
  assert.match(workerService, /ANOTHER_TASK_IS_ACTIVE/);
  assert.match(workerService, /status === 'IN_PROGRESS' && task\.accessStatus === 'OPEN'/);
  assert.match(workerService, /status: 'IN_PROGRESS',[\s\S]*?accessStatus: 'OPEN'/);
  assert.doesNotMatch(slider, /activeWorkerTaskId|pendingTaskPause|workerNavigationRevision/);
  assert.match(slider, /class PhotoSlider/);
  assert.match(slider, /loadViewerOriginal/);
});
