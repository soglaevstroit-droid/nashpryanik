import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { AppConfigService } from '../config/app-config.service.js';
import { EventService } from '../events/event.service.js';
import { ArtifactRecord } from './artifact-record.js';
import { ArtifactRepository } from './artifact.repository.js';
import { ArtifactStorageService } from './artifact-storage.service.js';
import { ArtifactService } from './artifact.service.js';
import { UploadedArtifactFile } from './uploaded-artifact-file.js';

const createdAt = new Date('2026-07-09T00:00:00.000Z');
const user: AuthUser = {
  id: 'worker-1',
  email: 'worker@example.com',
  role: 'WORKER',
};

function createFile(overrides: Partial<UploadedArtifactFile> = {}): UploadedArtifactFile {
  const buffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00,
    0x10, 0x00, 0x20, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11,
    0x00, 0xff, 0xd9,
  ]);

  return {
    buffer,
    originalname: 'progress.jpg',
    mimetype: 'image/jpeg',
    size: buffer.length,
    ...overrides,
  };
}

function createArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: 'artifact-1',
    type: 'PHOTO',
    eventId: 'event-1',
    taskId: 'task-1',
    taskStepId: 'step-1',
    uploadedBy: user.id,
    storageKey: 'photos/worker-1/2026-07-09/photo.jpg',
    originalFileName: 'progress.jpg',
    mimeType: 'image/jpeg',
    fileSize: 11,
    createdAt,
    ...overrides,
  };
}

function createRepository(seed: ArtifactRecord[] = []): ArtifactRepository {
  const artifacts = [...seed];

  const repository: Pick<
    ArtifactRepository,
    'create' | 'findById' | 'findManyByEventId' | 'delete'
  > = {
    create: async (data) => {
      const artifact = createArtifact({
        id: `artifact-${artifacts.length + 1}`,
        eventId: data.eventId,
        taskId: data.taskId ?? null,
        taskStepId: data.taskStepId ?? null,
        uploadedBy: data.uploadedBy,
        storageKey: data.storageKey,
        originalFileName: data.originalFileName,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
      });

      artifacts.unshift(artifact);

      return artifact;
    },
    findById: async (id: string) => artifacts.find((artifact) => artifact.id === id) ?? null,
    findManyByEventId: async (eventId: string) =>
      artifacts.filter((artifact) => artifact.eventId === eventId),
    delete: async (id: string) => {
      const index = artifacts.findIndex((artifact) => artifact.id === id);
      const artifact = artifacts[index];

      if (!artifact) {
        throw new Error('Artifact not found');
      }

      artifacts.splice(index, 1);

      return artifact;
    },
  };

  return repository as ArtifactRepository;
}

function createEventService(eventTypes: string[]): EventService {
  return {
    createEvent: async (dto) => {
      eventTypes.push(dto.type);

      return {
        id: `event-${eventTypes.length}`,
        type: dto.type,
        actorId: dto.actorId ?? null,
        entityType: dto.entityType ?? null,
        entityId: dto.entityId ?? null,
        payload: dto.payload,
        metadata: dto.metadata ?? null,
        createdAt,
      };
    },
  } as EventService;
}

function createStorage(storageEvents: string[]): ArtifactStorageService {
  return {
    generatePhotoStorageKey: (userId: string, fileName: string) =>
      `photos/${userId}/2026-07-09/${fileName}`,
    uploadPhoto: async (storageKey: string) => {
      storageEvents.push(`upload:${storageKey}`);
    },
    getObject: async (storageKey: string) => {
      storageEvents.push(`get:${storageKey}`);

      return Readable.from(['photo-bytes']);
    },
    deleteObject: async (storageKey: string) => {
      storageEvents.push(`delete:${storageKey}`);
    },
  } as unknown as ArtifactStorageService;
}

test('uploads photo, stores object, creates PHOTO_UPLOADED event and artifact', async () => {
  const eventTypes: string[] = [];
  const storageEvents: string[] = [];
  const service = new ArtifactService(
    createRepository(),
    createStorage(storageEvents),
    createEventService(eventTypes),
  );

  const artifact = await service.uploadPhoto(
    user,
    {
      taskId: 'task-1',
      taskStepId: 'step-1',
    },
    createFile(),
  );

  assert.equal(artifact.type, 'PHOTO');
  assert.equal(artifact.eventId, 'event-1');
  assert.equal(artifact.taskId, 'task-1');
  assert.equal(artifact.taskStepId, 'step-1');
  assert.deepEqual(eventTypes, ['PHOTO_UPLOADED']);
  assert.deepEqual(storageEvents, ['upload:photos/worker-1/2026-07-09/progress.jpg']);
});

test('gets photo download stream', async () => {
  const storageEvents: string[] = [];
  const service = new ArtifactService(
    createRepository([createArtifact()]),
    createStorage(storageEvents),
    createEventService([]),
  );

  const download = await service.getPhoto('artifact-1');

  assert.equal(download.artifact.id, 'artifact-1');
  assert.deepEqual(storageEvents, ['get:photos/worker-1/2026-07-09/photo.jpg']);
});

test('lists photos by event', async () => {
  const service = new ArtifactService(
    createRepository([createArtifact({ id: 'artifact-1' }), createArtifact({ id: 'artifact-2' })]),
    createStorage([]),
    createEventService([]),
  );

  const artifacts = await service.listPhotos('event-1');

  assert.equal(artifacts.length, 2);
});

test('deletes photo from storage and database', async () => {
  const storageEvents: string[] = [];
  const service = new ArtifactService(
    createRepository([createArtifact()]),
    createStorage(storageEvents),
    createEventService([]),
  );

  const artifact = await service.deletePhoto('artifact-1');

  assert.equal(artifact.id, 'artifact-1');
  assert.deepEqual(storageEvents, ['delete:photos/worker-1/2026-07-09/photo.jpg']);
});

test('rejects unsupported image content', async () => {
  const service = new ArtifactService(
    createRepository(),
    createStorage([]),
    createEventService([]),
  );

  await assert.rejects(
    () =>
      service.uploadPhoto(
        user,
        {},
        createFile({
          buffer: Buffer.from('not-image'),
          size: 9,
        }),
      ),
    BadRequestException,
  );
});

test('generates MinIO photo storage key', () => {
  const storage = new ArtifactStorageService(createConfigService());
  const storageKey = storage.generatePhotoStorageKey(user.id, 'progress.JPG');

  assert.match(storageKey, /^photos\/worker-1\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/);
});

function createConfigService(): AppConfigService {
  return {
    minio: {
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'stroit_minio',
      secretKey: 'stroit_minio_password',
      bucket: 'stroit-dev',
    },
  } as AppConfigService;
}
