import { TaskStepStatus } from '@prisma/client';

export interface TaskStepRecord {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  status: TaskStepStatus;
  order: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
