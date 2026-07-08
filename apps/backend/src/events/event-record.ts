import { Prisma } from '@prisma/client';
import { EventType } from './event-types.js';

export interface EventRecord {
  id: string;
  type: EventType;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Prisma.JsonValue;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}
