import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');

test('analyst and other unfinished roles open maintenance without worker API startup', () => {
  const showWorkspace =
    app.match(/async function showWorkspace\(\)[\s\S]*?function openView/)?.[0] ?? '';
  assert.match(showWorkspace, /if \(!isWorker\(\)\)/);
  assert.match(showWorkspace, /openView\('maintenance'\)/);
  assert.ok(
    showWorkspace.indexOf('if (!isWorker())') < showWorkspace.indexOf('refreshShiftState()'),
  );
});

test('worker and management role checks remain backend-role based', () => {
  assert.match(app, /function isWorker\(\)[\s\S]*?currentUser\?\.role === 'WORKER'/);
  assert.match(
    app,
    /function isManager\(\)[\s\S]*?\['FOREMAN', 'DIRECTOR', 'CREATOR'\]\.includes\(currentUser\?\.role\)/,
  );
  assert.match(app, /if \(!isManager\(\) && !isWorker\(\)\)/);
});
