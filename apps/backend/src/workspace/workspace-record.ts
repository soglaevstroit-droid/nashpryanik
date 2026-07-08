import { EventRecord } from '../events/event-record.js';
import { PublicUser } from '../users/user-record.js';
import { TaskStepRecord } from '../task-steps/task-step-record.js';
import { TaskRecord } from '../tasks/task-record.js';
import { WorkShiftRecord } from '../work-shifts/work-shift-record.js';

export interface WorkerWorkspaceRecord {
  user: PublicUser;
  currentShift: WorkShiftRecord | null;
  myTasks: TaskRecord[];
  currentTask: TaskRecord | null;
  currentSteps: TaskStepRecord[];
  myEvents: EventRecord[];
  today: WorkerWorkspaceToday;
}

export interface WorkerWorkspaceToday {
  shiftStatus: string;
  tasksCount: number;
  activeStepsCount: number;
  lastAction: EventRecord | null;
}
