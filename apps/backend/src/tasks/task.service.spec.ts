import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { ProcessRecord } from '../processes/process-record.js';
import { ProcessService } from '../processes/process.service.js';
import { TaskRecord } from './task-record.js';
import { TaskRepository } from './task.repository.js';
import { TaskService } from './task.service.js';

const createdAt = new Date('2026-07-08T00:00:00.000Z');
const manager: AuthUser = {
  id: 'manager-1',
  email: 'foreman@example.com',
  role: 'FOREMAN',
};
const worker: AuthUser = {
  id: 'worker-1',
  email: 'worker@example.com',
  role: 'WORKER',
};

function createTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    title: 'Install formwork',
    description: null,
    status: 'CREATED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 1,
    creatorId: manager.id,
    assigneeId: null,
    processId: 'process-1',
    startedAt: null,
    completedAt: null,
    completedWorkShiftId: null,
    deletedAt: null,
    deletedByUserId: null,
    deletionReason: null,
    creationOperationId: null,
    isWorkBlocked: false,
    workBlockedAt: null,
    workBlockedByUserId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createRepository(seed: TaskRecord[] = []): TaskRepository {
  const tasks = [...seed];

  const repository: Pick<
    TaskRepository,
    'create' | 'findById' | 'findMany' | 'findManyByAssigneeId' | 'update'
  > = {
    create: async (data) => {
      const task = createTask({
        id: `task-${tasks.length + 1}`,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        creatorId: data.creatorId,
        processId: data.processId,
      });

      tasks.unshift(task);

      return task;
    },
    findById: async (id: string) => tasks.find((task) => task.id === id) ?? null,
    findMany: async () => tasks,
    findManyByAssigneeId: async (assigneeId: string) =>
      tasks.filter((task) => task.assigneeId === assigneeId),
    update: async (id: string, data) => {
      const index = tasks.findIndex((task) => task.id === id);
      const current = tasks[index];

      if (!current) {
        throw new Error('Task not found');
      }

      const updated = {
        ...current,
        ...data,
        updatedAt: createdAt,
      };

      tasks[index] = updated;

      return updated;
    },
  };

  return repository as TaskRepository;
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
    cancelProcess: async (id: string) => {
      processEvents.push('cancel');

      return createProcess({
        id,
        status: 'CANCELLED',
        startedAt: createdAt,
        finishedAt: createdAt,
      });
    },
  } as unknown as ProcessService;
}

function createProcess(overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  return {
    id: 'process-1',
    type: 'TASK',
    status: 'CREATED',
    title: 'Install formwork',
    description: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

test('creates task with process and event', async () => {
  const eventTypes: string[] = [];
  const processEvents: string[] = [];
  const service = new TaskService(
    createRepository(),
    createEventService(eventTypes),
    createProcessService(processEvents),
  );

  const task = await service.createTask(manager, {
    title: 'Install formwork',
    priority: 'HIGH',
    objectId: 'object-1',
  });

  assert.equal(task.status, 'CREATED');
  assert.equal(task.priority, 'HIGH');
  assert.equal(task.creatorId, manager.id);
  assert.equal(task.processId, 'process-1');
  assert.deepEqual(eventTypes, ['TASK_CREATED']);
  assert.deepEqual(processEvents, ['create', 'start']);
});

test('assigns task', async () => {
  const eventTypes: string[] = [];
  const service = new TaskService(
    createRepository([createTask()]),
    createEventService(eventTypes),
    createProcessService([]),
  );

  const task = await service.assignTask(manager, 'task-1', { assigneeId: worker.id });

  assert.equal(task.status, 'ASSIGNED');
  assert.equal(task.assigneeId, worker.id);
  assert.deepEqual(eventTypes, ['TASK_ASSIGNED']);
});

test('accepts assigned task and starts it without creating ACCEPTED', async () => {
  const eventTypes: string[] = [];
  const service = new TaskService(
    createRepository([createTask({ status: 'ASSIGNED', assigneeId: worker.id })]),
    createEventService(eventTypes),
    createProcessService([]),
  );

  const task = await service.acceptTask(worker, 'task-1');

  assert.equal(task.status, 'IN_PROGRESS');
  assert.ok(task.startedAt);
  assert.deepEqual(eventTypes, ['TASK_STARTED']);
});

test('starts accepted task', async () => {
  const eventTypes: string[] = [];
  const service = new TaskService(
    createRepository([createTask({ status: 'ACCEPTED', assigneeId: worker.id })]),
    createEventService(eventTypes),
    createProcessService([]),
  );

  const task = await service.startTask(worker, 'task-1');

  assert.equal(task.status, 'IN_PROGRESS');
  assert.deepEqual(eventTypes, ['TASK_STARTED']);
});

test('sends task to review', async () => {
  const eventTypes: string[] = [];
  const service = new TaskService(
    createRepository([createTask({ status: 'IN_PROGRESS', assigneeId: worker.id })]),
    createEventService(eventTypes),
    createProcessService([]),
  );

  const task = await service.sendToReview(worker, 'task-1');

  assert.equal(task.status, 'ON_REVIEW');
  assert.deepEqual(eventTypes, ['TASK_SENT_TO_REVIEW']);
});

test('completes task and process', async () => {
  const eventTypes: string[] = [];
  const processEvents: string[] = [];
  const service = new TaskService(
    createRepository([createTask({ status: 'ON_REVIEW', assigneeId: worker.id })]),
    createEventService(eventTypes),
    createProcessService(processEvents),
  );

  const task = await service.completeTask(worker, 'task-1');

  assert.equal(task.status, 'COMPLETED');
  assert.ok(task.completedAt);
  assert.deepEqual(eventTypes, ['TASK_COMPLETED']);
  assert.deepEqual(processEvents, ['complete']);
});

test('cancels task and process', async () => {
  const eventTypes: string[] = [];
  const processEvents: string[] = [];
  const service = new TaskService(
    createRepository([createTask({ status: 'ASSIGNED', assigneeId: worker.id })]),
    createEventService(eventTypes),
    createProcessService(processEvents),
  );

  const task = await service.cancelTask(manager, 'task-1');

  assert.equal(task.status, 'CANCELLED');
  assert.deepEqual(eventTypes, ['TASK_CANCELLED']);
  assert.deepEqual(processEvents, ['cancel']);
});

test('gets task by id', async () => {
  const service = new TaskService(
    createRepository([createTask()]),
    createEventService([]),
    createProcessService([]),
  );

  const task = await service.getTask('task-1');

  assert.equal(task.id, 'task-1');
});

test('lists tasks', async () => {
  const service = new TaskService(
    createRepository([createTask({ id: 'task-1' }), createTask({ id: 'task-2' })]),
    createEventService([]),
    createProcessService([]),
  );

  const tasks = await service.listTasks();

  assert.equal(tasks.length, 2);
});

test('lists only current worker tasks', async () => {
  const service = new TaskService(
    createRepository([
      createTask({ id: 'task-1', assigneeId: worker.id }),
      createTask({ id: 'task-2', assigneeId: 'worker-2' }),
      createTask({ id: 'task-3', assigneeId: worker.id }),
    ]),
    createEventService([]),
    createProcessService([]),
  );

  const tasks = await service.listMyTasks(worker);

  assert.deepEqual(
    tasks.map((task) => task.id),
    ['task-1', 'task-3'],
  );
});

test('rejects unknown transition', async () => {
  const service = new TaskService(
    createRepository([createTask({ status: 'CREATED' })]),
    createEventService([]),
    createProcessService([]),
  );

  await assert.rejects(() => service.startTask(worker, 'task-1'), BadRequestException);
});

test('rejects worker action on another worker task', async () => {
  const service = new TaskService(
    createRepository([createTask({ status: 'ASSIGNED', assigneeId: 'worker-2' })]),
    createEventService([]),
    createProcessService([]),
  );

  await assert.rejects(() => service.acceptTask(worker, 'task-1'), ConflictException);
});

test('worker task actions require an active shift before reading the task', async () => {
  let taskRead = false;
  const repository = createRepository([createTask({ status: 'ASSIGNED', assigneeId: worker.id })]);
  const originalFindById = repository.findById.bind(repository);
  repository.findById = async (...args) => {
    taskRead = true;
    return originalFindById(...args);
  };
  const service = new TaskService(
    repository,
    createEventService([]),
    createProcessService([]),
    undefined,
    {
      assertActiveShift: async () => {
        throw new Error('ACTIVE_SHIFT_REQUIRED');
      },
    } as never,
  );

  await assert.rejects(service.acceptTask(worker, 'task-1'), /ACTIVE_SHIFT_REQUIRED/);
  assert.equal(taskRead, false);
});

test('confirmed task completion is transactional and idempotent', async () => {
  let task = createTask({
    status: 'IN_PROGRESS',
    assigneeId: worker.id,
    startedAt: new Date(Date.now() - 15 * 60_000),
  });
  let completionEvent: { idempotencyKey?: string } | null = null;
  const completionMetadata: Record<string, unknown>[] = [];
  let processStatus = 'ACTIVE';
  const client = {
    event: { findUnique: async () => completionEvent, findMany: async () => [] },
    task: {
      findFirst: async () => task,
      update: async ({ data }: { data: Partial<TaskRecord> }) => (
        (task = { ...task, ...data }),
        task
      ),
    },
    taskStep: {
      count: async ({ where }: { where: { status?: unknown } }) => (where.status ? 0 : 1),
    },
    workShift: { findFirst: async () => ({ id: 'shift-1' }) },
    process: {
      update: async ({ data }: { data: { status: string } }) => ((processStatus = data.status), {}),
    },
  };
  const database = {
    event: { findUnique: async () => completionEvent },
    task: { findFirst: async () => task },
    user: { findUnique: async () => ({ name: 'Илья Н.' }) },
    constructionObject: { findUnique: async () => ({ name: 'Пряник' }) },
    $transaction: async (action: (value: typeof client) => unknown) => action(client),
  };
  const eventTypes: string[] = [];
  const events = {
    createEvent: async (dto: {
      type: string;
      idempotencyKey?: string;
      metadata?: Record<string, unknown>;
    }) => {
      eventTypes.push(dto.type);
      completionEvent = { idempotencyKey: dto.idempotencyKey };
      if (dto.metadata) completionMetadata.push(dto.metadata);
      return { id: 'event-complete' };
    },
  };
  const service = new TaskService(
    createRepository([task]),
    events as never,
    createProcessService([]),
    database as never,
    { assertActiveShift: async () => undefined } as never,
  );
  await service.completeTask(worker, task.id, 'task-operation-1');
  await service.completeTask(worker, task.id, 'task-operation-1');
  assert.equal(task.status, 'COMPLETED');
  assert.equal(task.completedWorkShiftId, 'shift-1');
  assert.equal(processStatus, 'COMPLETED');
  assert.deepEqual(eventTypes, ['TASK_COMPLETED']);
  assert.equal(completionMetadata[0]?.costStatus, 'CALCULATED');
  assert.equal(completionMetadata[0]?.appliedRate, 756);
  assert.equal(typeof completionMetadata[0]?.taskCostCoins, 'number');
});

test('a shared task is atomically claimed by only one worker and starts immediately', async () => {
  const task = {
    ...createTask({ status: 'ASSIGNED', assigneeId: null }),
    object: { name: 'Пряник' },
    steps: [],
  };
  let claimedBy: string | null = null;
  const eventTypes: string[] = [];
  const client = {
    task: {
      findFirst: async ({ where }: { where: { id?: string } }) =>
        where.id ? task : claimedBy ? { id: task.id } : null,
      count: async () => 0,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string };
        data: { assigneeId?: string };
      }) => {
        if (!where.id) return { count: 0 };
        if (claimedBy) return { count: 0 };
        claimedBy = data.assigneeId ?? null;
        return { count: 1 };
      },
      findUnique: async () => ({
        ...task,
        assigneeId: claimedBy,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      }),
    },
    taskStep: { update: async () => ({}) },
  };
  const database = {
    $transaction: async (action: (value: typeof client) => unknown) => action(client),
  };
  const events = {
    createEvent: async ({ type }: { type: string }) => {
      eventTypes.push(type);
      return { id: `event-${eventTypes.length}` };
    },
  };
  const service = new TaskService(
    createRepository([task]),
    events as never,
    createProcessService([]),
    database as never,
    { assertActiveShift: async () => undefined } as never,
  );
  const worker2 = { ...worker, id: 'worker-2' };
  const results = await Promise.allSettled([
    service.acceptTask(worker, task.id),
    service.acceptTask(worker2, task.id),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.ok(['worker-1', 'worker-2'].includes(claimedBy ?? ''));
  assert.deepEqual(eventTypes, ['TASK_STARTED']);
});

test('worker with another active task cannot accept an assigned or shared task', async () => {
  const task = {
    ...createTask({ status: 'ASSIGNED', assigneeId: null }),
    object: null,
    steps: [],
  };
  const client = {
    task: {
      findFirst: async ({ where }: { where: { id?: string } }) =>
        where.id ? task : { id: 'another-task' },
    },
  };
  const service = new TaskService(
    createRepository([task]),
    createEventService([]),
    createProcessService([]),
    {
      $transaction: async (action: (value: typeof client) => unknown) => action(client),
    } as never,
    { assertActiveShift: async () => undefined } as never,
  );

  await assert.rejects(service.acceptTask(worker, task.id), /ANOTHER_TASK_IS_ACTIVE/);
});

test('simple task completion stores the final photo before linking completion to the shift', async () => {
  const task = {
    ...createTask({ status: 'IN_PROGRESS', assigneeId: worker.id }),
    startedAt: new Date('2026-07-20T10:00:00Z'),
    object: { name: 'Пряник' },
    steps: [],
  };
  const writes: string[] = [];
  const client = {
    event: { findUnique: async () => null, findMany: async () => [] },
    task: {
      findFirst: async () => task,
      updateMany: async ({ data }: { data: Partial<TaskRecord> }) => {
        writes.push('completed');
        Object.assign(task, data);
        return { count: 1 };
      },
      findUnique: async () => task,
    },
    workShift: { findFirst: async () => ({ id: 'shift-1' }) },
    artifact: { count: async () => 1 },
    process: { update: async () => (writes.push('process'), {}) },
  };
  const database = {
    event: { findUnique: async () => null },
    $transaction: async (action: (value: typeof client) => unknown) => action(client),
  };
  const artifacts = {
    preparePhotoObject: () => ({ storageKey: 'original.jpg', preview: null }),
    storePreparedPhoto: async () => writes.push('stored'),
    createPhotoArtifactRecord: async () => (writes.push('artifact'), { id: 'completion-photo' }),
    deleteStoredPhoto: async () => writes.push('deleted'),
  };
  const events = {
    createEvent: async ({ type }: { type: string }) => (
      writes.push(type),
      { id: 'completion-event' }
    ),
  };
  const service = new TaskService(
    createRepository([task]),
    events as never,
    createProcessService([]),
    database as never,
    { assertActiveShift: async () => undefined } as never,
    artifacts as never,
  );
  const result = await service.completeSimpleTaskWithPhoto(
    worker,
    task.id,
    'complete-1',
    {} as never,
  );

  assert.equal(result.task.status, 'COMPLETED');
  assert.equal(result.task.completedWorkShiftId, 'shift-1');
  assert.equal(result.artifact.id, 'completion-photo');
  assert.deepEqual(writes, ['stored', 'artifact', 'completed', 'process', 'TASK_COMPLETED']);
});

test('failed final photo storage leaves a simple task IN_PROGRESS', async () => {
  const task = {
    ...createTask({ status: 'IN_PROGRESS', assigneeId: worker.id }),
    startedAt: new Date('2026-07-20T10:00:00Z'),
    object: null,
    steps: [],
  };
  let completed = false;
  const client = {
    event: { findUnique: async () => null },
    task: {
      findFirst: async () => task,
      updateMany: async () => ((completed = true), { count: 1 }),
    },
    workShift: { findFirst: async () => ({ id: 'shift-1' }) },
    artifact: { count: async () => 1 },
  };
  const service = new TaskService(
    createRepository([task]),
    createEventService([]),
    createProcessService([]),
    {
      event: { findUnique: async () => null },
      $transaction: async (action: (value: typeof client) => unknown) => action(client),
    } as never,
    { assertActiveShift: async () => undefined } as never,
    {
      preparePhotoObject: () => ({ storageKey: 'original.jpg', preview: null }),
      storePreparedPhoto: async () => {
        throw new Error('storage failed');
      },
      deleteStoredPhoto: async () => undefined,
    } as never,
  );

  await assert.rejects(
    service.completeSimpleTaskWithPhoto(worker, task.id, 'complete-2', {} as never),
    /storage failed/,
  );
  assert.equal(completed, false);
  assert.equal(task.status, 'IN_PROGRESS');
});

test('simple task completion rejects an initial manager photo without worker progress photo', async () => {
  const startedAt = new Date('2026-07-20T10:00:00Z');
  const task = {
    ...createTask({ status: 'IN_PROGRESS', assigneeId: worker.id }),
    startedAt,
    object: null,
    steps: [],
  };
  let progressWhere: unknown;
  let stored = false;
  const client = {
    event: { findUnique: async () => null },
    task: { findFirst: async () => task },
    workShift: { findFirst: async () => ({ id: 'shift-1' }) },
    artifact: {
      count: async ({ where }: { where: unknown }) => ((progressWhere = where), 0),
    },
  };
  const service = new TaskService(
    createRepository([task]),
    createEventService([]),
    createProcessService([]),
    {
      event: { findUnique: async () => null },
      $transaction: async (action: (value: typeof client) => unknown) => action(client),
    } as never,
    { assertActiveShift: async () => undefined } as never,
    {
      preparePhotoObject: () => ({ storageKey: 'final.jpg', preview: null }),
      storePreparedPhoto: async () => {
        stored = true;
      },
      deleteStoredPhoto: async () => undefined,
    } as never,
  );

  await assert.rejects(
    service.completeSimpleTaskWithPhoto(worker, task.id, 'complete-without-progress', {} as never),
    /Сначала добавьте фотографию выполненной работы/,
  );
  assert.deepEqual(progressWhere, {
    taskId: task.id,
    taskStepId: null,
    type: 'PHOTO',
    uploadedBy: worker.id,
    createdAt: { gte: startedAt },
  });
  assert.equal(stored, false);
  assert.equal(task.status, 'IN_PROGRESS');
});

test('repeating simple completion with the same operation returns the original result', async () => {
  const task = {
    ...createTask({ status: 'COMPLETED', assigneeId: worker.id }),
    completedWorkShiftId: 'shift-1',
  };
  let prepared = false;
  const database = {
    event: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        where.idempotencyKey.startsWith('task:complete-with-photo:')
          ? { id: 'completion-event' }
          : { id: 'photo-event' },
    },
    task: { findFirst: async () => task },
    artifact: {
      findFirst: async () => ({ id: 'completion-photo', taskId: task.id, eventId: 'photo-event' }),
    },
  };
  const service = new TaskService(
    createRepository([task]),
    createEventService([]),
    createProcessService([]),
    database as never,
    { assertActiveShift: async () => undefined } as never,
    {
      preparePhotoObject: () => {
        prepared = true;
        throw new Error('must not prepare a duplicate photo');
      },
    } as never,
  );

  const result = await service.completeSimpleTaskWithPhoto(
    worker,
    task.id,
    'complete-repeat',
    {} as never,
  );

  assert.equal(result.task.status, 'COMPLETED');
  assert.equal(result.artifact.id, 'completion-photo');
  assert.equal(prepared, false);
});
