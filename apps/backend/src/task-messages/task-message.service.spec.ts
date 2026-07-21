import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { TaskMessageService } from './task-message.service.js';

const worker = { id: 'worker-1', email: 'ilya', role: 'WORKER' as const };
const manager = { id: 'manager-1', email: 'foreman', role: 'FOREMAN' as const };

test('pause updates task, creates one message and one event in a transaction', async () => {
  const writes: string[] = [];
  const client = {
    taskMessage: {
      create: async () => (writes.push('message'), { id: 'message-1' }),
    },
    task: { update: async () => (writes.push('paused'), {}) },
  };
  const database = {
    task: {
      findFirst: async () => ({
        id: 'task-1',
        status: 'IN_PROGRESS',
        objectId: 'object-1',
        title: 'Task',
        object: { name: 'Пряник' },
        steps: [{ id: 'step-1', title: 'Step', order: 1, status: 'IN_PROGRESS' }],
      }),
    },
    $transaction: async (action: (value: typeof client) => unknown) => action(client),
  };
  const events = { createEvent: async () => writes.push('event') };
  const shift = { assertActiveShift: async () => undefined };
  const service = new TaskMessageService(database as never, events as never, shift as never);

  await service.pause(worker, 'task-1', 'Нужна проверка');
  assert.deepEqual(writes, ['message', 'paused', 'event']);
});

test('assigned worker resumes a paused task with an immutable reason and manager notification', async () => {
  const writes: Array<{ kind: string; value?: unknown }> = [];
  const client = {
    taskMessage: {
      create: async (query: { data: { kind: string; body: string; parentId?: string } }) => {
        writes.push({ kind: 'message', value: query.data });
        return { id: 'resume-message' };
      },
    },
    task: {
      updateMany: async (query: unknown) => {
        writes.push({ kind: 'resumed', value: query });
        return { count: 1 };
      },
    },
  };
  const database = {
    task: {
      findFirst: async (query: { where: { id?: string } }) =>
        query.where.id
          ? {
              id: 'task-1',
              status: 'PAUSED',
              accessStatus: 'OPEN',
              isWorkBlocked: false,
              objectId: 'object-1',
              title: 'Task',
              object: { name: 'Пряник' },
              steps: [{ id: 'step-1', title: 'Step', order: 1, status: 'IN_PROGRESS' }],
            }
          : null,
    },
    taskMessage: { findFirst: async () => ({ id: 'pause-message' }) },
    $transaction: async (action: (value: typeof client) => unknown) => action(client),
  };
  const events = {
    createEvent: async (event: { type: string; metadata: { reason: string } }) =>
      writes.push({ kind: 'event', value: event }),
  };
  const shift = { assertActiveShift: async () => undefined };
  const service = new TaskMessageService(database as never, events as never, shift as never);

  await service.resume(worker, 'task-1', 'Материал доставлен');

  assert.equal((writes[0].value as { kind: string }).kind, 'WORK_RESUMED');
  assert.equal((writes[0].value as { parentId: string }).parentId, 'pause-message');
  assert.deepEqual((writes[1].value as { data: object }).data, { status: 'IN_PROGRESS' });
  assert.equal((writes[2].value as { type: string }).type, 'TASK_RESUMED');
  assert.equal(
    (writes[2].value as { metadata: { reason: string } }).metadata.reason,
    'Материал доставлен',
  );
});

test('worker cannot self-resume a manager-blocked or non-paused task', async () => {
  const task = {
    id: 'task-1',
    status: 'PAUSED',
    accessStatus: 'OPEN',
    isWorkBlocked: true,
    objectId: null,
    title: 'Task',
    object: null,
    steps: [],
  };
  const database = { task: { findFirst: async () => task } };
  const service = new TaskMessageService(
    database as never,
    {} as never,
    { assertActiveShift: async () => undefined } as never,
  );
  await assert.rejects(service.resume(worker, 'task-1', 'Продолжаю'), /stopped by manager/);
  task.isWorkBlocked = false;
  task.accessStatus = 'CLOSED';
  await assert.rejects(service.resume(worker, 'task-1', 'Продолжаю'), /available task/);
  task.accessStatus = 'OPEN';
  task.status = 'COMPLETED';
  await assert.rejects(service.resume(worker, 'task-1', 'Продолжаю'), /Only a paused task/);
});

test('self-resume rejects an empty reason and another active task', async () => {
  const shift = { assertActiveShift: async () => undefined };
  const emptyService = new TaskMessageService({} as never, {} as never, shift as never);
  await assert.rejects(emptyService.resume(worker, 'task-1', '   '), BadRequestException);
  const database = {
    task: {
      findFirst: async (query: { where: { id?: string } }) =>
        query.where.id
          ? {
              id: 'task-1',
              status: 'PAUSED',
              accessStatus: 'OPEN',
              isWorkBlocked: false,
              objectId: null,
              title: 'Task',
              object: null,
              steps: [],
            }
          : { id: 'task-2' },
    },
  };
  const activeService = new TaskMessageService(database as never, {} as never, shift as never);
  await assert.rejects(activeService.resume(worker, 'task-1', 'Проблема устранена'), /ANOTHER/);
});

test('help message is required', async () => {
  const service = new TaskMessageService(
    {} as never,
    {} as never,
    {
      assertActiveShift: async () => undefined,
    } as never,
  );
  await assert.rejects(service.help(worker, 'task-1', '   '), BadRequestException);
});

test('manager cannot answer the same request twice', async () => {
  const database = {
    taskMessage: {
      findUnique: async () => ({
        id: 'message-1',
        kind: 'PAUSE_REQUEST',
        taskId: 'task-1',
        taskStepId: null,
        task: { id: 'task-1', title: 'Task', objectId: null, object: null, steps: [] },
      }),
      findFirst: async () => ({ id: 'reply-1' }),
    },
  };
  const service = new TaskMessageService(database as never, {} as never, {} as never);
  await assert.rejects(
    service.reply(manager, 'message-1', 'Продолжайте', 'CONTINUE'),
    /already answered/,
  );
});

test('self-resume resolves the pause request and remains visible to the manager', async () => {
  const pause = { id: 'pause-1', kind: 'PAUSE_REQUEST', parentId: null };
  const resume = { id: 'resume-1', kind: 'WORK_RESUMED', parentId: pause.id };
  const database = {
    taskMessage: {
      findMany: async () => [resume, pause],
    },
  };
  const service = new TaskMessageService(database as never, {} as never, {} as never);

  assert.deepEqual(await service.managerMessages(), [resume]);
});

test('manager STOP keeps task paused and stores explicit work block', async () => {
  let taskUpdate: unknown;
  const client = {
    taskMessage: { create: async () => ({ id: 'reply-1' }) },
    task: { update: async (query: unknown) => ((taskUpdate = query), {}) },
  };
  const database = {
    taskMessage: {
      findUnique: async () => ({
        id: 'message-1',
        kind: 'PAUSE_REQUEST',
        taskId: 'task-1',
        taskStepId: 'step-1',
        task: {
          id: 'task-1',
          title: 'Task',
          objectId: null,
          object: null,
          steps: [{ id: 'step-1', title: 'Step' }],
        },
      }),
      findFirst: async () => null,
    },
    $transaction: async (action: (value: typeof client) => unknown) => action(client),
  };
  const service = new TaskMessageService(
    database as never,
    { createEvent: async () => ({}) } as never,
    {} as never,
  );
  await service.reply(manager, 'message-1', 'Не продолжать', 'STOP');
  assert.deepEqual((taskUpdate as { data: object }).data, {
    status: 'PAUSED',
    isWorkBlocked: true,
    workBlockedAt: (taskUpdate as { data: { workBlockedAt: Date } }).data.workBlockedAt,
    workBlockedByUserId: manager.id,
  });
});
