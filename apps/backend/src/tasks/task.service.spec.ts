import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
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
    creatorId: manager.id,
    assigneeId: null,
    processId: 'process-1',
    completedAt: null,
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

test('accepts assigned task', async () => {
  const eventTypes: string[] = [];
  const service = new TaskService(
    createRepository([createTask({ status: 'ASSIGNED', assigneeId: worker.id })]),
    createEventService(eventTypes),
    createProcessService([]),
  );

  const task = await service.acceptTask(worker, 'task-1');

  assert.equal(task.status, 'ACCEPTED');
  assert.deepEqual(eventTypes, ['TASK_ACCEPTED']);
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

  await assert.rejects(() => service.acceptTask(worker, 'task-1'), BadRequestException);
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
