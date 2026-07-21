import { resolve } from 'node:path';
import { rm, writeFile, mkdir } from 'node:fs/promises';
import { CONFIG } from './lib/backup-config.mjs';
import {
  assertSafeBackupName,
  assertSafeRestoreDatabase,
  createRestoreDatabaseName,
} from './lib/backup-safety.mjs';
import { capture, findExecutable, sanitizeError, sshArgs } from './lib/process.mjs';
import { createReport, finishReport, saveReport } from './lib/report.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const runtimeFile = resolve(rootDir, '.runtime/restore-check-active.json');
const report = createReport('backup:restore-check');
const options = parseArguments(process.argv.slice(2));
const temporaryDatabase = createRestoreDatabaseName();
let activeChild = null;
let interrupted = false;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true;
    activeChild?.kill(signal);
  });
}

try {
  report.info.temporaryDatabase = temporaryDatabase;
  await runBackupCheck();
  const ssh = await findExecutable('ssh');
  if (!ssh) throw new Error('Команда ssh не найдена.');
  await mkdir(resolve(rootDir, '.runtime'), { recursive: true, mode: 0o700 });
  await writeFile(
    runtimeFile,
    `${JSON.stringify({ temporaryDatabase, startedAt: report.startedAt }, null, 2)}\n`,
    { mode: 0o600 },
  );
  const response = await capture(
    ssh,
    sshArgs(process.env.BACKUP_CHECK_SSH_HOST ?? CONFIG.sshAlias, 'bash -s'),
    {
      input: buildRemoteScript(options.file, temporaryDatabase),
      timeoutMs: CONFIG.timeouts.restore,
      onChild: (child) => (activeChild = child),
    },
  );
  activeChild = null;
  const remote = parseRemoteOutput(response.stdout);
  const cleanup = await cleanupTemporaryDatabase(ssh, temporaryDatabase);
  if (cleanup.deleted) remote.temporary_database_deleted = '1';
  else if (cleanup.error) remote.cleanup_error = cleanup.error;
  applyRemoteResult(remote, response);
} catch (error) {
  report.critical.push(sanitizeError(error instanceof Error ? error.message : error));
} finally {
  await rm(runtimeFile, { force: true });
  if (interrupted)
    report.critical.push('Restore-check прерван сигналом; проверена очистка временной базы.');
  finishReport(report);
  const reportPath = await saveReport(report, 'restore-check');
  report.info.reportPath = reportPath.replace(`${rootDir}/`, '');
  outputReport(report, options.json);
  process.exitCode = report.success ? 0 : 1;
}

function parseArguments(args) {
  const result = { file: null, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') result.json = true;
    else if (argument === '--latest') result.file = null;
    else if (argument === '--file') result.file = assertSafeBackupName(args[++index]);
    else throw new Error(`Неизвестный аргумент: ${argument}`);
  }
  return result;
}

async function runBackupCheck() {
  const response = await capture(
    process.execPath,
    [resolve(import.meta.dirname, 'backup-check.mjs'), '--json'],
    {
      cwd: rootDir,
      timeoutMs: CONFIG.timeouts.readOnly,
    },
  );
  let readiness;
  try {
    readiness = JSON.parse(response.stdout);
  } catch {
    throw new Error(`backup:check вернул некорректный JSON: ${sanitizeError(response.stderr)}`);
  }
  report.steps.push({ name: 'backup:check', success: readiness.ready === true });
  report.warnings.push(...(readiness.warnings ?? []));
  if (!readiness.ready) {
    report.critical.push(...(readiness.critical ?? ['Production backup не готов.']));
    throw new Error('backup:check завершился со статусом NOT READY.');
  }
}

function buildRemoteScript(requestedFile, temporaryDatabaseName) {
  assertSafeRestoreDatabase(temporaryDatabaseName);
  const requested = requestedFile ? `'${requestedFile}'` : "''";
  return `set -u
container='${CONFIG.container}'
production_db='${CONFIG.database}'
db_user='${CONFIG.databaseUser}'
backup_dir='${CONFIG.backupDirectory}'
temp_db='${temporaryDatabaseName}'
requested=${requested}
emit() { printf '%s=%s\\n' "$1" "$2"; }
case "$temp_db" in ${CONFIG.restorePrefix}*) ;; *) emit error unsafe_temp_name; exit 20;; esac
test "$temp_db" != "$production_db" || { emit error production_temp_name; exit 21; }
if test -n "$requested"; then backup_name="$requested"; else backup_name="$(find "$backup_dir" -maxdepth 1 -type f ! -name '*.partial' ! -name '*.sha256' -printf '%T@|%f\\n' | sort -nr | head -n1 | cut -d'|' -f2-)"; fi
case "$backup_name" in */*|*\\*) emit error unsafe_backup_name; exit 22;; esac
case "$backup_name" in stroit-????????-??????.sql.gz|stroit_dev_????????T??????Z.sql.gz|stroit_dev_????????T??????Z.dump) ;; *) emit error invalid_backup_pattern; exit 23;; esac
backup_path="$backup_dir/$backup_name"
test -f "$backup_path" || { emit error backup_missing; exit 24; }
test ! -L "$backup_path" || { emit error backup_symlink; exit 25; }
size="$(stat -c %s "$backup_path")"
mtime="$(stat -c %Y "$backup_path")"
test "$size" -gt 0 || { emit error backup_empty; exit 26; }
emit backup_name "$backup_name"
emit backup_size "$size"
emit backup_mtime "$mtime"
case "$backup_name" in
  *.sql.gz)
    format=sql.gz
    gzip -t "$backup_path" || { emit error gzip_corrupt; exit 27; }
    gzip -cd "$backup_path" 2>/dev/null | head -n 30 | grep -q 'PostgreSQL database dump' || { emit error not_postgresql_sql; exit 28; }
    ;;
  *.dump)
    format=custom
    cat "$backup_path" | docker exec -i "$container" pg_restore --list >/tmp/stroit-restore-list.$$ 2>/dev/null || { rm -f /tmp/stroit-restore-list.$$; emit error custom_corrupt; exit 29; }
    test -s /tmp/stroit-restore-list.$$ || { rm -f /tmp/stroit-restore-list.$$; emit error custom_empty; exit 30; }
    grep -q ' TABLE ' /tmp/stroit-restore-list.$$ || { rm -f /tmp/stroit-restore-list.$$; emit error custom_no_tables; exit 31; }
    rm -f /tmp/stroit-restore-list.$$
    ;;
esac
emit backup_format "$format"
exists="$(docker exec "$container" psql -X -U "$db_user" -d postgres -Atqc "SELECT COUNT(*) FROM pg_database WHERE datname = '$temp_db'")"
test "$exists" = 0 || { emit error temporary_database_exists; exit 32; }
prod_tables="$(docker exec "$container" psql -X -U "$db_user" -d "$production_db" -Atqc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
prod_users="$(docker exec "$container" psql -X -U "$db_user" -d "$production_db" -Atqc 'SELECT COUNT(*) FROM users')"
prod_tasks="$(docker exec "$container" psql -X -U "$db_user" -d "$production_db" -Atqc 'SELECT COUNT(*) FROM tasks')"
prod_migrations="$(docker exec "$container" psql -X -U "$db_user" -d "$production_db" -Atqc 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$db_user" -d postgres -c "CREATE DATABASE $temp_db" >/dev/null
emit temporary_database_created 1
restore_started="$(date +%s)"
if test "$format" = sql.gz; then
  gzip -cd "$backup_path" | docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U "$db_user" -d "$temp_db" >/dev/null
else
  cat "$backup_path" | docker exec -i "$container" pg_restore --exit-on-error --no-owner --no-privileges -U "$db_user" -d "$temp_db" >/dev/null
fi
restore_finished="$(date +%s)"
query() { docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$db_user" -d "$temp_db" -Atqc "$1"; }
test "$(query 'SELECT 1')" = 1 || { emit error select_failed; exit 33; }
tables="$(query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
for required_table in users tasks task_steps artifacts events work_shifts task_messages shift_accruals _prisma_migrations; do
  table_exists="$(query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$required_table'")"
  test "$table_exists" = 1 || { emit error "required_table_missing_$required_table"; exit 34; }
done
users="$(query 'SELECT COUNT(*) FROM users')"
tasks="$(query 'SELECT COUNT(*) FROM tasks')"
task_steps="$(query 'SELECT COUNT(*) FROM task_steps')"
artifacts="$(query 'SELECT COUNT(*) FROM artifacts')"
events="$(query 'SELECT COUNT(*) FROM events')"
work_shifts="$(query 'SELECT COUNT(*) FROM work_shifts')"
task_messages="$(query 'SELECT COUNT(*) FROM task_messages')"
shift_accruals="$(query 'SELECT COUNT(*) FROM shift_accruals')"
migrations="$(query 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
test "$migrations" -gt 0 || { emit error migrations_empty; exit 35; }
test "$migrations" -le "$prod_migrations" || { emit error migrations_ahead_of_production; exit 36; }
emit restore_duration_seconds "$((restore_finished - restore_started))"
emit table_count "$tables"
emit users_count "$users"
emit tasks_count "$tasks"
emit task_steps_count "$task_steps"
emit artifacts_count "$artifacts"
emit events_count "$events"
emit work_shifts_count "$work_shifts"
emit task_messages_count "$task_messages"
emit shift_accruals_count "$shift_accruals"
emit migrations_count "$migrations"
emit production_table_count "$prod_tables"
emit production_users_count "$prod_users"
emit production_tasks_count "$prod_tasks"
emit production_migrations_count "$prod_migrations"
emit restore_success 1
`;
}

async function cleanupTemporaryDatabase(ssh, databaseName) {
  assertSafeRestoreDatabase(databaseName);
  const script = `set -u
container='${CONFIG.container}'
db_user='${CONFIG.databaseUser}'
temp_db='${databaseName}'
production_db='${CONFIG.database}'
case "$temp_db" in ${CONFIG.restorePrefix}*) ;; *) exit 70;; esac
test "$temp_db" != "$production_db" || exit 71
exists="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$db_user" -d postgres -Atqc "SELECT COUNT(*) FROM pg_database WHERE datname = '$temp_db'")"
if test "$exists" = 1; then
  docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$db_user" -d postgres -Atqc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$temp_db' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$db_user" -d postgres -c "DROP DATABASE $temp_db" >/dev/null
fi
remaining="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$db_user" -d postgres -Atqc "SELECT COUNT(*) FROM pg_database WHERE datname = '$temp_db'")"
test "$remaining" = 0 && printf 'temporary_database_deleted=1\\n'
`;
  const response = await capture(
    ssh,
    sshArgs(process.env.BACKUP_CHECK_SSH_HOST ?? CONFIG.sshAlias, 'bash -s'),
    {
      input: script,
      timeoutMs: CONFIG.timeouts.readOnly,
      onChild: (child) => (activeChild = child),
    },
  );
  activeChild = null;
  if (response.code === 0 && response.stdout.includes('temporary_database_deleted=1')) {
    return { deleted: true };
  }
  return {
    deleted: false,
    error: sanitizeError(response.stderr || `cleanup exit ${response.code}`),
  };
}

function parseRemoteOutput(output) {
  const allowed = new Set([
    'backup_name',
    'backup_size',
    'backup_mtime',
    'backup_format',
    'temporary_database_created',
    'temporary_database_deleted',
    'restore_duration_seconds',
    'table_count',
    'users_count',
    'tasks_count',
    'task_steps_count',
    'artifacts_count',
    'events_count',
    'work_shifts_count',
    'task_messages_count',
    'shift_accruals_count',
    'migrations_count',
    'production_table_count',
    'production_users_count',
    'production_tasks_count',
    'production_migrations_count',
    'restore_success',
    'cleanup_error',
    'error',
  ]);
  const result = {};
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator > 0 && allowed.has(line.slice(0, separator))) {
      result[line.slice(0, separator)] = line.slice(separator + 1).trim();
    }
  }
  return result;
}

function applyRemoteResult(remote, response) {
  report.info.backup = remote.backup_name
    ? {
        name: remote.backup_name,
        sizeBytes: Number(remote.backup_size),
        modifiedAt: new Date(Number(remote.backup_mtime) * 1000).toISOString(),
        format: remote.backup_format,
      }
    : null;
  report.info.restoreDurationMs = Number(remote.restore_duration_seconds ?? 0) * 1000;
  report.info.temporaryDatabaseCreated = remote.temporary_database_created === '1';
  report.info.temporaryDatabaseDeleted = remote.temporary_database_deleted === '1';
  report.info.restored = {
    tableCount: Number(remote.table_count ?? 0),
    usersCount: Number(remote.users_count ?? 0),
    tasksCount: Number(remote.tasks_count ?? 0),
    taskStepsCount: Number(remote.task_steps_count ?? 0),
    artifactsCount: Number(remote.artifacts_count ?? 0),
    eventsCount: Number(remote.events_count ?? 0),
    workShiftsCount: Number(remote.work_shifts_count ?? 0),
    taskMessagesCount: Number(remote.task_messages_count ?? 0),
    shiftAccrualsCount: Number(remote.shift_accruals_count ?? 0),
    migrationsCount: Number(remote.migrations_count ?? 0),
  };
  report.info.production = {
    tableCount: Number(remote.production_table_count ?? 0),
    usersCount: Number(remote.production_users_count ?? 0),
    tasksCount: Number(remote.production_tasks_count ?? 0),
    migrationsCount: Number(remote.production_migrations_count ?? 0),
  };
  if (remote.cleanup_error)
    report.critical.push(`Не удалось удалить временную базу: ${remote.cleanup_error}.`);
  if (response.timedOut) report.critical.push('Restore-check превысил timeout 10 минут.');
  if (response.code !== 0 || remote.restore_success !== '1') {
    report.critical.push(
      `Restore-check завершился ошибкой${remote.error ? `: ${remote.error}` : ''}. ${sanitizeError(response.stderr)}`.trim(),
    );
  }
  if (report.info.temporaryDatabaseCreated && !report.info.temporaryDatabaseDeleted) {
    report.critical.push(
      `Временная база могла остаться: ${temporaryDatabase}. Удалить вручную только после проверки безопасного префикса.`,
    );
  }
  if (remote.production_table_count && remote.table_count !== remote.production_table_count) {
    report.warnings.push('Количество таблиц backup отличается от текущей production-базы.');
  }
  report.steps.push({ name: 'archive-validation', success: Boolean(remote.backup_format) });
  report.steps.push({ name: 'isolated-restore', success: remote.restore_success === '1' });
  report.steps.push({
    name: 'temporary-database-cleanup',
    success: remote.temporary_database_deleted === '1',
  });
}

function outputReport(value, json) {
  if (json) return process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  console.log(value.success ? 'RESTORE CHECK PASSED' : 'RESTORE CHECK FAILED');
  if (value.info.backup)
    console.log(
      `Backup: ${value.info.backup.name} (${value.info.backup.format}, ${value.info.backup.sizeBytes} байт)`,
    );
  console.log(`Временная база: ${temporaryDatabase}`);
  console.log(
    `Удалена: ${value.info.temporaryDatabaseDeleted === true ? 'да' : 'нет/не создавалась'}`,
  );
  for (const message of value.critical) console.log(`CRITICAL: ${message}`);
  for (const message of value.warnings) console.log(`WARNING: ${message}`);
}
