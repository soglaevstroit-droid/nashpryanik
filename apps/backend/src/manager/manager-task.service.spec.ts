import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ManagerTaskService } from './manager-task.service.js';

const manager = { id: 'manager-1', email: 'manager', role: 'FOREMAN' as const };

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
