import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFinishedShift } from '../work-shifts/coin-policy.js';
import { calculateCurrentTaskCostSnapshot, calculateTaskCostSnapshot } from './task-cost-policy.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 6, 21, 13, minutes));

test('task cost uses the shared shift rate and exact working seconds', () => {
  const result = calculateCurrentTaskCostSnapshot({
    startedAt: at(27),
    completedAt: at(42),
    events: [],
  });
  assert.equal(result.costStatus, 'CALCULATED');
  assert.equal(result.taskWorkMinutes, 15);
  assert.equal(result.taskCostCoinUnits, 18_900);
  assert.equal(result.taskCostCoins, 189);
  assert.equal(result.appliedRate, 756);
});

test('one pause is excluded from task working time', () => {
  const result = calculateCurrentTaskCostSnapshot({
    startedAt: at(27),
    completedAt: at(47),
    events: [
      { type: 'TASK_PAUSED', createdAt: at(32) },
      { type: 'TASK_RESUMED', createdAt: at(37) },
    ],
  });
  assert.equal(result.taskWorkMinutes, 15);
  assert.equal(result.taskCostCoins, 189);
});

test('multiple pauses and manager continuation are excluded exactly', () => {
  const result = calculateCurrentTaskCostSnapshot({
    startedAt: at(0),
    completedAt: new Date(Date.UTC(2026, 6, 21, 14, 0)),
    events: [
      { type: 'TASK_PAUSED', createdAt: at(10) },
      { type: 'TASK_RESUMED', createdAt: at(15) },
      { type: 'TASK_PAUSED', createdAt: at(25) },
      { type: 'MANAGER_REPLY', createdAt: at(40), payload: { decision: 'CONTINUE' } },
    ],
  });
  assert.equal(result.taskWorkMinutes, 40);
  assert.equal(result.taskCostCoins, 504);
});

test('sub-minute task keeps exact coin units with at most two coin decimals', () => {
  const result = calculateCurrentTaskCostSnapshot({
    startedAt: new Date('2026-07-21T13:00:00.000Z'),
    completedAt: new Date('2026-07-21T13:00:07.000Z'),
    events: [],
  });
  assert.equal(result.taskWorkMinutes, 0);
  assert.equal(result.taskCostCoinUnits, 147);
  assert.equal(result.taskCostCoins, 1.47);
});

test('missing rate is explicit and never produces a zero cost', () => {
  const result = calculateTaskCostSnapshot({
    startedAt: at(0),
    completedAt: at(15),
    events: [],
    coinUnitsPerSecond: null,
  });
  assert.equal(result.costStatus, 'RATE_NOT_AVAILABLE');
  assert.equal(result.taskWorkMinutes, 15);
  assert.equal(result.taskCostCoins, null);
});

test('unfinished pause and invalid chronology return DATA_INCOMPLETE', () => {
  const paused = calculateCurrentTaskCostSnapshot({
    startedAt: at(0),
    completedAt: at(15),
    events: [{ type: 'TASK_PAUSED', createdAt: at(10) }],
  });
  const invalid = calculateCurrentTaskCostSnapshot({
    startedAt: at(15),
    completedAt: at(0),
    events: [],
  });
  assert.equal(paused.costStatus, 'DATA_INCOMPLETE');
  assert.equal(invalid.costStatus, 'DATA_INCOMPLETE');
});

test('task started before midnight and a legacy task with TASK_STARTED are calculated normally', () => {
  const overnight = calculateCurrentTaskCostSnapshot({
    startedAt: new Date('2026-07-21T23:55:00.000Z'),
    completedAt: new Date('2026-07-22T00:10:00.000Z'),
    events: [],
  });
  const eventFallback = calculateCurrentTaskCostSnapshot({
    startedAt: null,
    completedAt: at(15),
    events: [{ type: 'TASK_STARTED', createdAt: at(0) }],
  });
  assert.equal(overnight.taskWorkMinutes, 15);
  assert.equal(eventFallback.taskWorkMinutes, 15);
});

test('zero rate is a calculated zero while no rate remains unavailable', () => {
  const result = calculateTaskCostSnapshot({
    startedAt: at(0),
    completedAt: at(15),
    events: [],
    coinUnitsPerSecond: 0,
  });
  assert.equal(result.costStatus, 'CALCULATED');
  assert.equal(result.taskCostCoins, 0);
  assert.equal(result.appliedRate, 0);
});

test('separate task costs remain below a shift accrual when the shift includes idle time', () => {
  const first = calculateCurrentTaskCostSnapshot({
    startedAt: at(0),
    completedAt: at(15),
    events: [],
  });
  const second = calculateCurrentTaskCostSnapshot({
    startedAt: at(20),
    completedAt: new Date(Date.UTC(2026, 6, 21, 14, 0)),
    events: [],
  });
  const shift = calculateFinishedShift(at(0), new Date(Date.UTC(2026, 6, 21, 14, 5)));
  assert.notEqual(first.taskCostCoinUnits, second.taskCostCoinUnits);
  assert.ok(
    (first.taskCostCoinUnits ?? 0) + (second.taskCostCoinUnits ?? 0) <=
      shift.calculatedStandardCoinUnits,
  );
});
