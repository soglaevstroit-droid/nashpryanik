import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TaskStepStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { EventType } from '../events/event-types.js';
import { TaskService } from '../tasks/task.service.js';
import { CreateTaskStepDto } from './dto/create-task-step.dto.js';
import { TaskStepRecord } from './task-step-record.js';
import { TaskStepRepository } from './task-step.repository.js';

const defaultStepListLimit = 200;

@Injectable()
export class TaskStepService {
  constructor(
    private readonly repository: TaskStepRepository,
    private readonly events: EventService,
    private readonly tasks: TaskService,
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
    const updated = await this.repository.update(step.id, {
      status: 'IN_PROGRESS',
      startedAt: step.startedAt ?? new Date(),
      completedAt: null,
    });

    await this.createStepEvent(user, updated, 'STEP_STARTED');

    return updated;
  }

  async completeStep(user: AuthUser, id: string): Promise<TaskStepRecord> {
    const step = await this.prepareTransition(user, id, ['IN_PROGRESS'], 'complete');
    const updated = await this.repository.update(step.id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });

    await this.createStepEvent(user, updated, 'STEP_COMPLETED');

    return updated;
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

    const step = await this.getStep(id);

    if (!allowed.includes(step.status)) {
      throw new BadRequestException(`Task step cannot ${action} from status ${step.status}`);
    }

    return step;
  }

  private async createStepEvent(
    user: AuthUser,
    step: TaskStepRecord,
    type: EventType,
  ): Promise<void> {
    await this.events.createEvent({
      type,
      actorId: user.id,
      entityType: 'task_step',
      entityId: step.id,
      payload: {
        taskId: step.taskId,
        status: step.status,
        order: step.order,
      },
      metadata: {
        source: 'task-step-foundation',
      },
    });
  }
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
