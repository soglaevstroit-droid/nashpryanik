import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertExtendedExecutionEnvironment,
  assertExtendedTestdataDefinition,
  expectedTaskPhotoCount,
  EXTENDED_TESTDATA_MARKER,
  extendedTaskSpecs,
  extendedTestObjects,
  extendedTestUsers,
} from './extended-testdata.definition.js';

test('extended command needs explicit production authorization on loopback services', () => {
  assert.throws(() =>
    assertExtendedExecutionEnvironment({
      environment: 'production',
      databaseUrl: 'postgresql://user:pass@localhost:5432/stroit',
      minioHost: 'localhost',
    }),
  );
  assert.doesNotThrow(() =>
    assertExtendedExecutionEnvironment({
      environment: 'production',
      databaseUrl: 'postgresql://user:pass@localhost:5432/stroit',
      minioHost: '127.0.0.1',
      productionAuthorized: true,
    }),
  );
});

test('extended testdata has stable namespace and three intended profiles', () => {
  assert.equal(EXTENDED_TESTDATA_MARKER, 'EXT_TEST_V1');
  assert.deepEqual(
    extendedTestUsers.map(({ email, role }) => [email, role]),
    [
      ['work', 'WORKER'],
      ['work2', 'FOREMAN'],
      ['work3', 'ANALYST'],
    ],
  );
});

test('extended suite contains five objects and all eighteen primary scenarios', () => {
  assert.equal(extendedTestObjects.length, 5);
  assert.equal(extendedTaskSpecs.length, 18);
  assert.doesNotThrow(assertExtendedTestdataDefinition);
});

test('active positions are unique and archive records are excluded from the sequence', () => {
  const active = extendedTaskSpecs.filter(
    ({ deleted, status }) => !deleted && status !== 'COMPLETED' && status !== 'CANCELLED',
  );
  assert.equal(new Set(active.map(({ position }) => position)).size, active.length);
  assert.equal(extendedTaskSpecs.find(({ number }) => number === 16)?.status, 'COMPLETED');
  assert.equal(extendedTaskSpecs.find(({ number }) => number === 17)?.deleted, true);
});

test('photo and step boundary scenarios match the specification', () => {
  assert.equal(expectedTaskPhotoCount(extendedTaskSpecs[1]), 0);
  assert.equal(expectedTaskPhotoCount(extendedTaskSpecs[0]), 1);
  assert.equal(expectedTaskPhotoCount(extendedTaskSpecs[3]), 2);
  assert.equal(expectedTaskPhotoCount(extendedTaskSpecs[13]), 12);
  assert.equal(extendedTaskSpecs[11].steps.length, 20);
  assert.equal(extendedTaskSpecs[14].steps[1].photoCount, 1);
  assert.equal(extendedTaskSpecs[14].steps[0].photoCount, 4);
});

test('suite covers lifecycle, priority, access and pause variants', () => {
  const statuses = new Set(extendedTaskSpecs.map(({ status }) => status));
  for (const status of ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'])
    assert.equal(statuses.has(status as never), true);
  assert.equal(
    extendedTaskSpecs.some(({ priority }) => priority === 'URGENT'),
    true,
  );
  assert.equal(
    extendedTaskSpecs.some(({ accessStatus }) => accessStatus === 'CLOSED'),
    true,
  );
  assert.equal(
    extendedTaskSpecs.some(({ blocked }) => blocked),
    true,
  );
});
