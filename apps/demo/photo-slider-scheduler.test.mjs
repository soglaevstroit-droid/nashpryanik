import assert from 'node:assert/strict';
import { Blob } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import vm from 'node:vm';

const source = await readFile(new URL('./public/photo-slider.js', import.meta.url), 'utf8');

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

function createRuntime() {
  const revoked = [];
  let sequence = 0;
  class IntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
    }
    observe(target) {
      this.observed.push(target);
    }
    unobserve() {}
    disconnect() {}
  }
  class Image {
    constructor() {
      this.listeners = {};
    }
    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }
    set src(value) {
      this.value = value;
      Promise.resolve().then(() => this.listeners.load?.());
    }
  }
  const window = {
    IntersectionObserver,
    addEventListener: () => {},
  };
  const document = {
    body: { classList: { add: () => {}, remove: () => {} } },
    querySelectorAll: () => [],
  };
  vm.runInNewContext(source, {
    Blob,
    Image,
    IntersectionObserver,
    ResizeObserver: undefined,
    URL: {
      createObjectURL: () => `blob:photo-${++sequence}`,
      revokeObjectURL: (url) => revoked.push(url),
    },
    document,
    window,
  });
  return { PhotoSlider: window.PhotoSlider, revoked };
}

function createViewer() {
  return {
    root: {
      hidden: true,
      addEventListener: () => {},
    },
    image: {
      src: '',
      alt: '',
      style: {},
      addEventListener: () => {},
    },
    status: { hidden: true, textContent: '' },
  };
}

function createSlides(count) {
  return Array.from({ length: count }, (_, index) => {
    const image = {
      dataset: { sliderPhotoId: `photo-${index}` },
      hasAttribute: () => false,
    };
    return {
      index,
      offsetLeft: index * 100,
      querySelector: () => image,
    };
  });
}

test('visible slider loads first, then photos two and three, then the remainder', async () => {
  const { PhotoSlider } = createRuntime();
  const slider = new PhotoSlider({
    loadPreview: async () => new Blob(['preview']),
    loadOriginal: async () => new Blob(['original']),
    viewer: createViewer(),
  });
  const slides = createSlides(6);
  const waits = slides.map(() => deferred());
  const started = [];
  slider.loadSlide = (slide) => {
    started.push(slide.index);
    return waits[slide.index].promise;
  };
  const sliderElement = {
    dataset: {},
    querySelectorAll: (selector) => (selector === '[data-photo-slide]' ? slides : []),
  };

  slider.startSlider(sliderElement);
  assert.deepEqual(started, [0]);

  waits[0].resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(started, [0, 1, 2]);

  waits[1].resolve(true);
  waits[2].resolve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
});

test('far slider stays on placeholders until the visibility observer starts it', () => {
  const { PhotoSlider } = createRuntime();
  const slider = new PhotoSlider({
    loadPreview: async () => new Blob(['preview']),
    loadOriginal: async () => new Blob(['original']),
    viewer: createViewer(),
  });
  slider.maxConcurrentLoads = 0;
  const slides = createSlides(4);
  const carousel = {
    scrollLeft: 0,
    addEventListener: () => {},
    querySelectorAll: (selector) =>
      selector === '[data-photo-slide]' ? slides : selector === '[data-slider-photo-id][src]' ? [] : [],
  };
  const sliderElement = {
    dataset: {},
    querySelector: () => carousel,
    querySelectorAll: (selector) =>
      selector === '[data-photo-slide]' ? slides : selector === '[data-photo-dot]' ? [] : [],
  };
  const root = {
    querySelectorAll: () => [sliderElement],
  };

  slider.mount(root);

  assert.equal(slider.loadQueue.length, 0);
  assert.equal(slider.visibilityObserver.options.rootMargin, '600px 0px');
  slider.visibilityObserver.callback([{ target: sliderElement, isIntersecting: true }]);
  assert.equal(slider.loadQueue.length, 1);
  assert.equal(slider.loadQueue[0].slide.index, 0);
});

test('horizontal movement promotes the current and next slide to high priority', () => {
  const { PhotoSlider } = createRuntime();
  const slider = new PhotoSlider({
    loadPreview: async () => new Blob(['preview']),
    loadOriginal: async () => new Blob(['original']),
    viewer: createViewer(),
  });
  slider.maxConcurrentLoads = 0;
  const slides = createSlides(5);
  const carousel = {
    scrollLeft: 205,
    querySelectorAll: (selector) => (selector === '[data-photo-slide]' ? slides : []),
  };
  const sliderElement = {
    dataset: { photoLoadStarted: 'true', photoScrollLeft: '100' },
    querySelector: (selector) => (selector === '[data-photo-carousel]' ? carousel : null),
    querySelectorAll: (selector) =>
      selector === '[data-photo-slide]' ? slides : selector === '[data-photo-dot]' ? [] : [],
  };

  slider.updateIndicator(sliderElement);

  assert.equal(slider.loadJobs.get(slides[2]).rank, 0);
  assert.equal(slider.loadJobs.get(slides[3]).rank, 0);
});

test('fullscreen shows preview immediately, replaces it with cached original and revokes on destroy', async () => {
  const { PhotoSlider, revoked } = createRuntime();
  const viewer = createViewer();
  viewer.root.hidden = false;
  let originalRequests = 0;
  const slider = new PhotoSlider({
    loadPreview: async () => new Blob(['preview']),
    loadOriginal: async () => {
      originalRequests += 1;
      return new Blob(['original']);
    },
    viewer,
  });
  const image = {
    src: 'blob:preview',
    alt: 'Фото',
    dataset: { sliderPhotoId: 'artifact-1' },
  };
  slider.viewerImages = [image];
  slider.viewerIndex = 0;

  slider.renderViewer();
  assert.equal(viewer.image.src, 'blob:preview');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(viewer.image.src, 'blob:photo-1');

  slider.renderViewer();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(originalRequests, 1);

  slider.destroy();
  assert.deepEqual(revoked, ['blob:photo-1']);
});

test('a Safari-like preview image error falls back to original without marking the slide broken', async () => {
  const { PhotoSlider, revoked } = createRuntime();
  let assigned = 0;
  const listeners = { load: new Set(), error: new Set() };
  const carousel = { clientWidth: 400 };
  const brokenClasses = new Set();
  const slide = {
    classList: { add: (name) => brokenClasses.add(name) },
    closest: () => carousel,
    getBoundingClientRect: () => ({ height: 240 }),
    querySelector: () => image,
    style: {},
  };
  const image = {
    alt: 'Фото',
    dataset: { sliderPhotoId: 'artifact-1' },
    naturalWidth: 1200,
    naturalHeight: 800,
    addEventListener: (name, listener) => listeners[name].add(listener),
    removeEventListener: (name, listener) => listeners[name].delete(listener),
    hasAttribute: (name) => name === 'src' && Boolean(image.src),
    closest: () => slide,
    set src(value) {
      this.value = value;
      assigned += 1;
      const eventName = assigned === 1 ? 'error' : 'load';
      Promise.resolve().then(() => {
        for (const listener of [...listeners[eventName]]) listener();
      });
    },
    get src() {
      return this.value;
    },
  };
  const slider = new PhotoSlider({
    loadPreview: async () => new Blob(['preview']),
    loadOriginal: async () => new Blob(['original']),
    viewer: createViewer(),
  });

  assert.equal(await slider.loadSlide(slide), true);
  assert.equal(assigned, 2);
  assert.equal(image.src, 'blob:photo-2');
  assert.equal(brokenClasses.has('is-broken'), false);

  slider.destroy();
  assert.deepEqual(revoked, ['blob:photo-1', 'blob:photo-2']);
});
