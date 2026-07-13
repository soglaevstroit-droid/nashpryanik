import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ManagerDecision, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { DatabaseService } from '../database/database.service.js';
import { EventService } from '../events/event.service.js';
import { ActiveShiftAccessService } from '../work-shifts/active-shift-access.service.js';

@Injectable()
export class TaskMessageService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventService,
    private readonly shiftAccess: ActiveShiftAccessService,
  ) {}

  async pause(user: AuthUser, taskId: string, body: string) {
    await this.shiftAccess.assertActiveShift(user);
    const message = requiredBody(body);
    const task = await this.workerTask(user, taskId);
    if (task.status !== 'IN_PROGRESS')
      throw new BadRequestException('Only an active task can be paused');
    const step = currentStep(task.steps);
    return this.database.$transaction(async (client) => {
      const created = await client.taskMessage.create({
        data: {
          taskId,
          taskStepId: step?.id,
          senderId: user.id,
          kind: 'PAUSE_REQUEST',
          body: message,
        },
      });
      await client.task.update({ where: { id: taskId }, data: { status: 'PAUSED' } });
      await this.createEvent(client, user, task, step, 'TASK_PAUSED', created.id, message);
      return created;
    });
  }

  async help(user: AuthUser, taskId: string, body: string) {
    await this.shiftAccess.assertActiveShift(user);
    const message = requiredBody(body);
    const task = await this.workerTask(user, taskId);
    const step = currentStep(task.steps);
    return this.database.$transaction(async (client) => {
      const created = await client.taskMessage.create({
        data: {
          taskId,
          taskStepId: step?.id,
          senderId: user.id,
          kind: 'HELP_REQUEST',
          body: message,
        },
      });
      await this.createEvent(client, user, task, step, 'HELP_REQUEST', created.id, message);
      return created;
    });
  }

  async reply(user: AuthUser, messageId: string, body: string, decision: ManagerDecision) {
    const text = requiredBody(body);
    if (!['CONTINUE', 'STOP'].includes(decision))
      throw new BadRequestException('Manager decision is invalid');
    const request = await this.database.taskMessage.findUnique({
      where: { id: messageId },
      include: { task: { include: { object: true, steps: { orderBy: { order: 'asc' } } } } },
    });
    if (!request || request.kind === 'MANAGER_REPLY')
      throw new NotFoundException('Message not found');
    const duplicate = await this.database.taskMessage.findFirst({
      where: { parentId: request.id, kind: 'MANAGER_REPLY' },
    });
    if (duplicate) throw new BadRequestException('Message was already answered');
    const step =
      request.task.steps.find((candidate) => candidate.id === request.taskStepId) ?? null;
    return this.database.$transaction(async (client) => {
      const reply = await client.taskMessage.create({
        data: {
          taskId: request.taskId,
          taskStepId: request.taskStepId,
          senderId: user.id,
          parentId: request.id,
          kind: 'MANAGER_REPLY',
          body: text,
          decision,
        },
      });
      if (request.kind === 'PAUSE_REQUEST' && decision === 'CONTINUE')
        await client.task.update({
          where: { id: request.taskId },
          data: {
            status: 'IN_PROGRESS',
            isWorkBlocked: false,
            workBlockedAt: null,
            workBlockedByUserId: null,
          },
        });
      if (request.kind === 'PAUSE_REQUEST' && decision === 'STOP')
        await client.task.update({
          where: { id: request.taskId },
          data: {
            status: 'PAUSED',
            isWorkBlocked: true,
            workBlockedAt: new Date(),
            workBlockedByUserId: user.id,
          },
        });
      await this.events.createEvent(
        {
          type: 'MANAGER_REPLY',
          actorId: user.id,
          entityType: 'taskMessage',
          entityId: reply.id,
          objectId: request.task.objectId,
          taskId: request.taskId,
          taskStepId: request.taskStepId,
          payload: { action: 'MANAGER_REPLY', decision, requestId: request.id },
          metadata: {
            objectName: request.task.object?.name,
            taskTitle: request.task.title,
            stepTitle: step?.title,
            message: text,
          },
        },
        client,
      );
      return reply;
    });
  }

  workerMessages(user: AuthUser) {
    return this.database.taskMessage.findMany({
      where: { task: { assigneeId: user.id } },
      include: { task: { include: { object: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  managerMessages() {
    return this.database.taskMessage.findMany({
      where: { kind: { in: ['PAUSE_REQUEST', 'HELP_REQUEST'] } },
      include: { task: { include: { object: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async archive(user: AuthUser, manager = false) {
    const tasks = await this.database.task.findMany({
      where: { status: 'COMPLETED', ...(manager ? {} : { assigneeId: user.id }) },
      include: {
        object: true,
        steps: { orderBy: { order: 'asc' } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { completedAt: 'desc' },
    });
    const taskIds = tasks.map((task) => task.id);
    const [photos, events] = taskIds.length
      ? await Promise.all([
          this.database.artifact.findMany({
            where: { taskId: { in: taskIds }, type: 'PHOTO' },
            select: { id: true, taskId: true, taskStepId: true, originalFileName: true },
            orderBy: { createdAt: 'desc' },
          }),
          this.database.event.findMany({
            where: { taskId: { in: taskIds } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
        ])
      : [[], []];
    return tasks.map((task) => ({
      ...task,
      photos: photos.filter((photo) => photo.taskId === task.id),
      events: events.filter((event) => event.taskId === task.id),
    }));
  }

  private workerTask(user: AuthUser, taskId: string) {
    return this.database.task
      .findFirst({
        where: { id: taskId, assigneeId: user.id, deletedAt: null },
        include: { object: true, steps: { orderBy: { order: 'asc' } } },
      })
      .then((task) => task ?? Promise.reject(new NotFoundException('Task not found')));
  }

  private createEvent(
    client: Prisma.TransactionClient,
    user: AuthUser,
    task: Awaited<ReturnType<TaskMessageService['workerTask']>>,
    step: { id: string; title: string } | null | undefined,
    type: 'TASK_PAUSED' | 'HELP_REQUEST',
    messageId: string,
    body: string,
  ) {
    return this.events.createEvent(
      {
        type,
        actorId: user.id,
        entityType: 'taskMessage',
        entityId: messageId,
        objectId: task.objectId,
        taskId: task.id,
        taskStepId: step?.id,
        payload: { action: type, messageId },
        metadata: {
          objectName: task.object?.name,
          taskTitle: task.title,
          stepTitle: step?.title,
          message: body,
        },
      },
      client,
    );
  }
}

function requiredBody(value: string): string {
  const body = typeof value === 'string' ? value.trim() : '';
  if (!body) throw new BadRequestException('Message is required');
  if (body.length > 2000) throw new BadRequestException('Message is too long');
  return body;
}

function currentStep<T extends { status: string; order: number }>(steps: T[]): T | null {
  return (
    steps.find((step) => step.status === 'IN_PROGRESS') ??
    steps.find((step) => !['COMPLETED', 'CANCELLED'].includes(step.status)) ??
    null
  );
}
