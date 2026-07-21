import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { rolesMetadataKey } from '../auth/decorators/roles.decorator.js';
import { AnalystController } from './analyst.controller.js';
import { AnalystService } from './analyst.service.js';

const start = new Date('2026-07-21T08:00:00.000Z');
const finish = new Date('2026-07-21T12:00:00.000Z');
const worker = { id: 'worker-1', email: 'work', name: 'Илья Н.' };
const restingWorker = { id: 'worker-2', email: 'work2', name: 'Антон К.' };

function artifact(id: string, createdAt: Date, purpose?: string) {
  return {
    id,
    type: 'PHOTO',
    eventId: `photo-event-${id}`,
    taskId: 'task-1',
    taskStepId: null,
    workShiftId: null,
    uploadedBy: worker.id,
    storageKey: `${id}.jpg`,
    previewStorageKey: `${id}.preview.jpg`,
    originalFileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    previewMimeType: 'image/jpeg',
    fileSize: 100,
    previewFileSize: 50,
    createdAt,
    event: { payload: purpose ? { purpose } : {}, metadata: {} },
  };
}

function event(
  id: string,
  type: string,
  createdAt: Date,
  options: {
    artifacts?: ReturnType<typeof artifact>[];
    reason?: string;
    workShiftId?: string;
  } = {},
) {
  return {
    id,
    type,
    actorId: worker.id,
    entityType: 'task',
    entityId: 'task-1',
    objectId: null,
    taskId: type.startsWith('WORK_SHIFT') ? null : 'task-1',
    taskStepId: null,
    workShiftId: options.workShiftId ?? null,
    idempotencyKey: null,
    payload: options.reason ? { reason: options.reason } : {},
    metadata: options.reason ? { reason: options.reason } : {},
    createdAt,
    artifacts: options.artifacts ?? [],
  };
}

function shift(status: 'ACTIVE' | 'FINISHED' = 'ACTIVE') {
  return {
    id: 'shift-1',
    userId: worker.id,
    processId: 'process-1',
    status,
    startedAt: start,
    finishedAt: status === 'FINISHED' ? finish : null,
    createdAt: start,
    updatedAt: finish,
    photos: [],
    accrual:
      status === 'FINISHED'
        ? {
            status: 'APPROVED',
            standardCoinUnits: 1_200,
            calculatedStandardCoinUnits: 1_200,
            calculatedOvertimeCoinUnits: 80,
            analystFinalOvertimeUnits: 60,
          }
        : null,
    completedTasks: status === 'FINISHED' ? [{ id: 'task-1' }] : [],
  };
}

function fixture(options: { shiftStatus?: 'ACTIVE' | 'FINISHED'; paused?: boolean } = {}) {
  const progress = artifact('progress', new Date('2026-07-21T09:30:00.000Z'));
  const final = artifact('final', finish, 'TASK_COMPLETION');
  const timeline = [
    event('shift-start', 'WORK_SHIFT_STARTED', start, { workShiftId: 'shift-1' }),
    event('task-start', 'TASK_STARTED', new Date('2026-07-21T09:00:00.000Z')),
    event('photo', 'PHOTO_UPLOADED', progress.createdAt, { artifacts: [progress] }),
    event('pause', 'TASK_PAUSED', new Date('2026-07-21T10:00:00.000Z'), {
      reason: 'Жду материал',
    }),
    event('resume', 'TASK_RESUMED', new Date('2026-07-21T10:30:00.000Z'), {
      reason: 'Материал привезли',
    }),
    {
      ...event('complete', 'TASK_COMPLETED', finish, { workShiftId: 'shift-1' }),
      payload: { artifactId: final.id },
    },
  ];
  const tasks = [
    {
      id: 'task-1',
      title: 'Монтаж СКС',
      assigneeId: worker.id,
      startedAt: new Date('2026-07-21T09:00:00.000Z'),
      completedAt: finish,
      deletedAt: null,
    },
  ];
  const database = {
    user: {
      findMany: async () => [worker, restingWorker],
      findFirst: async () => worker,
    },
    workShift: {
      findMany: async () => [shift(options.shiftStatus)],
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'shift-1' ? shift(options.shiftStatus ?? 'FINISHED') : null,
    },
    task: {
      findMany: async (query: { where: { status?: { in?: string[] } } }) =>
        query.where.status?.in?.includes('IN_PROGRESS')
          ? options.shiftStatus === 'FINISHED'
            ? []
            : [
                {
                  id: 'task-1',
                  title: 'Монтаж СКС',
                  assigneeId: worker.id,
                  status: options.paused ? 'PAUSED' : 'IN_PROGRESS',
                  isWorkBlocked: false,
                },
              ]
          : tasks,
    },
    event: {
      findMany: async (query: { where: { type: { in: string[] } } }) =>
        query.where.type.in.includes('PHOTO_UPLOADED')
          ? timeline
          : timeline.filter((item) => item.taskId),
    },
    artifact: { findMany: async () => [progress, final] },
  };
  return new AnalystService(database as never);
}

test('analyst endpoints are protected by the ANALYST backend role', () => {
  assert.deepEqual(Reflect.getMetadata(rolesMetadataKey, AnalystController), ['ANALYST']);
});

test('live response includes every active worker and resting worker has no slider', async () => {
  const result = await fixture().getLiveWorkers(new Date('2026-07-21T12:00:00.000Z'));
  assert.equal(result.length, 2);
  assert.equal(result[0].worker.id, worker.id);
  assert.equal(result[0].status, 'WORKING');
  assert.equal(result[1].status, 'RESTING');
  assert.equal(result[1].activeShift, null);
  assert.deepEqual(result[1].timeline, []);
});

test('timeline is chronological and each process photo is a separate frame', async () => {
  const [entry] = await fixture().getLiveWorkers(new Date('2026-07-21T12:00:00.000Z'));
  assert.deepEqual(
    entry.timeline.map((frame) => frame.kind),
    [
      'WORK_SHIFT_STARTED',
      'TASK_STARTED',
      'TASK_PHOTO_ADDED',
      'TASK_PAUSED',
      'TASK_RESUMED',
      'TASK_COMPLETED',
    ],
  );
  assert.equal(entry.timeline[2].artifact?.id, 'progress');
  assert.equal(new Set(entry.timeline.map((frame) => frame.id)).size, entry.timeline.length);
});

test('pause and resume reasons remain attached to their own frames', async () => {
  const [entry] = await fixture({ paused: true }).getLiveWorkers(
    new Date('2026-07-21T12:00:00.000Z'),
  );
  assert.equal(entry.status, 'WAITING_FOR_RESPONSE');
  assert.equal(
    entry.timeline.find((frame) => frame.kind === 'TASK_PAUSED')?.reason,
    'Жду материал',
  );
  assert.equal(
    entry.timeline.find((frame) => frame.kind === 'TASK_RESUMED')?.reason,
    'Материал привезли',
  );
});

test('task duration is calculated on backend with paused interval excluded', async () => {
  const [entry] = await fixture().getLiveWorkers(new Date('2026-07-21T12:00:00.000Z'));
  const completed = entry.timeline.find((frame) => frame.kind === 'TASK_COMPLETED');
  assert.equal(completed?.taskDurationMinutes, 150);
  assert.equal(completed?.artifact?.id, 'final');
});

test('task coins stay pending because the existing accrual is shift-scoped', async () => {
  const [entry] = await fixture().getLiveWorkers(new Date('2026-07-21T12:00:00.000Z'));
  const completed = entry.timeline.find((frame) => frame.kind === 'TASK_COMPLETED');
  assert.equal(completed?.taskCoins, null);
  assert.equal(completed?.taskCoinsState, 'PENDING');
});

test('finished shift history uses actual accrual and completed-task count', async () => {
  const [entry] = await fixture({ shiftStatus: 'FINISHED' }).getShiftHistory();
  assert.equal(entry.coinUnits, 1_260);
  assert.equal(entry.coinState, 'APPROVED');
  assert.equal(entry.completedTaskCount, 1);
  assert.equal(entry.durationMinutes, 240);
});

test('shift detail is immutable read-only chronology and unknown shift returns 404', async () => {
  const service = fixture({ shiftStatus: 'FINISHED' });
  const detail = await service.getShift('shift-1');
  assert.equal(detail.worker.id, worker.id);
  assert.ok(detail.timeline.length > 0);
  await assert.rejects(service.getShift('missing'), NotFoundException);
});

test('live endpoint query count stays constant as worker count grows', async () => {
  const calls = { users: 0, shifts: 0, tasks: 0, events: 0 };
  const workers = Array.from({ length: 50 }, (_, index) => ({
    id: `worker-${index}`,
    email: `work-${index}`,
    name: `Worker ${index}`,
  }));
  const database = {
    user: { findMany: async () => (calls.users++, workers) },
    workShift: { findMany: async () => (calls.shifts++, []) },
    task: { findMany: async () => (calls.tasks++, []) },
    event: { findMany: async () => (calls.events++, []) },
  };
  const result = await new AnalystService(database as never).getLiveWorkers(finish);
  assert.equal(result.length, 50);
  assert.deepEqual(calls, { users: 1, shifts: 1, tasks: 1, events: 0 });
});
