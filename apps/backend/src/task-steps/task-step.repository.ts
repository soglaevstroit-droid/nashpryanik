import { Injectable } from '@nestjs/common';
import { Prisma, TaskStepStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';
import { TaskStepRecord } from './task-step-record.js';

interface CreateTaskStepData {
  taskId: string;
  title: string;
  description?: string | null;
  order: number;
}

interface UpdateTaskStepData {
  status?: TaskStepStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  completedByUserId?: string | null;
  completionOperationId?: string | null;
}

@Injectable()
export class TaskStepRepository {
  constructor(private readonly prisma: DatabaseService) {}

  create(data: CreateTaskStepData): Promise<TaskStepRecord> {
    return this.prisma.taskStep.create({
      data,
    });
  }

  findById(
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<TaskStepRecord | null> {
    return client.taskStep.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findManyByTaskId(taskId: string, limit: number): Promise<TaskStepRecord[]> {
    return this.prisma.taskStep.findMany({
      where: { taskId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
  }

  update(
    id: string,
    data: UpdateTaskStepData,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<TaskStepRecord> {
    return client.taskStep.update({
      where: { id },
      data: data as Prisma.TaskStepUpdateInput,
    });
  }
}
