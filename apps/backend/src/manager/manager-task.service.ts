import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskAccessStatus, TaskPriority } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ArtifactService, UploadedPhotoObject } from '../artifacts/artifact.service.js';
import { UploadedArtifactFile } from '../artifacts/uploaded-artifact-file.js';
import { AuthUser } from '../auth/auth-user.js';
import { DatabaseService } from '../database/database.service.js';
import { EventService } from '../events/event.service.js';

export interface ManagerTaskInput {
  operationId: string;
  objectId: string;
  assigneeId: string;
  title: string;
  description?: string;
  location: string;
  priority?: TaskPriority;
  accessStatus?: TaskAccessStatus;
  position: number;
  forceUrgent?: boolean;
  steps: Array<{ title: string; description: string; minimumPhotoCount?: number }>;
}

interface DecoratableTask {
  id: string;
  assigneeId: string | null;
  [key: string]: unknown;
}

@Injectable()
export class ManagerTaskService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventService,
    private readonly artifacts: ArtifactService,
  ) {}

  listWorkers() {
    return this.database.user.findMany({
      where: { role: 'WORKER', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
  }

  listObjects() {
    return this.database.constructionObject.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listTasks() {
    const tasks = await this.database.task.findMany({
      where: { deletedAt: null },
      include: { object: true, steps: { orderBy: { order: 'asc' } } },
      orderBy: [{ assigneeId: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });
    return this.decorate(tasks);
  }

  async getTask(taskId: string) {
    const task = await this.database.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { object: true, steps: { orderBy: { order: 'asc' } }, messages: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return (await this.decorate([task]))[0];
  }

  async getHistory(query: { workerId?: string; limit?: string; cursor?: string } = {}) {
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestException('History limit must be between 1 and 50');

    const worker = await this.database.user.findFirst({
      where: query.workerId
        ? { id: query.workerId, role: 'WORKER', isActive: true }
        : { role: 'WORKER', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
    if (!worker) throw new NotFoundException('Worker not found');

    const [tasks, shifts] = await Promise.all([
      this.database.task.findMany({
        where: { assigneeId: worker.id },
        select: { id: true },
      }),
      this.database.workShift.findMany({
        where: { userId: worker.id },
        select: { id: true },
      }),
    ]);
    const taskIds = tasks.map(({ id }) => id);
    const shiftIds = shifts.map(({ id }) => id);
    const workerScope: Prisma.EventWhereInput = {
      OR: [
        { actorId: worker.id },
        ...(taskIds.length ? [{ taskId: { in: taskIds } }] : []),
        ...(shiftIds.length ? [{ workShiftId: { in: shiftIds } }] : []),
      ],
    };
    const cursorScope = query.cursor ? managerHistoryCursorWhere(query.cursor) : undefined;
    const events = await this.database.event.findMany({
      where: cursorScope ? { AND: [workerScope, cursorScope] } : workerScope,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        artifacts: {
          select: { id: true, mimeType: true, originalFileName: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const hasMore = events.length > limit;
    const items = events.slice(0, limit);
    const last = items.at(-1);
    return {
      worker,
      items,
      hasMore,
      nextCursor: hasMore && last ? encodeManagerHistoryCursor(last.createdAt, last.id) : null,
    };
  }

  async createTask(user: AuthUser, input: ManagerTaskInput, files: UploadedArtifactFile[] = []) {
    assertInput(input);
    const existing = await this.database.task.findUnique({
      where: { creationOperationId: input.operationId },
    });
    if (existing) return this.getTask(existing.id);

    const [worker, object, activeTask] = await Promise.all([
      this.database.user.findFirst({
        where: { id: input.assigneeId, role: 'WORKER', isActive: true },
      }),
      this.database.constructionObject.findFirst({ where: { id: input.objectId, isActive: true } }),
      this.database.task.findFirst({
        where: { assigneeId: input.assigneeId, status: 'IN_PROGRESS', deletedAt: null },
      }),
    ]);
    if (!worker) throw new BadRequestException('Исполнитель недоступен');
    if (!object) throw new BadRequestException('Объект недоступен');
    if (input.priority === 'URGENT' && activeTask && !input.forceUrgent) {
      throw new ConflictException({
        code: 'ACTIVE_TASK_WARNING',
        message:
          'У сотрудника уже есть задача в работе. Новая срочная задача будет поставлена в очередь после текущей.',
      });
    }

    const uploads: UploadedPhotoObject[] = [];
    try {
      for (const file of files) uploads.push(await this.artifacts.uploadPhotoObject(user, file));
      const taskId = randomUUID();
      await this.database.$transaction(async (client) => {
        const count = await client.task.count({
          where: {
            assigneeId: input.assigneeId,
            deletedAt: null,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
        });
        const position = Math.min(input.position, count + 1);
        await client.task.updateMany({
          where: { assigneeId: input.assigneeId, deletedAt: null, position: { gte: position } },
          data: { position: { increment: 1 } },
        });
        const process = await client.process.create({
          data: {
            type: 'TASK',
            status: 'ACTIVE',
            title: input.title.trim(),
            description: clean(input.description),
            startedAt: new Date(),
          },
        });
        await client.task.create({
          data: {
            id: taskId,
            title: input.title.trim(),
            description: clean(input.description),
            location: input.location.trim(),
            status: 'ASSIGNED',
            priority: input.priority ?? 'NORMAL',
            accessStatus: input.accessStatus ?? 'OPEN',
            position,
            creatorId: user.id,
            assigneeId: worker.id,
            processId: process.id,
            objectId: object.id,
            creationOperationId: input.operationId,
            steps: {
              create: input.steps.map((step, index) => ({
                title: step.title.trim(),
                description: step.description.trim(),
                order: index + 1,
                minimumPhotoCount: Math.max(2, step.minimumPhotoCount ?? 2),
              })),
            },
          },
        });
        await this.events.createEvent(
          {
            type: 'TASK_CREATED',
            actorId: user.id,
            entityType: 'task',
            entityId: taskId,
            objectId: object.id,
            taskId,
            idempotencyKey: `manager:create:${input.operationId}`,
            payload: {
              action: 'TASK_CREATED',
              assigneeId: worker.id,
              position,
              priority: input.priority ?? 'NORMAL',
              accessStatus: input.accessStatus ?? 'OPEN',
            },
            metadata: {
              title: input.title.trim(),
              location: input.location.trim(),
              stepsCount: input.steps.length,
              photosCount: uploads.length,
            },
          },
          client,
        );
        for (const upload of uploads)
          await this.artifacts.createPhotoArtifactRecord(user, { taskId }, upload, client);
      });
      return this.getTask(taskId);
    } catch (error) {
      await Promise.all(
        uploads.map((upload) => this.artifacts.deleteStoredPhoto(upload.storageKey)),
      );
      throw error;
    }
  }

  async updateTask(
    user: AuthUser,
    taskId: string,
    body: {
      operationId: string;
      priority?: TaskPriority;
      accessStatus?: TaskAccessStatus;
      position?: number;
    },
  ) {
    if (!body.operationId) throw new BadRequestException('operationId is required');
    return this.database.$transaction(async (client) => {
      const task = await client.task.findFirst({ where: { id: taskId, deletedAt: null } });
      if (!task) throw new NotFoundException('Task not found');
      const existingEvent = await client.event.findUnique({
        where: { idempotencyKey: `manager:update:${body.operationId}` },
      });
      if (existingEvent) return task;
      if (body.priority && !['NORMAL', 'URGENT'].includes(body.priority))
        throw new BadRequestException('Unsupported priority');
      if (body.accessStatus && !['OPEN', 'CLOSED'].includes(body.accessStatus))
        throw new BadRequestException('Unsupported access');
      if (body.position !== undefined) await this.moveTask(client, task, body.position);
      const updated = await client.task.update({
        where: { id: task.id },
        data: { priority: body.priority, accessStatus: body.accessStatus },
      });
      const type = body.priority
        ? 'TASK_PRIORITY_CHANGED'
        : body.accessStatus === 'OPEN'
          ? 'TASK_ACCESS_OPENED'
          : 'TASK_ACCESS_CLOSED';
      await this.events.createEvent(
        {
          type,
          actorId: user.id,
          entityType: 'task',
          entityId: task.id,
          taskId: task.id,
          objectId: task.objectId,
          idempotencyKey: `manager:update:${body.operationId}`,
          payload: {
            priority: updated.priority,
            accessStatus: updated.accessStatus,
            position: updated.position,
          },
          metadata: {},
        },
        client,
      );
      return updated;
    });
  }

  async deleteTask(user: AuthUser, taskId: string, body: { operationId: string; reason?: string }) {
    if (!body.operationId) throw new BadRequestException('operationId is required');
    return this.database.$transaction(async (client) => {
      const task = await client.task.findUnique({
        where: { id: taskId },
        include: { object: true, steps: true },
      });
      if (!task) throw new NotFoundException('Task not found');
      if (task.deletedAt) return task;
      if (['ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(task.status) && !body.reason?.trim())
        throw new BadRequestException('Причина удаления обязательна');
      const assignee = task.assigneeId
        ? await client.user.findUnique({ where: { id: task.assigneeId }, select: { name: true } })
        : null;
      const updated = await client.task.update({
        where: { id: task.id },
        data: {
          deletedAt: new Date(),
          deletedByUserId: user.id,
          deletionReason: clean(body.reason),
        },
      });
      await client.task.updateMany({
        where: { assigneeId: task.assigneeId, deletedAt: null, position: { gt: task.position } },
        data: { position: { decrement: 1 } },
      });
      await this.events.createEvent(
        {
          type: 'TASK_DELETED',
          actorId: user.id,
          entityType: 'task',
          entityId: task.id,
          taskId: task.id,
          objectId: task.objectId,
          idempotencyKey: `manager:delete:${body.operationId}`,
          payload: {
            title: task.title,
            location: task.location,
            assignee: assignee?.name,
            manager: user.id,
            lifecycle: task.status,
            priority: task.priority,
            access: task.accessStatus,
            position: task.position,
            reason: clean(body.reason),
            deletedAt: updated.deletedAt,
          },
          metadata: { object: task.object?.name, stepsCount: task.steps.length },
        },
        client,
      );
      return updated;
    });
  }

  private async moveTask(
    client: Prisma.TransactionClient,
    task: { id: string; assigneeId: string | null; position: number },
    requested: number,
  ) {
    if (!Number.isInteger(requested) || requested < 1)
      throw new BadRequestException('Position must be a positive integer');
    const count = await client.task.count({
      where: { assigneeId: task.assigneeId, deletedAt: null },
    });
    const next = Math.min(requested, count);
    if (next < task.position)
      await client.task.updateMany({
        where: {
          assigneeId: task.assigneeId,
          deletedAt: null,
          position: { gte: next, lt: task.position },
          id: { not: task.id },
        },
        data: { position: { increment: 1 } },
      });
    if (next > task.position)
      await client.task.updateMany({
        where: {
          assigneeId: task.assigneeId,
          deletedAt: null,
          position: { gt: task.position, lte: next },
          id: { not: task.id },
        },
        data: { position: { decrement: 1 } },
      });
    await client.task.update({ where: { id: task.id }, data: { position: next } });
  }

  private async decorate(tasks: DecoratableTask[]) {
    const userIds = [...new Set(tasks.map((task) => task.assigneeId).filter(Boolean))] as string[];
    const taskIds = tasks.map((task) => task.id);
    const [users, photos] = await Promise.all([
      this.database.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      }),
      this.database.artifact.findMany({
        where: { taskId: { in: taskIds }, type: 'PHOTO' },
        select: {
          id: true,
          taskId: true,
          taskStepId: true,
          mimeType: true,
          originalFileName: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return tasks.map((task) => ({
      ...task,
      assignee: users.find((user) => user.id === task.assigneeId) ?? null,
      photos: photos.filter((photo) => photo.taskId === task.id),
    }));
  }
}

function encodeManagerHistoryCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    'base64url',
  );
}

function managerHistoryCursorWhere(value: string): Prisma.EventWhereInput {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: string;
      id?: string;
    };
    const createdAt = new Date(parsed.createdAt ?? '');
    if (!parsed.id || Number.isNaN(createdAt.getTime())) throw new Error();
    return {
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: parsed.id } }],
    };
  } catch {
    throw new BadRequestException('History cursor is invalid');
  }
}

function assertInput(input: ManagerTaskInput) {
  if (!input.operationId) throw new BadRequestException('operationId is required');
  if (!input.objectId || !input.assigneeId)
    throw new BadRequestException('Object and worker are required');
  if (input.title?.trim().length < 3 || input.title.trim().length > 160)
    throw new BadRequestException('Название должно содержать от 3 до 160 символов');
  if (!input.location?.trim()) throw new BadRequestException('Место обязательно');
  if (!Number.isInteger(input.position) || input.position < 1)
    throw new BadRequestException('Номер задачи должен быть положительным целым числом');
  if (
    !input.steps?.length ||
    input.steps.some((step) => !step.title?.trim() || !step.description?.trim())
  )
    throw new BadRequestException('Добавьте минимум один полностью заполненный этап');
  if (input.priority && !['NORMAL', 'URGENT'].includes(input.priority))
    throw new BadRequestException('Unsupported priority');
  if (input.accessStatus && !['OPEN', 'CLOSED'].includes(input.accessStatus))
    throw new BadRequestException('Unsupported access');
}

function clean(value?: string) {
  return value?.trim() || null;
}
