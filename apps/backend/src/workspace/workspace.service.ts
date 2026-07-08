import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.js';
import { AuthService } from '../auth/auth.service.js';
import { EventService } from '../events/event.service.js';
import { TaskStepService } from '../task-steps/task-step.service.js';
import { TaskRecord } from '../tasks/task-record.js';
import { TaskService } from '../tasks/task.service.js';
import { WorkShiftService } from '../work-shifts/work-shift.service.js';
import { WorkerWorkspaceRecord } from './workspace-record.js';

const workspaceEventLimit = 20;

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly auth: AuthService,
    private readonly workShifts: WorkShiftService,
    private readonly tasks: TaskService,
    private readonly taskSteps: TaskStepService,
    private readonly events: EventService,
  ) {}

  async getWorkerWorkspace(user: AuthUser): Promise<WorkerWorkspaceRecord> {
    const [publicUser, currentShift, myTasks, myEvents] = await Promise.all([
      this.auth.getMe(user),
      this.workShifts.getCurrentShift(user),
      this.tasks.listMyTasks(user),
      this.events.listEventsByActorId(user.id, workspaceEventLimit),
    ]);
    const currentTask = selectCurrentTask(myTasks);
    const currentSteps = currentTask ? await this.taskSteps.listStepsByTask(currentTask.id) : [];

    return {
      user: publicUser,
      currentShift,
      myTasks,
      currentTask,
      currentSteps,
      myEvents,
      today: {
        shiftStatus: currentShift?.status ?? 'NOT_STARTED',
        tasksCount: myTasks.length,
        activeStepsCount: currentSteps.filter((step) => step.status === 'IN_PROGRESS').length,
        lastAction: myEvents[0] ?? null,
      },
    };
  }
}

function selectCurrentTask(tasks: TaskRecord[]): TaskRecord | null {
  return (
    tasks.find((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED') ??
    tasks[0] ??
    null
  );
}
