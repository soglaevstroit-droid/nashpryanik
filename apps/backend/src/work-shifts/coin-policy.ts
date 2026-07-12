export const COIN_UNITS_PER_SECOND = 21;
export const DAILY_STANDARD_LIMIT_COIN_UNITS = 700_000;
export const COIN_UNITS_PER_COIN = 100;

export interface ShiftCoinCalculation {
  durationSeconds: number;
  standardDurationSeconds: number;
  overtimeSeconds: number;
  calculatedStandardCoinUnits: number;
  standardCoinUnits: number;
  calculatedOvertimeCoinUnits: number;
}

export function calculateActiveCoinUnits(startedAt: Date, at: Date = new Date()) {
  const durationSeconds = durationInWholeSeconds(startedAt, at);
  const rawCoinUnits = durationSeconds * COIN_UNITS_PER_SECOND;
  const standardCoinUnits = Math.min(rawCoinUnits, DAILY_STANDARD_LIMIT_COIN_UNITS);
  const standardDurationSeconds = Math.min(
    durationSeconds,
    Math.ceil(DAILY_STANDARD_LIMIT_COIN_UNITS / COIN_UNITS_PER_SECOND),
  );
  const overtimeSeconds = Math.max(0, durationSeconds - standardDurationSeconds);
  return {
    durationSeconds,
    standardDurationSeconds,
    overtimeSeconds,
    standardCoinUnits,
    overtimeCoinUnits: overtimeSeconds * COIN_UNITS_PER_SECOND,
  };
}

export function calculateFinishedShift(startedAt: Date, finishedAt: Date): ShiftCoinCalculation {
  const active = calculateActiveCoinUnits(startedAt, finishedAt);
  return {
    durationSeconds: active.durationSeconds,
    standardDurationSeconds: active.standardDurationSeconds,
    overtimeSeconds: active.overtimeSeconds,
    calculatedStandardCoinUnits: active.standardCoinUnits,
    standardCoinUnits: roundCoinUnitsToWholeCoin(active.standardCoinUnits),
    calculatedOvertimeCoinUnits: active.overtimeCoinUnits,
  };
}

export function roundCoinUnitsToWholeCoin(units: number): number {
  assertNonNegativeInteger(units);
  return Math.floor((units + COIN_UNITS_PER_COIN / 2) / COIN_UNITS_PER_COIN) * COIN_UNITS_PER_COIN;
}

function durationInWholeSeconds(startedAt: Date, at: Date): number {
  const durationMs = at.getTime() - startedAt.getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return 0;
  return Math.floor(durationMs / 1_000);
}

function assertNonNegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError('Coin units must be a non-negative safe integer');
}
