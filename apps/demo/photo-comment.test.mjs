import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const commentField = html.match(/<label id="shiftCameraCommentField"[\s\S]*?<\/label>/)?.[0] ?? '';

test('work photo confirmation exposes an optional untruncated 200-character comment field', () => {
  assert.match(commentField, /Комментарий/);
  assert.match(commentField, /placeholder="Что важно зафиксировать\?"/);
  assert.match(commentField, /до 200 символов/);
  assert.doesNotMatch(commentField, /required|maxlength/);
  assert.match(app, /showCameraCommentField\(\)/);
  assert.match(app, /\['TASK_STEP', 'TASK_PHOTO'\]\.includes\(cameraAttempt\.mode\)/);
});

test('comment normalization trims edges, preserves content and rejects over-limit Unicode', () => {
  const source = app.match(/function validateCameraComment\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const input = {
    value: '  Кабель готов 🙂\r\nПроверено  ',
    setAttribute() {},
    focus() {},
  };
  const context = {
    cameraAttempt: { mode: 'TASK_PHOTO' },
    elements: {
      shiftCameraCommentInput: input,
      shiftCameraCommentError: { textContent: '', hidden: true },
    },
    maxPhotoCommentLength: 200,
  };
  vm.runInNewContext(
    `${source}; globalThis.validateCameraComment = validateCameraComment;`,
    context,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(context.validateCameraComment())), {
    valid: true,
    comment: 'Кабель готов 🙂\nПроверено',
  });
  input.value = '   ';
  assert.deepEqual(JSON.parse(JSON.stringify(context.validateCameraComment())), {
    valid: true,
    comment: null,
  });
  input.value = '🙂'.repeat(201);
  assert.equal(context.validateCameraComment().valid, false);
});

test('comment travels in the same multipart upload and invalid input blocks fetch', () => {
  const submit = app.match(/async function submitCameraPhoto\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(submit, /const commentResult = validateCameraComment\(\)/);
  assert.match(
    submit,
    /if \(!commentResult\.valid\) return;[\s\S]*?cameraAttempt\.isSubmitting = true/,
  );
  assert.match(submit, /formData\.append\('comment', commentResult\.comment\)/);
  assert.match(submit, /apiFetch\(endpoint,[\s\S]*?body: formData/);
  assert.doesNotMatch(submit, /fetch[\s\S]*?\/comment|apiFetch[\s\S]*?\/comment/);
});

test('failed upload keeps the entered comment and the confirmation usable', () => {
  const submit = app.match(/async function submitCameraPhoto\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(
    submit,
    /if \(!response\.ok\)[\s\S]*?shiftCameraCommentInput\.disabled = false[\s\S]*?return/,
  );
  assert.match(
    submit,
    /catch \{[\s\S]*?shiftCameraCommentInput\.disabled = false[\s\S]*?setCameraError/,
  );
  const failureBranches =
    submit.match(/if \(!response\.ok\)[\s\S]*?return;|catch \{[\s\S]*?\n\s{2}\}/g) ?? [];
  assert.doesNotMatch(
    failureBranches.join('\n'),
    /shiftCameraCommentInput\.value\s*=|cleanupCameraAttempt/,
  );
});

test('TASK_PHOTO_ADDED shows only its optional comment and backend time', () => {
  const branch =
    app.match(/if \(frame\.kind === 'TASK_PHOTO_ADDED'\) \{[\s\S]*?\n\s{2}\}/)?.[0] ?? '';
  assert.match(branch, /frame\.comment/);
  assert.match(branch, /<time datetime=/);
  assert.doesNotMatch(
    branch,
    /Задача выполняется|frame\.title|frame\.description|Ответственный|Стоимость|Фотографий/,
  );
  assert.match(
    css,
    /\.analystFrameOverlay\.is-work-photo strong \{[\s\S]*?-webkit-line-clamp:\s*3/,
  );
  assert.match(
    css,
    /\.analystFrameOverlay\.is-work-photo time:first-child \{[\s\S]*?margin-top:\s*0/,
  );
});

test('virtual task and shift report renderers remain separate and unchanged', () => {
  assert.match(app, /isAnalystTaskSection\(frame\)/);
  assert.match(app, /renderAnalystTaskSection\(frame\)/);
  assert.match(app, /TASK_SECTION_SUMMARY/);
  assert.match(app, /SHIFT_SECTION_SUMMARY/);
});
