import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAILY_STANDARD_LIMIT_COIN_UNITS,
  calculateActiveCoinUnits,
  calculateFinishedShift,
  roundCoinUnitsToWholeCoin,
} from './coin-policy.js';

const start = new Date('2026-07-12T08:00:00.000Z');

test('calculates exact integer units for seconds without float accumulation', () => {
  assert.equal(
    calculateActiveCoinUnits(start, new Date(start.getTime() + 1_000)).standardCoinUnits,
    21,
  );
  assert.equal(
    calculateActiveCoinUnits(start, new Date(start.getTime() + 10_000)).standardCoinUnits,
    210,
  );
  assert.equal(
    calculateActiveCoinUnits(start, new Date(start.getTime() + 60_000)).standardCoinUnits,
    1_260,
  );
});

test('caps standard units and keeps overtime separate', () => {
  const result = calculateActiveCoinUnits(start, new Date(start.getTime() + 40_000_000));
  assert.equal(result.standardCoinUnits, DAILY_STANDARD_LIMIT_COIN_UNITS);
  assert.ok(result.overtimeSeconds > 0);
  assert.equal(result.overtimeCoinUnits, result.overtimeSeconds * 21);
});

test('rounds finished standard amount mathematically to a whole coin', () => {
  assert.equal(roundCoinUnitsToWholeCoin(12_549), 12_500);
  assert.equal(roundCoinUnitsToWholeCoin(12_550), 12_600);
  assert.equal(roundCoinUnitsToWholeCoin(12_599), 12_600);
  assert.equal(
    calculateFinishedShift(start, new Date(start.getTime() + 10_000)).standardCoinUnits,
    200,
  );
});
