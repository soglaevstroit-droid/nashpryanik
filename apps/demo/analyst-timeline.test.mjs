import assert from 'node:assert/strict';
import test from 'node:test';

await import('./public/analyst-timeline.js');

const { createIndexStore, findActiveIndex, resolveInitialIndex } = globalThis.AnalystTimeline;

function slide(offsetLeft, offsetWidth = 88) {
  return { offsetLeft, offsetWidth };
}

test('moving from frame 1 to frame 2 changes the active event description index', () => {
  const slides = [slide(0), slide(100)];
  assert.equal(findActiveIndex(slides, 0, 100), 0);
  assert.equal(findActiveIndex(slides, 80, 100), 1);
});

test('the last visible frame wins even when its left edge cannot reach carousel start', () => {
  const slides = [slide(0), slide(100), slide(200)];
  assert.equal(findActiveIndex(slides, 188, 100), 2);
  assert.equal(resolveInitialIndex(undefined, slides.length), 2);
});

test('polling keeps the current frame index and clamps it only when frames disappear', () => {
  const store = createIndexStore();
  store.set('worker-1', 1);
  assert.equal(store.get('worker-1', 3), 1);
  assert.equal(store.get('worker-1', 4), 1);
  assert.equal(store.get('worker-1', 1), 0);
});

test('each worker card owns an independent active index', () => {
  const store = createIndexStore();
  store.set('worker-1', 2);
  store.set('worker-2', 0);
  assert.equal(store.get('worker-1', 4), 2);
  assert.equal(store.get('worker-2', 4), 0);
});
