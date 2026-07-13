import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStepStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { EventType } from '../events/event-types.js';
import { DatabaseService } from '../database/database.service.js';
import { TaskService } from '../tasks/task.service.js';
import { CreateTaskStepDto } from './dto/create-task-step.dto.js';
import { TaskStepRecord } from './task-step-record.js';
import { TaskStepRepository } from './task-step.repository.js';
import { ActiveShiftAccessService } from '../work-shifts/active-shift-access.service.js';
import { randomUUID } from 'node:crypto';

const defaultStepListLimit = 200;

@Injectable()
export class TaskStepService {
  constructor(
    private readonly repository: TaskStepRepository,
    private readonly events: EventService,
    private readonly tasks: TaskService,
    private readonly database?: DatabaseService,
    private readonly activeShiftAccess?: ActiveShiftAccessService,
  ) {}

  async createStep(
    user: AuthUser,
    taskId: string,
    dto: CreateTaskStepDto,
  ): Promise<TaskStepRecord> {
    assertAuthUser(user);
    assertTaskId(taskId);
    assertCreateStepDto(dto);

    await this.tasks.getTask(taskId);

    const step = await this.repository.create({
      taskId,
      title: dto.title.trim(),
      description: dto.description ?? null,
      order: dto.order,
    });

    await this.createStepEvent(user, step, 'STEP_CREATED');

    return step;
  }

  async startStep(user: AuthUser, id: string): Promise<TaskStepRecord> {
    const step = await this.prepareTransition(user, id, ['CREATED', 'REOPENED'], 'start');
    const snapshot = await this.snapshot(user, step);
    return this.transaction(async (client) => {
      const current = await this.repository.findById(id, client);
      if (!current || !['CREATED', 'REOPENED'].includes(current.status))
        throw new BadRequestException('Task step was already started');
      const updated = await this.repository.update(
        step.id,
        {
          status: 'IN_PROGRESS',
          startedAt: step.startedAt ?? new Date(),
          completedAt: null,
        },
        client,
      );
      await this.createStepEvent(user, updated, 'STEP_STARTED', client, snapshot);
      return updated;
    });
  }

  async completeStep(
    user: AuthUser,
    id: string,
    requestedOperationId?: string,
  ): Promise<TaskStepRecord> {
    assertAuthUser(user);
    await this.activeShiftAccess?.assertActiveShift(user);
    const operationId = requestedOperationId?.trim() || randomUUID();
    if (operationId.length > 120) throw new BadRequestException('operationId is invalid');
    if (!this.database) {
      const step = await this.prepareTransition(user, id, ['IN_PROGRESS'], 'complete');
      const updated = await this.repository.update(step.id, {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedByUserId: user.id,
        completionOperationId: operationId,
      });
      await this.createStepEvent(user, updated, 'STEP_COMPLETED');
      return updated;
    }
    return this.database.$transaction(async (client) => {
      const duplicate = await client.taskStep.findUnique({
        where: { completionOperationId: operationId },
      });
      if (duplicate) {
        if (duplicate.id !== id)
          throw new BadRequestException('operationId belongs to another step');
        return duplicate;
      }
      const current = await client.taskStep.findUnique({
        where: { id },
        include: {
          task: {
            include: {
              object: true,
              steps: {
                where: { deletedAt: null },
                orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              },
            },
          },
        },
      });
      if (
        !current ||
        current.deletedAt ||
        current.task.deletedAt ||
        (user.role === 'WORKER' && current.task.assigneeId !== user.id)
      )
        throw new NotFoundException('Task step not found');
      if (current.task.status === 'PAUSED' || current.task.isWorkBlocked)
        throw new BadRequestException('Работа по задаче приостановлена');
      if (current.task.status !== 'IN_PROGRESS')
        throw new BadRequestException('Start the task before working with its steps');
      if (current.status !== 'IN_PROGRESS')
        throw new BadRequestException('Task step was already completed');
      const activeSteps = current.task.steps.filter((step) => step.status === 'IN_PROGRESS');
      if (activeSteps.length !== 1 || activeSteps[0].id !== current.id)
        throw new BadRequestException('Another task step is active');
      if (
        current.task.steps.some((step) => step.order < current.order && step.status !== 'COMPLETED')
      )
        throw new BadRequestException('Complete the previous task step first');
      const photoCount = await client.artifact.count({
        where: { taskId: current.taskId, taskStepId: current.id, type: 'PHOTO' },
      });
      const requiredPhotoCount = Math.max(2, current.minimumPhotoCount);
      if (photoCount < requiredPhotoCount)
        throw new BadRequestException(photoRequirementMessage(requiredPhotoCount));
      const completedAt = new Date();
      const updated = await client.taskStep.update({
        where: { id: current.id },
        data: {
          status: 'COMPLETED',
          completedAt,
          completedByUserId: user.id,
          completionOperationId: operationId,
        },
      });
      const snapshot = await this.snapshot(user, current);
      await this.createStepEvent(
        user,
        updated,
        'STEP_COMPLETED',
        client,
        { ...snapshot, photoCount, minimumPhotoCount: requiredPhotoCount },
        `step:complete:${operationId}`,
      );
      const next = current.task.steps.find(
        (step) => step.order > current.order && !['COMPLETED', 'CANCELLED'].includes(step.status),
      );
      if (next) {
        const started = await client.taskStep.update({
          where: { id: next.id },
          data: { status: 'IN_PROGRESS', startedAt: new Date() },
        });
        await this.createStepEvent(
          user,
          started,
          'STEP_STARTED',
          client,
          { ...snapshot, stepTitle: started.title },
          `step:start-after:${operationId}`,
        );
      }
      return updated;
    });
  }

  async reopenStep(user: AuthUser, id: string): Promise<TaskStepRecord> {
    const step = await this.prepareTransition(user, id, ['COMPLETED'], 'reopen');
    const updated = await this.repository.update(step.id, {
      status: 'REOPENED',
      completedAt: null,
    });

    await this.createStepEvent(user, updated, 'STEP_REOPENED');

    return updated;
  }

  async cancelStep(user: AuthUser, id: string): Promise<TaskStepRecord> {
    const step = await this.prepareTransition(
      user,
      id,
      ['CREATED', 'IN_PROGRESS', 'REOPENED'],
      'cancel',
    );
    const updated = await this.repository.update(step.id, { status: 'CANCELLED' });

    await this.createStepEvent(user, updated, 'STEP_CANCELLED');

    return updated;
  }

  async getStep(id: string): Promise<TaskStepRecord> {
    assertStepId(id);

    const step = await this.repository.findById(id);

    if (!step) {
      throw new NotFoundException('Task step not found');
    }

    return step;
  }

  async listStepsByTask(taskId: string): Promise<TaskStepRecord[]> {
    assertTaskId(taskId);
    await this.tasks.getTask(taskId);

    return this.repository.findManyByTaskId(taskId, defaultStepListLimit);
  }

  private async prepareTransition(
    user: AuthUser,
    id: string,
    allowed: TaskStepStatus[],
    action: string,
  ): Promise<TaskStepRecord> {
    assertAuthUser(user);
    await this.activeShiftAccess?.assertActiveShift(user);

    const step = await this.getStep(id);

    if (user.role === 'WORKER' && this.database) {
      const task = await this.database.task.findUnique({
        where: { id: step.taskId },
        include: { steps: { where: { deletedAt: null }, orderBy: { order: 'asc' } } },
      });
      if (!task || task.deletedAt || task.assigneeId !== user.id)
        throw new NotFoundException('Task step not found');
      if (task.isWorkBlocked || task.status === 'PAUSED')
        throw new BadRequestException('Работа по задаче приостановлена');
      if (task.status !== 'IN_PROGRESS')
        throw new BadRequestException('Start the task before working with its steps');
      const index = task.steps.findIndex((candidate) => candidate.id === step.id);
      if (task.steps.slice(0, index).some((candidate) => candidate.status !== 'COMPLETED'))
        throw new BadRequestException('Complete the previous task step first');
      if (
        action === 'start' &&
        task.steps.some(
          (candidate) => candidate.id !== step.id && candidate.status === 'IN_PROGRESS',
        )
      )
        throw new BadRequestException('Another task step is already active');
    }

    if (!allowed.includes(step.status)) {
      throw new BadRequestException(`Task step cannot ${action} from status ${step.status}`);
    }

    return step;
  }

  private async createStepEvent(
    user: AuthUser,
    step: TaskStepRecord,
    type: EventType,
    client?: Prisma.TransactionClient,
    snapshot?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.events.createEvent(
      {
        type,
        actorId: user.id,
        entityType: 'task_step',
        entityId: step.id,
        taskId: step.taskId,
        taskStepId: step.id,
        idempotencyKey,
        payload: {
          taskId: step.taskId,
          status: step.status,
          order: step.order,
        },
        metadata: {
          source: 'task-step-foundation',
          ...(snapshot ?? {}),
        },
      },
      client,
    );
  }

  private async snapshot(user: AuthUser, step: TaskStepRecord): Promise<Record<string, unknown>> {
    if (!this.database) return { stepTitle: step.title };
    const task = await this.database.task.findUnique({
      where: { id: step.taskId },
      include: { object: true },
    });
    if (user.role === 'WORKER' && task?.assigneeId !== user.id)
      throw new BadRequestException('Worker can act only on assigned task');
    const actor = await this.database.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    });
    return {
      actorName: actor?.name ?? null,
      objectName: task?.object?.name ?? null,
      taskTitle: task?.title ?? null,
      stepTitle: step.title,
    };
  }

  private transaction<T>(
    action: (client: Prisma.TransactionClient | undefined) => Promise<T>,
  ): Promise<T> {
    return this.database
      ? this.database.$transaction((client) => action(client))
      : action(undefined);
  }
}

function photoRequirementMessage(count: number): string {
  const word =
    count % 10 === 1 && count % 100 !== 11
      ? 'фотографию'
      : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
        ? 'фотографии'
        : 'фотографий';
  return `Загрузите минимум ${count} ${word}, чтобы завершить этап.`;
}

function assertAuthUser(user: AuthUser): void {
  if (!user?.id) {
    throw new BadRequestException('Authenticated user is required');
  }
}

function assertCreateStepDto(dto: CreateTaskStepDto): void {
  if (!dto || typeof dto !== 'object') {
    throw new BadRequestException('Task step body is required');
  }

  if (typeof dto.title !== 'string' || dto.title.trim().length === 0) {
    throw new BadRequestException('Task step title is required');
  }

  if (
    dto.description !== undefined &&
    dto.description !== null &&
    typeof dto.description !== 'string'
  ) {
    throw new BadRequestException('Task step description must be a string or null');
  }

  if (!Number.isInteger(dto.order) || dto.order < 1) {
    throw new BadRequestException('Task step order must be a positive integer');
  }
}

function assertTaskId(taskId: string): void {
  if (typeof taskId !== 'string' || taskId.trim().length === 0) {
    throw new BadRequestException('Task id is required');
  }
}

function assertStepId(id: string): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new BadRequestException('Task step id is required');
  }
}
