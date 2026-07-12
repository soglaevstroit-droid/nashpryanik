import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProcessStatus } from '@prisma/client';
import { ArtifactRecord } from '../artifacts/artifact-record.js';
import { ArtifactService, UploadedPhotoObject } from '../artifacts/artifact.service.js';
import { UploadedArtifactFile } from '../artifacts/uploaded-artifact-file.js';
import { AuthUser } from '../auth/auth-user.js';
import { DatabaseService } from '../database/database.service.js';
import { EventService } from '../events/event.service.js';
import { ProcessRecord } from '../processes/process-record.js';
import { ProcessRepository } from '../processes/process.repository.js';
import { ProcessService } from '../processes/process.service.js';
import { WorkShiftPhotoRecord } from './work-shift-photo-record.js';
import { WorkShiftPhotoBundle, WorkShiftPhotoRepository } from './work-shift-photo.repository.js';
import { WorkShiftRecord } from './work-shift-record.js';
import { WorkShiftRepository } from './work-shift.repository.js';
import { WorkShiftService } from './work-shift.service.js';

const createdAt = new Date('2026-07-08T00:00:00.000Z');
const capturedAt = '2026-07-11T08:00:00.000Z';
const operationId = '11111111-1111-4111-8111-111111111111';
const user: AuthUser = {
  id: 'user-1',
  email: 'worker@example.com',
  role: 'WORKER',
};

function createShift(overrides: Partial<WorkShiftRecord> = {}): WorkShiftRecord {
  return {
    id: 'shift-1',
    userId: user.id,
    processId: 'process-1',
    status: 'ACTIVE',
    startedAt: createdAt,
    finishedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createPhoto(overrides: Partial<WorkShiftPhotoRecord> = {}): WorkShiftPhotoRecord {
  return {
    id: 'photo-1',
    workShiftId: 'shift-1',
    artifactId: 'artifact-1',
    type: 'START',
    capturedAt: new Date(capturedAt),
    receivedAt: createdAt,
    source: 'DIRECT_CAMERA_CAPTURE',
    timezone: 'Europe/Moscow',
    width: 32,
    height: 16,
    operationId,
    createdAt,
    ...overrides,
  };
}

function createArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: 'artifact-1',
    type: 'PHOTO',
    eventId: 'event-1',
    taskId: null,
    taskStepId: null,
    uploadedBy: user.id,
    storageKey: 'photos/user-1/photo.jpg',
    originalFileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: jpegFile().size,
    createdAt,
    ...overrides,
  };
}

function jpegFile(overrides: Partial<UploadedArtifactFile> = {}): UploadedArtifactFile {
  return {
    buffer: Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]),
    originalname: 'photo.jpg',
    mimetype: 'application/octet-stream',
    size: 27,
    ...overrides,
  };
}

function createRepository(seed: WorkShiftRecord[] = []): WorkShiftRepository {
  const shifts = [...seed];

  const repository: Pick<
    WorkShiftRepository,
    'create' | 'findActiveByUserId' | 'findById' | 'finish' | 'findManyByUserId'
  > = {
    create: async (data) => {
      const shift = createShift({
        id: data.id ?? `shift-${shifts.length + 1}`,
        userId: data.userId,
        processId: data.processId,
        startedAt: data.startedAt,
      });

      shifts.unshift(shift);

      return shift;
    },
    findActiveByUserId: async (userId: string) =>
      shifts.find((shift) => shift.userId === userId && shift.status === 'ACTIVE') ?? null,
    findById: async (id: string) => shifts.find((shift) => shift.id === id) ?? null,
    finish: async (id: string, finishedAt: Date) => {
      const index = shifts.findIndex((shift) => shift.id === id);
      const current = shifts[index];

      if (!current) {
        throw new Error('Shift not found');
      }

      const updated = {
        ...current,
        status: 'FINISHED' as const,
        finishedAt,
      };

      shifts[index] = updated;

      return updated;
    },
    findManyByUserId: async (userId: string) => shifts.filter((shift) => shift.userId === userId),
  };

  return repository as WorkShiftRepository;
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

function createProcessService(processEvents: string[]): ProcessService {
  return {
    createProcess: async () => {
      processEvents.push('create');

      return createProcess({
        id: 'process-1',
        status: 'CREATED',
      });
    },
    startProcess: async (id: string) => {
      processEvents.push('start');

      return createProcess({
        id,
        status: 'ACTIVE',
        startedAt: createdAt,
      });
    },
    completeProcess: async (id: string) => {
      processEvents.push('complete');

      return createProcess({
        id,
        status: 'COMPLETED',
        startedAt: createdAt,
        finishedAt: createdAt,
      });
    },
  } as unknown as ProcessService;
}

function createProcessRepository(processEvents: string[]): ProcessRepository {
  return {
    create: async () => {
      processEvents.push('create-direct');

      return createProcess({ id: 'process-1', status: 'CREATED' });
    },
    updateStatus: async (
      id: string,
      status: ProcessStatus,
      dates: { startedAt?: Date; finishedAt?: Date } = {},
    ) => {
      processEvents.push(`update:${status}`);

      return createProcess({
        id,
        status,
        startedAt: dates.startedAt ?? null,
        finishedAt: dates.finishedAt ?? null,
      });
    },
  } as unknown as ProcessRepository;
}

function createProcess(overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  return {
    id: 'process-1',
    type: 'WORK_SHIFT',
    status: 'CREATED',
    title: 'Work shift',
    description: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createDatabase(): DatabaseService {
  return {
    $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback({}),
  } as DatabaseService;
}

function createArtifacts(events: string[]): ArtifactService {
  return {
    preparePhotoObject: (_user: AuthUser, file: UploadedArtifactFile): UploadedPhotoObject => ({
      storageKey: 'photos/user-1/photo.jpg',
      file: {
        ...file,
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      },
      inspection: {
        mimeType: 'image/jpeg',
        width: 32,
        height: 16,
        fileSize: file.size,
        extension: 'jpg',
      },
    }),
    createPhotoArtifactRecord: async (
      _user: AuthUser,
      _dto: unknown,
      uploaded: UploadedPhotoObject,
      _client: unknown,
      options?: { artifactId?: string },
    ) => {
      events.push('PHOTO_UPLOADED');

      return createArtifact({
        id: options?.artifactId ?? 'artifact-1',
        storageKey: uploaded.storageKey,
        mimeType: uploaded.file.mimetype,
        fileSize: uploaded.file.size,
      });
    },
    storePreparedPhoto: async () => {
      events.push('store');
    },
    deleteStoredPhoto: async () => {
      events.push('delete');
    },
  } as unknown as ArtifactService;
}

function createShiftPhotos(seed: WorkShiftPhotoBundle[] = []): WorkShiftPhotoRepository {
  const bundles = [...seed];

  return {
    create: async (data) => {
      const photo = createPhoto({
        id: data.id ?? `photo-${bundles.length + 1}`,
        workShiftId: data.workShiftId,
        artifactId: data.artifactId,
        type: data.type,
        capturedAt: data.capturedAt,
        source: data.source,
        timezone: data.timezone,
        width: data.width,
        height: data.height,
        operationId: data.operationId,
      });

      bundles.unshift({
        shift: createShift({ id: data.workShiftId }),
        photo,
        artifact: createArtifact({ id: data.artifactId }),
      });

      return photo;
    },
    findByOperationId: async (id: string) =>
      bundles.find((bundle) => bundle.photo.operationId === id) ?? null,
  } as WorkShiftPhotoRepository;
}

function createService(
  options: {
    repository?: WorkShiftRepository;
    eventTypes?: string[];
    processEvents?: string[];
    artifactEvents?: string[];
    shiftPhotos?: WorkShiftPhotoRepository;
    artifacts?: ArtifactService;
  } = {},
): WorkShiftService {
  const eventTypes = options.eventTypes ?? [];
  const processEvents = options.processEvents ?? [];
  const artifactEvents = options.artifactEvents ?? [];

  return new WorkShiftService(
    options.repository ?? createRepository(),
    createEventService(eventTypes),
    createProcessService(processEvents),
    createDatabase(),
    options.artifacts ?? createArtifacts(artifactEvents),
    createProcessRepository(processEvents),
    options.shiftPhotos ?? createShiftPhotos(),
  );
}

test('starts shift and creates event and process', async () => {
  const eventTypes: string[] = [];
  const processEvents: string[] = [];
  const service = createService({
    repository: createRepository(),
    eventTypes,
    processEvents,
  });

  const shift = await service.startShift(user);

  assert.equal(shift.status, 'ACTIVE');
  assert.equal(shift.userId, user.id);
  assert.equal(shift.processId, 'process-1');
  assert.deepEqual(eventTypes, ['WORK_SHIFT_STARTED']);
  assert.deepEqual(processEvents, ['create', 'start']);
});

test('does not open second active shift', async () => {
  const service = createService({
    repository: createRepository([createShift()]),
  });

  await assert.rejects(() => service.startShift(user), BadRequestException);
});

test('finishes shift and completes process', async () => {
  const eventTypes: string[] = [];
  const processEvents: string[] = [];
  const service = createService({
    repository: createRepository([createShift()]),
    eventTypes,
    processEvents,
  });

  const shift = await service.finishShift(user);

  assert.equal(shift.status, 'FINISHED');
  assert.ok(shift.finishedAt);
  assert.deepEqual(eventTypes, ['WORK_SHIFT_FINISHED']);
  assert.deepEqual(processEvents, ['complete']);
});

test('gets current shift', async () => {
  const service = createService({
    repository: createRepository([createShift()]),
  });

  const shift = await service.getCurrentShift(user);

  assert.equal(shift?.id, 'shift-1');
});

test('returns shift history', async () => {
  const service = createService({
    repository: createRepository([createShift({ id: 'shift-1' }), createShift({ id: 'shift-2' })]),
  });

  const shifts = await service.history(user);

  assert.equal(shifts.length, 2);
});

test('starts shift with photo and creates start photo relation', async () => {
  const eventTypes: string[] = [];
  const artifactEvents: string[] = [];
  const processEvents: string[] = [];
  const service = createService({
    eventTypes,
    artifactEvents,
    processEvents,
  });

  const result = await service.startShiftWithPhoto(
    user,
    { capturedAt, timezone: 'Europe/Moscow', operationId },
    jpegFile(),
  );

  assert.equal(result.shift.status, 'ACTIVE');
  assert.equal(result.photo.type, 'START');
  assert.equal(result.photo.workShiftId, result.shift.id);
  assert.equal(result.photo.artifactId, result.artifact.id);
  assert.equal(result.photo.width, 32);
  assert.equal(result.photo.height, 16);
  assert.deepEqual(artifactEvents, ['PHOTO_UPLOADED', 'store']);
  assert.deepEqual(eventTypes, ['WORK_SHIFT_STARTED']);
  assert.deepEqual(processEvents, ['create-direct', 'update:ACTIVE']);
});

test('finishes shift with photo and creates finish photo relation', async () => {
  const eventTypes: string[] = [];
  const artifactEvents: string[] = [];
  const processEvents: string[] = [];
  const service = createService({
    repository: createRepository([createShift()]),
    eventTypes,
    artifactEvents,
    processEvents,
  });

  const result = await service.finishShiftWithPhoto(
    user,
    {
      capturedAt,
      timezone: 'Europe/Moscow',
      operationId: '22222222-2222-4222-8222-222222222222',
    },
    jpegFile(),
  );

  assert.equal(result.shift.status, 'FINISHED');
  assert.equal(result.photo.type, 'FINISH');
  assert.equal(result.photo.workShiftId, 'shift-1');
  assert.equal(result.photo.artifactId, result.artifact.id);
  assert.deepEqual(artifactEvents, ['PHOTO_UPLOADED', 'store']);
  assert.deepEqual(eventTypes, ['WORK_SHIFT_FINISHED']);
  assert.deepEqual(processEvents, ['update:COMPLETED']);
});

test('returns existing result for repeated operation id', async () => {
  const existing = {
    shift: createShift(),
    photo: createPhoto(),
    artifact: createArtifact(),
  };
  const artifactEvents: string[] = [];
  const service = createService({
    shiftPhotos: createShiftPhotos([existing]),
    artifactEvents,
  });

  const result = await service.startShiftWithPhoto(
    user,
    { capturedAt, timezone: 'Europe/Moscow', operationId },
    jpegFile(),
  );

  assert.equal(result.photo.id, 'photo-1');
  assert.deepEqual(artifactEvents, []);
});

test('rejects operation id owned by another action', async () => {
  const existing = {
    shift: createShift(),
    photo: createPhoto({ type: 'FINISH' }),
    artifact: createArtifact(),
  };
  const service = createService({
    shiftPhotos: createShiftPhotos([existing]),
  });

  await assert.rejects(
    () =>
      service.startShiftWithPhoto(
        user,
        { capturedAt, timezone: 'Europe/Moscow', operationId },
        jpegFile(),
      ),
    ConflictException,
  );
});

test('rejects opening second active shift with photo', async () => {
  const service = createService({
    repository: createRepository([createShift()]),
  });

  await assert.rejects(
    () =>
      service.startShiftWithPhoto(
        user,
        { capturedAt, timezone: 'Europe/Moscow', operationId },
        jpegFile(),
      ),
    ConflictException,
  );
});

test('rejects finishing shift with photo when no active shift exists', async () => {
  const service = createService();

  await assert.rejects(
    () =>
      service.finishShiftWithPhoto(
        user,
        { capturedAt, timezone: 'Europe/Moscow', operationId },
        jpegFile(),
      ),
    ConflictException,
  );
});

test('rejects invalid operation id', async () => {
  const service = createService();

  await assert.rejects(
    () =>
      service.startShiftWithPhoto(
        user,
        { capturedAt, timezone: 'Europe/Moscow', operationId: 'not-a-uuid' },
        jpegFile(),
      ),
    BadRequestException,
  );
});

test('rejects corrupted image file', async () => {
  const service = new WorkShiftService(
    createRepository(),
    createEventService([]),
    createProcessService([]),
    createDatabase(),
    new ArtifactService({} as never, {} as never, {} as never),
    createProcessRepository([]),
    createShiftPhotos(),
  );

  await assert.rejects(
    () =>
      service.startShiftWithPhoto(
        user,
        { capturedAt, timezone: 'Europe/Moscow', operationId },
        jpegFile({ buffer: Buffer.from('not-image'), size: 9 }),
      ),
    BadRequestException,
  );
});

test('compensates stored object when database operation fails after upload', async () => {
  const artifactEvents: string[] = [];
  const service = new WorkShiftService(
    createRepository(),
    {
      createEvent: async () => {
        throw new Error('database failed');
      },
    } as unknown as EventService,
    createProcessService([]),
    createDatabase(),
    createArtifacts(artifactEvents),
    createProcessRepository([]),
    createShiftPhotos(),
  );

  await assert.rejects(
    () =>
      service.startShiftWithPhoto(
        user,
        { capturedAt, timezone: 'Europe/Moscow', operationId },
        jpegFile(),
      ),
    /database failed/,
  );
  assert.deepEqual(artifactEvents, ['PHOTO_UPLOADED', 'store', 'delete']);
});
