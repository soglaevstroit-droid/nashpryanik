import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkerService } from './worker.service.js';

const worker = { id: 'worker-1', email: 'ilya', role: 'WORKER' as const };

test('returns active objects with only current worker tasks grouped', async () => {
  let where: unknown;
  const database = {
    constructionObject: {
      findMany: async (query: { include: { tasks: { where: unknown } } }) => {
        where = query.include.tasks.where;
        return [
          {
            id: 'object-1',
            name: 'Пряник',
            sortOrder: 1,
            tasks: [
              {
                id: 'task-1',
                steps: [],
                status: 'ASSIGNED',
                priority: 'NORMAL',
                accessStatus: 'OPEN',
                position: 1,
                createdAt: new Date(),
              },
            ],
          },
        ];
      },
    },
    artifact: { findMany: async () => [{ id: 'photo-1', taskId: 'task-1' }] },
    workShift: { findFirst: async () => ({ id: 'shift-1' }) },
  };
  const result = await new WorkerService(database as never).getObjectsWithTasks(worker);
  assert.deepEqual(where, {
    assigneeId: worker.id,
    deletedAt: null,
    status: { notIn: ['COMPLETED', 'CANCELLED'] },
  });
  assert.equal(result[0].activeTasksCount, 1);
  assert.equal(result[0].object.name, 'Пряник');
  assert.equal(result[0].tasks[0].photos[0].id, 'photo-1');
});

test('inactive objects are excluded by database query', async () => {
  let activeFilter: unknown;
  const database = {
    constructionObject: {
      findMany: async (query: { where: unknown }) => {
        activeFilter = query.where;
        return [];
      },
    },
    workShift: { findFirst: async () => null },
  };
  const result = await new WorkerService(database as never).getObjectsWithTasks(worker);
  assert.deepEqual(activeFilter, { isActive: true });
  assert.deepEqual(result, []);
});

test('task details belong to the selected worker task and steps keep their order', async () => {
  let taskWhere: unknown;
  const database = {
    task: {
      findFirst: async (query: { where: unknown }) => {
        taskWhere = query.where;
        return {
          id: 'task-2',
          title: 'Вторая задача',
          assigneeId: worker.id,
          accessStatus: 'OPEN',
          object: { id: 'object-1', name: 'Пряник' },
          steps: [
            { id: 'step-1', order: 1, title: 'Первый этап' },
            { id: 'step-2', order: 2, title: 'Второй этап' },
          ],
          messages: [],
        };
      },
    },
    artifact: {
      findMany: async () => [
        { id: 'task-photo', taskStepId: null },
        { id: 'step-photo', taskStepId: 'step-2' },
      ],
    },
    user: {
      findUnique: async () => ({ id: worker.id, name: 'Илья' }),
      findMany: async () => [],
    },
  };
  const result = await new WorkerService(database as never).getTask(worker, 'task-2');
  assert.deepEqual(taskWhere, { assigneeId: worker.id, status: 'IN_PROGRESS', deletedAt: null });
  assert.equal(result.title, 'Вторая задача');
  assert.deepEqual(
    result.steps.map((step) => step.title),
    ['Первый этап', 'Второй этап'],
  );
  assert.equal(result.photos[0].id, 'task-photo');
  assert.equal(result.steps[1].photos[0].id, 'step-photo');
});

test('task details require an active worker shift before querying the task', async () => {
  let taskQueried = false;
  const database = { task: { findFirst: async () => ((taskQueried = true), null) } };
  const activeShiftAccess = {
    assertActiveShift: async () => {
      throw new Error('ACTIVE_SHIFT_REQUIRED');
    },
  };

  await assert.rejects(
    new WorkerService(database as never, activeShiftAccess as never).getTask(worker, 'task-1'),
    /ACTIVE_SHIFT_REQUIRED/,
  );
  assert.equal(taskQueried, false);
});

test('another worker task is not exposed', async () => {
  const database = { task: { findFirst: async () => null } };
  await assert.rejects(
    new WorkerService(database as never).getTask(worker, 'foreign-task'),
    /Task not found/,
  );
});

test('history always filters by authenticated actor and sorts newest first', async () => {
  let query: { where: { actorId: string }; orderBy: unknown } | undefined;
  const database = {
    event: {
      findMany: async (value: { where: { actorId: string }; orderBy: unknown }) => {
        query = value;
        return [];
      },
    },
  };
  await new WorkerService(database as never).getHistory(worker, { limit: '20' });
  assert.equal(query?.where.actorId, worker.id);
  assert.deepEqual(query?.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
});

test('history pagination is stable and bounded', async () => {
  const createdAt = new Date('2026-07-12T10:00:00Z');
  const events = Array.from({ length: 3 }, (_, index) => ({
    id: `event-${index}`,
    createdAt,
    artifacts: [],
    metadata: {},
  }));
  const database = { event: { findMany: async () => events } };
  const result = await new WorkerService(database as never).getHistory(worker, { limit: '2' });
  assert.equal(result.items.length, 2);
  assert.equal(result.hasMore, true);
  assert.ok(result.nextCursor);
});

test('history response contains snapshots without secret fields', async () => {
  const event = {
    id: 'event-1',
    createdAt: new Date(),
    artifacts: [],
    metadata: { actorName: 'Илья', objectName: 'Пряник', taskTitle: 'Задача' },
  };
  const database = { event: { findMany: async () => [event] } };
  const result = await new WorkerService(database as never).getHistory(worker, {});
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /password|token|secret|jwt/i);
  assert.match(serialized, /Задача/);
});
