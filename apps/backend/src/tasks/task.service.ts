import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth-user.js';
import { EventService } from '../events/event.service.js';
import { EventType } from '../events/event-types.js';
import { ProcessService } from '../processes/process.service.js';
import { DatabaseService } from '../database/database.service.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TaskRecord } from './task-record.js';
import { TaskRepository } from './task.repository.js';
import { ActiveShiftAccessService } from '../work-shifts/active-shift-access.service.js';

const defaultTaskListLimit = 100;

@Injectable()
export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly events: EventService,
    private readonly processes: ProcessService,
    private readonly database?: DatabaseService,
    private readonly activeShiftAccess?: ActiveShiftAccessService,
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
      objectId: dto.objectId!,
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
    const task = await this.prepareWorkerTransition(user, id, ['ASSIGNED'], 'accept');
    const snapshot = await this.eventSnapshot(user, task);
    return this.transaction(async (client) => {
      const current = await this.repository.findById(id, client);
      if (!current || current.status !== 'ASSIGNED')
        throw new BadRequestException('Task was already accepted');
      const updated = await this.repository.update(id, { status: 'ACCEPTED' }, client);
      await this.createTaskEvent(
        user,
        updated,
        'TASK_ACCEPTED',
        'TASK_ACCEPTED',
        {},
        client,
        snapshot,
      );
      return updated;
    });
  }

  async startTask(user: AuthUser, id: string): Promise<TaskRecord> {
    const task = await this.prepareWorkerTransition(user, id, ['ACCEPTED'], 'start');
    const snapshot = await this.eventSnapshot(user, task);
    return this.transaction(async (client) => {
      const current = await this.repository.findById(id, client);
      if (!current || current.status !== 'ACCEPTED')
        throw new BadRequestException('Task was already started');
      const updated = await this.repository.update(task.id, { status: 'IN_PROGRESS' }, client);
      await this.createTaskEvent(
        user,
        updated,
        'TASK_STARTED',
        'TASK_STARTED',
        {},
        client,
        snapshot,
      );
      return updated;
    });
  }

  async sendToReview(user: AuthUser, id: string): Promise<TaskRecord> {
    const task = await this.prepareWorkerTransition(user, id, ['IN_PROGRESS'], 'send to review');
    const updated = await this.repository.update(task.id, { status: 'ON_REVIEW' });

    await this.createTaskEvent(user, updated, 'TASK_SENT_TO_REVIEW', 'TASK_SENT_TO_REVIEW');

    return updated;
  }

  async completeTask(user: AuthUser, id: string): Promise<TaskRecord> {
    const task = await this.prepareWorkerTransition(
      user,
      id,
      ['IN_PROGRESS', 'ON_REVIEW'],
      'complete',
    );
    const incompleteSteps = this.database ? await this.repository.countIncompleteSteps(task.id) : 0;
    if (incompleteSteps > 0) throw new BadRequestException('Complete all task steps first');
    const snapshot = await this.eventSnapshot(user, task);
    const updated = await this.transaction(async (client) => {
      const result = await this.repository.update(
        task.id,
        { status: 'COMPLETED', completedAt: new Date() },
        client,
      );
      await this.createTaskEvent(
        user,
        result,
        'TASK_COMPLETED',
        'TASK_COMPLETED',
        {},
        client,
        snapshot,
      );
      return result;
    });

    await this.processes.completeProcess(updated.processId);

    return updated;
  }

  async cancelTask(user: AuthUser, id: string): Promise<TaskRecord> {
    assertAuthUser(user);
    await this.activeShiftAccess?.assertActiveShift(user);

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

  listMyTasks(user: AuthUser): Promise<TaskRecord[]> {
    assertAuthUser(user);

    return this.repository.findManyByAssigneeId(user.id, defaultTaskListLimit);
  }

  private async prepareWorkerTransition(
    user: AuthUser,
    id: string,
    allowed: TaskStatus[],
    action: string,
  ): Promise<TaskRecord> {
    assertAuthUser(user);
    await this.activeShiftAccess?.assertActiveShift(user);

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
    client?: Prisma.TransactionClient,
    snapshot?: Record<string, unknown>,
  ): Promise<void> {
    await this.events.createEvent(
      {
        type,
        actorId: user.id,
        entityType: 'task',
        entityId: task.id,
        objectId: task.objectId,
        taskId: task.id,
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
          ...(snapshot ?? {}),
        },
      },
      client,
    );
  }

  private async eventSnapshot(user: AuthUser, task: TaskRecord): Promise<Record<string, unknown>> {
    if (!this.database) return { taskTitle: task.title };
    const [actor, object] = await Promise.all([
      this.database.user.findUnique({ where: { id: user.id }, select: { name: true } }),
      task.objectId
        ? this.database.constructionObject.findUnique({
            where: { id: task.objectId },
            select: { name: true },
          })
        : null,
    ]);
    return {
      actorName: actor?.name ?? null,
      objectName: object?.name ?? null,
      taskTitle: task.title,
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
  if (typeof dto.objectId !== 'string' || dto.objectId.length === 0) {
    throw new BadRequestException('Task objectId is required');
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
