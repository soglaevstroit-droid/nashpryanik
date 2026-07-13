import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');

test('manager receives Put task navigation and one reusable task form', () => {
  assert.match(app, /orderNavLabel\.textContent = manager \? 'Поставить' : 'Заказать'/);
  assert.equal((html.match(/id="managerTaskModal"/g) ?? []).length, 1);
  assert.match(html, /data-add-manager-step/);
  assert.match(html, /name="managerPriority" value="URGENT"/);
  assert.match(html, /name="managerAccess" value="CLOSED"/);
});

test('worker cards preserve backend business lock and manager controls stay role-based', () => {
  assert.match(app, /task\.isAccessLocked/);
  assert.match(app, /data-business-locked/);
  assert.match(app, /function renderManagerControls/);
  assert.match(app, /data-manager-delete/);
});
