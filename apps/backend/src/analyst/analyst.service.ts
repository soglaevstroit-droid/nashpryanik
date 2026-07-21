import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';
import {
  calculateTaskCostSnapshot,
  TaskCostSnapshot,
  TaskCostStatus,
} from '../tasks/task-cost-policy.js';
import {
  calculateActiveCoinUnits,
  COIN_UNITS_PER_COIN,
  COIN_UNITS_PER_SECOND,
  DAILY_STANDARD_LIMIT_COIN_UNITS,
} from '../work-shifts/coin-policy.js';

const timelineEventTypes = [
  'WORK_SHIFT_STARTED',
  'TASK_STARTED',
  'PHOTO_UPLOADED',
  'TASK_PAUSED',
  'TASK_RESUMED',
  'MANAGER_REPLY',
  'TASK_COMPLETED',
  'WORK_SHIFT_FINISHED',
] as const;

type AnalystStatus =
  'RESTING' | 'ON_SHIFT' | 'WORKING' | 'PAUSED' | 'WAITING_FOR_RESPONSE' | 'SHIFT_COMPLETED';

type ShiftRow = Prisma.WorkShiftGetPayload<{
  include: {
    photos: { include: { artifact: true } };
    accrual: true;
    completedTasks: { select: { id: true } };
  };
}>;

type TimelineEvent = Prisma.EventGetPayload<{
  include: { artifacts: true };
}>;

type TimelineTask = Prisma.TaskGetPayload<{
  select: {
    id: true;
    title: true;
    location: true;
    assigneeId: true;
    startedAt: true;
    completedAt: true;
    deletedAt: true;
    object: { select: { name: true } };
  };
}>;

type TimelineArtifact = Prisma.ArtifactGetPayload<{
  include: { event: { select: { payload: true; metadata: true } } };
}>;

interface ShiftOwner {
  id: string;
  email: string;
  name: string | null;
}

interface TimelineFrame {
  id: string;
  kind: string;
  occurredAt: Date;
  title: string;
  description: string | null;
  task: { id: string; title: string } | null;
  artifact: {
    id: string;
    previewUrl: string;
    originalUrl: string;
    originalFileName: string;
  } | null;
  reason: string | null;
  comment?: string | null;
  taskDurationMinutes: number | null;
  taskCoins: number | null;
  taskCoinsState: 'PENDING' | 'AVAILABLE';
  taskCostCoins?: number | null;
  appliedRate?: number | null;
  costStatus?: TaskCostStatus | null;
  metadata: Record<string, unknown>;
}

@Injectable()
export class AnalystService {
  constructor(private readonly database: DatabaseService) {}

  async getSummary(now = new Date()) {
    const dayStart = startOfUtcDay(now);
    const [workers, approvedAccruals, activeShifts] = await Promise.all([
      this.database.user.findMany({
        where: { role: 'WORKER' },
        select: { id: true, isActive: true, openingBalanceCoinUnits: true },
      }),
      this.database.shiftAccrual.findMany({
        where: { status: 'APPROVED' },
        select: {
          workerId: true,
          standardCoinUnits: true,
          calculatedOvertimeCoinUnits: true,
          analystFinalOvertimeUnits: true,
          overtimeDecision: true,
          workShift: { select: { status: true, finishedAt: true } },
        },
      }),
      this.database.workShift.findMany({
        where: { status: 'ACTIVE', startedAt: { lte: now } },
        select: { userId: true, startedAt: true },
      }),
    ]);

    const workerIds = new Set(workers.map((worker) => worker.id));
    const activeWorkers = workers.filter((worker) => worker.isActive);
    const activeWorkerIds = new Set(activeWorkers.map((worker) => worker.id));
    const confirmedHistorical = approvedAccruals.filter(
      (accrual) =>
        workerIds.has(accrual.workerId) &&
        accrual.workShift.status === 'FINISHED' &&
        accrual.workShift.finishedAt &&
        accrual.workShift.finishedAt <= now,
    );
    const totalEarnedCoinUnits = confirmedHistorical.reduce(
      (sum, accrual) => sum + confirmedAccrualCoinUnits(accrual),
      0,
    );
    const currentWorkerBalanceCoinUnits =
      activeWorkers.reduce((sum, worker) => sum + worker.openingBalanceCoinUnits, 0) +
      approvedAccruals.reduce(
        (sum, accrual) =>
          activeWorkerIds.has(accrual.workerId) ? sum + accrual.standardCoinUnits : sum,
        0,
      );
    const finishedTodayCoinUnits = confirmedHistorical.reduce((sum, accrual) => {
      const finishedAt = accrual.workShift.finishedAt!;
      return finishedAt >= dayStart && finishedAt <= now
        ? sum + confirmedAccrualCoinUnits(accrual)
        : sum;
    }, 0);
    const activeTodayCoinUnits = activeShifts.reduce(
      (sum, shift) =>
        workerIds.has(shift.userId)
          ? sum + calculateActiveCoinUnits(shift.startedAt, now).standardCoinUnits
          : sum,
      0,
    );

    return {
      totalEarnedCoins: coinUnitsToCoins(totalEarnedCoinUnits),
      currentWorkerBalanceCoins: coinUnitsToCoins(currentWorkerBalanceCoinUnits),
      earnedTodayCoins: coinUnitsToCoins(finishedTodayCoinUnits + activeTodayCoinUnits),
      calculatedAt: now,
      live: {
        coinUnitsPerSecond: COIN_UNITS_PER_SECOND,
        dailyStandardLimitCoinUnits: DAILY_STANDARD_LIMIT_COIN_UNITS,
        activeShifts: activeShifts
          .filter((shift) => workerIds.has(shift.userId))
          .map((shift) => ({ startedAt: shift.startedAt })),
      },
    };
  }

  async getLiveWorkers(now = new Date()) {
    const workers = await this.database.user.findMany({
      where: { role: 'WORKER', isActive: true },
      select: { id: true, email: true, name: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
    if (!workers.length) return [];

    const workerIds = workers.map((worker) => worker.id);
    const [allShifts, currentTasks] = await Promise.all([
      this.database.workShift.findMany({
        where: { userId: { in: workerIds } },
        include: {
          photos: { include: { artifact: true }, orderBy: { createdAt: 'asc' } },
          accrual: true,
          completedTasks: { select: { id: true } },
        },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
      this.database.task.findMany({
        where: {
          assigneeId: { in: workerIds },
          status: { in: ['IN_PROGRESS', 'PAUSED'] },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          assigneeId: true,
          status: true,
          isWorkBlocked: true,
        },
      }),
    ]);

    const shifts = workers.flatMap((worker) => {
      const candidates = allShifts.filter((shift) => shift.userId === worker.id);
      const active = candidates.find((shift) => shift.status === 'ACTIVE');
      const finishedToday = candidates.find(
        (shift) => shift.finishedAt && sameUtcDay(shift.finishedAt, now),
      );
      return active ? [active] : finishedToday ? [finishedToday] : [];
    });
    const timelines = await this.buildTimelines(shifts, workers, now);

    return workers
      .map((worker) => {
        const shift = shifts.find((candidate) => candidate.userId === worker.id) ?? null;
        const task =
          shift?.status === 'ACTIVE'
            ? (currentTasks.find(
                (candidate) =>
                  candidate.assigneeId === worker.id && candidate.status === 'IN_PROGRESS',
              ) ??
              currentTasks.find(
                (candidate) => candidate.assigneeId === worker.id && candidate.status === 'PAUSED',
              ) ??
              null)
            : null;
        const status = resolveStatus(shift, task);
        return {
          worker: { ...worker, avatar: null },
          status,
          statusLabel: statusLabel(status),
          activeShift: shift ? shiftSummary(shift, now) : null,
          activeTask: task ? { id: task.id, title: task.title, lifecycle: task.status } : null,
          timeline: shift ? (timelines.get(shift.id) ?? []) : [],
        };
      })
      .sort(
        (left, right) =>
          statusRank(left.status) - statusRank(right.status) ||
          displayName(left.worker).localeCompare(displayName(right.worker), 'ru'),
      );
  }

  async getShiftHistory() {
    const [workers, shifts] = await Promise.all([
      this.database.user.findMany({
        where: { role: 'WORKER' },
        select: { id: true, email: true, name: true },
      }),
      this.database.workShift.findMany({
        where: { status: 'FINISHED' },
        include: {
          photos: { include: { artifact: true }, orderBy: { createdAt: 'asc' } },
          accrual: true,
          completedTasks: { select: { id: true } },
        },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
    ]);
    const workerMap = new Map(workers.map((worker) => [worker.id, worker]));
    return shifts.flatMap((shift) => {
      const worker = workerMap.get(shift.userId);
      if (!worker) return [];
      return [{ worker: { ...worker, avatar: null }, ...shiftSummary(shift, shift.finishedAt!) }];
    });
  }

  async getShift(shiftId: string) {
    if (!shiftId) throw new BadRequestException('Shift id is required');
    const shift = await this.database.workShift.findUnique({
      where: { id: shiftId },
      include: {
        photos: { include: { artifact: true }, orderBy: { createdAt: 'asc' } },
        accrual: true,
        completedTasks: { select: { id: true } },
      },
    });
    if (!shift) throw new NotFoundException('Work shift not found');
    const worker = await this.database.user.findFirst({
      where: { id: shift.userId, role: 'WORKER' },
      select: { id: true, email: true, name: true },
    });
    if (!worker) throw new NotFoundException('Worker not found');
    const now = shift.finishedAt ?? new Date();
    const timelines = await this.buildTimelines([shift], [worker], now);
    return {
      worker: { ...worker, avatar: null },
      shift: shiftSummary(shift, now),
      timeline: timelines.get(shift.id) ?? [],
    };
  }

  private async buildTimelines(shifts: ShiftRow[], workers: ShiftOwner[], now: Date) {
    const result = new Map<string, TimelineFrame[]>();
    if (!shifts.length) return result;
    const earliest = new Date(Math.min(...shifts.map((shift) => shift.startedAt.getTime())));
    const latest = new Date(
      Math.max(...shifts.map((shift) => (shift.finishedAt ?? now).getTime())),
    );
    const events = await this.database.event.findMany({
      where: {
        type: { in: [...timelineEventTypes] },
        createdAt: { gte: earliest, lte: latest },
      },
      include: { artifacts: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const taskIds = [...new Set(events.flatMap((event) => (event.taskId ? [event.taskId] : [])))];
    const [tasks, artifacts, taskEvents] = taskIds.length
      ? await Promise.all([
          this.database.task.findMany({
            where: { id: { in: taskIds } },
            select: {
              id: true,
              title: true,
              location: true,
              assigneeId: true,
              startedAt: true,
              completedAt: true,
              deletedAt: true,
              object: { select: { name: true } },
            },
          }),
          this.database.artifact.findMany({
            where: { taskId: { in: taskIds }, type: 'PHOTO' },
            include: { event: { select: { payload: true, metadata: true } } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
          this.database.event.findMany({
            where: {
              taskId: { in: taskIds },
              type: {
                in: [
                  'TASK_STARTED',
                  'TASK_PAUSED',
                  'TASK_RESUMED',
                  'MANAGER_REPLY',
                  'TASK_COMPLETED',
                ],
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
        ])
      : [[], [], []];
    const taskMap = new Map((tasks as TimelineTask[]).map((task) => [task.id, task]));
    const workerMap = new Map(workers.map((worker) => [worker.id, worker]));

    for (const shift of shifts) {
      const owner = workerMap.get(shift.userId);
      if (!owner) continue;
      const end = shift.finishedAt ?? now;
      const shiftEvents = (events as TimelineEvent[]).filter((event) => {
        if (event.createdAt < shift.startedAt || event.createdAt > end) return false;
        if (event.workShiftId === shift.id) return true;
        if (event.actorId === shift.userId) return true;
        return Boolean(event.taskId && taskMap.get(event.taskId)?.assigneeId === shift.userId);
      });
      const frames = shiftEvents.flatMap((event) => {
        const frame = this.toFrame(
          event,
          shift,
          owner,
          taskMap,
          artifacts as TimelineArtifact[],
          taskEvents,
        );
        return frame ? [frame] : [];
      });
      const timeline = deduplicateFrames(frames);
      if (!timeline.some((frame) => frame.kind === 'WORK_SHIFT_STARTED'))
        timeline.unshift(syntheticShiftFrame(shift, owner, 'START'));
      if (shift.finishedAt && !timeline.some((frame) => frame.kind === 'SHIFT_COMPLETED'))
        timeline.push(syntheticShiftFrame(shift, owner, 'FINISH'));
      timeline.sort(
        (left, right) =>
          left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id),
      );
      const groupedTimeline = addTaskSectionFrames(
        timeline,
        owner,
        taskMap,
        artifacts as TimelineArtifact[],
        taskEvents,
      );
      if (shift.finishedAt)
        groupedTimeline.push(
          shiftSectionSummaryFrame(shift, owner, groupedTimeline, artifacts as TimelineArtifact[]),
        );
      result.set(shift.id, groupedTimeline);
    }
    return result;
  }

  private toFrame(
    event: TimelineEvent,
    shift: ShiftRow,
    owner: ShiftOwner,
    taskMap: Map<string, TimelineTask>,
    artifacts: TimelineArtifact[],
    taskEvents: Array<{ taskId: string | null; type: string; createdAt: Date }>,
  ): TimelineFrame | null {
    const payload = jsonObject(event.payload);
    const metadata = jsonObject(event.metadata);
    const task = event.taskId ? (taskMap.get(event.taskId) ?? null) : null;
    const taskArtifacts = task ? artifacts.filter((artifact) => artifact.taskId === task.id) : [];
    const purpose = String(payload.purpose ?? metadata.purpose ?? '');
    if (
      event.type === 'PHOTO_UPLOADED' &&
      (!task || purpose === 'TASK_COMPLETION' || event.artifacts[0]?.uploadedBy !== owner.id)
    )
      return null;
    if (event.type === 'MANAGER_REPLY' && payload.decision !== 'CONTINUE') return null;

    const name = firstName(owner);
    let kind: string = event.type;
    let title = '';
    let description: string | null = task?.title ?? null;
    let reason: string | null = null;
    let comment: string | null = null;
    let artifact: { id: string; originalFileName: string } | null = event.artifacts[0] ?? null;
    let duration: number | null = null;
    let taskCost: TaskCostSnapshot | null = null;

    if (event.type === 'WORK_SHIFT_STARTED') {
      title = `${name} начал работу`;
      description = 'Начало смены';
      artifact = shift.photos.find((photo) => photo.type === 'START')?.artifact ?? null;
    } else if (event.type === 'TASK_STARTED' && task) {
      title = `${name} начал задачу`;
      artifact = firstArtifact(taskArtifacts, event.createdAt);
    } else if (event.type === 'PHOTO_UPLOADED' && task) {
      kind = 'TASK_PHOTO_ADDED';
      title = 'Задача выполняется';
      comment = stringValue(metadata.comment) ?? stringValue(payload.comment);
      artifact ??= latestArtifact(taskArtifacts, event.createdAt);
    } else if (event.type === 'TASK_PAUSED' && task) {
      title = 'Задача поставлена на паузу';
      reason = stringValue(payload.reason) ?? stringValue(metadata.reason);
      artifact = latestArtifact(taskArtifacts, event.createdAt);
    } else if (event.type === 'TASK_RESUMED' && task) {
      title = 'Работа продолжена';
      reason = stringValue(payload.reason) ?? stringValue(metadata.reason);
      artifact = latestArtifact(taskArtifacts, event.createdAt);
    } else if (event.type === 'MANAGER_REPLY' && task) {
      kind = 'TASK_RESUMED';
      title = 'Руководитель разрешил продолжить работу';
      reason = stringValue(metadata.message);
      artifact = latestArtifact(taskArtifacts, event.createdAt);
    } else if (event.type === 'TASK_COMPLETED' && task) {
      title = 'Задача выполнена';
      const completionPhotoId =
        stringValue(payload.artifactId) ?? stringValue(metadata.completionPhotoId);
      artifact =
        taskArtifacts.find((candidate) => candidate.id === completionPhotoId) ??
        latestArtifact(taskArtifacts, event.createdAt);
      taskCost = resolveTaskCostSnapshot(
        metadata,
        task.id,
        taskEvents,
        task.startedAt,
        event.createdAt,
      );
      duration = taskCost.taskWorkMinutes;
    } else if (event.type === 'WORK_SHIFT_FINISHED') {
      kind = 'SHIFT_COMPLETED';
      title = `${displayName(owner)} завершил работу`;
      description = null;
      artifact = shift.photos.find((photo) => photo.type === 'FINISH')?.artifact ?? null;
    } else {
      return null;
    }

    return {
      id: event.id,
      kind,
      occurredAt: event.createdAt,
      title,
      description,
      task: task ? { id: task.id, title: task.title } : null,
      artifact: artifact ? artifactView(artifact) : null,
      reason,
      comment,
      taskDurationMinutes: duration,
      taskCoins: taskCost?.taskCostCoinUnits ?? null,
      taskCoinsState: taskCost?.costStatus === 'CALCULATED' ? 'AVAILABLE' : 'PENDING',
      taskCostCoins: taskCost?.taskCostCoins ?? null,
      appliedRate: taskCost?.appliedRate ?? null,
      costStatus: taskCost?.costStatus ?? null,
      metadata: {},
    };
  }
}

function resolveStatus(
  shift: ShiftRow | null,
  task: { status: string; isWorkBlocked: boolean } | null,
): AnalystStatus {
  if (!shift) return 'RESTING';
  if (shift.status === 'FINISHED') return 'SHIFT_COMPLETED';
  if (task?.status === 'IN_PROGRESS') return 'WORKING';
  if (task?.status === 'PAUSED') return task.isWorkBlocked ? 'PAUSED' : 'WAITING_FOR_RESPONSE';
  return 'ON_SHIFT';
}

function statusLabel(status: AnalystStatus) {
  return {
    RESTING: 'Отдыхает',
    ON_SHIFT: 'На смене',
    WORKING: 'Выполняет задачу',
    PAUSED: 'Пауза',
    WAITING_FOR_RESPONSE: 'Ожидает ответа',
    SHIFT_COMPLETED: 'Смена завершена',
  }[status];
}

function statusRank(status: AnalystStatus) {
  return [
    'WORKING',
    'PAUSED',
    'WAITING_FOR_RESPONSE',
    'ON_SHIFT',
    'SHIFT_COMPLETED',
    'RESTING',
  ].indexOf(status);
}

function displayName(worker: ShiftOwner) {
  return worker.name?.trim() || worker.email;
}

function firstName(worker: ShiftOwner) {
  return displayName(worker).split(/\s+/)[0];
}

function shiftSummary(shift: ShiftRow, now: Date) {
  return {
    id: shift.id,
    status: shift.status,
    startedAt: shift.startedAt,
    finishedAt: shift.finishedAt,
    durationMinutes: durationMinutes(shift.startedAt, shift.finishedAt ?? now),
    completedTaskCount: shift.completedTasks.length,
    coinUnits: shiftCoinUnits(shift),
    coinState: shift.accrual?.status ?? 'PENDING',
  };
}

function shiftCoinUnits(shift: ShiftRow) {
  if (!shift.accrual) return null;
  const standard =
    shift.accrual.status === 'APPROVED'
      ? shift.accrual.standardCoinUnits
      : shift.accrual.calculatedStandardCoinUnits;
  const overtime =
    shift.accrual.analystFinalOvertimeUnits ?? shift.accrual.calculatedOvertimeCoinUnits;
  return standard + overtime;
}

function artifactView(artifact: { id: string; originalFileName: string }) {
  return {
    id: artifact.id,
    previewUrl: `/api/v1/artifacts/${artifact.id}/preview`,
    originalUrl: `/api/v1/artifacts/${artifact.id}`,
    originalFileName: artifact.originalFileName,
  };
}

function firstArtifact(artifacts: TimelineArtifact[], at: Date) {
  return artifacts.find((artifact) => artifact.createdAt <= at) ?? null;
}

function latestArtifact(artifacts: TimelineArtifact[], at: Date) {
  return artifacts.filter((artifact) => artifact.createdAt <= at).at(-1) ?? null;
}

function resolveTaskCostSnapshot(
  metadata: Record<string, unknown>,
  taskId: string,
  events: Array<{
    taskId: string | null;
    type: string;
    createdAt: Date;
    payload?: Prisma.JsonValue;
  }>,
  startedAt: Date | null,
  completedAt: Date,
): TaskCostSnapshot {
  const storedStatus = costStatusValue(metadata.costStatus);
  if (storedStatus) {
    const stored: TaskCostSnapshot = {
      costStatus: storedStatus,
      taskWorkSeconds: finiteNumber(metadata.taskWorkSeconds),
      taskWorkMinutes: finiteNumber(metadata.taskWorkMinutes),
      taskCostCoinUnits: finiteNumber(metadata.taskCostCoinUnits),
      taskCostCoins: finiteNumber(metadata.taskCostCoins),
      appliedCoinUnitsPerSecond: finiteNumber(metadata.appliedCoinUnitsPerSecond),
      appliedHourlyRateCoinUnits: finiteNumber(metadata.appliedHourlyRateCoinUnits),
      appliedRate: finiteNumber(metadata.appliedRate),
    };
    if (
      storedStatus !== 'CALCULATED' ||
      (stored.taskWorkSeconds !== null &&
        stored.taskWorkMinutes !== null &&
        stored.taskCostCoinUnits !== null &&
        stored.taskCostCoins !== null &&
        stored.appliedRate !== null)
    )
      return stored;
    return {
      ...stored,
      costStatus: 'DATA_INCOMPLETE',
      taskCostCoinUnits: null,
      taskCostCoins: null,
    };
  }
  return calculateTaskCostSnapshot({
    startedAt,
    completedAt,
    events: events.filter((event) => event.taskId === taskId),
    coinUnitsPerSecond: null,
  });
}

function costStatusValue(value: unknown): TaskCostStatus | null {
  return ['CALCULATED', 'RATE_NOT_AVAILABLE', 'DATA_INCOMPLETE'].includes(String(value))
    ? (value as TaskCostStatus)
    : null;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function durationMinutes(start: Date, finish: Date | null) {
  return finish ? Math.max(0, Math.round((finish.getTime() - start.getTime()) / 60_000)) : null;
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sameUtcDay(left: Date, right: Date) {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function confirmedAccrualCoinUnits(accrual: {
  standardCoinUnits: number;
  calculatedOvertimeCoinUnits: number;
  analystFinalOvertimeUnits: number | null;
  overtimeDecision: string;
}) {
  const overtimeCoinUnits = ['APPROVED', 'ADJUSTED'].includes(accrual.overtimeDecision)
    ? (accrual.analystFinalOvertimeUnits ?? accrual.calculatedOvertimeCoinUnits)
    : 0;
  return accrual.standardCoinUnits + overtimeCoinUnits;
}

function coinUnitsToCoins(units: number) {
  return units / COIN_UNITS_PER_COIN;
}

function deduplicateFrames(frames: TimelineFrame[]) {
  const seen = new Set<string>();
  return frames.filter((frame) => {
    const key = `${frame.kind}:${frame.artifact?.id ?? frame.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addTaskSectionFrames(
  frames: TimelineFrame[],
  owner: ShiftOwner,
  taskMap: Map<string, TimelineTask>,
  artifacts: TimelineArtifact[],
  taskEvents: Array<{ taskId: string | null; type: string; createdAt: Date }>,
) {
  const result: TimelineFrame[] = [];
  const seenTasks = new Set<string>();
  let previousTaskId: string | null = null;

  for (const frame of frames) {
    const taskId = frame.task?.id ?? null;
    const task = taskId ? taskMap.get(taskId) : null;
    if (!taskId || !task) {
      result.push(frame);
      continue;
    }

    if (!seenTasks.has(taskId)) {
      result.push(taskSectionStartFrame(task, owner, frame.occurredAt));
      seenTasks.add(taskId);
    } else if (previousTaskId && previousTaskId !== taskId && frame.kind === 'TASK_RESUMED') {
      result.push(taskSectionReturnFrame(task, owner, frame));
    }

    result.push(frame);
    if (frame.kind === 'TASK_COMPLETED') {
      const startedAt =
        task.startedAt ??
        taskEvents.find((event) => event.taskId === taskId && event.type === 'TASK_STARTED')
          ?.createdAt ??
        frame.occurredAt;
      const taskArtifacts = artifacts.filter(
        (artifact) =>
          artifact.taskId === taskId &&
          artifact.uploadedBy === owner.id &&
          artifact.createdAt >= startedAt &&
          artifact.createdAt <= frame.occurredAt,
      );
      const pauseCount = taskEvents.filter(
        (event) =>
          event.taskId === taskId &&
          event.type === 'TASK_PAUSED' &&
          event.createdAt >= startedAt &&
          event.createdAt <= frame.occurredAt,
      ).length;
      result.push(
        taskSectionSummaryFrame(task, owner, frame, startedAt, taskArtifacts.length, pauseCount),
      );
    }
    previousTaskId = taskId;
  }

  return result;
}

function taskSectionStartFrame(task: TimelineTask, owner: ShiftOwner, occurredAt: Date) {
  return {
    id: `task-section-start:${task.id}`,
    kind: 'TASK_SECTION_START',
    occurredAt,
    title: 'Новая задача',
    description: task.title,
    task: { id: task.id, title: task.title },
    artifact: null,
    reason: null,
    taskDurationMinutes: null,
    taskCoins: null,
    taskCoinsState: 'PENDING' as const,
    metadata: taskSectionMetadata(task, owner, {
      startedAt: task.startedAt ?? occurredAt,
    }),
  } satisfies TimelineFrame;
}

function taskSectionReturnFrame(task: TimelineTask, owner: ShiftOwner, frame: TimelineFrame) {
  return {
    id: `task-section-return:${task.id}:${frame.id}`,
    kind: 'TASK_SECTION_RETURN',
    occurredAt: frame.occurredAt,
    title: 'Возврат к задаче',
    description: task.title,
    task: { id: task.id, title: task.title },
    artifact: null,
    reason: frame.reason,
    taskDurationMinutes: null,
    taskCoins: null,
    taskCoinsState: 'PENDING' as const,
    metadata: taskSectionMetadata(task, owner, { resumedAt: frame.occurredAt }),
  } satisfies TimelineFrame;
}

function taskSectionSummaryFrame(
  task: TimelineTask,
  owner: ShiftOwner,
  completedFrame: TimelineFrame,
  startedAt: Date,
  photoCount: number,
  pauseCount: number,
) {
  return {
    id: `task-section-summary:${task.id}`,
    kind: 'TASK_SECTION_SUMMARY',
    occurredAt: completedFrame.occurredAt,
    title: 'Задача выполнена',
    description: task.title,
    task: { id: task.id, title: task.title },
    artifact: null,
    reason: null,
    taskDurationMinutes: completedFrame.taskDurationMinutes,
    taskCoins: completedFrame.taskCoins,
    taskCoinsState: completedFrame.taskCoinsState,
    taskCostCoins: completedFrame.taskCostCoins ?? null,
    appliedRate: completedFrame.appliedRate ?? null,
    costStatus: completedFrame.costStatus ?? 'DATA_INCOMPLETE',
    metadata: taskSectionMetadata(task, owner, {
      startedAt,
      completedAt: completedFrame.occurredAt,
      photoCount,
      pauseCount,
    }),
  } satisfies TimelineFrame;
}

function taskSectionMetadata(
  task: TimelineTask,
  owner: ShiftOwner,
  values: Record<string, unknown>,
) {
  return {
    responsibleName: displayName(owner),
    objectName: task.object?.name ?? null,
    location: task.location ?? null,
    ...values,
  };
}

function shiftSectionSummaryFrame(
  shift: ShiftRow,
  owner: ShiftOwner,
  frames: TimelineFrame[],
  artifacts: TimelineArtifact[],
) {
  const finishedAt = shift.finishedAt!;
  const workPhotoCount = artifacts.filter(
    (artifact) =>
      artifact.uploadedBy === owner.id &&
      artifact.createdAt >= shift.startedAt &&
      artifact.createdAt <= finishedAt,
  ).length;
  return {
    id: `shift-section-summary:${shift.id}`,
    kind: 'SHIFT_SECTION_SUMMARY',
    occurredAt: finishedAt,
    title: 'Смена завершена',
    description: displayName(owner),
    task: null,
    artifact: null,
    reason: null,
    taskDurationMinutes: null,
    taskCoins: null,
    taskCoinsState: 'PENDING' as const,
    metadata: {
      workerName: displayName(owner),
      shiftDate: shift.startedAt,
      startedAt: shift.startedAt,
      finishedAt,
      shiftDurationMinutes: durationMinutes(shift.startedAt, finishedAt),
      completedTaskCount: shift.completedTasks.length,
      workPhotoCount,
      pauseCount: frames.filter((frame) => frame.kind === 'TASK_PAUSED').length,
      shiftCoinUnits: shiftCoinUnits(shift),
      shiftCoinsState: shift.accrual?.status ?? 'PENDING',
    },
  } satisfies TimelineFrame;
}

function syntheticShiftFrame(shift: ShiftRow, owner: ShiftOwner, type: 'START' | 'FINISH') {
  const finished = type === 'FINISH';
  const artifact = shift.photos.find((photo) => photo.type === type)?.artifact ?? null;
  return {
    id: `shift-${type.toLowerCase()}:${shift.id}`,
    kind: finished ? 'SHIFT_COMPLETED' : 'WORK_SHIFT_STARTED',
    occurredAt: finished ? shift.finishedAt! : shift.startedAt,
    title: `${finished ? displayName(owner) : firstName(owner)} ${finished ? 'завершил' : 'начал'} работу`,
    description: finished ? null : 'Начало смены',
    task: null,
    artifact: artifact ? artifactView(artifact) : null,
    reason: null,
    taskDurationMinutes: null,
    taskCoins: null,
    taskCoinsState: 'PENDING' as const,
    metadata: {},
  } satisfies TimelineFrame;
}
