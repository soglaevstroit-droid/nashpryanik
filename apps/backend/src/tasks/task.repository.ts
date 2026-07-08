import { Injectable } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';
import { TaskRecord } from './task-record.js';

interface CreateTaskData {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  creatorId: string;
  processId: string;
}

interface UpdateTaskData {
  status?: TaskStatus;
  assigneeId?: string | null;
  completedAt?: Date | null;
}

@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: DatabaseService) {}

  create(data: CreateTaskData): Promise<TaskRecord> {
    return this.prisma.task.create({
      data,
    });
  }

  findById(id: string): Promise<TaskRecord | null> {
    return this.prisma.task.findUnique({
      where: { id },
    });
  }

  findMany(limit: number): Promise<TaskRecord[]> {
    return this.prisma.task.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  findManyByAssigneeId(assigneeId: string, limit: number): Promise<TaskRecord[]> {
    return this.prisma.task.findMany({
      where: { assigneeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  update(id: string, data: UpdateTaskData): Promise<TaskRecord> {
    return this.prisma.task.update({
      where: { id },
      data: data as Prisma.TaskUpdateInput,
    });
  }
}
