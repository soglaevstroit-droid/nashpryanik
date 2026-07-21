import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const seed = await readFile(
  new URL('../backend/src/database/bootstrap-demo-worker.ts', import.meta.url),
  'utf8',
);

test('help island is one simple Нужна помощь? action', () => {
  const island = html.match(/<section id="taskHelpIsland"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(island, />\s*Нужна помощь\?\s*</);
  assert.doesNotMatch(island, /Отправьте сообщение руководителю|Написать руководителю/);
  assert.equal((island.match(/<button/g) ?? []).length, 1);
  assert.match(island, /data-open-modal="helpRequest"/);
});

test('future steps never infer completion from index and completed requires backend facts', () => {
  assert.match(app, /candidate\.status !== 'COMPLETED'/);
  assert.match(app, /step\.status === 'COMPLETED' && Boolean\(step\.completedAt\)/);
  assert.doesNotMatch(app, /index < currentStep|order < currentStep/);
  assert.doesNotMatch(seed, /database\.taskStep\./);
});

test('camera waits for a real frame and preview image before stopping stream', () => {
  assert.match(app, /await waitForVideoFrame\(elements\.shiftCameraVideo\)/);
  assert.match(app, /video\.readyState >= 2/);
  assert.match(app, /context\.drawImage\(video, 0, 0, width, height\)/);
  assert.match(app, /canvas\.toBlob\(resolve, 'image\/jpeg', 0\.9\)/);
  assert.match(
    app,
    /await loadPreviewImage\(elements\.shiftCameraPreview, cameraAttempt\.previewUrl\)/,
  );
  assert.match(app, /loadPreviewImage[\s\S]*stopCameraStream\(\)/);
  assert.match(css, /#shiftCameraPreview[\s\S]*object-fit: contain/);
});

test('preview failure cannot be confirmed and cleanup revokes its ObjectURL', () => {
  assert.match(app, /Не удалось подготовить фотографию\. Сделайте снимок ещё раз/);
  assert.match(app, /shiftCameraConfirmButton\.hidden = true/);
  assert.match(app, /shiftCameraConfirmButton\.disabled = true/);
  assert.match(app, /URL\.revokeObjectURL\(cameraAttempt\.previewUrl\)/);
  assert.match(app, /formData\.append\([\s\S]*new File\(\s*\[cameraAttempt\.blob\]/);
});

test('preview image stays above stopped video and hidden camera layers stay hidden', () => {
  assert.match(css, /#shiftCameraPreview[\s\S]*?z-index:\s*2/);
  assert.match(css, /#shiftCameraPreview[\s\S]*?display:\s*block/);
  assert.match(css, /#shiftCameraPreview[\s\S]*?visibility:\s*visible/);
  assert.match(css, /#shiftCameraPreview[\s\S]*?opacity:\s*1/);
  assert.match(css, /#shiftCameraPreview[\s\S]*?object-fit:\s*contain/);
  assert.match(css, /video\[hidden\],[\s\S]*?img\[hidden\],[\s\S]*?display:\s*none\s*!important/);
  assert.match(app, /Не удалось отобразить фотографию\. Переснимите кадр\./);
});

test('worker history routes to maintenance while manager keeps real history', () => {
  assert.match(app, /section === 'history' && !isManager\(\)/);
  assert.match(app, /currentSection = 'history';[\s\S]*openView\('maintenance'\)/);
  assert.match(app, /else if \(section === 'history'\)[\s\S]*openView\('history'\)/);
  assert.match(app, /isManager\(\)[\s\S]*`\/api\/v1\/manager\/history\?workerId=/);
  assert.match(app, /navigateSection\(previousWorkingSection \|\| 'tasks'\)/);
});

test('one role-aware menu keeps manager history fourth and rebuilds after user changes', () => {
  const navigation = html.match(/<nav class="bottomNav"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const sections = [...navigation.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sections, ['tasks', 'messages', 'order', 'history', 'profile']);
  assert.match(navigation, /id="historyNavButton"[\s\S]*?<span>История<\/span>/);
  assert.match(app, /function configureBottomNavigation\(\)/);
  assert.match(
    app,
    /const expectedSections = analyst[\s\S]*?\['tasks', 'history', 'profile'\][\s\S]*?\['tasks', 'messages', 'order', 'history', 'profile'\]/,
  );
  assert.match(app, /button\.dataset\.menuRole = currentUser\?\.role/);
  assert.match(app, /elements\.orderNavLabel\.textContent = manager \? 'Поставить' : 'Заказать'/);
  assert.match(app, /elements\.historyNavButton\.hidden = false/);
  assert.match(app, /if \(isManager\(\)\) \{[\s\S]*?configureBottomNavigation\(\)/);
  assert.match(
    app,
    /elements\.userInfo\.textContent = currentUser\?\.name[\s\S]*?configureBottomNavigation\(\)/,
  );
});

test('manager history automatically selects a worker and renders the worker feed title', () => {
  assert.match(html, /id="historyHeading">История<\/h1>/);
  assert.match(app, /api\/v1\/manager\/workers/);
  assert.match(app, /managerHistoryWorker = workers\[0\]/);
  assert.match(
    app,
    /api\/v1\/manager\/history\?workerId=\$\{encodeURIComponent\(managerHistoryWorker\.id\)\}/,
  );
  assert.match(app, /История — \$\{managerHistoryWorker\.name \|\| managerHistoryWorker\.email\}/);
  assert.match(app, /managerHistoryWorker = null;[\s\S]*historyCursor = null/);
});
