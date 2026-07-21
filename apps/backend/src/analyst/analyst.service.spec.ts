import assert from 'node:assert/strict';
import test from 'node:test';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { rolesMetadataKey } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AnalystController } from './analyst.controller.js';
import { AnalystService } from './analyst.service.js';

const start = new Date('2026-07-21T08:00:00.000Z');
const finish = new Date('2026-07-21T12:00:00.000Z');
const worker = { id: 'worker-1', email: 'work', name: 'Илья Н.' };
const restingWorker = { id: 'worker-2', email: 'work2', name: 'Антон К.' };

function summaryFixture(
  options: {
    workers?: Array<{ id: string; isActive?: boolean; openingBalanceCoinUnits: number }>;
    accruals?: Array<{
      workerId: string;
      status: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';
      standardCoinUnits: number;
      calculatedOvertimeCoinUnits: number;
      analystFinalOvertimeUnits: number | null;
      overtimeDecision: 'PENDING' | 'APPROVED' | 'ADJUSTED' | 'REJECTED';
      workShift: { status: 'ACTIVE' | 'FINISHED'; finishedAt: Date | null };
    }>;
    activeShifts?: Array<{ userId: string; startedAt: Date }>;
  } = {},
) {
  const calls = { users: 0, accruals: 0, shifts: 0 };
  const workers = options.workers ?? [];
  const accruals = options.accruals ?? [];
  const activeShifts = options.activeShifts ?? [];
  const database = {
    user: {
      findMany: async () => {
        calls.users += 1;
        return workers.map((worker) => ({ ...worker, isActive: worker.isActive ?? true }));
      },
    },
    shiftAccrual: {
      findMany: async (query: { where: { status: string } }) => {
        calls.accruals += 1;
        return accruals.filter((accrual) => accrual.status === query.where.status);
      },
    },
    workShift: {
      findMany: async (query: { where: { startedAt: { lte: Date } } }) => {
        calls.shifts += 1;
        return activeShifts.filter((shift) => shift.startedAt <= query.where.startedAt.lte);
      },
    },
  };
  return { service: new AnalystService(database as never), calls };
}

function summaryAccrual(
  workerId: string,
  finishedAt: string,
  options: {
    status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';
    standard?: number;
    overtime?: number;
    finalOvertime?: number | null;
    overtimeDecision?: 'PENDING' | 'APPROVED' | 'ADJUSTED' | 'REJECTED';
  } = {},
) {
  return {
    workerId,
    status: options.status ?? ('APPROVED' as const),
    standardCoinUnits: options.standard ?? 0,
    calculatedOvertimeCoinUnits: options.overtime ?? 0,
    analystFinalOvertimeUnits: options.finalOvertime ?? null,
    overtimeDecision: options.overtimeDecision ?? ('PENDING' as const),
    workShift: { status: 'FINISHED' as const, finishedAt: new Date(finishedAt) },
  };
}

function artifact(id: string, createdAt: Date, purpose?: string, taskId = 'task-1') {
  return {
    id,
    type: 'PHOTO',
    eventId: `photo-event-${id}`,
    taskId,
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
    taskId?: string;
    metadata?: Record<string, unknown>;
  } = {},
) {
  return {
    id,
    type,
    actorId: worker.id,
    entityType: 'task',
    entityId: options.taskId ?? 'task-1',
    objectId: null,
    taskId: type.startsWith('WORK_SHIFT') ? null : (options.taskId ?? 'task-1'),
    taskStepId: null,
    workShiftId: options.workShiftId ?? null,
    idempotencyKey: null,
    payload: options.reason ? { reason: options.reason } : {},
    metadata: { ...(options.reason ? { reason: options.reason } : {}), ...options.metadata },
    createdAt,
    artifacts: options.artifacts ?? [],
  };
}

function taskCostMetadata(workMinutes: number) {
  const taskWorkSeconds = workMinutes * 60;
  const taskCostCoinUnits = taskWorkSeconds * 21;
  return {
    costStatus: 'CALCULATED',
    taskWorkSeconds,
    taskWorkMinutes: workMinutes,
    taskCostCoinUnits,
    taskCostCoins: taskCostCoinUnits / 100,
    appliedCoinUnitsPerSecond: 21,
    appliedHourlyRateCoinUnits: 75_600,
    appliedRate: 756,
  };
}

function shift(status: 'ACTIVE' | 'FINISHED' = 'ACTIVE', pendingAccrual = false) {
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
      status === 'FINISHED' && !pendingAccrual
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

function fixture(
  options: {
    shiftStatus?: 'ACTIVE' | 'FINISHED';
    paused?: boolean;
    incomplete?: boolean;
    multipleTasks?: boolean;
    legacyCost?: boolean;
    pendingAccrual?: boolean;
    progressComment?: string;
  } = {},
) {
  const progress = artifact('progress', new Date('2026-07-21T09:30:00.000Z'));
  const final = artifact('final', finish, 'TASK_COMPLETION');
  const secondProgress = artifact(
    'progress-2',
    new Date('2026-07-21T10:10:00.000Z'),
    undefined,
    'task-2',
  );
  const secondFinal = artifact(
    'final-2',
    new Date('2026-07-21T10:30:00.000Z'),
    'TASK_COMPLETION',
    'task-2',
  );
  const standardTimeline = [
    event('shift-start', 'WORK_SHIFT_STARTED', start, { workShiftId: 'shift-1' }),
    event('task-start', 'TASK_STARTED', new Date('2026-07-21T09:00:00.000Z')),
    event('photo', 'PHOTO_UPLOADED', progress.createdAt, {
      artifacts: [progress],
      metadata: options.progressComment ? { comment: options.progressComment } : undefined,
    }),
    event('pause', 'TASK_PAUSED', new Date('2026-07-21T10:00:00.000Z'), {
      reason: 'Жду материал',
    }),
    event('resume', 'TASK_RESUMED', new Date('2026-07-21T10:30:00.000Z'), {
      reason: 'Материал привезли',
    }),
    ...(options.incomplete
      ? []
      : [
          {
            ...event('complete', 'TASK_COMPLETED', finish, {
              workShiftId: 'shift-1',
              ...(options.legacyCost ? {} : { metadata: taskCostMetadata(150) }),
            }),
            payload: { artifactId: final.id },
          },
        ]),
  ];
  const multipleTimeline = [
    event('shift-start', 'WORK_SHIFT_STARTED', start, { workShiftId: 'shift-1' }),
    event('task-start', 'TASK_STARTED', new Date('2026-07-21T09:00:00.000Z')),
    event('photo', 'PHOTO_UPLOADED', new Date('2026-07-21T09:20:00.000Z'), {
      artifacts: [progress],
    }),
    event('pause', 'TASK_PAUSED', new Date('2026-07-21T09:30:00.000Z'), {
      reason: 'Жду материал',
    }),
    event('task-start-2', 'TASK_STARTED', new Date('2026-07-21T10:00:00.000Z'), {
      taskId: 'task-2',
    }),
    event('photo-2', 'PHOTO_UPLOADED', secondProgress.createdAt, {
      taskId: 'task-2',
      artifacts: [secondProgress],
    }),
    {
      ...event('complete-2', 'TASK_COMPLETED', secondFinal.createdAt, {
        taskId: 'task-2',
        metadata: taskCostMetadata(30),
      }),
      payload: { artifactId: secondFinal.id },
    },
    event('resume', 'TASK_RESUMED', new Date('2026-07-21T11:00:00.000Z'), {
      reason: 'Материал привезли',
    }),
    {
      ...event('complete', 'TASK_COMPLETED', finish, { metadata: taskCostMetadata(90) }),
      payload: { artifactId: final.id },
    },
  ];
  const timeline = options.multipleTasks ? multipleTimeline : standardTimeline;
  const tasks = [
    {
      id: 'task-1',
      title: 'Монтаж СКС',
      location: 'Этаж 3 / Пом. 311',
      object: { name: 'Пряник' },
      assigneeId: worker.id,
      startedAt: new Date('2026-07-21T09:00:00.000Z'),
      completedAt: options.incomplete ? null : finish,
      deletedAt: null,
    },
    ...(options.multipleTasks
      ? [
          {
            id: 'task-2',
            title: 'Монтаж оборудования',
            location: 'Этаж 4',
            object: { name: 'Пряник' },
            assigneeId: worker.id,
            startedAt: new Date('2026-07-21T10:00:00.000Z'),
            completedAt: secondFinal.createdAt,
            deletedAt: null,
          },
        ]
      : []),
  ];
  const database = {
    user: {
      findMany: async () => [worker, restingWorker],
      findFirst: async () => worker,
    },
    workShift: {
      findMany: async () => [shift(options.shiftStatus, options.pendingAccrual)],
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'shift-1'
          ? shift(options.shiftStatus ?? 'FINISHED', options.pendingAccrual)
          : null,
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
    artifact: {
      findMany: async () =>
        options.multipleTasks
          ? [progress, final, secondProgress, secondFinal]
          : options.incomplete
            ? [progress]
            : [progress, final],
    },
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
      'TASK_SECTION_START',
      'TASK_STARTED',
      'TASK_PHOTO_ADDED',
      'TASK_PAUSED',
      'TASK_RESUMED',
      'TASK_COMPLETED',
      'TASK_SECTION_SUMMARY',
    ],
  );
  assert.equal(entry.timeline[3].artifact?.id, 'progress');
  assert.equal(new Set(entry.timeline.map((frame) => frame.id)).size, entry.timeline.length);
});

test('analyst live and history expose the same per-artifact photo comment and legacy null', async () => {
  const commented = fixture({ progressComment: 'Кабель уложен до коробки' });
  const [live] = await commented.getLiveWorkers(new Date('2026-07-21T12:00:00.000Z'));
  const history = await commented.getShift('shift-1');
  const livePhoto = live.timeline.find((frame) => frame.kind === 'TASK_PHOTO_ADDED');
  const historyPhoto = history.timeline.find((frame) => frame.kind === 'TASK_PHOTO_ADDED');
  assert.equal(livePhoto?.artifact?.id, 'progress');
  assert.equal(livePhoto?.comment, 'Кабель уложен до коробки');
  assert.equal(historyPhoto?.comment, livePhoto?.comment);

  const [legacy] = await fixture().getLiveWorkers(new Date('2026-07-21T12:00:00.000Z'));
  assert.equal(legacy.timeline.find((frame) => frame.kind === 'TASK_PHOTO_ADDED')?.comment, null);
});

test('task section frames have stable ids, no Artifact and correct summary metrics', async () => {
  const [entry] = await fixture().getLiveWorkers(new Date('2026-07-21T12:00:00.000Z'));
  const section = entry.timeline.find((frame) => frame.kind === 'TASK_SECTION_START');
  const summary = entry.timeline.find((frame) => frame.kind === 'TASK_SECTION_SUMMARY');
  assert.equal(section?.id, 'task-section-start:task-1');
  assert.equal(section?.artifact, null);
  assert.equal(section?.metadata.responsibleName, 'Илья Н.');
  assert.equal(section?.metadata.objectName, 'Пряник');
  assert.equal(summary?.id, 'task-section-summary:task-1');
  assert.equal(summary?.artifact, null);
  assert.equal(summary?.metadata.photoCount, 2);
  assert.equal(summary?.metadata.pauseCount, 1);
  assert.equal(summary?.taskDurationMinutes, 150);
  assert.equal(summary?.taskCoins, 189_000);
  assert.equal(summary?.taskCostCoins, 1_890);
  assert.equal(summary?.appliedRate, 756);
  assert.equal(summary?.costStatus, 'CALCULATED');
  assert.equal(summary?.taskCoinsState, 'AVAILABLE');
});

test('unfinished task has a start separator but no summary', async () => {
  const [entry] = await fixture({ incomplete: true }).getLiveWorkers(
    new Date('2026-07-21T11:00:00.000Z'),
  );
  assert.equal(entry.timeline.filter((frame) => frame.kind === 'TASK_SECTION_START').length, 1);
  assert.equal(
    entry.timeline.some((frame) => frame.kind === 'TASK_SECTION_SUMMARY'),
    false,
  );
});

test('multiple tasks stay chronological and returning to a paused task gets a stable separator', async () => {
  const [entry] = await fixture({ multipleTasks: true }).getLiveWorkers(
    new Date('2026-07-21T12:00:00.000Z'),
  );
  const kinds = entry.timeline.map((frame) => frame.kind);
  assert.equal(kinds.filter((kind) => kind === 'TASK_SECTION_START').length, 2);
  assert.equal(kinds.filter((kind) => kind === 'TASK_SECTION_SUMMARY').length, 2);
  const returned = entry.timeline.find((frame) => frame.kind === 'TASK_SECTION_RETURN');
  assert.equal(returned?.id, 'task-section-return:task-1:resume');
  assert.equal(returned?.task?.id, 'task-1');
  assert.ok(
    entry.timeline.findIndex((frame) => frame.id === 'task-section-summary:task-2') <
      entry.timeline.findIndex((frame) => frame.id === returned?.id),
  );
});

test('virtual frame ids remain duplicate-free across polling and live/history share the builder', async () => {
  const service = fixture({ shiftStatus: 'FINISHED' });
  const [first] = await service.getLiveWorkers(finish);
  const [second] = await service.getLiveWorkers(finish);
  const detail = await service.getShift('shift-1');
  assert.deepEqual(
    first.timeline.map((frame) => frame.id),
    second.timeline.map((frame) => frame.id),
  );
  assert.deepEqual(
    first.timeline.map((frame) => frame.kind),
    detail.timeline.map((frame) => frame.kind),
  );
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

test('task cost comes from the immutable completion snapshot, not the shift accrual', async () => {
  const [entry] = await fixture().getLiveWorkers(new Date('2026-07-21T12:00:00.000Z'));
  const completed = entry.timeline.find((frame) => frame.kind === 'TASK_COMPLETED');
  assert.equal(completed?.taskCostCoins, 1_890);
  assert.equal(completed?.appliedRate, 756);
  assert.equal(completed?.costStatus, 'CALCULATED');
  assert.equal(completed?.taskCoinsState, 'AVAILABLE');
});

test('legacy completion without a historical tariff returns RATE_NOT_AVAILABLE, never zero', async () => {
  const [entry] = await fixture({ legacyCost: true }).getLiveWorkers(finish);
  const summary = entry.timeline.find((frame) => frame.kind === 'TASK_SECTION_SUMMARY');
  assert.equal(summary?.taskDurationMinutes, 150);
  assert.equal(summary?.taskCostCoins, null);
  assert.equal(summary?.costStatus, 'RATE_NOT_AVAILABLE');
});

test('live and history return the same snapshotted task cost', async () => {
  const service = fixture({ shiftStatus: 'FINISHED' });
  const [live] = await service.getLiveWorkers(finish);
  const detail = await service.getShift('shift-1');
  const liveSummary = live.timeline.find((frame) => frame.kind === 'TASK_SECTION_SUMMARY');
  const historySummary = detail.timeline.find((frame) => frame.kind === 'TASK_SECTION_SUMMARY');
  assert.equal(liveSummary?.taskCostCoins, historySummary?.taskCostCoins);
  assert.equal(liveSummary?.costStatus, historySummary?.costStatus);
});

test('finished shift history uses actual accrual and completed-task count', async () => {
  const [entry] = await fixture({ shiftStatus: 'FINISHED' }).getShiftHistory();
  assert.equal(entry.coinUnits, 1_260);
  assert.equal(entry.coinState, 'APPROVED');
  assert.equal(entry.completedTaskCount, 1);
  assert.equal(entry.durationMinutes, 240);
});

test('finished shift ends with a stable virtual daily summary after the short photo frame', async () => {
  const service = fixture({ shiftStatus: 'FINISHED' });
  const [entry] = await service.getLiveWorkers(finish);
  const completedIndex = entry.timeline.findIndex((frame) => frame.kind === 'SHIFT_COMPLETED');
  const summary = entry.timeline.at(-1);
  assert.ok(completedIndex >= 0);
  assert.equal(entry.timeline[completedIndex].title, 'Илья Н. завершил работу');
  assert.equal(entry.timeline[completedIndex].description, null);
  assert.deepEqual(entry.timeline[completedIndex].metadata, {});
  assert.equal(summary?.kind, 'SHIFT_SECTION_SUMMARY');
  assert.equal(summary?.id, 'shift-section-summary:shift-1');
  assert.equal(summary?.artifact, null);
  assert.equal(completedIndex + 1, entry.timeline.length - 1);
});

test('daily summary contains actual shift tasks photos pauses duration and accrual', async () => {
  const [entry] = await fixture({ shiftStatus: 'FINISHED' }).getLiveWorkers(finish);
  const summary = entry.timeline.at(-1);
  assert.equal(summary?.metadata.workerName, 'Илья Н.');
  assert.equal(summary?.metadata.shiftDurationMinutes, 240);
  assert.equal(summary?.metadata.completedTaskCount, 1);
  assert.equal(summary?.metadata.workPhotoCount, 2);
  assert.equal(summary?.metadata.pauseCount, 1);
  assert.equal(summary?.metadata.shiftCoinUnits, 1_260);
  assert.equal(summary?.metadata.shiftCoinsState, 'APPROVED');
});

test('active shift has no daily summary and pending accrual is not returned as zero', async () => {
  const [active] = await fixture().getLiveWorkers(finish);
  assert.equal(
    active.timeline.some((frame) => frame.kind === 'SHIFT_SECTION_SUMMARY'),
    false,
  );
  const [finished] = await fixture({
    shiftStatus: 'FINISHED',
    pendingAccrual: true,
  }).getLiveWorkers(finish);
  const summary = finished.timeline.at(-1);
  assert.equal(summary?.metadata.shiftCoinUnits, null);
  assert.equal(summary?.metadata.shiftCoinsState, 'PENDING');
});

test('daily summary stays duplicate-free and live/history share its final structure', async () => {
  const service = fixture({ shiftStatus: 'FINISHED' });
  const [first] = await service.getLiveWorkers(finish);
  const [second] = await service.getLiveWorkers(finish);
  const detail = await service.getShift('shift-1');
  for (const timeline of [first.timeline, second.timeline, detail.timeline]) {
    assert.equal(timeline.filter((frame) => frame.kind === 'SHIFT_SECTION_SUMMARY').length, 1);
    assert.equal(timeline.at(-1)?.id, 'shift-section-summary:shift-1');
  }
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

test('summary totals only approved historical accruals and applies finalized overtime adjustments', async () => {
  const now = new Date('2026-07-21T12:00:00.000Z');
  const { service } = summaryFixture({
    workers: [{ id: 'worker-1', openingBalanceCoinUnits: 0 }],
    accruals: [
      summaryAccrual('worker-1', '2026-07-21T10:00:00.000Z', {
        standard: 10_025,
        overtime: 500,
        finalOvertime: 250,
        overtimeDecision: 'ADJUSTED',
      }),
      summaryAccrual('worker-1', '2026-07-20T10:00:00.000Z', {
        standard: 2_000,
        overtime: 700,
        overtimeDecision: 'REJECTED',
      }),
      summaryAccrual('worker-1', '2026-07-21T11:00:00.000Z', {
        status: 'PENDING_APPROVAL',
        standard: 90_000,
      }),
      summaryAccrual('worker-1', '2026-07-21T11:30:00.000Z', {
        status: 'REJECTED',
        standard: 80_000,
      }),
    ],
  });

  const result = await service.getSummary(now);

  assert.equal(result.totalEarnedCoins, 122.75);
  assert.equal(result.earnedTodayCoins, 102.75);
});

test('summary balance is the existing opening plus approved standard balance for active workers', async () => {
  const { service } = summaryFixture({
    workers: [
      { id: 'worker-1', openingBalanceCoinUnits: 10_025 },
      { id: 'worker-2', openingBalanceCoinUnits: 5_000 },
      { id: 'inactive-worker', isActive: false, openingBalanceCoinUnits: 12_000 },
    ],
    accruals: [
      summaryAccrual('worker-1', '2026-07-21T10:00:00.000Z', { standard: 4_000 }),
      summaryAccrual('worker-2', '2026-07-20T10:00:00.000Z', { standard: 3_000 }),
      summaryAccrual('inactive-worker', '2026-07-21T09:00:00.000Z', { standard: 8_000 }),
    ],
  });

  const result = await service.getSummary(new Date('2026-07-21T12:00:00.000Z'));

  assert.equal(result.currentWorkerBalanceCoins, 220.25);
});

test('today includes approved finished shifts and live open shifts but excludes yesterday and future', async () => {
  const now = new Date('2026-07-21T12:00:00.000Z');
  const { service } = summaryFixture({
    workers: [{ id: 'worker-1', openingBalanceCoinUnits: 0 }],
    accruals: [
      summaryAccrual('worker-1', '2026-07-21T10:00:00.000Z', { standard: 4_000 }),
      summaryAccrual('worker-1', '2026-07-20T23:59:59.999Z', { standard: 8_000 }),
      summaryAccrual('worker-1', '2026-07-21T13:00:00.000Z', { standard: 16_000 }),
    ],
    activeShifts: [
      { userId: 'worker-1', startedAt: new Date('2026-07-21T11:00:00.000Z') },
      { userId: 'worker-1', startedAt: new Date('2026-07-21T13:00:00.000Z') },
    ],
  });

  const result = await service.getSummary(now);

  assert.equal(result.earnedTodayCoins, 796);
  assert.deepEqual(result.live, {
    coinUnitsPerSecond: 21,
    dailyStandardLimitCoinUnits: 700_000,
    activeShifts: [{ startedAt: new Date('2026-07-21T11:00:00.000Z') }],
  });
});

test('summary exposes all current worker shift starts for one local multi-shift projection', async () => {
  const now = new Date('2026-07-21T12:00:00.000Z');
  const { service } = summaryFixture({
    workers: [
      { id: 'worker-1', openingBalanceCoinUnits: 0 },
      { id: 'worker-2', openingBalanceCoinUnits: 0 },
    ],
    activeShifts: [
      { userId: 'worker-1', startedAt: new Date('2026-07-21T11:59:50.000Z') },
      { userId: 'worker-2', startedAt: new Date('2026-07-21T11:59:55.000Z') },
    ],
  });

  const result = await service.getSummary(now);

  assert.equal(result.earnedTodayCoins, 3.15);
  assert.deepEqual(
    result.live.activeShifts.map((shift) => shift.startedAt),
    [new Date('2026-07-21T11:59:50.000Z'), new Date('2026-07-21T11:59:55.000Z')],
  );
});

test('open shift crossing UTC midnight keeps the existing whole-shift live calculation', async () => {
  const now = new Date('2026-07-21T00:30:00.000Z');
  const { service } = summaryFixture({
    workers: [{ id: 'worker-1', openingBalanceCoinUnits: 0 }],
    activeShifts: [{ userId: 'worker-1', startedAt: new Date('2026-07-20T23:30:00.000Z') }],
  });

  const result = await service.getSummary(now);

  assert.equal(result.earnedTodayCoins, 756);
});

test('summary uses three constant-size queries and an empty database returns exact zeros', async () => {
  const { service, calls } = summaryFixture();

  const result = await service.getSummary(new Date('2026-07-21T12:00:00.000Z'));

  assert.deepEqual(result, {
    totalEarnedCoins: 0,
    currentWorkerBalanceCoins: 0,
    earnedTodayCoins: 0,
    calculatedAt: new Date('2026-07-21T12:00:00.000Z'),
    live: {
      coinUnitsPerSecond: 21,
      dailyStandardLimitCoinUnits: 700_000,
      activeShifts: [],
    },
  });
  assert.deepEqual(calls, { users: 1, accruals: 1, shifts: 1 });
});

test('analyst summary route allows ANALYST and rejects WORKER and FOREMAN with HTTP 403', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = AnalystController.prototype.summary as () => unknown;
  const createContext = (role: 'ANALYST' | 'WORKER' | 'FOREMAN') =>
    ({
      getHandler: () => handler,
      getClass: () => AnalystController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: `${role.toLowerCase()}-1`, email: role.toLowerCase(), role },
        }),
      }),
    }) as unknown as ExecutionContext;

  assert.equal(guard.canActivate(createContext('ANALYST')), true);
  for (const role of ['WORKER', 'FOREMAN'] as const) {
    assert.throws(
      () => guard.canActivate(createContext(role)),
      (error) => error instanceof ForbiddenException && error.getStatus() === 403,
    );
  }
});
