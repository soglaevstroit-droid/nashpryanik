import { TaskPriority, TaskStatus } from '@prisma/client';

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  creatorId: string;
  assigneeId: string | null;
  processId: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
