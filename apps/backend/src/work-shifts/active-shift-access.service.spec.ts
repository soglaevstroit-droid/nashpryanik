import assert from 'node:assert/strict';
import test from 'node:test';
import { ActiveShiftAccessService } from './active-shift-access.service.js';

const worker = { id: 'worker-1', email: 'ilya', role: 'WORKER' as const };

test('worker without an active shift receives ACTIVE_SHIFT_REQUIRED', async () => {
  const service = new ActiveShiftAccessService({
    workShift: { findFirst: async () => null },
  } as never);

  await assert.rejects(service.assertActiveShift(worker), (error: unknown) => {
    const response = (error as { getResponse(): unknown }).getResponse();
    assert.deepEqual(response, {
      code: 'ACTIVE_SHIFT_REQUIRED',
      message: 'Откройте смену, чтобы работать с задачей',
    });
    return true;
  });
});

test('worker with an active shift can continue', async () => {
  const service = new ActiveShiftAccessService({
    workShift: { findFirst: async () => ({ id: 'shift-1' }) },
  } as never);

  await service.assertActiveShift(worker);
});

test('non-worker roles are not restricted by the worker shift policy', async () => {
  let queried = false;
  const service = new ActiveShiftAccessService({
    workShift: { findFirst: async () => ((queried = true), null) },
  } as never);

  await service.assertActiveShift({ id: 'manager-1', email: 'boss', role: 'FOREMAN' });
  assert.equal(queried, false);
});
