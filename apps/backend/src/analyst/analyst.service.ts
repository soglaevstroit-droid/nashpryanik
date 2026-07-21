import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service.js';

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
    assigneeId: true;
    startedAt: true;
    completedAt: true;
    deletedAt: true;
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
  taskDurationMinutes: number | null;
  taskCoins: number | null;
  taskCoinsState: 'PENDING' | 'AVAILABLE';
  metadata: Record<string, unknown>;
}

@Injectable()
export class AnalystService {
  constructor(private readonly database: DatabaseService) {}

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
              assigneeId: true,
              startedAt: true,
              completedAt: true,
              deletedAt: true,
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
      result.set(shift.id, timeline);
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
    let artifact: { id: string; originalFileName: string } | null = event.artifacts[0] ?? null;
    let duration: number | null = null;

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
      duration = taskDurationMinutes(task.id, taskEvents, task.startedAt, event.createdAt);
    } else if (event.type === 'WORK_SHIFT_FINISHED') {
      kind = 'SHIFT_COMPLETED';
      title = `${name} завершил работу`;
      description = 'Смена завершена';
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
      taskDurationMinutes: duration,
      taskCoins: null,
      taskCoinsState: 'PENDING',
      metadata:
        kind === 'SHIFT_COMPLETED'
          ? {
              shiftDurationMinutes: durationMinutes(shift.startedAt, shift.finishedAt),
              completedTaskCount: shift.completedTasks.length,
              shiftCoinUnits: shiftCoinUnits(shift),
              shiftCoinsState: shift.accrual ? shift.accrual.status : 'PENDING',
            }
          : {},
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

function taskDurationMinutes(
  taskId: string,
  events: Array<{
    taskId: string | null;
    type: string;
    createdAt: Date;
    payload?: Prisma.JsonValue;
  }>,
  startedAt: Date | null,
  completedAt: Date,
) {
  const relevant = events.filter((event) => event.taskId === taskId);
  let activeSince = relevant.find((event) => event.type === 'TASK_STARTED')?.createdAt ?? startedAt;
  let milliseconds = 0;
  for (const event of relevant) {
    if (
      event.type === 'TASK_RESUMED' ||
      (event.type === 'MANAGER_REPLY' && jsonObject(event.payload ?? null).decision === 'CONTINUE')
    )
      activeSince = event.createdAt;
    if (event.type === 'TASK_PAUSED' && activeSince) {
      milliseconds += Math.max(0, event.createdAt.getTime() - activeSince.getTime());
      activeSince = null;
    }
    if (event.type === 'TASK_COMPLETED' && activeSince) {
      milliseconds += Math.max(0, event.createdAt.getTime() - activeSince.getTime());
      activeSince = null;
    }
  }
  if (activeSince) milliseconds += Math.max(0, completedAt.getTime() - activeSince.getTime());
  return Math.round(milliseconds / 60_000);
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

function deduplicateFrames(frames: TimelineFrame[]) {
  const seen = new Set<string>();
  return frames.filter((frame) => {
    const key = `${frame.kind}:${frame.artifact?.id ?? frame.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function syntheticShiftFrame(shift: ShiftRow, owner: ShiftOwner, type: 'START' | 'FINISH') {
  const finished = type === 'FINISH';
  const artifact = shift.photos.find((photo) => photo.type === type)?.artifact ?? null;
  return {
    id: `shift-${type.toLowerCase()}:${shift.id}`,
    kind: finished ? 'SHIFT_COMPLETED' : 'WORK_SHIFT_STARTED',
    occurredAt: finished ? shift.finishedAt! : shift.startedAt,
    title: `${firstName(owner)} ${finished ? 'завершил' : 'начал'} работу`,
    description: finished ? 'Смена завершена' : 'Начало смены',
    task: null,
    artifact: artifact ? artifactView(artifact) : null,
    reason: null,
    taskDurationMinutes: null,
    taskCoins: null,
    taskCoinsState: 'PENDING' as const,
    metadata: finished
      ? {
          shiftDurationMinutes: durationMinutes(shift.startedAt, shift.finishedAt),
          completedTaskCount: shift.completedTasks.length,
          shiftCoinUnits: shiftCoinUnits(shift),
          shiftCoinsState: shift.accrual?.status ?? 'PENDING',
        }
      : {},
  } satisfies TimelineFrame;
}
