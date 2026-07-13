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

export interface ManagerTaskEditInput {
  operationId: string;
  updatedAt: string;
  objectId: string;
  assigneeId: string;
  title: string;
  description?: string;
  location: string;
  priority: TaskPriority;
  accessStatus: TaskAccessStatus;
  position: number;
  reason?: string;
  removedPhotoIds?: string[];
  steps: Array<{ id?: string; title: string; description: string }>;
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
      include: { object: true, steps: { where: { deletedAt: null }, orderBy: { order: 'asc' } } },
      orderBy: [{ assigneeId: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });
    return this.decorate(tasks);
  }

  async getTask(taskId: string) {
    const task = await this.database.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        object: true,
        steps: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
        messages: true,
      },
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

  async editTask(
    user: AuthUser,
    taskId: string,
    input: ManagerTaskEditInput,
    files: UploadedArtifactFile[] = [],
  ) {
    assertEditInput(input);
    const idempotencyKey = `manager:edit:${input.operationId}`;
    const duplicate = await this.database.event.findUnique({ where: { idempotencyKey } });
    if (duplicate) return this.getTask(taskId);

    const uploads: UploadedPhotoObject[] = [];
    try {
      for (const file of files) uploads.push(await this.artifacts.uploadPhotoObject(user, file));
      await this.database.$transaction(async (client) => {
        const task = await client.task.findFirst({
          where: { id: taskId, deletedAt: null },
          include: {
            object: true,
            steps: { where: { deletedAt: null }, orderBy: [{ order: 'asc' }, { id: 'asc' }] },
          },
        });
        if (!task) throw new NotFoundException('Task not found');
        if (['COMPLETED', 'CANCELLED'].includes(task.status))
          throw new BadRequestException('Завершённую задачу нельзя редактировать.');
        if (task.updatedAt.getTime() !== new Date(input.updatedAt).getTime())
          throw new ConflictException(
            'Задача была изменена другим пользователем. Обновите данные и повторите попытку.',
          );
        if (['ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(task.status) && !input.reason?.trim())
          throw new BadRequestException('Причина изменений обязательна');

        const worker = await client.user.findFirst({
          where: { id: input.assigneeId, role: 'WORKER', isActive: true },
          select: { id: true, name: true, email: true },
        });
        const object = await client.constructionObject.findFirst({
          where: { id: input.objectId, isActive: true },
          select: { id: true, name: true },
        });
        if (!worker) throw new BadRequestException('Исполнитель недоступен');
        if (!object) throw new BadRequestException('Объект недоступен');
        if (task.status === 'IN_PROGRESS' && input.assigneeId !== task.assigneeId)
          throw new BadRequestException(
            'Задача уже находится в работе. Передача другому сотруднику будет реализована отдельно.',
          );
        if (
          ['ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(task.status) &&
          input.objectId !== task.objectId
        )
          throw new BadRequestException('После начала выполнения объект изменить нельзя');

        const changes: Array<Record<string, unknown>> = [];
        addFieldChange(changes, 'title', task.title, input.title.trim());
        addFieldChange(changes, 'description', task.description, clean(input.description));
        addFieldChange(changes, 'location', task.location, input.location.trim());
        addFieldChange(changes, 'objectId', task.objectId, input.objectId);
        addFieldChange(changes, 'assigneeId', task.assigneeId, input.assigneeId);
        addFieldChange(changes, 'priority', task.priority, input.priority);
        addFieldChange(changes, 'accessStatus', task.accessStatus, input.accessStatus);
        addFieldChange(changes, 'position', task.position, input.position);

        const existingById = new Map(task.steps.map((step) => [step.id, step]));
        const inputIds = input.steps.flatMap((step) => (step.id ? [step.id] : []));
        if (new Set(inputIds).size !== inputIds.length)
          throw new BadRequestException('Этап указан несколько раз');
        if (inputIds.some((id) => !existingById.has(id)))
          throw new BadRequestException('Этап не относится к задаче');
        for (const step of task.steps.filter((candidate) => candidate.status === 'COMPLETED')) {
          const submitted = input.steps.find((candidate) => candidate.id === step.id);
          if (
            !submitted ||
            submitted.title.trim() !== step.title ||
            clean(submitted.description) !== step.description
          )
            throw new BadRequestException('Выполненный этап нельзя изменять или удалять');
        }
        const completedIds = task.steps
          .filter((candidate) => candidate.status === 'COMPLETED')
          .map((candidate) => candidate.id);
        if (
          JSON.stringify(input.steps.slice(0, completedIds.length).map((step) => step.id)) !==
          JSON.stringify(completedIds)
        )
          throw new BadRequestException('Порядок выполненных этапов изменять нельзя');
        const current = task.steps.find((step) => step.status === 'IN_PROGRESS');
        const submittedExisting = input.steps.filter((step) => step.id).map((step) => step.id!);
        const deleted = task.steps.filter(
          (step) => step.status !== 'COMPLETED' && !submittedExisting.includes(step.id),
        );
        if (
          current &&
          deleted.some((step) => step.id === current.id) &&
          !input.steps.some((step) => !step.id || existingById.get(step.id)?.status !== 'COMPLETED')
        )
          throw new BadRequestException('Нельзя удалить единственный незавершённый этап');
        const finalExistingOrder = input.steps
          .filter((step) => step.id && existingById.get(step.id)?.status !== 'COMPLETED')
          .map((step) => step.id!);
        if (
          current &&
          !deleted.some((step) => step.id === current.id) &&
          finalExistingOrder[0] !== current.id
        )
          throw new BadRequestException(
            'Текущий этап должен оставаться первым среди незавершённых',
          );
        if (
          current &&
          !deleted.some((step) => step.id === current.id) &&
          input.steps[completedIds.length]?.id !== current.id
        )
          throw new BadRequestException('Нельзя добавлять этап перед текущим этапом');

        for (const [index, submitted] of input.steps.entries()) {
          if (!submitted.id) {
            changes.push({
              type: 'TASK_STEP_ADDED',
              after: submitted.title.trim(),
              order: index + 1,
            });
            continue;
          }
          const before = existingById.get(submitted.id)!;
          if (before.status !== 'COMPLETED') {
            if (before.title !== submitted.title.trim())
              changes.push({
                type: 'TASK_STEP_RENAMED',
                stepId: before.id,
                before: before.title,
                after: submitted.title.trim(),
                status: before.status,
              });
            if (before.description !== clean(submitted.description))
              changes.push({
                type: 'TASK_STEP_DESCRIPTION_CHANGED',
                stepId: before.id,
                stepTitle: before.title,
                before: before.description,
                after: clean(submitted.description),
                status: before.status,
              });
          }
        }
        for (const step of deleted)
          changes.push({
            type: 'TASK_STEP_DELETED',
            stepId: step.id,
            before: step.title,
            status: step.status,
          });
        const oldOrder = task.steps.map((step) => step.id);
        const newOrder = input.steps.map((step) => step.id ?? `new:${step.title.trim()}`);
        if (JSON.stringify(oldOrder) !== JSON.stringify(newOrder))
          changes.push({ type: 'TASK_STEPS_REORDERED', before: oldOrder, after: newOrder });

        const removablePhotos = input.removedPhotoIds?.length
          ? await client.artifact.findMany({
              where: {
                id: { in: input.removedPhotoIds },
                taskId: task.id,
                taskStepId: null,
              },
            })
          : [];
        if ((input.removedPhotoIds?.length ?? 0) !== removablePhotos.length)
          throw new BadRequestException('Рабочие фотографии сотрудника удалять нельзя');
        for (const photo of removablePhotos)
          changes.push({
            type: 'TASK_REFERENCE_PHOTO_REMOVED',
            photoId: photo.id,
            before: photo.originalFileName,
          });
        for (const upload of uploads)
          changes.push({ type: 'TASK_REFERENCE_PHOTO_ADDED', after: upload.file.originalname });
        if (!changes.length) throw new BadRequestException('Изменений нет.');

        if (input.assigneeId !== task.assigneeId) {
          await client.task.updateMany({
            where: {
              assigneeId: task.assigneeId,
              deletedAt: null,
              position: { gt: task.position },
            },
            data: { position: { decrement: 1 } },
          });
          const destinationCount = await client.task.count({
            where: { assigneeId: input.assigneeId, deletedAt: null },
          });
          const destinationPosition = Math.min(input.position, destinationCount + 1);
          await client.task.updateMany({
            where: {
              assigneeId: input.assigneeId,
              deletedAt: null,
              position: { gte: destinationPosition },
            },
            data: { position: { increment: 1 } },
          });
          input.position = destinationPosition;
        } else if (input.position !== task.position)
          await this.moveTask(client, task, input.position);

        const now = new Date();
        await client.task.update({
          where: { id: task.id },
          data: {
            title: input.title.trim(),
            description: clean(input.description),
            location: input.location.trim(),
            objectId: input.objectId,
            assigneeId: input.assigneeId,
            priority: input.priority,
            accessStatus: input.accessStatus,
            position: input.position,
            updatedAt: now,
          },
        });
        await client.process.update({
          where: { id: task.processId },
          data: { title: input.title.trim(), description: clean(input.description) },
        });

        for (const step of deleted)
          await client.taskStep.update({
            where: { id: step.id },
            data: {
              deletedAt: now,
              deletedByUserId: user.id,
              deletionReason: clean(input.reason) ?? 'Изменение состава этапов',
              status: 'CANCELLED',
            },
          });
        for (const [index, submitted] of input.steps.entries()) {
          if (submitted.id) {
            const before = existingById.get(submitted.id)!;
            await client.taskStep.update({
              where: { id: submitted.id },
              data: {
                order: index + 1,
                ...(before.status === 'COMPLETED'
                  ? {}
                  : { title: submitted.title.trim(), description: clean(submitted.description) }),
              },
            });
          } else {
            await client.taskStep.create({
              data: {
                taskId: task.id,
                title: submitted.title.trim(),
                description: clean(submitted.description),
                order: index + 1,
                minimumPhotoCount: 2,
              },
            });
          }
        }
        if (current && deleted.some((step) => step.id === current.id)) {
          const next = await client.taskStep.findFirst({
            where: { taskId: task.id, deletedAt: null, status: { not: 'COMPLETED' } },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
          });
          if (next)
            await client.taskStep.update({
              where: { id: next.id },
              data: { status: 'IN_PROGRESS', startedAt: next.startedAt ?? now },
            });
        }
        if (removablePhotos.length)
          await client.artifact.updateMany({
            where: { id: { in: removablePhotos.map((photo) => photo.id) } },
            data: { taskId: null },
          });
        for (const upload of uploads)
          await this.artifacts.createPhotoArtifactRecord(
            user,
            { taskId: task.id },
            upload,
            client,
            {
              eventPayload: { action: 'TASK_REFERENCE_PHOTO_ADDED' },
              eventMetadata: { taskTitle: input.title.trim(), objectName: object.name },
            },
          );

        const actor = await client.user.findUnique({
          where: { id: user.id },
          select: { name: true, email: true },
        });
        const currentStepChanged = changes.some(
          (change) =>
            change.stepId === current?.id &&
            ['TASK_STEP_DESCRIPTION_CHANGED', 'TASK_STEP_RENAMED', 'TASK_STEP_DELETED'].includes(
              String(change.type),
            ),
        );
        const summary = changeSummary(changes);
        await this.events.createEvent(
          {
            type: 'TASK_UPDATED',
            actorId: user.id,
            entityType: 'task',
            entityId: task.id,
            taskId: task.id,
            objectId: input.objectId,
            idempotencyKey,
            payload: {
              action: 'TASK_UPDATED',
              reason: clean(input.reason),
              changes: changes as Prisma.InputJsonArray,
            },
            metadata: {
              taskTitle: input.title.trim(),
              objectName: object.name,
              assigneeId: worker.id,
              assigneeName: worker.name ?? worker.email,
              actorName: actor?.name ?? actor?.email,
              reason: clean(input.reason),
              summary,
              currentStepChanged,
            },
          },
          client,
        );
        await client.taskMessage.create({
          data: {
            taskId: task.id,
            taskStepId: current?.id ?? null,
            senderId: user.id,
            recipientId: input.assigneeId,
            kind: 'TASK_UPDATED',
            body: [
              'Руководитель внёс изменения в задачу.',
              summary,
              input.reason?.trim() ? `Причина: ${input.reason.trim()}` : null,
              currentStepChanged
                ? 'Изменён текущий этап. Ознакомьтесь с обновлённым описанием перед продолжением работ.'
                : null,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        });
        if (task.assigneeId && task.assigneeId !== input.assigneeId)
          await client.taskMessage.create({
            data: {
              taskId: task.id,
              senderId: user.id,
              recipientId: task.assigneeId,
              kind: 'TASK_UPDATED',
              body: `Задача «${input.title.trim()}» передана другому исполнителю. ${summary}`,
            },
          });
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
      reason?: string;
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
      const changes: Array<Record<string, unknown>> = [];
      if (body.priority !== undefined)
        addFieldChange(changes, 'priority', task.priority, body.priority);
      if (body.accessStatus !== undefined)
        addFieldChange(changes, 'accessStatus', task.accessStatus, body.accessStatus);
      if (body.position !== undefined)
        addFieldChange(changes, 'position', task.position, body.position);
      if (!changes.length) throw new BadRequestException('Изменений нет.');
      if (['ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(task.status) && !body.reason?.trim())
        throw new BadRequestException('Причина изменений обязательна');
      if (body.position !== undefined) await this.moveTask(client, task, body.position);
      const updated = await client.task.update({
        where: { id: task.id },
        data: { priority: body.priority, accessStatus: body.accessStatus },
      });
      await this.events.createEvent(
        {
          type: 'TASK_UPDATED',
          actorId: user.id,
          entityType: 'task',
          entityId: task.id,
          taskId: task.id,
          objectId: task.objectId,
          idempotencyKey: `manager:update:${body.operationId}`,
          payload: {
            action: 'TASK_UPDATED',
            reason: clean(body.reason),
            changes: changes as Prisma.InputJsonArray,
          },
          metadata: {
            taskTitle: task.title,
            reason: clean(body.reason),
            summary: changeSummary(changes),
          },
        },
        client,
      );
      if (task.assigneeId)
        await client.taskMessage.create({
          data: {
            taskId: task.id,
            senderId: user.id,
            recipientId: task.assigneeId,
            kind: 'TASK_UPDATED',
            body: [
              'Руководитель внёс изменения в задачу.',
              changeSummary(changes),
              body.reason?.trim() ? `Причина: ${body.reason.trim()}` : null,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        });
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

function assertEditInput(input: ManagerTaskEditInput) {
  if (!input?.operationId?.trim()) throw new BadRequestException('operationId is required');
  const version = new Date(input.updatedAt);
  if (Number.isNaN(version.getTime())) throw new BadRequestException('updatedAt is required');
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
  if (!['NORMAL', 'URGENT'].includes(input.priority))
    throw new BadRequestException('Unsupported priority');
  if (!['OPEN', 'CLOSED'].includes(input.accessStatus))
    throw new BadRequestException('Unsupported access');
  if (input.removedPhotoIds && new Set(input.removedPhotoIds).size !== input.removedPhotoIds.length)
    throw new BadRequestException('Фотография указана несколько раз');
}

function addFieldChange(
  changes: Array<Record<string, unknown>>,
  field: string,
  before: unknown,
  after: unknown,
) {
  if (before !== after) changes.push({ field, before, after });
}

function changeSummary(changes: Array<Record<string, unknown>>): string {
  const fieldLabels: Record<string, string> = {
    title: 'Название задачи изменено',
    description: 'Описание задачи изменено',
    location: 'Место выполнения изменено',
    objectId: 'Объект изменён',
    assigneeId: 'Исполнитель изменён',
    priority: 'Приоритет изменён',
    accessStatus: 'Доступ изменён',
    position: 'Позиция задачи изменена',
  };
  const typeLabels: Record<string, string> = {
    TASK_STEP_ADDED: 'Добавлен этап',
    TASK_STEP_RENAMED: 'Название этапа изменено',
    TASK_STEP_DESCRIPTION_CHANGED: 'Описание этапа изменено',
    TASK_STEP_DELETED: 'Этап удалён',
    TASK_STEPS_REORDERED: 'Порядок этапов изменён',
    TASK_REFERENCE_PHOTO_ADDED: 'Добавлена исходная фотография',
    TASK_REFERENCE_PHOTO_REMOVED: 'Удалена исходная фотография',
  };
  return changes
    .map(
      (change) =>
        fieldLabels[String(change.field)] ?? typeLabels[String(change.type)] ?? 'Задача изменена',
    )
    .filter((label, index, values) => values.indexOf(label) === index)
    .join('. ');
}

function clean(value?: string) {
  return value?.trim() || null;
}
