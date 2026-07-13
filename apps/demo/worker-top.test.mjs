import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const cameraSource = await readFile(new URL('./public/camera-utils.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(cameraSource, context);
const camera = context.window.CameraUtils;

test('decorative phone status bar and fixed 9:41 are absent', () => {
  assert.doesNotMatch(html, /9:41|statusBar|●●●/);
  assert.doesNotMatch(html, /phoneShell/);
  assert.doesNotMatch(styles, /\.statusBar/);
  assert.match(styles, /var\(--safe-top\)/);
});

test('camera switch is hidden for one input and available for two', () => {
  assert.equal(camera.countVideoInputs([{ kind: 'videoinput' }]), 1);
  assert.equal(camera.countVideoInputs([{ kind: 'videoinput' }, { kind: 'videoinput' }]), 2);
  assert.match(app, /cameraAttempt\.cameraCount < 2/);
  assert.match(html, /aria-label="Переключить камеру"/);
});

test('stopping camera releases every media track', () => {
  let stopped = 0;
  camera.stopStream({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] });
  assert.equal(stopped, 2);
});

test('camera starts at environment and toggles without opening a second stream', () => {
  assert.equal(camera.nextFacingMode('environment'), 'user');
  assert.equal(camera.nextFacingMode('user'), 'environment');
  assert.match(app, /stopCameraStream\(\);[\s\S]*getUserMedia/);
});

test('preview confirmation spans the full row and duplicate submission is guarded', () => {
  assert.match(styles, /\.cameraConfirmButton:not\(\[hidden\]\)[\s\S]*grid-column:\s*1 \/ -1/);
  assert.match(app, /cameraAttempt\.isSubmitting/);
  assert.match(app, /cleanupCameraAttempt\(\{ keepOperationId: false \}\)/);
});

test('worker header renders three equal financial columns', () => {
  assert.match(styles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(html, /На согласовании/);
  assert.match(html, /Ожидание/);
  assert.match(html, /approvedCoinAmount/);
  assert.match(html, /pendingCoinAmount/);
});

test('earned block is the only live value without Сейчас or plus sign', () => {
  assert.doesNotMatch(html, /currentCoinRow|shiftEarnedAmount/);
  assert.doesNotMatch(app, /currentCoinRow|shiftEarnedAmount|`\+\$\{formatCoinUnits/);
  assert.match(app, /approvedCoinAmount\.textContent = formatCoinUnits\(units\)/);
  assert.match(app, /approvedCoinAmount\.classList\.add\('is-live'\)/);
  assert.match(styles, /\.workerStats strong\.is-live[\s\S]*color:\s*var\(--green\)/);
});

test('closed shift resets earned to 0,00 and uses human status labels', () => {
  assert.match(app, /approvedCoinAmount\.textContent = '0,00'/);
  assert.match(app, /status === 'ACTIVE' \? 'Работает' : 'Отдыхает'/);
});

test('pending is rounded for display while top balance uses approved whole coins', () => {
  assert.match(app, /pendingCoinAmount\.textContent = formatRoundedCoinUnits\(pending\)/);
  assert.match(app, /Math\.floor\(\(safeUnits \+ 50\) \/ 100\)/);
  assert.equal(Math.floor((12542 + 50) / 100), 125);
  assert.equal(Math.floor((12550 + 50) / 100), 126);
  assert.match(app, /totalCoinBalance\.textContent = formatApprovedCoinUnits\(approved\)/);
  assert.match(app, /approvedBalanceCoinUnits/);
});
