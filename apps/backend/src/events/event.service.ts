import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateEventDto } from './dto/create-event.dto.js';
import { EventRecord } from './event-record.js';
import { EventRepository } from './event.repository.js';
import { isEventType } from './event-types.js';

const defaultEventListLimit = 100;

@Injectable()
export class EventService {
  constructor(private readonly repository: EventRepository) {}

  async createEvent(dto: CreateEventDto): Promise<EventRecord> {
    this.assertCreateEventDto(dto);

    return this.repository.create(dto);
  }

  async getEventById(id: string): Promise<EventRecord> {
    if (!id) {
      throw new BadRequestException('Event id is required');
    }

    const event = await this.repository.findById(id);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async listEvents(): Promise<EventRecord[]> {
    return this.repository.findMany(defaultEventListLimit);
  }

  async listEventsByActorId(actorId: string, limit: number): Promise<EventRecord[]> {
    if (!actorId) {
      throw new BadRequestException('Actor id is required');
    }

    return this.repository.findManyByActorId(actorId, limit);
  }

  private assertCreateEventDto(dto: CreateEventDto): void {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Event body is required');
    }

    if (!isEventType(dto.type)) {
      throw new BadRequestException('Unknown event type');
    }

    if (!isJsonValue(dto.payload)) {
      throw new BadRequestException('Event payload must be valid JSON');
    }

    if (dto.metadata !== undefined && dto.metadata !== null && !isJsonValue(dto.metadata)) {
      throw new BadRequestException('Event metadata must be valid JSON');
    }

    assertNullableString(dto.actorId, 'actorId');
    assertNullableString(dto.entityType, 'entityType');
    assertNullableString(dto.entityId, 'entityId');
  }
}

function assertNullableString(value: unknown, fieldName: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new BadRequestException(`Event ${fieldName} must be a string or null`);
  }
}

function isJsonValue(value: unknown): value is Prisma.InputJsonValue {
  if (value === undefined || value === null) {
    return false;
  }

  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}
