import { Prisma } from '@prisma/client';
import { EventType } from '../event-types.js';

export interface CreateEventDto {
  type: EventType;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  objectId?: string | null;
  taskId?: string | null;
  taskStepId?: string | null;
  workShiftId?: string | null;
  idempotencyKey?: string | null;
  payload: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue | null;
}
