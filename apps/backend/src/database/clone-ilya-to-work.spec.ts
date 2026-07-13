import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignSequentialClonePositions,
  assertCloneLocalOnly,
  cleanupIsConfirmed,
  cloneOperationId,
  ILYA_CLONE_MANAGER_LOGIN,
  ILYA_CLONE_TARGET_LOGIN,
  ILYA_SOURCE_LOGIN,
  ILYA_TO_WORK_MARKER,
  normalizeCloneStatus,
  remapJson,
  stableCloneId,
} from './clone-ilya-to-work.definition.js';

test('clone command uses a stable isolated namespace', () => {
  assert.equal(ILYA_TO_WORK_MARKER, 'ILYA_TO_WORK_TEST_V1');
  assert.equal(stableCloneId('task', 'source-1'), stableCloneId('task', 'source-1'));
  assert.notEqual(stableCloneId('task', 'source-1'), stableCloneId('task', 'source-2'));
  assert.match(cloneOperationId('source-1'), /^ILYA_TO_WORK_TEST_V1:TASK:/);
  assert.deepEqual(
    [ILYA_SOURCE_LOGIN, ILYA_CLONE_TARGET_LOGIN, ILYA_CLONE_MANAGER_LOGIN],
    ['ilya', 'work', 'work2'],
  );
});

test('active clone positions are sequential and archive records do not consume them', () => {
  const positions = assignSequentialClonePositions(
    [
      { id: 'active-1', status: 'ASSIGNED', deletedAt: null },
      { id: 'completed', status: 'COMPLETED', deletedAt: null },
      { id: 'deleted', status: 'ASSIGNED', deletedAt: new Date() },
      { id: 'active-2', status: 'PAUSED', deletedAt: null },
    ],
    17,
  );
  assert.deepEqual(
    [...positions],
    [
      ['active-1', 17],
      ['active-2', 18],
    ],
  );
});

test('cleanup stays dry-run unless both clean and confirm are explicit', () => {
  assert.equal(cleanupIsConfirmed([]), false);
  assert.equal(cleanupIsConfirmed(['--clean']), false);
  assert.equal(cleanupIsConfirmed(['--confirm']), false);
  assert.equal(cleanupIsConfirmed(['--clean', '--confirm']), true);
});

test('clone command rejects production and any non-local data service', () => {
  assert.doesNotThrow(() =>
    assertCloneLocalOnly({
      environment: 'development',
      databaseUrl: 'postgresql://user:pass@localhost:5432/stroit_dev',
      minioHost: '127.0.0.1',
    }),
  );
  assert.throws(() =>
    assertCloneLocalOnly({
      environment: 'production',
      databaseUrl: 'postgresql://user:pass@localhost:5432/stroit_dev',
      minioHost: 'localhost',
    }),
  );
  assert.doesNotThrow(() =>
    assertCloneLocalOnly({
      environment: 'production',
      databaseUrl: 'postgresql://user:pass@127.0.0.1:5432/stroit',
      minioHost: 'localhost',
      productionAuthorized: true,
    }),
  );
  assert.throws(() =>
    assertCloneLocalOnly({
      environment: 'development',
      databaseUrl: 'postgresql://user:pass@production.example/stroit',
      minioHost: 'production.example',
    }),
  );
});

test('only a conflicting active IN_PROGRESS clone is normalized', () => {
  assert.deepEqual(normalizeCloneStatus('IN_PROGRESS', null, true), {
    status: 'ACCEPTED',
    normalized: true,
  });
  assert.deepEqual(normalizeCloneStatus('IN_PROGRESS', new Date(), true), {
    status: 'IN_PROGRESS',
    normalized: false,
  });
  assert.deepEqual(normalizeCloneStatus('PAUSED', null, true), {
    status: 'PAUSED',
    normalized: false,
  });
});

test('event snapshots remap source ids without mutating their source object', () => {
  const source = { taskId: 'task-source', nested: ['step-source', { text: 'task-source' }] };
  const result = remapJson(
    source,
    new Map([
      ['task-source', 'task-clone'],
      ['step-source', 'step-clone'],
    ]),
  );
  assert.deepEqual(result, {
    taskId: 'task-clone',
    nested: ['step-clone', { text: 'task-clone' }],
  });
  assert.equal(source.taskId, 'task-source');
});
