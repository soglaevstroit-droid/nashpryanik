import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { TaskService } from '../tasks/task.service.js';
import { TaskStepRecord } from './task-step-record.js';
import { TaskStepRepository } from './task-step.repository.js';
import { TaskStepService } from './task-step.service.js';

const createdAt = new Date('2026-07-08T00:00:00.000Z');
const foreman: AuthUser = {
  id: 'foreman-1',
  email: 'foreman@example.com',
  role: 'FOREMAN',
};
const worker: AuthUser = {
  id: 'worker-1',
  email: 'worker@example.com',
  role: 'WORKER',
};

function createStep(overrides: Partial<TaskStepRecord> = {}): TaskStepRecord {
  return {
    id: 'step-1',
    taskId: 'task-1',
    title: 'Prepare surface',
    description: null,
    status: 'CREATED',
    order: 1,
    startedAt: null,
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createRepository(seed: TaskStepRecord[] = []): TaskStepRepository {
  const steps = [...seed];

  const repository: Pick<
    TaskStepRepository,
    'create' | 'findById' | 'findManyByTaskId' | 'update'
  > = {
    create: async (data) => {
      const step = createStep({
        id: `step-${steps.length + 1}`,
        taskId: data.taskId,
        title: data.title,
        description: data.description ?? null,
        order: data.order,
      });

      steps.unshift(step);

      return step;
    },
    findById: async (id: string) => steps.find((step) => step.id === id) ?? null,
    findManyByTaskId: async (taskId: string) => steps.filter((step) => step.taskId === taskId),
    update: async (id: string, data) => {
      const index = steps.findIndex((step) => step.id === id);
      const current = steps[index];

      if (!current) {
        throw new Error('Task step not found');
      }

      const updated = {
        ...current,
        ...data,
        updatedAt: createdAt,
      };

      steps[index] = updated;

      return updated;
    },
  };

  return repository as TaskStepRepository;
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

function createTaskService(): TaskService {
  return {
    getTask: async (id: string) => ({
      id,
      title: 'Install formwork',
      description: null,
      status: 'IN_PROGRESS',
      priority: 'NORMAL',
      creatorId: foreman.id,
      assigneeId: worker.id,
      processId: 'process-1',
      completedAt: null,
      createdAt,
      updatedAt: createdAt,
    }),
  } as TaskService;
}

test('creates step and event', async () => {
  const eventTypes: string[] = [];
  const service = new TaskStepService(
    createRepository(),
    createEventService(eventTypes),
    createTaskService(),
  );

  const step = await service.createStep(foreman, 'task-1', {
    title: 'Prepare surface',
    order: 1,
  });

  assert.equal(step.taskId, 'task-1');
  assert.equal(step.status, 'CREATED');
  assert.deepEqual(eventTypes, ['STEP_CREATED']);
});

test('lists steps by task', async () => {
  const service = new TaskStepService(
    createRepository([createStep({ id: 'step-1' }), createStep({ id: 'step-2' })]),
    createEventService([]),
    createTaskService(),
  );

  const steps = await service.listStepsByTask('task-1');

  assert.equal(steps.length, 2);
});

test('gets step by id', async () => {
  const service = new TaskStepService(
    createRepository([createStep()]),
    createEventService([]),
    createTaskService(),
  );

  const step = await service.getStep('step-1');

  assert.equal(step.id, 'step-1');
});

test('starts step and event', async () => {
  const eventTypes: string[] = [];
  const service = new TaskStepService(
    createRepository([createStep()]),
    createEventService(eventTypes),
    createTaskService(),
  );

  const step = await service.startStep(worker, 'step-1');

  assert.equal(step.status, 'IN_PROGRESS');
  assert.ok(step.startedAt);
  assert.deepEqual(eventTypes, ['STEP_STARTED']);
});

test('completes step and event', async () => {
  const eventTypes: string[] = [];
  const service = new TaskStepService(
    createRepository([createStep({ status: 'IN_PROGRESS', startedAt: createdAt })]),
    createEventService(eventTypes),
    createTaskService(),
  );

  const step = await service.completeStep(worker, 'step-1');

  assert.equal(step.status, 'COMPLETED');
  assert.ok(step.completedAt);
  assert.deepEqual(eventTypes, ['STEP_COMPLETED']);
});

test('reopens step and event', async () => {
  const eventTypes: string[] = [];
  const service = new TaskStepService(
    createRepository([createStep({ status: 'COMPLETED', completedAt: createdAt })]),
    createEventService(eventTypes),
    createTaskService(),
  );

  const step = await service.reopenStep(foreman, 'step-1');

  assert.equal(step.status, 'REOPENED');
  assert.equal(step.completedAt, null);
  assert.deepEqual(eventTypes, ['STEP_REOPENED']);
});

test('cancels step and event', async () => {
  const eventTypes: string[] = [];
  const service = new TaskStepService(
    createRepository([createStep({ status: 'IN_PROGRESS', startedAt: createdAt })]),
    createEventService(eventTypes),
    createTaskService(),
  );

  const step = await service.cancelStep(foreman, 'step-1');

  assert.equal(step.status, 'CANCELLED');
  assert.deepEqual(eventTypes, ['STEP_CANCELLED']);
});

test('rejects invalid transition', async () => {
  const service = new TaskStepService(
    createRepository([createStep({ status: 'COMPLETED' })]),
    createEventService([]),
    createTaskService(),
  );

  await assert.rejects(() => service.startStep(worker, 'step-1'), BadRequestException);
});

test('worker step actions require an active shift before reading the step', async () => {
  let stepRead = false;
  const repository = createRepository([createStep()]);
  const originalFindById = repository.findById.bind(repository);
  repository.findById = async (...args) => {
    stepRead = true;
    return originalFindById(...args);
  };
  const service = new TaskStepService(
    repository,
    createEventService([]),
    createTaskService(),
    undefined,
    {
      assertActiveShift: async () => {
        throw new Error('ACTIVE_SHIFT_REQUIRED');
      },
    } as never,
  );

  await assert.rejects(service.startStep(worker, 'step-1'), /ACTIVE_SHIFT_REQUIRED/);
  assert.equal(stepRead, false);
});
