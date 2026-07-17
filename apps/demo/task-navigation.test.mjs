import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const slider = await readFile(new URL('./public/photo-slider.js', import.meta.url), 'utf8');
const placeholder = await readFile(new URL('./public/photo-placeholder.js', import.meta.url), 'utf8');
const seed = await readFile(
  new URL('../backend/src/database/bootstrap-demo-worker.ts', import.meta.url),
  'utf8',
);

test('dynamic cards carry their real task id and open selected details', () => {
  assert.match(app, /data-worker-task-id=/);
  assert.match(app, /openTaskDetails\(taskCard\.dataset\.workerTaskId\)/);
  assert.match(app, /worker\/tasks\/\$\{selectedTaskId\}/);
});

test('task detail is rendered from the selected task and its own ordered steps', () => {
  assert.match(app, /elements\.taskTitle\.textContent = selectedTask\.title/);
  assert.match(app, /selectedTask\.steps\.map\(renderTaskStep\)/);
  assert.match(app, /step\.photos/);
  assert.doesNotMatch(html, /Кабели — стена А/);
  assert.equal((html.match(/id="stepsList"/g) ?? []).length, 1);
});

test('details support status actions and return to the task list', () => {
  assert.match(app, /data-detail-step-action/);
  assert.match(app, /data-detail-task-action/);
  assert.match(html, /id="taskDetailView"[\s\S]*?data-back-to-tasks/);
  assert.match(app, /taskListScrollY/);
});

test('photo gallery keeps swipe behavior and dots without a numeric counter', () => {
  assert.match(slider, /class PhotoSlider/);
  assert.match(slider, /data-photo-dot/);
  assert.doesNotMatch(slider, /data-photo-counter|viewer\.counter/);
  assert.doesNotMatch(html, /photoViewerCounter/);
  assert.match(slider, /updateIndicator/);
  assert.match(slider, /carousel\.scrollLeft = 0/);
  assert.match(styles, /scroll-snap-type:\s*x mandatory/);
  assert.match(styles, /touch-action:\s*pan-x pan-y pinch-zoom/);
  assert.match(styles, /\.photoSlide img[\s\S]*?object-fit:\s*contain/);
});

test('photo slider keeps vertical page scrolling and lets the browser resolve diagonal gestures', () => {
  assert.match(styles, /\.photoCarousel[\s\S]*?touch-action:\s*pan-x pan-y pinch-zoom/);
  assert.doesNotMatch(
    slider.match(/mount\(root\)[\s\S]*?\n {4}clear\(root\)/)?.[0] ?? '',
    /preventDefault/,
  );
  assert.match(styles, /scroll-snap-type:\s*x mandatory/);
  assert.match(styles, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(styles, /\.photoViewer img[\s\S]*?touch-action:\s*none/);
});

test('photo scheduler loads previews near viewport without changing the stable image assignment', () => {
  assert.match(slider, /new IntersectionObserver/);
  assert.match(slider, /rootMargin:\s*'600px 0px'/);
  assert.match(slider, /this\.enqueue\(slides\[0\], 'high'\)/);
  assert.match(slider, /this\.enqueue\(slides\[1\], 'normal'\)/);
  assert.match(slider, /this\.enqueue\(slides\[2\], 'normal'\)/);
  assert.match(slider, /slides\.slice\(3\)/);
  assert.match(slider, /slides\[index \+ direction\].*'high'/);
  assert.match(slider, /URL\.createObjectURL\(blob\)/);
  assert.match(slider, /image\.src = url/);
  assert.doesNotMatch(slider, /decode\(|AbortController|loadToken|instanceId/);
  assert.doesNotMatch(slider, /MutationObserver|photoSkeleton|photoUnavailable/);
  assert.doesNotMatch(styles, /photoSkeleton|photoUnavailable|photoDiagnostic/);
  assert.match(app, /artifacts\/\$\{id\}\/preview/);
  assert.match(app, /loadOriginal:[\s\S]*?artifacts\/\$\{id\}`/);
});

test('photo placeholder is a presentation-only layer with branded building blocks', () => {
  assert.match(html, /photo-placeholder\.js/);
  assert.match(placeholder, /photoLoadingPlaceholder/);
  assert.match(placeholder, /строит\.рф/);
  assert.match(placeholder, /Загружаем фотографию/);
  assert.match(placeholder, /image\.addEventListener\('load'/);
  assert.doesNotMatch(
    placeholder,
    /fetch|Authorization|Artifact|Blob|ObjectURL|JWT|MinIO|decode\(|img\.onerror/,
  );
  assert.match(styles, /\.photoLoadingBlocks i[\s\S]*?width:\s*7px[\s\S]*?height:\s*7px/);
  assert.match(styles, /animation:\s*photo-loading-block 540ms/);
  assert.match(styles, /animation-delay:\s*150ms/);
  assert.match(styles, /background:\s*var\(--accent\)/);
  assert.match(styles, /\.photoSlide\.is-photo-loaded \.photoLoadingPlaceholder[\s\S]*?opacity:\s*0/);
  assert.match(styles, /\.photoSlide\.is-broken \.photoLoadingPlaceholder[\s\S]*?display:\s*none/);
});

test('task title uses a balanced header zone and responsive 19–20px type', () => {
  assert.match(app, /taskFeedCardHeader/);
  assert.match(styles, /\.taskFeedCardHeader[\s\S]*?align-items:\s*center/);
  assert.match(styles, /min-height:\s*clamp\(52px, 14vw, 58px\)/);
  assert.match(styles, /font-size:\s*clamp\(19px, calc\(4\.6vw \+ 2px\), 20px\)/);
  assert.match(styles, /-webkit-line-clamp:\s*2/);
});

test('task feed is flat and each card contains only title, slider, location and progress', () => {
  assert.match(app, /flatMap\(\(group\) =>/);
  assert.match(app, /function renderTaskCard/);
  assert.match(app, /taskLocation/);
  assert.match(app, /taskProgressBlock/);
  assert.doesNotMatch(
    app.match(/function renderTaskCard[\s\S]*?\n}/)?.[0] ?? '',
    /Исполнитель|taskSummary/,
  );
  assert.match(styles, /\.taskCard::before[\s\S]*?width:\s*4px/);
});

test('photo slides have one height and preserve intrinsic proportions', () => {
  assert.match(styles, /--photo-slide-height:/);
  assert.match(styles, /\.photoSlide \{[\s\S]*?height:\s*var\(--photo-slide-height\)/);
  assert.match(styles, /\.photoSlide img[\s\S]*?height:\s*100%/);
  assert.match(slider, /image\.naturalWidth \/ image\.naturalHeight/);
  assert.match(slider, /carousel\.clientWidth \* 0\.88/);
});

test('demo seed provisions reusable pairs for tasks, steps and events', () => {
  assert.match(seed, /assetFiles\.slice\(0, 2\)/);
  assert.match(seed, /assetFiles\.slice\(2, 4\)/);
  assert.match(seed, /if \(event\.artifacts\.length >= 2\) continue/);
});

test('one photo and empty photo lists use valid states', () => {
  assert.match(slider, /if \(!photos\?\.length\)/);
  assert.match(slider, /photos\.length > 1/);
  assert.match(slider, /this\.viewerImages/);
});

test('step actions are enabled only for a started task and use backend state', () => {
  assert.match(app, /selectedTask\.status === 'IN_PROGRESS'/);
  assert.match(app, /steps\.find\(\(candidate\) => candidate\.status !== 'COMPLETED'\)/);
  assert.match(app, /currentStep\?\.id === step\.id/);
  assert.match(app, /Загрузите минимум две фотографии, чтобы завершить этап/);
  assert.match(app, /api\/v1\/task-steps/);
});

test('top task status switch receives the selected backend task status class', () => {
  assert.match(
    app,
    /control\.className = `taskStatusControl \$\{taskCardStatusClass\(selectedTask\.status\)\}`/,
  );
});

test('task workspace reuses the slider, camera, messages and archive APIs', () => {
  assert.match(html, /taskWorkspaceCard/);
  assert.match(app, /openShiftCamera\('TASK_STEP', stepId\)/);
  assert.match(app, /api\/v1\/worker\/tasks\/\$\{selectedTaskId\}\/help/);
  assert.match(app, /api\/v1\/worker\/messages/);
  assert.match(app, /api\/v1\/worker\/archive/);
  assert.match(app, /api\/v1\/manager\/messages/);
  assert.match(app, /data-manager-reply/);
  assert.match(app, /function calculateCompletionBonus\(\)/);
});

test('bottom navigation uses one maintenance screen and one active section', () => {
  assert.match(html, /id="maintenanceView"/);
  assert.match(html, /Извините/);
  assert.match(html, /Идут технические работы/);
  assert.match(html, /data-maintenance-back/);
  assert.match(html, /data-section="messages"/);
  assert.match(html, /data-section="order" aria-label="Заказать"/);
  assert.match(html, /data-section="profile"/);
  assert.match(app, /let currentSection = 'tasks'/);
  assert.match(app, /function navigateSection\(section\)/);
  assert.match(app, /function updateBottomNavigation\(\)/);
  assert.match(app, /removeAttribute\('aria-current'\)/);
  assert.match(app, /navigateSection\(previousWorkingSection \|\| 'tasks'\)/);
});

test('the same PhotoSlider is used by task list, history and task details only', () => {
  assert.match(app, /PhotoSlider\.render\(task\.photos/);
  assert.match(app, /PhotoSlider\.render\(event\.artifacts/);
  assert.match(app, /PhotoSlider\.render\(selectedTask\.photos/);
  assert.doesNotMatch(app, /PhotoSlider\.render\(step\.photos/);
});

test('resting worker sees per-slide locks while the slider remains interactive', () => {
  assert.match(app, /function isTaskAccessLocked\(\)/);
  assert.match(
    app,
    /locked: !isManager\(\) && \(isTaskAccessLocked\(\) \|\| task\.isAccessLocked\)/,
  );
  assert.match(slider, /class="photoLockOverlay" aria-hidden="true"/);
  assert.match(slider, /fill="none" stroke="#FFFFFF"/);
  assert.match(slider, /setLocked\(root, locked\)/);
  assert.match(styles, /\[data-photo-locked='true'\] \.photoSlide img[\s\S]*?grayscale\(100%\)/);
  assert.match(styles, /\.photoLockOverlay[\s\S]*?pointer-events:\s*none/);
  assert.match(styles, /\.photoLockOverlay[\s\S]*?translate\(-50%, -50%\)/);
  assert.match(styles, /\.photoLockOverlay[\s\S]*?color:\s*#fff/);
  assert.match(styles, /\.photoLockOverlay svg[\s\S]*?fill:\s*none[\s\S]*?stroke:\s*#fff/);
  assert.match(styles, /\[data-photo-locked='true'\] \.photoLockOverlay[\s\S]*?opacity:\s*0\.85/);
});

test('resting worker cannot navigate or open the full-screen viewer', () => {
  assert.match(app, /if \(isTaskAccessLocked\(\)\) return notifyTaskLocked\(\)/);
  assert.match(app, /shiftStateResolved = false/);
  assert.match(slider, /if \(this\.isLocked\(image\)\)/);
  assert.match(app, /aria-disabled/);
});

test('fullscreen viewer supports zoom, pan and swipe', () => {
  assert.match(slider, /this\.viewer\.image\.src = image\.src/);
  assert.match(slider, /loadViewerOriginal/);
  assert.match(slider, /this\.viewer\.image\.src = url/);
  assert.match(html, /id="photoViewerStatus"/);
  assert.match(slider, /clamp\([^,]+, 1, 4\)/);
  assert.match(slider, /toggleZoom/);
  assert.match(slider, /totalY > 100/);
  assert.match(slider, /Math\.abs\(totalX\) > 60/);
});
