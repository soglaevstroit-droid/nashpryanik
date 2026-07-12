import { randomBytes } from 'node:crypto';
import { CONFIG, FORBIDDEN_PRODUCTION_DATABASE } from './backup-config.mjs';

export function assertSafeBackupName(name) {
  if (!name || name.includes('/') || name.includes('\\') || !CONFIG.backupPattern.test(name)) {
    throw new Error('Недопустимое имя backup-файла. Разрешён только ожидаемый basename.');
  }
  return name;
}

export function detectBackupFormat(name) {
  assertSafeBackupName(name);
  if (name.endsWith('.sql.gz')) return 'sql.gz';
  if (name.endsWith('.dump')) return 'custom';
  throw new Error('Неподдерживаемый формат backup.');
}

export function createRestoreDatabaseName(
  now = new Date(),
  random = randomBytes(3).toString('hex'),
) {
  const timestamp = now
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'z')
    .toLowerCase();
  return assertSafeRestoreDatabase(`${CONFIG.restorePrefix}${timestamp}_${random}`);
}

export function assertSafeRestoreDatabase(name) {
  if (name === FORBIDDEN_PRODUCTION_DATABASE || !name.startsWith(CONFIG.restorePrefix)) {
    throw new Error('Операция разрешена только для временной restore-check базы.');
  }
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error('Имя временной базы содержит опасные символы.');
  return name;
}

export function migrationRisk(sql) {
  const rules = [
    [/\bDROP\b/i, 'DROP'],
    [/\bDELETE\s+FROM\b/i, 'DELETE'],
    [/\bALTER\s+TABLE[\s\S]*\bDROP\b/i, 'ALTER TABLE … DROP'],
    [/\bALTER\s+COLUMN[\s\S]*\bTYPE\b/i, 'ALTER COLUMN TYPE'],
    [/\bADD\s+(?:COLUMN\s+)?"?[\w]+"?\s+[^;]+NOT\s+NULL(?![^;]*DEFAULT)/i, 'NOT NULL без DEFAULT'],
  ];
  return rules.filter(([pattern]) => pattern.test(sql)).map(([, label]) => label);
}
