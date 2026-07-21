import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('./public/', import.meta.url);

async function loadProfileAvatar() {
  const source = await readFile(new URL('profile-avatar.js', root), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context.ProfileAvatar;
}

test('Ilya and Igor resolve to separate local avatar assets', async () => {
  const avatars = await loadProfileAvatar();
  const ilya = avatars.urlForUser({ email: 'ilya' });
  const igor = avatars.urlForUser({ email: ' IGOR ' });

  assert.equal(ilya, '/assets/ilya-profile.png');
  assert.equal(igor, '/assets/igor-profile.webp?v=20260722');
  assert.notEqual(ilya, igor);
});

test('unknown profiles do not inherit another worker avatar', async () => {
  const avatars = await loadProfileAvatar();
  assert.equal(avatars.urlForUser({ email: 'manager' }), null);
  assert.equal(avatars.urlForUser(null), null);
});

test('worker, manager and analyst views consume the login-specific avatar helper', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('app.js', root), 'utf8'),
  ]);

  assert.match(html, /id="workerProfileAvatar"/);
  assert.match(html, /<script src="\/profile-avatar\.js"><\/script>/);
  assert.match(app, /ProfileAvatar\.urlForUser\(currentUser\)/);
  assert.match(app, /function updateManagerWorkerAvatar\(\)/);
  assert.match(app, /ProfileAvatar\.urlForUser\(worker\)/);
  assert.match(app, /ProfileAvatar\.urlForUser\(entry\.worker\)/);
});
