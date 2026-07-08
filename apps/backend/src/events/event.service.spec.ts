import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto.js';
import { EventRecord } from './event-record.js';
import { EventRepository } from './event.repository.js';
import { EventService } from './event.service.js';

const createdAt = new Date('2026-07-08T00:00:00.000Z');

function createEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'event-1',
    type: 'SYSTEM_UPDATED',
    actorId: null,
    entityType: null,
    entityId: null,
    payload: {
      source: 'test',
    },
    metadata: null,
    createdAt,
    ...overrides,
  };
}

function createRepository(seed: EventRecord[] = []): EventRepository {
  const events = [...seed];

  const repository: Pick<
    EventRepository,
    'create' | 'findMany' | 'findManyByActorId' | 'findById'
  > = {
    create: async (dto: CreateEventDto) => {
      const event = createEvent({
        id: `event-${events.length + 1}`,
        type: dto.type,
        actorId: dto.actorId ?? null,
        entityType: dto.entityType ?? null,
        entityId: dto.entityId ?? null,
        payload: dto.payload as EventRecord['payload'],
        metadata: (dto.metadata ?? null) as EventRecord['metadata'],
      });

      events.unshift(event);

      return event;
    },
    findMany: async () => events,
    findManyByActorId: async (actorId: string) =>
      events.filter((event) => event.actorId === actorId),
    findById: async (id: string) => events.find((event) => event.id === id) ?? null,
  };

  return repository as EventRepository;
}

test('creates event', async () => {
  const service = new EventService(createRepository());

  const event = await service.createEvent({
    type: 'SYSTEM_UPDATED',
    payload: {
      source: 'test',
    },
  });

  assert.equal(event.type, 'SYSTEM_UPDATED');
  assert.deepEqual(event.payload, {
    source: 'test',
  });
});

test('lists events', async () => {
  const service = new EventService(
    createRepository([createEvent({ id: 'event-1' }), createEvent({ id: 'event-2' })]),
  );

  const events = await service.listEvents();

  assert.equal(events.length, 2);
  assert.equal(events[0]?.id, 'event-1');
});

test('gets event by id', async () => {
  const service = new EventService(createRepository([createEvent({ id: 'event-42' })]));

  const event = await service.getEventById('event-42');

  assert.equal(event.id, 'event-42');
});

test('lists events by actor id', async () => {
  const service = new EventService(
    createRepository([
      createEvent({ id: 'event-1', actorId: 'worker-1' }),
      createEvent({ id: 'event-2', actorId: 'worker-2' }),
      createEvent({ id: 'event-3', actorId: 'worker-1' }),
    ]),
  );

  const events = await service.listEventsByActorId('worker-1', 20);

  assert.deepEqual(
    events.map((event) => event.id),
    ['event-1', 'event-3'],
  );
});

test('rejects unknown event type', async () => {
  const service = new EventService(createRepository());

  await assert.rejects(
    () =>
      service.createEvent({
        type: 'UNKNOWN_EVENT',
        payload: {},
      } as never),
    BadRequestException,
  );
});
