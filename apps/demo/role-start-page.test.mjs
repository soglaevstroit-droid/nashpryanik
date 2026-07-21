import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');

test('analyst opens the employees page while other unfinished roles keep maintenance', () => {
  const showWorkspace =
    app.match(/async function showWorkspace\(\)[\s\S]*?function openView/)?.[0] ?? '';
  assert.match(showWorkspace, /if \(isAnalyst\(\)\)[\s\S]*?openView\('analystLive'\)/);
  assert.match(showWorkspace, /loadAnalystWorkers\(\{ initial: true \}\)/);
  assert.match(showWorkspace, /if \(!isWorker\(\)\)/);
  assert.match(showWorkspace, /openView\('maintenance'\)/);
  assert.ok(
    showWorkspace.indexOf('if (!isWorker())') < showWorkspace.indexOf('refreshShiftState()'),
  );
});

test('worker and management role checks remain backend-role based', () => {
  assert.match(app, /function isAnalyst\(\)[\s\S]*?currentUser\?\.role === 'ANALYST'/);
  assert.match(app, /function isWorker\(\)[\s\S]*?currentUser\?\.role === 'WORKER'/);
  assert.match(
    app,
    /function isManager\(\)[\s\S]*?\['FOREMAN', 'DIRECTOR', 'CREATOR'\]\.includes\(currentUser\?\.role\)/,
  );
  assert.match(app, /if \(!isManager\(\) && !isWorker\(\)\)/);
});

test('stored session restores the backend profile before role routing', () => {
  const restoreSession =
    app.match(
      /async function restoreSession\(\)[\s\S]*?\n}\n\nasync function showWorkspace/,
    )?.[0] ?? '';
  assert.match(restoreSession, /apiFetch\('\/api\/v1\/auth\/me'\)/);
  assert.match(restoreSession, /currentUser = body/);
  assert.ok(
    restoreSession.indexOf('currentUser = body') < restoreSession.indexOf('showWorkspace()'),
  );
  assert.match(restoreSession, /response\.status === 401/);
  assert.doesNotMatch(restoreSession, /openView\('maintenance'\)/);
});
