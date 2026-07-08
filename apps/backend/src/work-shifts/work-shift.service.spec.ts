import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { ProcessRecord } from '../processes/process-record.js';
import { ProcessService } from '../processes/process.service.js';
import { WorkShiftRecord } from './work-shift-record.js';
import { WorkShiftRepository } from './work-shift.repository.js';
import { WorkShiftService } from './work-shift.service.js';

const createdAt = new Date('2026-07-08T00:00:00.000Z');
const user: AuthUser = {
  id: 'user-1',
  email: 'worker@example.com',
  role: 'WORKER',
};

function createShift(overrides: Partial<WorkShiftRecord> = {}): WorkShiftRecord {
  return {
    id: 'shift-1',
    userId: user.id,
    processId: 'process-1',
    status: 'ACTIVE',
    startedAt: createdAt,
    finishedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createRepository(seed: WorkShiftRecord[] = []): WorkShiftRepository {
  const shifts = [...seed];

  const repository: Pick<
    WorkShiftRepository,
    'create' | 'findActiveByUserId' | 'findById' | 'finish' | 'findManyByUserId'
  > = {
    create: async (data) => {
      const shift = createShift({
        id: `shift-${shifts.length + 1}`,
        userId: data.userId,
        processId: data.processId,
        startedAt: data.startedAt,
      });

      shifts.unshift(shift);

      return shift;
    },
    findActiveByUserId: async (userId: string) =>
      shifts.find((shift) => shift.userId === userId && shift.status === 'ACTIVE') ?? null,
    findById: async (id: string) => shifts.find((shift) => shift.id === id) ?? null,
    finish: async (id: string, finishedAt: Date) => {
      const index = shifts.findIndex((shift) => shift.id === id);
      const current = shifts[index];

      if (!current) {
        throw new Error('Shift not found');
      }

      const updated = {
        ...current,
        status: 'FINISHED' as const,
        finishedAt,
      };

      shifts[index] = updated;

      return updated;
    },
    findManyByUserId: async (userId: string) => shifts.filter((shift) => shift.userId === userId),
  };

  return repository as WorkShiftRepository;
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
  } as unknown as ProcessService;
}

function createProcess(overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  return {
    id: 'process-1',
    type: 'WORK_SHIFT',
    status: 'CREATED',
    title: 'Work shift',
    description: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

test('starts shift and creates event and process', async () => {
  const eventTypes: string[] = [];
  const processEvents: string[] = [];
  const service = new WorkShiftService(
    createRepository(),
    createEventService(eventTypes),
    createProcessService(processEvents),
  );

  const shift = await service.startShift(user);

  assert.equal(shift.status, 'ACTIVE');
  assert.equal(shift.userId, user.id);
  assert.equal(shift.processId, 'process-1');
  assert.deepEqual(eventTypes, ['WORK_SHIFT_STARTED']);
  assert.deepEqual(processEvents, ['create', 'start']);
});

test('does not open second active shift', async () => {
  const service = new WorkShiftService(
    createRepository([createShift()]),
    createEventService([]),
    createProcessService([]),
  );

  await assert.rejects(() => service.startShift(user), BadRequestException);
});

test('finishes shift and completes process', async () => {
  const eventTypes: string[] = [];
  const processEvents: string[] = [];
  const service = new WorkShiftService(
    createRepository([createShift()]),
    createEventService(eventTypes),
    createProcessService(processEvents),
  );

  const shift = await service.finishShift(user);

  assert.equal(shift.status, 'FINISHED');
  assert.ok(shift.finishedAt);
  assert.deepEqual(eventTypes, ['WORK_SHIFT_FINISHED']);
  assert.deepEqual(processEvents, ['complete']);
});

test('gets current shift', async () => {
  const service = new WorkShiftService(
    createRepository([createShift()]),
    createEventService([]),
    createProcessService([]),
  );

  const shift = await service.getCurrentShift(user);

  assert.equal(shift?.id, 'shift-1');
});

test('returns shift history', async () => {
  const service = new WorkShiftService(
    createRepository([createShift({ id: 'shift-1' }), createShift({ id: 'shift-2' })]),
    createEventService([]),
    createProcessService([]),
  );

  const shifts = await service.history(user);

  assert.equal(shifts.length, 2);
});
