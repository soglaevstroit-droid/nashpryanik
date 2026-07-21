import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { AppConfigService } from '../config/app-config.service.js';
import { EventService } from '../events/event.service.js';
import { ArtifactRecord } from './artifact-record.js';
import { ArtifactRepository } from './artifact.repository.js';
import { ArtifactStorageService } from './artifact-storage.service.js';
import { ArtifactService } from './artifact.service.js';
import { UploadedArtifactFile } from './uploaded-artifact-file.js';
import { DatabaseService } from '../database/database.service.js';
import { PhotoPreviewService } from './photo-preview.service.js';

const createdAt = new Date('2026-07-09T00:00:00.000Z');
const user: AuthUser = {
  id: 'worker-1',
  email: 'worker@example.com',
  role: 'WORKER',
};

function createFile(overrides: Partial<UploadedArtifactFile> = {}): UploadedArtifactFile {
  const buffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
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
    previewStorageKey: null,
    originalFileName: 'progress.jpg',
    mimeType: 'image/jpeg',
    previewMimeType: null,
    fileSize: 11,
    previewFileSize: null,
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
        id: data.id ?? `artifact-${artifacts.length + 1}`,
        eventId: data.eventId,
        taskId: data.taskId ?? null,
        taskStepId: data.taskStepId ?? null,
        uploadedBy: data.uploadedBy,
        storageKey: data.storageKey,
        previewStorageKey: data.previewStorageKey ?? null,
        originalFileName: data.originalFileName,
        mimeType: data.mimeType,
        previewMimeType: data.previewMimeType ?? null,
        fileSize: data.fileSize,
        previewFileSize: data.previewFileSize ?? null,
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

function createEventService(
  eventTypes: string[],
  createdEvents: Array<Parameters<EventService['createEvent']>[0]> = [],
): EventService {
  return {
    createEvent: async (dto) => {
      eventTypes.push(dto.type);
      createdEvents.push(dto);

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
    generatePreviewStorageKey: (storageKey: string) => `${storageKey}.preview.jpg`,
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

function createAccessDatabase(assigneeByTask: Record<string, string>): DatabaseService {
  return {
    task: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const assigneeId = assigneeByTask[where.id];
        return assigneeId ? { assigneeId } : null;
      },
    },
  } as unknown as DatabaseService;
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

test('photo comment is normalized and atomically linked to the created artifact event', async () => {
  const eventTypes: string[] = [];
  const createdEvents: Array<Parameters<EventService['createEvent']>[0]> = [];
  const service = new ArtifactService(
    createRepository(),
    createStorage([]),
    createEventService(eventTypes, createdEvents),
  );

  const artifact = await service.uploadPhoto(
    user,
    {
      taskId: 'task-1',
      operationId: 'commented-photo',
      comment: '  Кабель уложен ✨\r\nДо коробки  ',
    },
    createFile(),
  );

  assert.equal(createdEvents[0]?.entityId, artifact.id);
  assert.deepEqual(createdEvents[0]?.payload, {
    artifactId: artifact.id,
    artifactType: 'PHOTO',
    taskId: 'task-1',
    taskStepId: null,
    workerId: user.id,
    originalFileName: 'progress.jpg',
    mimeType: 'image/jpeg',
    fileSize: createFile().size,
    storageKey: 'photos/worker-1/2026-07-09/progress.jpg',
  });
  assert.deepEqual(createdEvents[0]?.metadata, {
    source: 'artifact-foundation',
    comment: 'Кабель уложен ✨\nДо коробки',
  });
});

test('missing and whitespace-only photo comments are stored as null', async () => {
  const createdEvents: Array<Parameters<EventService['createEvent']>[0]> = [];
  const service = new ArtifactService(
    createRepository(),
    createStorage([]),
    createEventService([], createdEvents),
  );

  await service.uploadPhoto(user, { taskId: 'task-1' }, createFile());
  await service.uploadPhoto(user, { taskId: 'task-1', comment: ' \n ' }, createFile());

  assert.deepEqual(
    createdEvents.map((event) => (event.metadata as { comment: string | null }).comment),
    [null, null],
  );
});

test('separate photos preserve separate comments in upload order', async () => {
  const createdEvents: Array<Parameters<EventService['createEvent']>[0]> = [];
  const service = new ArtifactService(
    createRepository(),
    createStorage([]),
    createEventService([], createdEvents),
  );

  await service.uploadPhoto(user, { taskId: 'task-1', comment: 'Первый кадр' }, createFile());
  await service.uploadPhoto(user, { taskId: 'task-1', comment: 'Второй кадр' }, createFile());

  assert.deepEqual(
    createdEvents.map((event) => (event.metadata as { comment: string }).comment),
    ['Первый кадр', 'Второй кадр'],
  );
  assert.notEqual(createdEvents[0]?.entityId, createdEvents[1]?.entityId);
});

test('photo comment over 200 Unicode characters is rejected before storage', async () => {
  const storageEvents: string[] = [];
  const service = new ArtifactService(
    createRepository(),
    createStorage(storageEvents),
    createEventService([]),
  );

  await assert.rejects(
    service.uploadPhoto(user, { taskId: 'task-1', comment: '🙂'.repeat(201) }, createFile()),
    BadRequestException,
  );
  assert.deepEqual(storageEvents, []);
});

test('failed photo storage creates no event or standalone comment', async () => {
  const eventTypes: string[] = [];
  const storage = createStorage([]);
  storage.uploadPhoto = async () => {
    throw new Error('Storage unavailable');
  };
  const service = new ArtifactService(createRepository(), storage, createEventService(eventTypes));

  await assert.rejects(
    service.uploadPhoto(user, { taskId: 'task-1', comment: 'Не потерять' }, createFile()),
  );
  assert.deepEqual(eventTypes, []);
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
  assert.equal(download.mimeType, 'image/jpeg');
  assert.deepEqual(storageEvents, ['get:photos/worker-1/2026-07-09/photo.jpg']);
});

test('preview endpoint returns preview when available and original for legacy artifacts', async () => {
  const storageEvents: string[] = [];
  const service = new ArtifactService(
    createRepository([
      createArtifact({
        id: 'preview-artifact',
        previewStorageKey: 'photos/worker-1/2026-07-09/photo.preview.jpg',
        previewMimeType: 'image/jpeg',
        previewFileSize: 5,
      }),
      createArtifact({ id: 'legacy-artifact' }),
    ]),
    createStorage(storageEvents),
    createEventService([]),
  );

  const preview = await service.getPhotoPreview(
    { id: 'foreman-1', email: 'manager', role: 'FOREMAN' },
    'preview-artifact',
  );
  const fallback = await service.getPhotoPreview(user, 'legacy-artifact');

  assert.equal(preview.mimeType, 'image/jpeg');
  assert.equal(fallback.mimeType, 'image/jpeg');
  assert.deepEqual(storageEvents, [
    'get:photos/worker-1/2026-07-09/photo.preview.jpg',
    'get:photos/worker-1/2026-07-09/photo.jpg',
  ]);
});

test('preview endpoint safely falls back when preview metadata exists but the object is missing', async () => {
  const storageEvents: string[] = [];
  const storage = createStorage(storageEvents);
  const originalGetObject = storage.getObject.bind(storage);
  storage.getObject = async (storageKey: string) => {
    if (storageKey.endsWith('.preview.jpg')) {
      storageEvents.push(`get:${storageKey}`);
      throw new Error('missing preview');
    }
    return originalGetObject(storageKey);
  };
  const service = new ArtifactService(
    createRepository([
      createArtifact({
        previewStorageKey: 'photos/worker-1/2026-07-09/photo.preview.jpg',
        previewMimeType: 'image/jpeg',
        previewFileSize: 5,
      }),
    ]),
    storage,
    createEventService([]),
  );

  const fallback = await service.getPhotoPreview(user, 'artifact-1');

  assert.equal(fallback.mimeType, 'image/jpeg');
  assert.deepEqual(storageEvents, [
    'get:photos/worker-1/2026-07-09/photo.preview.jpg',
    'get:photos/worker-1/2026-07-09/photo.jpg',
  ]);
});

test('preview endpoint applies the same worker access rules as original', async () => {
  const service = new ArtifactService(
    createRepository([
      createArtifact({
        uploadedBy: 'worker-2',
        previewStorageKey: 'photos/worker-2/photo.preview.jpg',
        previewMimeType: 'image/jpeg',
        previewFileSize: 5,
      }),
    ]),
    createStorage([]),
    createEventService([]),
    createAccessDatabase({ 'task-1': 'worker-2' }),
  );

  await assert.rejects(() => service.getPhotoPreview(user, 'artifact-1'), NotFoundException);
});

test('preview failure does not fail original upload or populate preview fields', async () => {
  const storageEvents: string[] = [];
  const previews = {
    generate: async () => {
      throw new Error('preview failed');
    },
  } as unknown as PhotoPreviewService;
  const service = new ArtifactService(
    createRepository(),
    createStorage(storageEvents),
    createEventService([]),
    undefined,
    undefined,
    previews,
  );

  const artifact = await service.uploadPhoto(user, {}, createFile());

  assert.equal(artifact.previewStorageKey, null);
  assert.equal(artifact.previewMimeType, null);
  assert.equal(artifact.previewFileSize, null);
  assert.deepEqual(storageEvents, ['upload:photos/worker-1/2026-07-09/progress.jpg']);
});

test('successful preview upload records independent storage metadata', async () => {
  const storageEvents: string[] = [];
  const previews = {
    generate: async () => ({
      buffer: Buffer.from('preview'),
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: 16,
      height: 8,
    }),
  } as unknown as PhotoPreviewService;
  const service = new ArtifactService(
    createRepository(),
    createStorage(storageEvents),
    createEventService([]),
    undefined,
    undefined,
    previews,
  );

  const artifact = await service.uploadPhoto(user, {}, createFile());

  assert.equal(artifact.previewStorageKey, 'photos/worker-1/2026-07-09/progress.jpg.preview.jpg');
  assert.equal(artifact.previewFileSize, 7);
  assert.deepEqual(storageEvents, [
    'upload:photos/worker-1/2026-07-09/progress.jpg',
    'upload:photos/worker-1/2026-07-09/progress.jpg.preview.jpg',
  ]);
});

test('worker can read a cloned task photo assigned to that worker', async () => {
  const storageEvents: string[] = [];
  const service = new ArtifactService(
    createRepository([createArtifact({ uploadedBy: 'foreman-1' })]),
    createStorage(storageEvents),
    createEventService([]),
    createAccessDatabase({ 'task-1': user.id }),
  );

  const download = await service.getPhoto(user, 'artifact-1');

  assert.equal(download.artifact.taskId, 'task-1');
  assert.deepEqual(storageEvents, ['get:photos/worker-1/2026-07-09/photo.jpg']);
});

test('worker can read manager reference photos of an open shared task', async () => {
  const storageEvents: string[] = [];
  const database = {
    task: {
      findUnique: async () => ({
        assigneeId: null,
        status: 'ASSIGNED',
        accessStatus: 'OPEN',
        deletedAt: null,
      }),
    },
  };
  const service = new ArtifactService(
    createRepository([createArtifact({ uploadedBy: 'foreman-1' })]),
    createStorage(storageEvents),
    createEventService([]),
    database as never,
  );

  await service.getPhotoPreview(user, 'artifact-1');
  assert.deepEqual(storageEvents, ['get:photos/worker-1/2026-07-09/photo.jpg']);
});

test('simple active task accepts task-level worker photos without a synthetic step', async () => {
  const storageEvents: string[] = [];
  const database = {
    task: {
      findFirst: async () => ({
        id: 'task-1',
        assigneeId: user.id,
        status: 'IN_PROGRESS',
        accessStatus: 'OPEN',
        isWorkBlocked: false,
        steps: [],
      }),
    },
    $transaction: async (action: (client: object) => unknown) => action({}),
  };
  const service = new ArtifactService(
    createRepository(),
    createStorage(storageEvents),
    createEventService([]),
    database as never,
    { assertActiveShift: async () => undefined } as never,
  );

  const artifact = await service.uploadPhoto(user, { taskId: 'task-1' }, createFile());
  assert.equal(artifact.taskId, 'task-1');
  assert.equal(artifact.taskStepId, null);
  assert.equal(storageEvents.length, 1);
});

test('worker cannot read an unrelated worker photo', async () => {
  const service = new ArtifactService(
    createRepository([createArtifact({ uploadedBy: 'worker-2' })]),
    createStorage([]),
    createEventService([]),
    createAccessDatabase({ 'task-1': 'worker-2' }),
  );

  await assert.rejects(() => service.getPhoto(user, 'artifact-1'), NotFoundException);
});

test('foreman can read a worker task photo', async () => {
  const storageEvents: string[] = [];
  const service = new ArtifactService(
    createRepository([createArtifact({ uploadedBy: user.id })]),
    createStorage(storageEvents),
    createEventService([]),
    createAccessDatabase({ 'task-1': user.id }),
  );

  await service.getPhoto({ id: 'foreman-1', email: 'work2', role: 'FOREMAN' }, 'artifact-1');

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

test('worker task photo requires an active shift before storing a file', async () => {
  const storageEvents: string[] = [];
  const service = new ArtifactService(
    createRepository(),
    createStorage(storageEvents),
    createEventService([]),
    undefined,
    {
      assertActiveShift: async () => {
        throw new Error('ACTIVE_SHIFT_REQUIRED');
      },
    } as never,
  );

  await assert.rejects(
    service.uploadPhoto(user, { taskId: 'task-1' }, createFile()),
    /ACTIVE_SHIFT_REQUIRED/,
  );
  assert.deepEqual(storageEvents, []);
});

test('repeated photo operation returns existing artifact without storing a duplicate', async () => {
  const storageEvents: string[] = [];
  const existing = createArtifact();
  const database = {
    taskStep: {
      findUnique: async () => ({
        id: 'step-1',
        taskId: 'task-1',
        status: 'IN_PROGRESS',
        task: {
          id: 'task-1',
          assigneeId: user.id,
          deletedAt: null,
          status: 'IN_PROGRESS',
          isWorkBlocked: false,
          steps: [{ id: 'step-1', status: 'IN_PROGRESS' }],
        },
      }),
    },
    event: { findUnique: async () => ({ id: existing.eventId }) },
    artifact: { findFirst: async () => existing },
  };
  const service = new ArtifactService(
    createRepository([existing]),
    createStorage(storageEvents),
    createEventService([]),
    database as never,
    { assertActiveShift: async () => undefined } as never,
  );
  const result = await service.uploadPhoto(
    user,
    {
      taskId: 'task-1',
      taskStepId: 'step-1',
      operationId: 'same-photo',
      comment: 'Повтор не должен изменить исходный комментарий',
    },
    createFile(),
  );
  assert.equal(result.id, existing.id);
  assert.deepEqual(storageEvents, []);
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
