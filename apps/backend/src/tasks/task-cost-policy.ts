import { COIN_UNITS_PER_COIN, COIN_UNITS_PER_SECOND } from '../work-shifts/coin-policy.js';

export type TaskCostStatus = 'CALCULATED' | 'RATE_NOT_AVAILABLE' | 'DATA_INCOMPLETE';

export interface TaskWorkEvent {
  type: string;
  createdAt: Date;
  payload?: unknown;
}

export interface TaskCostSnapshot {
  costStatus: TaskCostStatus;
  taskWorkSeconds: number | null;
  taskWorkMinutes: number | null;
  taskCostCoinUnits: number | null;
  taskCostCoins: number | null;
  appliedCoinUnitsPerSecond: number | null;
  appliedHourlyRateCoinUnits: number | null;
  appliedRate: number | null;
}

export function calculateTaskCostSnapshot(input: {
  startedAt: Date | null;
  completedAt: Date;
  events: TaskWorkEvent[];
  coinUnitsPerSecond?: number | null;
}): TaskCostSnapshot {
  const workSeconds = calculateTaskWorkSeconds(input.startedAt, input.completedAt, input.events);
  if (workSeconds === null) return emptySnapshot('DATA_INCOMPLETE');

  const rate = input.coinUnitsPerSecond ?? null;
  if (typeof rate !== 'number' || !Number.isSafeInteger(rate) || rate < 0)
    return {
      ...emptySnapshot('RATE_NOT_AVAILABLE'),
      taskWorkSeconds: workSeconds,
      taskWorkMinutes: Math.round(workSeconds / 60),
    };

  const taskCostCoinUnits = workSeconds * rate;
  if (!Number.isSafeInteger(taskCostCoinUnits)) return emptySnapshot('DATA_INCOMPLETE');
  const appliedHourlyRateCoinUnits = rate * 3_600;
  return {
    costStatus: 'CALCULATED',
    taskWorkSeconds: workSeconds,
    taskWorkMinutes: Math.round(workSeconds / 60),
    taskCostCoinUnits,
    taskCostCoins: taskCostCoinUnits / COIN_UNITS_PER_COIN,
    appliedCoinUnitsPerSecond: rate,
    appliedHourlyRateCoinUnits,
    appliedRate: appliedHourlyRateCoinUnits / COIN_UNITS_PER_COIN,
  };
}

export function calculateCurrentTaskCostSnapshot(input: {
  startedAt: Date | null;
  completedAt: Date;
  events: TaskWorkEvent[];
}) {
  return calculateTaskCostSnapshot({ ...input, coinUnitsPerSecond: COIN_UNITS_PER_SECOND });
}

function calculateTaskWorkSeconds(
  startedAt: Date | null,
  completedAt: Date,
  events: TaskWorkEvent[],
) {
  const sorted = [...events].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const start =
    startedAt ?? sorted.find((event) => event.type === 'TASK_STARTED')?.createdAt ?? null;
  if (!start || start > completedAt) return null;

  let activeSince: Date | null = start;
  let workMilliseconds = 0;
  for (const event of sorted) {
    if (event.createdAt < start || event.createdAt > completedAt || event.type === 'TASK_STARTED')
      continue;
    const resumed =
      event.type === 'TASK_RESUMED' ||
      (event.type === 'MANAGER_REPLY' && eventDecision(event.payload) === 'CONTINUE');
    if (event.type === 'TASK_PAUSED') {
      if (!activeSince || event.createdAt < activeSince) return null;
      workMilliseconds += event.createdAt.getTime() - activeSince.getTime();
      activeSince = null;
    } else if (resumed) {
      if (activeSince) return null;
      activeSince = event.createdAt;
    }
  }
  if (!activeSince || completedAt < activeSince) return null;
  workMilliseconds += completedAt.getTime() - activeSince.getTime();
  return Math.floor(workMilliseconds / 1_000);
}

function eventDecision(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return (payload as Record<string, unknown>).decision;
}

function emptySnapshot(costStatus: Exclude<TaskCostStatus, 'CALCULATED'>): TaskCostSnapshot {
  return {
    costStatus,
    taskWorkSeconds: null,
    taskWorkMinutes: null,
    taskCostCoinUnits: null,
    taskCostCoins: null,
    appliedCoinUnitsPerSecond: null,
    appliedHourlyRateCoinUnits: null,
    appliedRate: null,
  };
}
