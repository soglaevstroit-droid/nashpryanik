import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthUser } from '../auth/auth-user.js';
import { AuthService } from '../auth/auth.service.js';
import { EventRecord } from '../events/event-record.js';
import { EventService } from '../events/event.service.js';
import { TaskStepRecord } from '../task-steps/task-step-record.js';
import { TaskStepService } from '../task-steps/task-step.service.js';
import { TaskRecord } from '../tasks/task-record.js';
import { TaskService } from '../tasks/task.service.js';
import { WorkShiftRecord } from '../work-shifts/work-shift-record.js';
import { WorkShiftService } from '../work-shifts/work-shift.service.js';
import { WorkspaceService } from './workspace.service.js';

const createdAt = new Date('2026-07-09T00:00:00.000Z');
const worker: AuthUser = {
  id: 'worker-1',
  email: 'worker@example.com',
  role: 'WORKER',
};

function createTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    title: 'Install formwork',
    description: null,
    status: 'ASSIGNED',
    priority: 'NORMAL',
    accessStatus: 'OPEN',
    position: 1,
    creatorId: 'foreman-1',
    assigneeId: worker.id,
    processId: 'process-1',
    startedAt: null,
    completedAt: null,
    completedWorkShiftId: null,
    deletedAt: null,
    deletedByUserId: null,
    deletionReason: null,
    creationOperationId: null,
    isWorkBlocked: false,
    workBlockedAt: null,
    workBlockedByUserId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createStep(overrides: Partial<TaskStepRecord> = {}): TaskStepRecord {
  return {
    id: 'step-1',
    taskId: 'task-1',
    title: 'Prepare surface',
    description: null,
    status: 'IN_PROGRESS',
    order: 1,
    startedAt: createdAt,
    completedAt: null,
    completedByUserId: null,
    minimumPhotoCount: 2,
    completionOperationId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createShift(overrides: Partial<WorkShiftRecord> = {}): WorkShiftRecord {
  return {
    id: 'shift-1',
    userId: worker.id,
    processId: 'process-1',
    status: 'ACTIVE',
    startedAt: createdAt,
    finishedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'event-1',
    type: 'PHOTO_UPLOADED',
    actorId: worker.id,
    entityType: 'artifact',
    entityId: 'artifact-1',
    payload: {},
    metadata: null,
    createdAt,
    ...overrides,
  };
}

function createWorkspaceService(seed: {
  shift?: WorkShiftRecord | null;
  tasks?: TaskRecord[];
  steps?: TaskStepRecord[];
  events?: EventRecord[];
}): WorkspaceService {
  const auth = {
    getMe: async () => ({
      id: worker.id,
      email: worker.email,
      role: worker.role,
      name: 'Worker',
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    }),
  } as unknown as AuthService;
  const workShifts = {
    getCurrentShift: async () => seed.shift ?? null,
  } as unknown as WorkShiftService;
  const tasks = {
    listMyTasks: async () => seed.tasks ?? [],
  } as unknown as TaskService;
  const taskSteps = {
    listStepsByTask: async (taskId: string) =>
      (seed.steps ?? []).filter((step) => step.taskId === taskId),
  } as unknown as TaskStepService;
  const events = {
    listEventsByActorId: async (actorId: string) =>
      (seed.events ?? []).filter((event) => event.actorId === actorId),
  } as unknown as EventService;

  return new WorkspaceService(auth, workShifts, tasks, taskSteps, events);
}

test('returns empty worker workspace day', async () => {
  const service = createWorkspaceService({});

  const workspace = await service.getWorkerWorkspace(worker);

  assert.equal(workspace.user.id, worker.id);
  assert.equal(workspace.currentShift, null);
  assert.equal(workspace.currentTask, null);
  assert.deepEqual(workspace.myTasks, []);
  assert.deepEqual(workspace.currentSteps, []);
  assert.deepEqual(workspace.myEvents, []);
  assert.equal(workspace.today.shiftStatus, 'NOT_STARTED');
});

test('returns active shift, current task and active step summary', async () => {
  const service = createWorkspaceService({
    shift: createShift(),
    tasks: [createTask(), createTask({ id: 'task-2', status: 'COMPLETED' })],
    steps: [createStep(), createStep({ id: 'step-2', status: 'COMPLETED' })],
    events: [createEvent()],
  });

  const workspace = await service.getWorkerWorkspace(worker);

  assert.equal(workspace.currentShift?.status, 'ACTIVE');
  assert.equal(workspace.currentTask?.id, 'task-1');
  assert.equal(workspace.currentSteps.length, 2);
  assert.equal(workspace.today.tasksCount, 2);
  assert.equal(workspace.today.activeStepsCount, 1);
  assert.equal(workspace.today.lastAction?.type, 'PHOTO_UPLOADED');
});

test('returns only current worker events', async () => {
  const service = createWorkspaceService({
    events: [
      createEvent({ id: 'event-1', actorId: worker.id }),
      createEvent({ id: 'event-2', actorId: 'worker-2' }),
    ],
  });

  const workspace = await service.getWorkerWorkspace(worker);

  assert.deepEqual(
    workspace.myEvents.map((event) => event.id),
    ['event-1'],
  );
});
