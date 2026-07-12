export function classifyLock({ exists, ageSeconds, processActive }) {
  if (!exists) return 'available';
  if (processActive) return 'active';
  return ageSeconds > 3600 ? 'stale' : 'unknown';
}

export function validateArchiveScenario({ exists = true, size = 1, format, valid = true }) {
  if (!exists) throw new Error('backup отсутствует');
  if (size === 0) throw new Error('backup пустой');
  if (!['sql.gz', 'custom'].includes(format)) throw new Error('неправильное расширение');
  if (!valid)
    throw new Error(format === 'sql.gz' ? 'повреждённый gzip' : 'повреждённый custom dump');
  return true;
}

export function restoreCleanupDecision({ databaseCreated, restoreSucceeded, interrupted }) {
  return databaseCreated && (restoreSucceeded || !restoreSucceeded || interrupted);
}

export function validateBackupResult({
  size,
  checksumMatches,
  scpSucceeded,
  sizeMatches,
  restoreSucceeded,
}) {
  if (size === 0) throw new Error('нулевой backup');
  if (!checksumMatches) throw new Error('ошибка checksum');
  if (!scpSucceeded) throw new Error('ошибка SCP');
  if (!sizeMatches) throw new Error('несовпадение размера');
  if (!restoreSucceeded) throw new Error('restore-check нового файла не прошёл');
  return true;
}

export function validatePublishScenario(value) {
  const required = [
    'cleanTree',
    'mainBranch',
    'originAvailable',
    'testsPassed',
    'backupReady',
    'restoreReady',
  ];
  const failed = required.find((key) => !value[key]);
  if (failed) throw new Error(`publish precondition: ${failed}`);
  return true;
}

export function evaluatePublishExecution(value) {
  if (!value.commitSucceeded) return 'commit-failed';
  if (!value.pushSucceeded) return 'push-failed';
  if (!value.deploySucceeded || !value.healthSucceeded) {
    if (value.migrationRisk) return 'manual-intervention-required';
    return value.rollbackSucceeded ? 'rolled-back' : 'rollback-failed';
  }
  return 'published';
}
