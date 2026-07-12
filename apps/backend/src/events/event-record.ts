import { Prisma } from '@prisma/client';
import { EventType } from './event-types.js';

export interface EventRecord {
  id: string;
  type: EventType;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  objectId?: string | null;
  taskId?: string | null;
  taskStepId?: string | null;
  workShiftId?: string | null;
  payload: Prisma.JsonValue;
  metadata: Prisma.JsonValue | null;
  artifacts?: Array<{ id: string; mimeType: string; originalFileName: string }>;
  createdAt: Date;
}
