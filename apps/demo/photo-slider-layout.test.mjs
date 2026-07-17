import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const sliderSource = await readFile(new URL('./public/photo-slider.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');

function getPhotoSlider() {
  const window = {};
  vm.runInNewContext(sliderSource, {
    Image: class {},
    IntersectionObserver: class {},
    ResizeObserver: class {},
    URL,
    document: { body: { classList: {} }, querySelectorAll: () => [] },
    window,
  });
  return window.PhotoSlider;
}

test('one photo renders the single mode without dots', () => {
  const PhotoSlider = getPhotoSlider();
  const html = PhotoSlider.render([{ id: 'one', originalFileName: 'one.jpg' }], {
    id: 'gallery-one',
  });

  assert.match(html, /class="photoSlider is-single"/);
  assert.doesNotMatch(html, /photoDots|data-photo-dot/);
  assert.equal((html.match(/data-photo-slide(?=[ >])/g) ?? []).length, 1);
});

test('two and three photos retain the multiple mode, dots and all slides', () => {
  const PhotoSlider = getPhotoSlider();
  for (const count of [2, 3]) {
    const photos = Array.from({ length: count }, (_, index) => ({ id: `photo-${index}` }));
    const html = PhotoSlider.render(photos, { id: `gallery-${count}` });

    assert.match(html, /class="photoSlider is-multiple"/);
    assert.equal((html.match(/data-photo-slide(?=[ >])/g) ?? []).length, count);
    assert.equal((html.match(/data-photo-dot=/g) ?? []).length, count);
  }
});

test('single mode fills the slider at fixed height and cannot scroll horizontally', () => {
  assert.match(
    styles,
    /\.photoSlider\.is-single \.photoCarousel[\s\S]*?width:\s*100%[\s\S]*?overflow-x:\s*hidden[\s\S]*?scroll-snap-type:\s*none[\s\S]*?touch-action:\s*pan-y pinch-zoom/,
  );
  assert.match(
    styles,
    /\.photoSlider\.is-single \.photoSlide[\s\S]*?flex-basis:\s*100%[\s\S]*?width:\s*100%/,
  );
  assert.match(
    styles,
    /\.photoSlider\.is-single \.photoSlide img[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%[\s\S]*?object-fit:\s*cover[\s\S]*?object-position:\s*center/,
  );
  assert.match(styles, /\.photoSlide \{[\s\S]*?height:\s*var\(--photo-slide-height\)/);
  assert.match(sliderSource, /classList\?\.contains\('is-single'\)[\s\S]*?style\.width = '100%'/);
});

test('multiple mode keeps the approved peek, snap and placeholder geometry', () => {
  assert.match(styles, /\.photoSlide \{[\s\S]*?width:\s*88%/);
  assert.match(styles, /\.photoCarousel \{[\s\S]*?gap:\s*12px[\s\S]*?scroll-snap-type:\s*x mandatory/);
  assert.match(styles, /\.photoLoadingPlaceholder \{[\s\S]*?inset:\s*0/);
  assert.match(styles, /\.photoSlide \{[\s\S]*?overflow:\s*hidden/);
});

test('closed lock stays centered and fullscreen remains contain', () => {
  assert.match(
    styles,
    /\.photoLockOverlay[\s\S]*?top:\s*50%[\s\S]*?left:\s*50%[\s\S]*?transform:\s*translate\(-50%, -50%\)/,
  );
  assert.match(styles, /\[data-photo-locked='true'\] \.photoSlide img[\s\S]*?grayscale\(100%\)/);
  assert.match(styles, /\.photoViewer img[\s\S]*?object-fit:\s*contain/);
});

test('layout change does not alter Preview, Original or scheduler wiring', () => {
  assert.match(app, /loadPreview:[\s\S]*?artifacts\/\$\{id\}\/preview/);
  assert.match(app, /loadOriginal:[\s\S]*?artifacts\/\$\{id\}`/);
  assert.match(sliderSource, /this\.enqueue\(slides\[0\], 'high'\)/);
  assert.match(sliderSource, /this\.enqueue\(slides\[1\], 'normal'\)/);
  assert.match(sliderSource, /this\.enqueue\(slides\[2\], 'normal'\)/);
  assert.match(sliderSource, /loadViewerOriginal\(image\)/);
});
