import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertPreviewBackfillExecution,
  parsePreviewBackfillOptions,
} from './artifact-preview-backfill.definition.js';

test('preview backfill is dry-run by default with bounded batches and concurrency', () => {
  assert.deepEqual(parsePreviewBackfillOptions([]), {
    apply: false,
    productionApproved: false,
    batchSize: 25,
    concurrency: 2,
  });
  assert.deepEqual(
    parsePreviewBackfillOptions([
      '--apply',
      '--production-approved',
      '--batch-size',
      '40',
      '--concurrency',
      '3',
    ]),
    {
      apply: true,
      productionApproved: true,
      batchSize: 40,
      concurrency: 3,
    },
  );
  assert.throws(() => parsePreviewBackfillOptions(['--concurrency', '20']));
});

test('preview backfill requires explicit production approval and local data services', () => {
  assert.doesNotThrow(() =>
    assertPreviewBackfillExecution({
      environment: 'development',
      databaseUrl: 'postgresql://stroit:secret@localhost:5432/stroit_dev',
      minioHost: '127.0.0.1',
      productionApproved: false,
    }),
  );
  assert.throws(() =>
    assertPreviewBackfillExecution({
      environment: 'production',
      databaseUrl: 'postgresql://stroit:secret@localhost:5432/stroit',
      minioHost: 'localhost',
      productionApproved: false,
    }),
  );
  assert.doesNotThrow(() =>
    assertPreviewBackfillExecution({
      environment: 'production',
      databaseUrl: 'postgresql://stroit:secret@localhost:5432/stroit',
      minioHost: '127.0.0.1',
      productionApproved: true,
    }),
  );
  assert.throws(() =>
    assertPreviewBackfillExecution({
      environment: 'development',
      databaseUrl: 'postgresql://stroit:secret@db.example.com:5432/stroit_dev',
      minioHost: 'localhost',
      productionApproved: false,
    }),
  );
  assert.throws(() =>
    assertPreviewBackfillExecution({
      environment: 'production',
      databaseUrl: 'postgresql://stroit:secret@db.example.com:5432/stroit',
      minioHost: 'localhost',
      productionApproved: true,
    }),
  );
});

test('preview backfill uses stable id pagination while rows leave the candidate set', async () => {
  const source = await readFile(new URL('./artifact-preview-backfill.js', import.meta.url), 'utf8');
  assert.match(source, /previewStorageKey:\s*null/);
  assert.match(source, /id:\s*\{\s*gt:\s*cursor\s*}/);
  assert.doesNotMatch(source, /cursor:\s*\{\s*id:\s*cursor\s*}[\s\S]*?skip:\s*1/);
});
