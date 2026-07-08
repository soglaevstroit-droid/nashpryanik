import { ProcessStatus } from '@prisma/client';

export interface ProcessRecord {
  id: string;
  type: string;
  status: ProcessStatus;
  title: string;
  description: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
