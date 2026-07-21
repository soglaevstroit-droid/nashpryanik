(function exposeLiveCoins(global) {
  const COIN_UNITS_PER_COIN = 100;
  const CORRECTION_DURATION_MS = 5_000;

  function calculateStandardCoinUnits(startedAt, atMs, policy) {
    const startedAtMs = new Date(startedAt).getTime();
    if (
      !Number.isFinite(startedAtMs) ||
      !Number.isFinite(atMs) ||
      !Number.isSafeInteger(policy?.coinUnitsPerSecond) ||
      !Number.isSafeInteger(policy?.dailyStandardLimitCoinUnits)
    )
      return 0;
    const durationSeconds = Math.max(0, Math.floor((atMs - startedAtMs) / 1_000));
    return Math.min(
      durationSeconds * policy.coinUnitsPerSecond,
      policy.dailyStandardLimitCoinUnits,
    );
  }

  function createAnalystSnapshot(summary, receivedAtMs, previousDisplayCoinUnits = null) {
    const calculatedAtMs = new Date(summary?.calculatedAt).getTime();
    const earnedTodayCoinUnits = Math.round(summary?.earnedTodayCoins * COIN_UNITS_PER_COIN);
    const activeShifts = Array.isArray(summary?.live?.activeShifts)
      ? summary.live.activeShifts.filter((shift) => shift?.startedAt)
      : [];
    const policy = {
      coinUnitsPerSecond: summary?.live?.coinUnitsPerSecond,
      dailyStandardLimitCoinUnits: summary?.live?.dailyStandardLimitCoinUnits,
    };
    if (
      !Number.isFinite(calculatedAtMs) ||
      typeof summary?.earnedTodayCoins !== 'number' ||
      !Number.isSafeInteger(earnedTodayCoinUnits) ||
      !Number.isFinite(receivedAtMs) ||
      !Number.isSafeInteger(policy.coinUnitsPerSecond) ||
      !Number.isSafeInteger(policy.dailyStandardLimitCoinUnits)
    )
      return null;

    const activeAtServerCoinUnits = activeShifts.reduce(
      (sum, shift) => sum + calculateStandardCoinUnits(shift.startedAt, calculatedAtMs, policy),
      0,
    );
    const snapshot = {
      calculatedAtMs,
      receivedAtMs,
      baseCoinUnits: earnedTodayCoinUnits - activeAtServerCoinUnits,
      activeShifts,
      policy,
      correctionCoinUnits: 0,
    };
    const projectedAtReceipt = projectAnalystCoinUnits(snapshot, receivedAtMs);
    if (Number.isSafeInteger(previousDisplayCoinUnits))
      snapshot.correctionCoinUnits = previousDisplayCoinUnits - projectedAtReceipt;
    return snapshot;
  }

  function projectAnalystCoinUnits(snapshot, atMs) {
    if (!snapshot) return null;
    const activeCoinUnits = snapshot.activeShifts.reduce(
      (sum, shift) => sum + calculateStandardCoinUnits(shift.startedAt, atMs, snapshot.policy),
      0,
    );
    const correctionProgress = Math.min(
      1,
      Math.max(0, (atMs - snapshot.receivedAtMs) / CORRECTION_DURATION_MS),
    );
    const correctionCoinUnits = Math.round(snapshot.correctionCoinUnits * (1 - correctionProgress));
    return snapshot.baseCoinUnits + activeCoinUnits + correctionCoinUnits;
  }

  global.LiveCoins = {
    calculateStandardCoinUnits,
    createAnalystSnapshot,
    projectAnalystCoinUnits,
  };
})(window);
