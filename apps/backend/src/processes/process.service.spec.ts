import test from 'node:test';
import assert from 'node:assert/strict';
import { ProcessStatus } from '@prisma/client';
import { EventService } from '../events/event.service.js';
import { CreateProcessDto } from './dto/create-process.dto.js';
import { ProcessRecord } from './process-record.js';
import { ProcessRepository } from './process.repository.js';
import { ProcessService } from './process.service.js';

const createdAt = new Date('2026-07-08T00:00:00.000Z');

function createProcess(overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  return {
    id: 'process-1',
    type: 'WORK_DAY',
    status: 'CREATED',
    title: 'Work day process',
    description: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createRepository(seed: ProcessRecord[] = []): ProcessRepository {
  const processes = [...seed];

  const repository: Pick<ProcessRepository, 'create' | 'findById' | 'findMany' | 'updateStatus'> = {
    create: async (dto: CreateProcessDto) => {
      const process = createProcess({
        id: `process-${processes.length + 1}`,
        type: dto.type,
        title: dto.title,
        description: dto.description ?? null,
      });

      processes.unshift(process);

      return process;
    },
    findById: async (id: string) => processes.find((process) => process.id === id) ?? null,
    findMany: async () => processes,
    updateStatus: async (
      id: string,
      status: ProcessStatus,
      dates: {
        startedAt?: Date;
        finishedAt?: Date;
      } = {},
    ) => {
      const index = processes.findIndex((process) => process.id === id);
      const current = processes[index];

      if (!current) {
        throw new Error('Process not found');
      }

      const updated = {
        ...current,
        status,
        startedAt: dates.startedAt ?? current.startedAt,
        finishedAt: dates.finishedAt ?? current.finishedAt,
        updatedAt: new Date('2026-07-08T00:01:00.000Z'),
      };

      processes[index] = updated;

      return updated;
    },
  };

  return repository as ProcessRepository;
}

function createEventService(eventTypes: string[]): EventService {
  return {
    createEvent: async (dto) => {
      eventTypes.push(dto.type);

      return {
        id: `event-${eventTypes.length}`,
        type: dto.type,
        actorId: null,
        entityType: dto.entityType ?? null,
        entityId: dto.entityId ?? null,
        payload: dto.payload,
        metadata: dto.metadata ?? null,
        createdAt,
      };
    },
  } as EventService;
}

test('creates process and corresponding event', async () => {
  const eventTypes: string[] = [];
  const service = new ProcessService(createRepository(), createEventService(eventTypes));

  const process = await service.createProcess({
    type: 'WORK_DAY',
    title: 'Work day process',
  });

  assert.equal(process.status, 'CREATED');
  assert.deepEqual(eventTypes, ['PROCESS_CREATED']);
});

test('starts process and creates event', async () => {
  const eventTypes: string[] = [];
  const service = new ProcessService(
    createRepository([createProcess({ id: 'process-1', status: 'CREATED' })]),
    createEventService(eventTypes),
  );

  const process = await service.startProcess('process-1');

  assert.equal(process.status, 'ACTIVE');
  assert.ok(process.startedAt);
  assert.deepEqual(eventTypes, ['PROCESS_STARTED']);
});

test('pauses process and creates event', async () => {
  const eventTypes: string[] = [];
  const service = new ProcessService(
    createRepository([createProcess({ id: 'process-1', status: 'ACTIVE', startedAt: createdAt })]),
    createEventService(eventTypes),
  );

  const process = await service.pauseProcess('process-1');

  assert.equal(process.status, 'PAUSED');
  assert.deepEqual(eventTypes, ['PROCESS_PAUSED']);
});

test('completes process and creates event', async () => {
  const eventTypes: string[] = [];
  const service = new ProcessService(
    createRepository([createProcess({ id: 'process-1', status: 'ACTIVE', startedAt: createdAt })]),
    createEventService(eventTypes),
  );

  const process = await service.completeProcess('process-1');

  assert.equal(process.status, 'COMPLETED');
  assert.ok(process.finishedAt);
  assert.deepEqual(eventTypes, ['PROCESS_COMPLETED']);
});

test('cancels process and creates event', async () => {
  const eventTypes: string[] = [];
  const service = new ProcessService(
    createRepository([createProcess({ id: 'process-1', status: 'ACTIVE', startedAt: createdAt })]),
    createEventService(eventTypes),
  );

  const process = await service.cancelProcess('process-1');

  assert.equal(process.status, 'CANCELLED');
  assert.ok(process.finishedAt);
  assert.deepEqual(eventTypes, ['PROCESS_CANCELLED']);
});

test('gets process by id', async () => {
  const service = new ProcessService(
    createRepository([createProcess({ id: 'process-42' })]),
    createEventService([]),
  );

  const process = await service.getProcess('process-42');

  assert.equal(process.id, 'process-42');
});

test('lists processes', async () => {
  const service = new ProcessService(
    createRepository([createProcess({ id: 'process-1' }), createProcess({ id: 'process-2' })]),
    createEventService([]),
  );

  const processes = await service.listProcesses();

  assert.equal(processes.length, 2);
});
