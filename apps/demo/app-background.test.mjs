import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');
const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const server = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');
const avif = await stat(new URL('./public/assets/app-background.avif', import.meta.url));
const webp = await stat(new URL('./public/assets/app-background.webp', import.meta.url));

test('optimized fon2 assets are local, versioned, cacheable and below 100 KB', () => {
  assert.ok(avif.size > 0 && avif.size <= 100_000);
  assert.ok(webp.size > 0 && webp.size <= 100_000);
  assert.match(css, /url\('\/assets\/app-background\.avif\?v=fon2'\)/);
  assert.match(css, /url\('\/assets\/app-background\.webp\?v=fon2'\)/);
  assert.match(server, /'\.avif': 'image\/avif'/);
  assert.match(server, /'\.webp': 'image\/webp'/);
  assert.match(server, /public, max-age=86400/);
});

test('one fixed viewport layer covers the page with a graphite fallback and no repeat', () => {
  const layer = css.match(/\.appShell::before \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(css, /--app-background-fallback:\s*#0d0f12/);
  assert.match(layer, /position:\s*fixed/);
  assert.match(layer, /background-color:\s*var\(--app-background-fallback\)/);
  assert.match(layer, /background-repeat:\s*no-repeat/);
  assert.match(layer, /background-size:\s*cover/);
  assert.doesNotMatch(layer, /background-attachment/);
  assert.equal((css.match(/\.appShell::before \{/g) ?? []).length, 1);
});

test('one shared background sits behind all information cards without per-card image work', () => {
  assert.doesNotMatch(app, /app-background|backgroundImage/);
  assert.match(css, /body \{[\s\S]*?overflow-x:\s*clip/);
  assert.match(css, /--surface:\s*#ffffff/);
  assert.doesNotMatch(
    css,
    /\.(?:workerTop|analystTop|taskCard|modalCard)::before[\s\S]{0,120}app-background/,
  );
});
