import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('./reset-local-worker-history.js', import.meta.url);

test('local worker reset is scoped to exact logins and requires explicit confirmation', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /const targetLogins = \['ilya', 'igor'\]/);
  assert.match(source, /--confirm-local-ilya-igor-cleanup/);
  assert.match(source, /if \(!confirmed\)/);
  assert.match(source, /Expected exactly active WORKER logins/);
});

test('worker reset requires explicit production identity and verified backup guards', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /--production/);
  assert.match(source, /--expected-user-ids/);
  assert.match(source, /--backup-sha256/);
  assert.match(source, /Production cleanup permits only the exact logins ilya,igor/);
  assert.match(source, /Production backup SHA-256 does not match/);
  assert.match(source, /databaseUrl\.pathname\.slice\(1\) === 'stroit_dev'/);
  assert.match(source, /config\.minio\.bucket === 'stroit-dev'/);
  assert.doesNotMatch(source, /\.(?:dropDatabase|truncate)\b|removeBucket|listObjects/);
  assert.doesNotMatch(source, /user\.delete|user\.deleteMany/);
});

test('worker reset preserves profiles, shared storage and blocks foreign worker relations', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /passwordHash === before\.passwordHash/);
  assert.match(source, /data: \{ openingBalanceCoinUnits: 0 \}/);
  assert.match(source, /retainedKeys\.has\(key\)/);
  assert.match(source, /statObject/);
  assert.match(source, /removeObject/);
  assert.match(source, /Cleanup apply is blocked because related data belongs to another WORKER/);
  assert.match(source, /artifactsFromOtherWorkers/);
});
