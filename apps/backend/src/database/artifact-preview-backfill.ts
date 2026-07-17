import { PrismaClient } from '@prisma/client';
import { Readable } from 'node:stream';
import { ArtifactStorageService } from '../artifacts/artifact-storage.service.js';
import { PhotoPreviewService } from '../artifacts/photo-preview.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { loadAppConfig } from '../config/app-config.js';
import {
  assertPreviewBackfillExecution,
  parsePreviewBackfillOptions,
} from './artifact-preview-backfill.definition.js';

const config = loadAppConfig();
const options = parsePreviewBackfillOptions(process.argv.slice(2));
assertPreviewBackfillExecution({
  environment: config.environment,
  databaseUrl: config.databaseUrl,
  minioHost: config.minio.endPoint,
  productionApproved: options.productionApproved,
});

const database = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
const storage = new ArtifactStorageService(new AppConfigService());
const previews = new PhotoPreviewService();
const results = { created: 0, skipped: 0, failed: 0 };

try {
  const [total, existing, candidateOriginalSize] = await Promise.all([
    database.artifact.count(),
    database.artifact.count({ where: { previewStorageKey: { not: null } } }),
    database.artifact.aggregate({
      where: { previewStorageKey: null },
      _sum: { fileSize: true },
    }),
  ]);
  const candidates = total - existing;

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          total,
          candidates,
          candidateOriginalBytes: candidateOriginalSize._sum.fileSize ?? 0,
          expectedPreviews: candidates,
          created: 0,
          skipped: existing,
          failed: 0,
          batchSize: options.batchSize,
          concurrency: options.concurrency,
        },
        null,
        2,
      ),
    );
  } else {
    let cursor: string | undefined;
    while (true) {
      const artifacts = await database.artifact.findMany({
        where: {
          previewStorageKey: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: options.batchSize,
      });
      if (!artifacts.length) break;
      cursor = artifacts.at(-1)!.id;
      for (let index = 0; index < artifacts.length; index += options.concurrency) {
        const group = artifacts.slice(index, index + options.concurrency);
        await Promise.all(
          group.map(async (artifact) => {
            try {
              const original = await streamToBuffer(await storage.getObject(artifact.storageKey));
              const generated = await previews.generate({
                buffer: original,
                size: original.length,
                mimetype: artifact.mimeType,
                originalname: artifact.originalFileName,
              });
              if (!generated) {
                results.skipped += 1;
                return;
              }
              const previewStorageKey = storage.generatePreviewStorageKey(artifact.storageKey);
              await storage.uploadPhoto(previewStorageKey, {
                buffer: generated.buffer,
                size: generated.buffer.length,
                mimetype: generated.mimeType,
                originalname: `preview.${generated.extension}`,
              });
              await database.artifact.update({
                where: { id: artifact.id },
                data: {
                  previewStorageKey,
                  previewMimeType: generated.mimeType,
                  previewFileSize: generated.buffer.length,
                },
              });
              results.created += 1;
            } catch (error) {
              results.failed += 1;
              console.warn('Artifact preview backfill item failed', {
                artifactId: artifact.id,
                error: error instanceof Error ? error.name : 'UnknownError',
              });
            }
          }),
        );
      }
    }

    results.skipped += existing;
    console.log(
      JSON.stringify(
        {
          mode: 'apply',
          ...results,
          batchSize: options.batchSize,
          concurrency: options.concurrency,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await database.$disconnect();
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
