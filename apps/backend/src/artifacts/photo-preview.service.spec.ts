import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import {
  PhotoPreviewService,
  previewJpegQuality,
  previewMaxSide,
} from './photo-preview.service.js';

test('preview generation preserves the original and creates a smaller proportional JPEG', async () => {
  const original = await sharp(randomBytes(2400 * 1200 * 3), {
    raw: { width: 2400, height: 1200, channels: 3 },
  })
    .jpeg({ quality: 96 })
    .toBuffer();
  const originalCopy = Buffer.from(original);
  const preview = await new PhotoPreviewService().generate({
    buffer: original,
    size: original.length,
    mimetype: 'image/jpeg',
    originalname: 'original.jpg',
  });

  assert.ok(preview);
  assert.deepEqual(original, originalCopy);
  assert.equal(preview.mimeType, 'image/jpeg');
  assert.equal(previewJpegQuality, 80);
  assert.equal(Math.max(preview.width, preview.height), previewMaxSide);
  assert.ok(Math.abs(preview.width / preview.height - 2) < 0.01);
  assert.ok(preview.buffer.length < original.length);
});
