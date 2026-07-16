import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./public/photo-placeholder.js', import.meta.url), 'utf8');

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    contains: (name) => values.has(name),
    toggle: (name, force) => {
      if (force) values.add(name);
      else values.delete(name);
    },
  };
}

test('placeholder is inserted before an image and hides only after a successful load', () => {
  let observeOptions;
  let notifyMutation;
  let loadPhoto;
  let insertedPlaceholder;
  const slide = { classList: createClassList(['photoSlide']) };
  const image = {
    complete: false,
    naturalWidth: 0,
    dataset: {},
    before: (node) => (insertedPlaceholder = node),
    closest: () => slide,
    addEventListener: (name, listener) => {
      if (name === 'load') loadPhoto = listener;
    },
  };
  const addedCard = {
    nodeType: 1,
    matches: () => false,
    querySelectorAll: () => [image],
  };
  const document = {
    documentElement: {},
    createElement: () => ({
      className: '',
      innerHTML: '',
      setAttribute: () => {},
    }),
    matches: () => false,
    querySelectorAll: () => [],
  };

  class MutationObserver {
    constructor(callback) {
      notifyMutation = callback;
    }

    observe(_root, options) {
      observeOptions = options;
    }
  }

  vm.runInNewContext(source, { document, MutationObserver });
  notifyMutation([{ addedNodes: [addedCard] }]);

  assert.equal(image.dataset.photoPlaceholderReady, 'true');
  assert.equal(insertedPlaceholder.className, 'photoLoadingPlaceholder');
  assert.match(insertedPlaceholder.innerHTML, /строит\.рф/);
  assert.equal(slide.classList.contains('is-photo-loaded'), false);
  assert.equal(observeOptions.childList, true);
  assert.equal(observeOptions.subtree, true);

  image.complete = true;
  image.naturalWidth = 1200;
  loadPhoto();

  assert.equal(slide.classList.contains('is-photo-loaded'), true);
});
