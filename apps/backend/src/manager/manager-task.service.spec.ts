import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ManagerTaskService } from './manager-task.service.js';
import { managerTaskUploadLimits } from './manager-task.controller.js';

const manager = { id: 'manager-1', email: 'manager', role: 'FOREMAN' as const };

test('manager task multipart limits fit a 100 MiB reverse proxy boundary', () => {
  assert.deepEqual(managerTaskUploadLimits, {
    files: 12,
    fileSize: 8 * 1024 * 1024,
    fields: 1,
    fieldSize: 512 * 1024,
  });
  assert.ok(managerTaskUploadLimits.files * managerTaskUploadLimits.fileSize < 100 * 1024 * 1024);
});

test('lists only active workers for manager assignment', async () => {
  let where: unknown;
  const database = {
    user: {
      findMany: async (query: { where: unknown }) => (
        (where = query.where),
        [{ id: 'worker-1', name: 'Илья Н.', email: 'ilya' }]
      ),
    },
  };
  const service = new ManagerTaskService(database as never, {} as never, {} as never);
  const workers = await service.listWorkers();
  assert.deepEqual(where, { role: 'WORKER', isActive: true });
  assert.equal(workers[0].name, 'Илья Н.');
});

test('manager history scopes events to the selected worker tasks and shifts', async () => {
  let eventQuery: { where: unknown; orderBy: unknown; take: number } | undefined;
  const createdAt = new Date('2026-07-13T10:00:00Z');
  const events = [
    { id: 'event-new', createdAt, actorId: 'worker-1', artifacts: [{ id: 'photo-1' }] },
    { id: 'event-old', createdAt: new Date('2026-07-13T09:00:00Z'), artifacts: [] },
  ];
  const database = {
    user: {
      findFirst: async () => ({ id: 'worker-1', name: 'Илья Н.', email: 'ilya' }),
    },
    task: { findMany: async () => [{ id: 'task-1' }] },
    workShift: { findMany: async () => [{ id: 'shift-1' }] },
    event: {
      findMany: async (query: { where: unknown; orderBy: unknown; take: number }) => {
        eventQuery = query;
        return events;
      },
    },
  };
  const service = new ManagerTaskService(database as never, {} as never, {} as never);
  const result = await service.getHistory({ workerId: 'worker-1', limit: '20' });
  assert.equal(result.worker.name, 'Илья Н.');
  assert.equal(result.items[0].actorId, 'worker-1');
  assert.equal(result.items[0].artifacts[0].id, 'photo-1');
  assert.deepEqual(eventQuery?.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(eventQuery?.take, 21);
  assert.match(JSON.stringify(eventQuery?.where), /worker-1|task-1|shift-1/);
});

test('manager history keeps cursor pagination and does not substitute manager actor history', async () => {
  const createdAt = new Date('2026-07-13T10:00:00Z');
  const events = Array.from({ length: 3 }, (_, index) => ({
    id: `worker-event-${index}`,
    createdAt,
    actorId: 'worker-1',
    artifacts: [],
  }));
  const database = {
    user: { findFirst: async () => ({ id: 'worker-1', name: 'Илья Н.', email: 'ilya' }) },
    task: { findMany: async () => [] },
    workShift: { findMany: async () => [] },
    event: { findMany: async () => events },
  };
  const service = new ManagerTaskService(database as never, {} as never, {} as never);
  const result = await service.getHistory({ workerId: 'worker-1', limit: '2' });
  assert.equal(result.items.length, 2);
  assert.equal(result.hasMore, true);
  assert.ok(result.nextCursor);
  assert.equal(
    result.items.some((event) => event.actorId === manager.id),
    false,
  );
});

test('rejects task creation without a positive integer position before database writes', async () => {
  const service = new ManagerTaskService({} as never, {} as never, {} as never);
  await assert.rejects(
    service.createTask(manager, {
      operationId: 'operation-1',
      objectId: 'object-1',
      assigneeId: 'worker-1',
      title: 'Новая задача',
      location: 'Этаж 3',
      position: 0,
      steps: [{ title: 'Этап', description: 'Описание' }],
    }),
    BadRequestException,
  );
});

function editableTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Старое название',
    description: 'Старое описание',
    location: 'Этаж 1',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 1,
    creatorId: manager.id,
    assigneeId: 'worker-1',
    processId: 'process-1',
    objectId: 'object-1',
    completedAt: null,
    deletedAt: null,
    updatedAt: new Date('2026-07-13T12:00:00.000Z'),
    object: { id: 'object-1', name: 'Пряник' },
    steps: [
      {
        id: 'step-1',
        taskId: 'task-1',
        title: 'Подготовка',
        description: 'Подготовить место',
        status: 'CREATED',
        order: 1,
        completedAt: null,
      },
    ],
    ...overrides,
  };
}

function editInput(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'edit-operation-1',
    updatedAt: '2026-07-13T12:00:00.000Z',
    objectId: 'object-1',
    assigneeId: 'worker-1',
    title: 'Новое название',
    description: 'Старое описание',
    location: 'Этаж 1',
    priority: 'NORMAL' as const,
    accessStatus: 'OPEN' as const,
    position: 1,
    steps: [{ id: 'step-1', title: 'Подготовка', description: 'Подготовить место' }],
    ...overrides,
  };
}

test('full edit stores a structured before/after event and worker notification atomically', async () => {
  const task = editableTask();
  let eventInput: Record<string, unknown> | undefined;
  let notification: Record<string, unknown> | undefined;
  let updatedTitle = task.title;
  const client = {
    task: {
      findFirst: async () => task,
      update: async ({ data }: { data: { title: string } }) => ((updatedTitle = data.title), task),
    },
    user: {
      findFirst: async () => ({ id: 'worker-1', name: 'Илья Н.', email: 'ilya' }),
      findUnique: async () => ({ name: 'Иван Р.', email: 'manager' }),
    },
    constructionObject: { findFirst: async () => ({ id: 'object-1', name: 'Пряник' }) },
    process: { update: async () => ({}) },
    taskStep: { update: async () => ({}), create: async () => ({}) },
    taskMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => ((notification = data), data),
    },
  };
  const database = {
    event: { findUnique: async () => null },
    $transaction: async (action: (value: typeof client) => unknown) => action(client),
    task: {
      findFirst: async () => ({ ...task, title: updatedTitle, messages: [] }),
    },
    user: { findMany: async () => [{ id: 'worker-1', name: 'Илья Н.', email: 'ilya' }] },
    artifact: { findMany: async () => [] },
  };
  const events = {
    createEvent: async (input: Record<string, unknown>) => ((eventInput = input), input),
  };
  const service = new ManagerTaskService(database as never, events as never, {} as never);
  const result = await service.editTask(manager, 'task-1', editInput());
  assert.equal((result as unknown as { title: string }).title, 'Новое название');
  assert.equal(eventInput?.type, 'TASK_UPDATED');
  assert.match(JSON.stringify(eventInput?.payload), /"before":"Старое название"/);
  assert.match(JSON.stringify(eventInput?.payload), /"after":"Новое название"/);
  assert.equal(notification?.kind, 'TASK_UPDATED');
  assert.equal(notification?.recipientId, 'worker-1');
});

test('full edit rejects stale updatedAt with HTTP conflict semantics', async () => {
  const task = editableTask();
  const database = {
    event: { findUnique: async () => null },
    $transaction: async (action: (client: unknown) => unknown) =>
      action({ task: { findFirst: async () => task } }),
  };
  const service = new ManagerTaskService(database as never, {} as never, {} as never);
  await assert.rejects(
    service.editTask(manager, 'task-1', editInput({ updatedAt: '2026-07-13T11:59:59.000Z' })),
    ConflictException,
  );
});

test('active task edit requires a reason before any mutation', async () => {
  const task = editableTask({ status: 'IN_PROGRESS' });
  const database = {
    event: { findUnique: async () => null },
    $transaction: async (action: (client: unknown) => unknown) =>
      action({ task: { findFirst: async () => task } }),
  };
  const service = new ManagerTaskService(database as never, {} as never, {} as never);
  await assert.rejects(service.editTask(manager, 'task-1', editInput()), BadRequestException);
});

test('completed task is read-only in the manager edit API', async () => {
  const task = editableTask({ status: 'COMPLETED' });
  const database = {
    event: { findUnique: async () => null },
    $transaction: async (action: (client: unknown) => unknown) =>
      action({ task: { findFirst: async () => task } }),
  };
  const service = new ManagerTaskService(database as never, {} as never, {} as never);
  await assert.rejects(service.editTask(manager, 'task-1', editInput()), BadRequestException);
});

test('completed step cannot be changed, reordered or deleted', async () => {
  const task = editableTask({
    steps: [
      {
        id: 'step-completed',
        taskId: 'task-1',
        title: 'Выполнено',
        description: 'Готово',
        status: 'COMPLETED',
        order: 1,
        completedAt: new Date(),
      },
    ],
  });
  const client = {
    task: { findFirst: async () => task },
    user: { findFirst: async () => ({ id: 'worker-1' }) },
    constructionObject: { findFirst: async () => ({ id: 'object-1' }) },
  };
  const database = {
    event: { findUnique: async () => null },
    $transaction: async (action: (value: typeof client) => unknown) => action(client),
  };
  const service = new ManagerTaskService(database as never, {} as never, {} as never);
  await assert.rejects(
    service.editTask(
      manager,
      'task-1',
      editInput({
        steps: [{ id: 'step-completed', title: 'Изменённое выполненное', description: 'Готово' }],
      }),
    ),
    BadRequestException,
  );
});

test('repeated edit operation returns current task without a second transaction', async () => {
  let transactions = 0;
  const task = editableTask({ messages: [] });
  const database = {
    event: { findUnique: async () => ({ id: 'existing-edit-event' }) },
    $transaction: async () => ((transactions += 1), null),
    task: { findFirst: async () => task },
    user: { findMany: async () => [{ id: 'worker-1' }] },
    artifact: { findMany: async () => [] },
  };
  const service = new ManagerTaskService(database as never, {} as never, {} as never);
  await service.editTask(manager, 'task-1', editInput());
  assert.equal(transactions, 0);
});
