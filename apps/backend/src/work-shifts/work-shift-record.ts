import { WorkShiftStatus } from '@prisma/client';

export interface WorkShiftRecord {
  id: string;
  userId: string;
  processId: string | null;
  status: WorkShiftStatus;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
