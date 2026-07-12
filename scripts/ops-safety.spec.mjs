import test from 'node:test';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import {
  assertSafeBackupName,
  assertSafeRestoreDatabase,
  createRestoreDatabaseName,
  detectBackupFormat,
  migrationRisk,
} from './lib/backup-safety.mjs';
import {
  classifyLock,
  evaluatePublishExecution,
  restoreCleanupDecision,
  validateArchiveScenario,
  validateBackupResult,
  validatePublishScenario,
} from './lib/workflow-policy.mjs';

test('restore-check rejects missing, empty, corrupt and unsupported archives', () => {
  assert.throws(() => validateArchiveScenario({ exists: false, format: 'sql.gz' }), /отсутствует/);
  assert.throws(() => validateArchiveScenario({ size: 0, format: 'sql.gz' }), /пустой/);
  assert.throws(() => validateArchiveScenario({ format: 'sql.gz', valid: false }), /gzip/);
  assert.throws(() => validateArchiveScenario({ format: 'custom', valid: false }), /custom/);
  assert.throws(() => validateArchiveScenario({ format: 'zip' }), /расширение/);
});

test('restore database safety rejects production and accepts unique prefix', () => {
  assert.throws(() => assertSafeRestoreDatabase('stroit_dev'), /только для временной/);
  assert.throws(() => assertSafeRestoreDatabase('other_database'), /только для временной/);
  const generated = createRestoreDatabaseName();
  assert.match(generated, /^stroit_restore_check_/);
  assert.equal(generated, generated.toLowerCase());
});

test('backup basename cannot escape directory and formats are not mixed', () => {
  assert.throws(() => assertSafeBackupName('../stroit.sql.gz'), /basename/);
  assert.equal(detectBackupFormat('stroit-20260712-030001.sql.gz'), 'sql.gz');
  assert.equal(detectBackupFormat('stroit_dev_20260712T030001Z.dump'), 'custom');
});

test('temporary database cleanup is mandatory on success, failure and SIGINT', () => {
  assert.equal(
    restoreCleanupDecision({ databaseCreated: true, restoreSucceeded: true, interrupted: false }),
    true,
  );
  assert.equal(
    restoreCleanupDecision({ databaseCreated: true, restoreSucceeded: false, interrupted: false }),
    true,
  );
  assert.equal(
    restoreCleanupDecision({ databaseCreated: true, restoreSucceeded: false, interrupted: true }),
    true,
  );
});

test('restore success/failure and pre-existing temporary database are isolated', () => {
  assert.equal(validateArchiveScenario({ format: 'sql.gz', valid: true }), true);
  assert.throws(() => assertSafeRestoreDatabase('stroit_dev'));
  assert.equal(
    restoreCleanupDecision({ databaseCreated: false, restoreSucceeded: false, interrupted: false }),
    false,
  );
});

test('backup-create handles active/stale locks, checksum, SCP, size and restore failure', () => {
  assert.equal(classifyLock({ exists: false }), 'available');
  assert.equal(classifyLock({ exists: true, processActive: true }), 'active');
  assert.equal(classifyLock({ exists: true, processActive: false, ageSeconds: 7200 }), 'stale');
  assert.equal(classifyLock({ exists: true, processActive: false, ageSeconds: 10 }), 'unknown');
  for (const scenario of [
    {
      size: 0,
      checksumMatches: true,
      scpSucceeded: true,
      sizeMatches: true,
      restoreSucceeded: true,
    },
    {
      size: 1,
      checksumMatches: false,
      scpSucceeded: true,
      sizeMatches: true,
      restoreSucceeded: true,
    },
    {
      size: 1,
      checksumMatches: true,
      scpSucceeded: false,
      sizeMatches: true,
      restoreSucceeded: true,
    },
    {
      size: 1,
      checksumMatches: true,
      scpSucceeded: true,
      sizeMatches: false,
      restoreSucceeded: true,
    },
    {
      size: 1,
      checksumMatches: true,
      scpSucceeded: true,
      sizeMatches: true,
      restoreSucceeded: false,
    },
  ])
    assert.throws(() => validateBackupResult(scenario));
});

test('partial backup is never accepted as a final backup', () => {
  assert.throws(() => assertSafeBackupName('stroit_dev_20260712T030001Z.sql.gz.partial'));
});

test('publish blocks dirty tree, wrong branch, origin/test/backup/restore failures', () => {
  const ok = {
    cleanTree: true,
    mainBranch: true,
    originAvailable: true,
    testsPassed: true,
    backupReady: true,
    restoreReady: true,
  };
  assert.equal(validatePublishScenario(ok), true);
  for (const key of Object.keys(ok))
    assert.throws(() => validatePublishScenario({ ...ok, [key]: false }), /precondition/);
});

test('publish execution handles commit, push, deploy, health and rollback outcomes', () => {
  const ok = {
    commitSucceeded: true,
    pushSucceeded: true,
    deploySucceeded: true,
    healthSucceeded: true,
    rollbackSucceeded: false,
    migrationRisk: false,
  };
  assert.equal(evaluatePublishExecution(ok), 'published');
  assert.equal(evaluatePublishExecution({ ...ok, commitSucceeded: false }), 'commit-failed');
  assert.equal(evaluatePublishExecution({ ...ok, pushSucceeded: false }), 'push-failed');
  assert.equal(
    evaluatePublishExecution({ ...ok, deploySucceeded: false, rollbackSucceeded: true }),
    'rolled-back',
  );
  assert.equal(
    evaluatePublishExecution({ ...ok, healthSucceeded: false, rollbackSucceeded: false }),
    'rollback-failed',
  );
  assert.equal(
    evaluatePublishExecution({ ...ok, deploySucceeded: false, migrationRisk: true }),
    'manual-intervention-required',
  );
});

test('migration scanner detects destructive and risky SQL', () => {
  assert.deepEqual(migrationRisk('DROP TABLE users;'), ['DROP']);
  assert.ok(
    migrationRisk('ALTER TABLE x ADD COLUMN y TEXT NOT NULL;').includes('NOT NULL без DEFAULT'),
  );
  assert.deepEqual(migrationRisk('CREATE TABLE safe (id TEXT);'), []);
});

test('tests use aggregates only and never expose secret fields', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('./backup-restore-check.mjs', import.meta.url), 'utf8'),
  );
  assert.doesNotMatch(source, /SELECT\s+.*passwordHash/i);
  assert.doesNotMatch(source, /DATABASE_URL/);
  assert.match(source, /cleanupTemporaryDatabase/);
  assert.doesNotMatch(source, /trap .*EXIT/);
});
