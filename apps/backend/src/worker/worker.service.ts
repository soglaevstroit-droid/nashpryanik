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
    const objects = await this.database.constructionObject.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        tasks: {
          where: {
            assigneeId: user.id,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
          orderBy: [{ createdAt: 'desc' }],
          include: { steps: { orderBy: [{ order: 'asc' }] } },
        },
      },
    });
    const taskIds = objects.flatMap((object) => object.tasks.map((task) => task.id));
    const photos = taskIds.length
      ? await this.database.artifact.findMany({
          where: { taskId: { in: taskIds }, taskStepId: null, type: 'PHOTO' },
          select: { id: true, taskId: true, mimeType: true, originalFileName: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    return objects.map((object) => ({
      object: { id: object.id, name: object.name, sortOrder: object.sortOrder },
      activeTasksCount: object.tasks.length,
      tasks: object.tasks.map((task) => ({
        ...task,
        photos: photos.filter((photo) => photo.taskId === task.id),
      })),
    }));
  }

  async getTask(user: AuthUser, taskId: string) {
    await this.activeShiftAccess?.assertActiveShift(user);
    const task = await this.database.task.findFirst({
      where: { id: taskId, assigneeId: user.id },
      include: {
        object: { select: { id: true, name: true } },
        steps: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!task) throw new NotFoundException('Task not found');

    const [artifacts, assignee] = await Promise.all([
      this.database.artifact.findMany({
        where: { taskId: task.id, type: 'PHOTO' },
        select: {
          id: true,
          taskStepId: true,
          mimeType: true,
          originalFileName: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      task.assigneeId
        ? this.database.user.findUnique({
            where: { id: task.assigneeId },
            select: { id: true, name: true },
          })
        : null,
    ]);
    return {
      ...task,
      assignee,
      photos: artifacts.filter((artifact) => !artifact.taskStepId),
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
