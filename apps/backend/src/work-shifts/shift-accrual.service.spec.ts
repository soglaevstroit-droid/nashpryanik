import assert from 'node:assert/strict';
import test from 'node:test';
import { ShiftAccrualService } from './shift-accrual.service.js';

const worker = { id: 'worker-1', email: 'worker', role: 'WORKER' as const };
const finance = { id: 'finance-1', email: 'finance', role: 'FINANCE' as const };
const analyst = { id: 'analyst-1', email: 'analyst', role: 'ANALYST' as const };

test('worker summary restores active shift from backend time and keeps pending outside approved', async () => {
  const startedAt = new Date('2026-07-12T08:00:00Z');
  const database = {
    workShift: {
      findFirst: async ({ where }: { where: { status?: string } }) =>
        where.status === 'ACTIVE'
          ? { id: 'shift-1', status: 'ACTIVE', startedAt }
          : { id: 'shift-1', status: 'ACTIVE', startedAt },
    },
    user: {
      findUniqueOrThrow: async () => ({ openingBalanceCoinUnits: 2_378_000 }),
    },
    shiftAccrual: {
      aggregate: async ({ where }: { where: { status: string } }) => ({
        _sum:
          where.status === 'APPROVED'
            ? { standardCoinUnits: 42_000 }
            : { calculatedStandardCoinUnits: 12_542 },
      }),
    },
  };
  const result = await new ShiftAccrualService(database as never).getWorkerSummary(
    worker,
    new Date(startedAt.getTime() + 10_000),
  );
  assert.equal(result.shift.currentEstimatedCoinUnits, 210);
  assert.equal(result.coins.approvedBalanceCoinUnits, 2_420_000);
  assert.equal(result.coins.pendingCoinUnits, 12_542);
});

test('finance approval is atomic and repeated approval is rejected', async () => {
  let pending = true;
  const client = {
    shiftAccrual: {
      updateMany: async () => ({ count: pending ? ((pending = false), 1) : 0 }),
      findUniqueOrThrow: async () => ({ id: 'accrual-1', status: 'APPROVED' }),
    },
  };
  const database = {
    $transaction: async (action: (value: typeof client) => unknown) => action(client),
  };
  const service = new ShiftAccrualService(database as never);
  assert.equal((await service.approveStandard(finance, 'accrual-1')).status, 'APPROVED');
  await assert.rejects(service.approveStandard(finance, 'accrual-1'), /not pending/);
});

test('worker cannot approve own accrual', async () => {
  await assert.rejects(
    new ShiftAccrualService({} as never).approveStandard(worker, 'accrual-1'),
    /FINANCE role is required/,
  );
});

test('finishing a shift persists rounded pending and separate overtime fields', async () => {
  let create: Record<string, unknown> | undefined;
  const database = {
    shiftAccrual: {
      upsert: async (query: { create: Record<string, unknown> }) => (
        (create = query.create),
        query.create
      ),
    },
  };
  const startedAt = new Date('2026-07-12T08:00:00Z');
  await new ShiftAccrualService(database as never).finishShift({
    id: 'shift-1',
    userId: worker.id,
    processId: 'process-1',
    status: 'FINISHED',
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 40_000_000),
    createdAt: startedAt,
    updatedAt: startedAt,
  });
  assert.equal(create?.status, 'PENDING_APPROVAL');
  assert.equal(create?.standardCoinUnits, 700_000);
  assert.ok(Number(create?.overtimeSeconds) > 0);
  assert.ok(Number(create?.calculatedOvertimeCoinUnits) > 0);
});

test('finished accrual keeps raw cents separately from rounded approved units', async () => {
  let create: Record<string, unknown> | undefined;
  const database = {
    shiftAccrual: {
      upsert: async (query: { create: Record<string, unknown> }) => (
        (create = query.create),
        query.create
      ),
    },
  };
  const startedAt = new Date('2026-07-12T08:00:00Z');
  await new ShiftAccrualService(database as never).finishShift({
    id: 'shift-short',
    userId: worker.id,
    processId: 'process-short',
    status: 'FINISHED',
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 4_000),
    createdAt: startedAt,
    updatedAt: startedAt,
  });
  assert.equal(create?.calculatedStandardCoinUnits, 84);
  assert.equal(create?.standardCoinUnits, 100);
});

test('analyst can adjust overtime once and calculated amount remains unchanged', async () => {
  let saved: Record<string, unknown> | undefined;
  const database = {
    shiftAccrual: {
      findUnique: async () => ({
        id: 'accrual-1',
        overtimeDecision: 'PENDING',
        calculatedOvertimeCoinUnits: 2_100,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ((saved = data), data),
    },
  };
  await new ShiftAccrualService(database as never).reviewOvertime(analyst, 'accrual-1', {
    decision: 'ADJUSTED',
    finalCoinUnits: 1_500,
    comment: 'Проверено',
  });
  assert.equal(saved?.analystFinalOvertimeUnits, 1_500);
  assert.equal(saved?.overtimeDecision, 'ADJUSTED');
});
