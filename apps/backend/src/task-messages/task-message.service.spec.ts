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
