import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { EventType } from '../events/event-types.js';
import { ProcessService } from '../processes/process.service.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TaskRecord } from './task-record.js';
import { TaskRepository } from './task.repository.js';

const defaultTaskListLimit = 100;

@Injectable()
export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly events: EventService,
    private readonly processes: ProcessService,
  ) {}

  async createTask(user: AuthUser, dto: CreateTaskDto): Promise<TaskRecord> {
    assertAuthUser(user);
    assertCreateTaskDto(dto);

    const process = await this.processes.createProcess({
      type: 'TASK',
      title: dto.title.trim(),
      description: dto.description ?? null,
    });
    const activeProcess = await this.processes.startProcess(process.id);
    const task = await this.repository.create({
      title: dto.title.trim(),
      description: dto.description ?? null,
      priority: dto.priority ?? 'NORMAL',
      creatorId: user.id,
      processId: activeProcess.id,
    });

    await this.createTaskEvent(user, task, 'TASK_CREATED', 'TASK_CREATED');

    return task;
  }

  async assignTask(user: AuthUser, id: string, dto: AssignTaskDto): Promise<TaskRecord> {
    assertAuthUser(user);
    assertTaskId(id);
    assertAssigneeDto(dto);

    const task = await this.getTask(id);
    this.assertTransition(task, ['CREATED', 'ASSIGNED'], 'assign');

    const updated = await this.repository.update(id, {
      status: 'ASSIGNED',
      assigneeId: dto.assigneeId,
    });
    await this.createTaskEvent(user, updated, 'TASK_ASSIGNED', 'TASK_ASSIGNED', {
      assigneeId: dto.assigneeId,
    });

    return updated;
  }

  async acceptTask(user: AuthUser, id: string): Promise<TaskRecord> {
    await this.prepareWorkerTransition(user, id, ['ASSIGNED'], 'accept');
    const updated = await this.repository.update(id, { status: 'ACCEPTED' });

    await this.createTaskEvent(user, updated, 'TASK_ACCEPTED', 'TASK_ACCEPTED');

    return updated;
  }

  async startTask(user: AuthUser, id: string): Promise<TaskRecord> {
    const task = await this.prepareWorkerTransition(user, id, ['ACCEPTED'], 'start');
    const updated = await this.repository.update(task.id, { status: 'IN_PROGRESS' });

    await this.createTaskEvent(user, updated, 'TASK_STARTED', 'TASK_STARTED');

    return updated;
  }

  async sendToReview(user: AuthUser, id: string): Promise<TaskRecord> {
    const task = await this.prepareWorkerTransition(user, id, ['IN_PROGRESS'], 'send to review');
    const updated = await this.repository.update(task.id, { status: 'ON_REVIEW' });

    await this.createTaskEvent(user, updated, 'TASK_UPDATED', 'TASK_SENT_TO_REVIEW');

    return updated;
  }

  async completeTask(user: AuthUser, id: string): Promise<TaskRecord> {
    const task = await this.prepareWorkerTransition(
      user,
      id,
      ['IN_PROGRESS', 'ON_REVIEW'],
      'complete',
    );
    const updated = await this.repository.update(task.id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });

    await this.processes.completeProcess(updated.processId);
    await this.createTaskEvent(user, updated, 'TASK_COMPLETED', 'TASK_COMPLETED');

    return updated;
  }

  async cancelTask(user: AuthUser, id: string): Promise<TaskRecord> {
    assertAuthUser(user);

    const task = await this.getTask(id);
    this.assertTransition(
      task,
      ['CREATED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'ON_REVIEW'],
      'cancel',
    );

    const updated = await this.repository.update(task.id, { status: 'CANCELLED' });

    await this.processes.cancelProcess(updated.processId);
    await this.createTaskEvent(user, updated, 'TASK_CANCELLED', 'TASK_CANCELLED');

    return updated;
  }

  async getTask(id: string): Promise<TaskRecord> {
    assertTaskId(id);

    const task = await this.repository.findById(id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  listTasks(): Promise<TaskRecord[]> {
    return this.repository.findMany(defaultTaskListLimit);
  }

  private async prepareWorkerTransition(
    user: AuthUser,
    id: string,
    allowed: TaskStatus[],
    action: string,
  ): Promise<TaskRecord> {
    assertAuthUser(user);

    const task = await this.getTask(id);
    this.assertTransition(task, allowed, action);
    this.assertWorkerCanAct(user, task);

    return task;
  }

  private assertTransition(task: TaskRecord, allowed: TaskStatus[], action: string): void {
    if (!allowed.includes(task.status)) {
      throw new BadRequestException(`Task cannot ${action} from status ${task.status}`);
    }
  }

  private assertWorkerCanAct(user: AuthUser, task: TaskRecord): void {
    if (user.role !== 'WORKER' || !task.assigneeId) {
      return;
    }

    if (task.assigneeId !== user.id) {
      throw new BadRequestException('Worker can act only on assigned task');
    }
  }

  private async createTaskEvent(
    user: AuthUser,
    task: TaskRecord,
    type: EventType,
    action: string,
    extraPayload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.events.createEvent({
      type,
      actorId: user.id,
      entityType: 'task',
      entityId: task.id,
      payload: {
        action,
        status: task.status,
        priority: task.priority,
        processId: task.processId,
        creatorId: task.creatorId,
        assigneeId: task.assigneeId,
        ...extraPayload,
      },
      metadata: {
        source: 'task-foundation',
      },
    });
  }
}

function assertAuthUser(user: AuthUser): void {
  if (!user?.id) {
    throw new BadRequestException('Authenticated user is required');
  }
}

function assertCreateTaskDto(dto: CreateTaskDto): void {
  if (!dto || typeof dto !== 'object') {
    throw new BadRequestException('Task body is required');
  }

  if (typeof dto.title !== 'string' || dto.title.trim().length === 0) {
    throw new BadRequestException('Task title is required');
  }

  if (
    dto.description !== undefined &&
    dto.description !== null &&
    typeof dto.description !== 'string'
  ) {
    throw new BadRequestException('Task description must be a string or null');
  }

  if (dto.priority !== undefined && !isTaskPriority(dto.priority)) {
    throw new BadRequestException('Task priority is invalid');
  }
}

function assertAssigneeDto(dto: AssignTaskDto): void {
  if (!dto || typeof dto !== 'object') {
    throw new BadRequestException('Task assignment body is required');
  }

  if (typeof dto.assigneeId !== 'string' || dto.assigneeId.trim().length === 0) {
    throw new BadRequestException('Task assigneeId is required');
  }
}

function assertTaskId(id: string): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new BadRequestException('Task id is required');
  }
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return value === 'LOW' || value === 'NORMAL' || value === 'HIGH' || value === 'CRITICAL';
}
