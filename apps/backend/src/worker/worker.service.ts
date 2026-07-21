import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { DatabaseService } from '../database/database.service.js';
import { ActiveShiftAccessService } from '../work-shifts/active-shift-access.service.js';

@Injectable()
export class WorkerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activeShiftAccess?: ActiveShiftAccessService,
  ) {}

  async getObjectsWithTasks(user: AuthUser) {
    const activeShift = await this.database.workShift.findFirst({
      where: { userId: user.id, status: 'ACTIVE', finishedAt: null },
      select: { id: true },
    });
    const objects = await this.database.constructionObject.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        tasks: {
          where: {
            deletedAt: null,
            OR: [
              {
                assigneeId: user.id,
                status: { notIn: ['COMPLETED', 'CANCELLED'] },
              },
              {
                assigneeId: null,
                status: 'ASSIGNED',
                accessStatus: 'OPEN',
              },
              ...(activeShift
                ? [
                    {
                      assigneeId: user.id,
                      status: 'COMPLETED' as const,
                      completedWorkShiftId: activeShift.id,
                    },
                  ]
                : []),
            ],
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          include: { steps: { where: { deletedAt: null }, orderBy: [{ order: 'asc' }] } },
        },
      },
    });
    const taskIds = objects.flatMap((object) => object.tasks.map((task) => task.id));
    const photos = taskIds.length
      ? await this.database.artifact.findMany({
          where: { taskId: { in: taskIds }, type: 'PHOTO' },
          select: { id: true, taskId: true, mimeType: true, originalFileName: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const allTasks = objects.flatMap((object) => object.tasks);
    const activeTask = allTasks.find(
      (task) => task.status === 'IN_PROGRESS' && task.accessStatus === 'OPEN',
    );
    const urgentTask = [...allTasks]
      .filter((task) => task.priority === 'URGENT' && task.accessStatus === 'OPEN')
      .sort(
        (left, right) =>
          left.position - right.position || left.createdAt.getTime() - right.createdAt.getTime(),
      )[0];
    return objects.map((object) => ({
      object: { id: object.id, name: object.name, sortOrder: object.sortOrder },
      activeTasksCount: object.tasks.length,
      tasks: [...object.tasks]
        .sort(
          (left, right) =>
            Number(left.status === 'COMPLETED') - Number(right.status === 'COMPLETED') ||
            left.position - right.position ||
            left.createdAt.getTime() - right.createdAt.getTime(),
        )
        .map((task) => ({
          ...task,
          isAccessLocked:
            !activeShift ||
            task.accessStatus === 'CLOSED' ||
            task.status === 'COMPLETED' ||
            (activeTask
              ? task.id !== activeTask.id
              : urgentTask
                ? task.id !== urgentTask.id
                : false),
          photos: photos.filter((photo) => photo.taskId === task.id),
        })),
    }));
  }

  async getTask(user: AuthUser, taskId: string) {
    await this.activeShiftAccess?.assertActiveShift(user);
    const task = await this.database.task.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
        OR: [
          { assigneeId: user.id },
          { assigneeId: null, status: 'ASSIGNED', accessStatus: 'OPEN' },
        ],
      },
      include: {
        object: { select: { id: true, name: true } },
        steps: { where: { deletedAt: null }, orderBy: [{ order: 'asc' }, { id: 'asc' }] },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertTaskPolicy(user.id, task);

    const senderIds = [...new Set(task.messages.map((message) => message.senderId))];
    const [artifacts, assignee, messageSenders] = await Promise.all([
      this.database.artifact.findMany({
        where: { taskId: task.id, type: 'PHOTO' },
        select: {
          id: true,
          taskStepId: true,
          uploadedBy: true,
          mimeType: true,
          originalFileName: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      task.assigneeId
        ? this.database.user.findUnique({
            where: { id: task.assigneeId },
            select: { id: true, name: true },
          })
        : null,
      this.database.user.findMany({
        where: { id: { in: senderIds } },
        select: { id: true, name: true, role: true },
      }),
    ]);
    return {
      ...task,
      assignee,
      messages: task.messages.map((message) => ({
        ...message,
        sender: messageSenders.find((sender) => sender.id === message.senderId) ?? null,
      })),
      hasWorkerProgressPhoto: artifacts.some(
        (artifact) =>
          artifact.taskStepId === null &&
          artifact.uploadedBy === user.id &&
          (!task.startedAt || artifact.createdAt >= task.startedAt),
      ),
      photos: artifacts,
      steps: task.steps.map((step) => ({
        ...step,
        photos: artifacts.filter((artifact) => artifact.taskStepId === step.id),
      })),
    };
  }

  async getHistory(user: AuthUser, query: { limit?: string; cursor?: string }) {
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException('History limit must be between 1 and 50');
    }
    let cursorWhere: Prisma.EventWhereInput | undefined;
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      cursorWhere = {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
    }
    const events = await this.database.event.findMany({
      where: { actorId: user.id, ...cursorWhere },
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
      items,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  private async assertTaskPolicy(
    userId: string,
    task: { id: string; accessStatus: string; status?: string },
  ) {
    if (task.status === 'COMPLETED') return;
    if (task.accessStatus === 'CLOSED') throw new BadRequestException('TASK_ACCESS_CLOSED');
    if (task.status === 'PAUSED') return;
    const active = await this.database.task.findFirst({
      where: {
        assigneeId: userId,
        status: 'IN_PROGRESS',
        accessStatus: 'OPEN',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (active && active.id !== task.id) throw new BadRequestException('ANOTHER_TASK_IS_ACTIVE');
    if (!active) {
      const urgent = await this.database.task.findFirst({
        where: {
          assigneeId: userId,
          priority: 'URGENT',
          accessStatus: 'OPEN',
          deletedAt: null,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      if (urgent && urgent.id !== task.id) throw new BadRequestException('URGENT_TASK_REQUIRED');
    }
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    'base64url',
  );
}

function decodeCursor(value: string): { createdAt: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const createdAt = new Date(parsed.createdAt);
    if (!parsed.id || Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException('History cursor is invalid');
  }
}
