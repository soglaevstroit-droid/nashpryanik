import { Injectable } from '@nestjs/common';
import { Event, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { EventRecord } from './event-record.js';
import { EventType } from './event-types.js';

@Injectable()
export class EventRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(
    data: CreateEventDto,
    client: Prisma.TransactionClient = this.database,
  ): Promise<EventRecord> {
    const event = await client.event.create({
      data: {
        type: data.type,
        actorId: data.actorId ?? null,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        objectId: data.objectId ?? null,
        taskId: data.taskId ?? null,
        taskStepId: data.taskStepId ?? null,
        workShiftId: data.workShiftId ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
        payload: data.payload,
        metadata: data.metadata ?? Prisma.DbNull,
      },
    });

    return this.toRecord(event);
  }

  async findById(id: string): Promise<EventRecord | null> {
    const event = await this.database.event.findUnique({
      where: {
        id,
      },
    });

    return event ? this.toRecord(event) : null;
  }

  async findMany(limit: number): Promise<EventRecord[]> {
    const events = await this.database.event.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return events.map((event) => this.toRecord(event));
  }

  async findManyByActorId(actorId: string, limit: number): Promise<EventRecord[]> {
    const events = await this.database.event.findMany({
      where: {
        actorId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return events.map((event) => this.toRecord(event));
  }

  private toRecord(event: Event): EventRecord {
    return {
      id: event.id,
      type: event.type as EventType,
      actorId: event.actorId,
      entityType: event.entityType,
      entityId: event.entityId,
      objectId: event.objectId,
      taskId: event.taskId,
      taskStepId: event.taskStepId,
      workShiftId: event.workShiftId,
      payload: event.payload,
      metadata: event.metadata,
      createdAt: event.createdAt,
    };
  }
}
