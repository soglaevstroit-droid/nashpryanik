import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const slider = await readFile(new URL('./public/photo-slider.js', import.meta.url), 'utf8');

test('completed task is a readable soft-green island while active task keeps its strip', () => {
  assert.match(app, /IN_PROGRESS: 'is-working'/);
  assert.match(app, /COMPLETED: 'is-completed'/);
  assert.match(
    css,
    /\.taskCard\.is-completed \{[\s\S]*?background:\s*var\(--green-completed\)[\s\S]*?color:\s*var\(--text\)/,
  );
  assert.match(css, /\.taskCard\.is-completed::before \{[\s\S]*?background:\s*transparent/);
  assert.match(
    css,
    /\.taskCard\.is-working,[\s\S]*?--task-card-status-color:\s*#4caf50[\s\S]*?\.taskCard\.is-working,[\s\S]*?background:\s*var\(--surface\)/,
  );
});

test('completed photos show a centered branded ready badge while closed tasks retain the lock', () => {
  assert.match(css, /--green-completed:\s*#ddf4e5/);
  assert.match(
    css,
    /\.taskCard\.is-completed \.photoLockOverlay \{[\s\S]*?display:\s*inline-flex[\s\S]*?min-width:\s*168px[\s\S]*?gap:\s*12px[\s\S]*?padding:\s*17px 30px[\s\S]*?border:\s*1\.5px solid rgb\(255 255 255 \/ 58%\)[\s\S]*?border-radius:\s*18px[\s\S]*?background:\s*rgb\(255 255 255 \/ 18%\)[\s\S]*?font-size:\s*21px[\s\S]*?backdrop-filter:\s*blur\(10px\)/,
  );
  assert.match(css, /\.taskCard\.is-completed \.photoLockOverlay svg \{[\s\S]*?display:\s*none/);
  assert.match(
    css,
    /\.taskCard\.is-completed \.photoLockOverlay::before \{[\s\S]*?content:\s*'✓'[\s\S]*?font-size:\s*23px/,
  );
  assert.match(
    css,
    /\.taskCard\.is-completed \.photoLockOverlay::after \{[\s\S]*?content:\s*'Готово'/,
  );
  const completedMark = css.match(
    /\.taskCard\.is-completed \.photoLockOverlay::before \{([^}]*)\}/,
  )?.[1];
  assert.doesNotMatch(completedMark ?? '', /border-radius:\s*50%/);
  assert.match(slider, /<path d="M7 10V7a5 5 0 0 1 10 0v3"\/>/);
  assert.doesNotMatch(slider, /is-completed|Готово/);
});

test('dynamic simple-task photo button is re-enabled after accept and opens the camera flow', () => {
  assert.match(app, /const simpleTaskPhotoButton = event\.target\.closest\('\[data-simple-task-photo\]'\)/);
  assert.match(app, /if \(simpleTaskPhotoButton\) \{[\s\S]*?openSimpleTaskCamera\(false\)/);
  assert.match(
    app,
    /function renderSelectedTaskActionState\(\)[\s\S]*?renderSelectedTaskControl\(\)[\s\S]*?renderSimpleTaskActions\(\)/,
  );
  const accept = app.match(/async function runWorkerTaskAction[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(accept, /taskDetailActionPending = false[\s\S]*?renderSelectedTaskActionState\(\)/);
  const opener = app.match(/function openSimpleTaskCamera[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(opener, /openShiftCamera\(completing \? 'TASK_COMPLETE' : 'TASK_PHOTO'\)/);
  assert.doesNotMatch(opener, /hasActiveWorkerTask|activeWorkerTaskId|navigation/);
});

test('camera has iPhone capture and desktop file-input fallback without changing upload routes', () => {
  assert.match(
    html,
    /id="shiftCameraFileInput"[\s\S]*?type="file"[\s\S]*?accept="image\/jpeg,image\/webp"[\s\S]*?capture="environment"/,
  );
  assert.match(app, /shiftCameraFileInput\.addEventListener\('change', handleCameraFileSelection\)/);
  assert.match(app, /if \(!navigator\.mediaDevices\?\.getUserMedia\)[\s\S]*?enableCameraFileFallback\(true\)/);
  assert.match(app, /filePickerFallback[\s\S]*?shiftCameraFileInput\.click\(\)/);
  assert.match(app, /cameraAttempt\.blob = file/);
  assert.match(app, /cameraAttempt\.previewUrl = URL\.createObjectURL\(file\)/);
  assert.match(app, /cameraAttempt\.mode === 'TASK_PHOTO'[\s\S]*?'\/api\/v1\/artifacts\/photos'/);
});

test('cancel and upload failure keep task state while success reloads backend details', () => {
  const cancel = app.match(/function cancelCameraAttempt[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(cancel, /cleanupCameraAttempt/);
  assert.match(cancel, /closeModal/);
  assert.doesNotMatch(cancel, /status|IN_PROGRESS|COMPLETED/);
  const submit = app.match(/async function submitCameraPhoto[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(submit, /if \(!response\.ok\)[\s\S]*?return/);
  assert.match(
    submit,
    /\['TASK_STEP', 'TASK_PHOTO'\]\.includes\(submittedMode\)[\s\S]*?reloadTaskDetails\(\)[\s\S]*?loadWorkerObjects\(\)/,
  );
});

test('PhotoSlider and step workflow do not depend on the new completed or camera states', () => {
  assert.match(slider, /class PhotoSlider/);
  assert.match(slider, /loadViewerOriginal/);
  assert.doesNotMatch(slider, /is-completed|filePickerFallback|simpleTaskPhotoButton/);
  const stepPicker = app.match(/function openDetailPhotoPicker[\s\S]*?\n}/)?.[0] ?? '';
  assert.doesNotMatch(stepPicker, /filePickerFallback/);
});
