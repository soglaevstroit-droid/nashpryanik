import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const modal =
  html.match(/<section\s+id="managerTaskModal"[\s\S]*?<\/section>\s*<\/div>/)?.[0] ?? '';

test('manager composer is one accessible branded dialog with a compact header', () => {
  assert.equal((html.match(/id="managerTaskModal"/g) ?? []).length, 1);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby="managerTaskTitle"/);
  assert.match(modal, /id="managerTaskTitle">Поставить задачу/);
  assert.match(modal, /Создайте новую задачу для монтажника/);
  assert.match(modal, /aria-label="Закрыть форму постановки задачи"/);
  assert.match(css, /\.modalCard\.managerTaskModal[\s\S]*?border-radius:\s*28px/);
  assert.match(css, /\.modalLayer\.is-manager-task-modal[\s\S]*?backdrop-filter:\s*blur/);
});

test('required fields keep labels and styled non-system controls', () => {
  for (const id of [
    'managerObject',
    'managerLocation',
    'managerTitle',
    'managerDescription',
    'managerWorker',
    'managerPosition',
  ]) {
    assert.match(modal, new RegExp(`<label[^>]+for="${id}"`));
  }
  assert.match(modal, /id="managerTitle"[\s\S]*?minlength="3"[\s\S]*?maxlength="160"/);
  assert.match(modal, /id="managerPosition"[\s\S]*?min="1"[\s\S]*?step="1"/);
  assert.match(css, /\.managerTaskModal select[\s\S]*?appearance:\s*none/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /#managerTaskForm\.was-validated[\s\S]*?:invalid/);
});

test('custom upload zone supports multiple binary photos, previews and cleanup', () => {
  assert.match(modal, /class="managerFileInput"[\s\S]*?multiple/);
  assert.match(modal, /data-open-manager-photos/);
  assert.match(modal, /Выбрать фотографии/);
  assert.match(modal, /Выбрано: 0 из 12/);
  assert.match(app, /managerPhotoMaxCount = 12/);
  assert.match(app, /const nextFiles = \[\.\.\.managerSelectedFiles, \.\.\.selected\]/);
  assert.match(app, /URL\.createObjectURL\(file\)/);
  assert.match(app, /URL\.revokeObjectURL\(url\)/);
  assert.match(app, /data-remove-manager-photo/);
  assert.match(app, /data\.append\('photos', file\)/);
  assert.doesNotMatch(app, /readAsDataURL|base64/);
  assert.match(css, /\.managerFileInput[\s\S]*?clip-path:\s*inset\(50%\)/);
});

test('step cards add, focus, confirm destructive removal and renumber safely', () => {
  assert.match(app, /class="managerStepFields [^"]*" data-manager-step-card/);
  assert.match(app, /class="managerStepNumber"/);
  assert.match(app, /data-manager-step-title required/);
  assert.match(app, /data-manager-step-description required/);
  assert.match(app, /scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(app, /type: 'deleteStep'/);
  assert.match(app, /Введённые данные этого этапа будут удалены/);
  assert.match(app, /removeButton\.hidden = isCompleted/);
  assert.match(app, /removeButton\.setAttribute\('aria-label', `Удалить этап \$\{order\}`\)/);
  assert.match(css, /\.managerStepFields::before[\s\S]*?background:\s*linear-gradient/);
});

test('priority and access use only the approved native radio semantics', () => {
  const priorities = [...modal.matchAll(/name="managerPriority" value="([A-Z]+)"/g)].map(
    (match) => match[1],
  );
  const access = [...modal.matchAll(/name="managerAccess" value="([A-Z]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(priorities, ['NORMAL', 'URGENT']);
  assert.deepEqual(access, ['OPEN', 'CLOSED']);
  assert.doesNotMatch(modal, /Низкий|Высокий/);
  assert.match(css, /\.managerSegmentOption input[\s\S]*?opacity:\s*0/);
  assert.match(css, /\.managerSegmentOption input:checked \+ span/);
  assert.match(css, /\.managerSegmentOption input:focus-visible \+ span/);
});

test('worker stays API-driven and the selected id or shared mode remains the payload assignee', () => {
  assert.match(app, /apiFetch\('\/api\/v1\/manager\/workers'\)/);
  assert.match(app, /'<option value="">Без ответственного<\/option>'/);
  assert.match(app, /escapeHtml\(item\.name \|\| item\.email\)/);
  assert.match(app, /assigneeId: elements\.managerWorker\.value \|\| null/);
  assert.match(css, /\.managerAssignmentRow[\s\S]*?grid-template-columns/);
  assert.doesNotMatch(modal, /ilya|Илья Н\./);
});

test('submit confirmation keeps the complete payload and loading is idempotent', () => {
  for (const label of [
    'Объект',
    'Место',
    'Название',
    'Исполнитель',
    'Фотографии',
    'Этапы',
    'Приоритет',
    'Доступ',
    'Позиция',
  ]) {
    assert.match(app, new RegExp(`\\['${label}',`));
  }
  assert.match(app, /managerDraftOperationId = crypto\.randomUUID\(\)/);
  assert.match(app, /if \(managerTaskSubmitting\) return/);
  assert.match(app, /Создаём задачу…/);
  assert.match(app, /type: 'submitTask'/);
  assert.match(app, /type: 'forceUrgent'/);
  assert.match(css, /\.managerFormActions[\s\S]*?background:\s*rgb\(255 255 255 \/ 96%\)/);
});

test('known 413, dirty close and failed requests preserve a usable draft', () => {
  assert.match(
    app,
    /Фотографии превышают допустимый общий размер\. Удалите часть файлов или выберите изображения меньшего размера\./,
  );
  assert.match(app, /function isManagerFormDirty\(\)/);
  assert.match(app, /type: 'discard'/);
  assert.match(app, /Введённые данные будут потеряны/);
  assert.match(app, /setManagerSubmitting\(false\);[\s\S]*showManagerFormError/);
  assert.match(app, /!\/<\[a-z\]\[\\s\\S\]\*>\/i\.test\(message\)/);
});

test('keyboard focus, safe areas and narrow layouts are explicitly handled', () => {
  assert.match(app, /function trapManagerDialogFocus\(event\)/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /returnFocus\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /height:\s*min\([\s\S]*?100dvh/);
  assert.match(css, /max\(16px, var\(--safe-bottom\)\)/);
  assert.match(css, /@media \(max-width: 350px\)/);
  assert.match(css, /\.managerAssignmentRow[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
