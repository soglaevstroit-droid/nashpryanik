import { TaskAccessStatus, TaskPriority, TaskStatus } from '@prisma/client';

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  accessStatus: TaskAccessStatus;
  position: number;
  creatorId: string;
  assigneeId: string | null;
  processId: string;
  objectId?: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completedWorkShiftId: string | null;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  deletionReason: string | null;
  creationOperationId: string | null;
  isWorkBlocked: boolean;
  workBlockedAt: Date | null;
  workBlockedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
