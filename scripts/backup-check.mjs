import { spawn } from 'node:child_process';
import { access, statfs } from 'node:fs/promises';
import { delimiter, resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';

const PRODUCTION_HOST = '176.125.242.120';
const PREFERRED_SSH_HOST = 'stroit-server';
const FALLBACK_SSH_HOST = `root@${PRODUCTION_HOST}`;
const CONTAINER = 'stroit-postgres';
const DATABASE = 'stroit_dev';
const DATABASE_USER = 'stroit';
const BACKUP_DIRECTORY = '/root/backups/postgres';
const BACKUP_SCRIPT = '/root/backup-postgres.sh';
const CRITICAL_FREE_BYTES = 2 * 1024 ** 3;
const WARNING_FREE_BYTES = 5 * 1024 ** 3;
const SMALL_BACKUP_BYTES = 1024 ** 2;
const STALE_BACKUP_SECONDS = 24 * 60 * 60;
const allowedArguments = new Set(['--json']);
const jsonMode = process.argv.slice(2).includes('--json');

const result = {
  ready: false,
  critical: [],
  warnings: [],
  info: {
    checksAreReadOnly: true,
    pgDumpExecuted: false,
  },
};

try {
  for (const argument of process.argv.slice(2)) {
    if (!allowedArguments.has(argument)) throw new Error(`Неизвестный аргумент: ${argument}`);
  }

  const sshExecutable = await findExecutable('ssh');
  if (!sshExecutable) {
    critical('Команда ssh не найдена на Mac.');
  } else {
    info('ssh', sshExecutable);
    success('ssh доступен на Mac');
    await checkLocalDisk();
    await checkLocalPgDump();

    const sshHost = await resolveSshHost(sshExecutable);
    info('sshHost', sshHost);
    success(`SSH host найден: ${sshHost}`);
    const remote = await runRemoteChecks(sshExecutable, sshHost);
    evaluateRemote(remote);
  }
} catch (error) {
  critical(error instanceof Error ? error.message : String(error));
}

result.ready = result.critical.length === 0;
if (jsonMode) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  printSummary();
}
process.exitCode = result.ready ? 0 : 1;

async function checkLocalDisk() {
  const stats = await statfs(resolve(import.meta.dirname, '..'));
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  info('macFreeBytes', freeBytes);
  checkFreeSpace('Mac', freeBytes);
}

async function checkLocalPgDump() {
  const executable = await findExecutable('pg_dump');
  info('localPgDumpAvailable', Boolean(executable));
  if (executable) success('Локальный pg_dump доступен');
  else warning('Локальный pg_dump отсутствует; текущая серверная архитектура его не использует.');
}

async function resolveSshHost(sshExecutable) {
  if (process.env.BACKUP_CHECK_SSH_HOST) {
    return validateSshTarget(process.env.BACKUP_CHECK_SSH_HOST);
  }

  const config = await capture(sshExecutable, ['-G', PREFERRED_SSH_HOST], { timeoutMs: 5000 });
  const hostname = config.stdout.match(/^hostname\s+(.+)$/m)?.[1]?.trim();
  const user = config.stdout.match(/^user\s+(.+)$/m)?.[1]?.trim();
  if (config.code === 0 && hostname === PRODUCTION_HOST && user === 'root') {
    return PREFERRED_SSH_HOST;
  }
  return FALLBACK_SSH_HOST;
}

function validateSshTarget(value) {
  if (!/^(?:[a-zA-Z0-9._-]+|[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+)$/.test(value)) {
    throw new Error('BACKUP_CHECK_SSH_HOST имеет недопустимый формат.');
  }
  return value;
}

async function runRemoteChecks(sshExecutable, sshHost) {
  const remoteScript = buildRemoteScript();
  const response = await capture(
    sshExecutable,
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      sshHost,
      'sh -s',
    ],
    { input: remoteScript, timeoutMs: 30000 },
  );

  if (response.code !== 0) {
    const detail = sanitizeSshError(response.stderr);
    throw new Error(
      `SSH-подключение или read-only диагностика не выполнены${detail ? `: ${detail}` : '.'}`,
    );
  }
  success('SSH-подключение по ключу работает, host key подтверждён');
  return parseRemoteOutput(response.stdout);
}

function buildRemoteScript() {
  return `
emit() { printf '%s=%s\\n' "$1" "$2"; }
emit ssh_ok 1
if command -v docker >/dev/null 2>&1; then emit docker_command 1; else emit docker_command 0; fi
if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then emit docker_daemon 1; else emit docker_daemon 0; fi
if docker inspect ${CONTAINER} >/dev/null 2>&1; then
  emit container_exists 1
  emit container_state "$(docker inspect --format '{{.State.Status}}' ${CONTAINER} 2>/dev/null)"
  emit container_health "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' ${CONTAINER} 2>/dev/null)"
else
  emit container_exists 0
fi
if docker exec ${CONTAINER} sh -c 'command -v pg_dump >/dev/null 2>&1' >/dev/null 2>&1; then emit pg_dump_available 1; else emit pg_dump_available 0; fi
if docker exec ${CONTAINER} sh -c 'command -v psql >/dev/null 2>&1' >/dev/null 2>&1; then emit psql_available 1; else emit psql_available 0; fi
if docker exec ${CONTAINER} pg_isready -U ${DATABASE_USER} -d ${DATABASE} >/dev/null 2>&1; then emit postgres_ready 1; else emit postgres_ready 0; fi
psql_value() { docker exec ${CONTAINER} psql -X -v ON_ERROR_STOP=1 -U ${DATABASE_USER} -d "$1" -Atqc "$2" 2>/dev/null; }
emit database_exists "$(psql_value postgres "SELECT COUNT(*) FROM pg_database WHERE datname = '${DATABASE}'" || printf 0)"
emit user_exists "$(psql_value postgres "SELECT COUNT(*) FROM pg_roles WHERE rolname = '${DATABASE_USER}'" || printf 0)"
emit select_one "$(psql_value ${DATABASE} 'SELECT 1' || printf 0)"
emit database_size "$(psql_value ${DATABASE} "SELECT pg_database_size('${DATABASE}')" || printf 0)"
emit table_count "$(psql_value ${DATABASE} "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'" || printf 0)"
emit users_count "$(psql_value ${DATABASE} 'SELECT COUNT(*) FROM users' || printf -1)"
emit tasks_count "$(psql_value ${DATABASE} 'SELECT COUNT(*) FROM tasks' || printf -1)"
emit migrations_count "$(psql_value ${DATABASE} 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL' || printf -1)"
if test -d ${BACKUP_DIRECTORY}; then emit backup_directory_exists 1; else emit backup_directory_exists 0; fi
if test -w ${BACKUP_DIRECTORY}; then emit backup_directory_writable 1; else emit backup_directory_writable 0; fi
emit server_free_kb "$(df -Pk ${BACKUP_DIRECTORY} 2>/dev/null | awk 'NR == 2 { print $4 }')"
if test -f ${BACKUP_SCRIPT}; then emit backup_script_exists 1; else emit backup_script_exists 0; fi
if crontab -l 2>/dev/null | grep -F '${BACKUP_SCRIPT}' >/dev/null; then emit cron_exists 1; else emit cron_exists 0; fi
latest="$(find ${BACKUP_DIRECTORY} -maxdepth 1 -type f -printf '%T@|%s|%f\\n' 2>/dev/null | sort -nr | head -n 1)"
if test -n "$latest"; then
  emit last_backup_exists 1
  emit last_backup_mtime "$(printf '%s' "$latest" | cut -d'|' -f1 | cut -d'.' -f1)"
  emit last_backup_size "$(printf '%s' "$latest" | cut -d'|' -f2)"
  emit last_backup_name "$(printf '%s' "$latest" | cut -d'|' -f3-)"
else
  emit last_backup_exists 0
fi
`;
}

function parseRemoteOutput(output) {
  const allowedKeys = new Set([
    'ssh_ok',
    'docker_command',
    'docker_daemon',
    'container_exists',
    'container_state',
    'container_health',
    'pg_dump_available',
    'psql_available',
    'postgres_ready',
    'database_exists',
    'user_exists',
    'select_one',
    'database_size',
    'table_count',
    'users_count',
    'tasks_count',
    'migrations_count',
    'backup_directory_exists',
    'backup_directory_writable',
    'server_free_kb',
    'backup_script_exists',
    'cron_exists',
    'last_backup_exists',
    'last_backup_mtime',
    'last_backup_size',
    'last_backup_name',
  ]);
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    if (allowedKeys.has(key)) values[key] = line.slice(separator + 1).trim();
  }
  return values;
}

function evaluateRemote(remote) {
  requireFlag(remote, 'docker_command', 'Docker доступен', 'Команда docker отсутствует.');
  requireFlag(remote, 'docker_daemon', 'Docker daemon работает', 'Docker daemon недоступен.');
  requireFlag(
    remote,
    'container_exists',
    `Контейнер ${CONTAINER} существует`,
    `Контейнер ${CONTAINER} отсутствует.`,
  );
  if (remote.container_state === 'running') success(`Контейнер ${CONTAINER} запущен`);
  else critical(`Контейнер ${CONTAINER} не находится в состоянии running.`);
  if (remote.container_health === 'healthy') success('PostgreSQL healthy');
  else critical(`PostgreSQL health: ${remote.container_health || 'неизвестно'}.`);
  requireFlag(
    remote,
    'pg_dump_available',
    'pg_dump доступен внутри контейнера',
    'pg_dump отсутствует внутри контейнера.',
  );
  requireFlag(
    remote,
    'psql_available',
    'psql доступен внутри контейнера',
    'psql отсутствует внутри контейнера.',
  );
  requireFlag(remote, 'postgres_ready', 'PostgreSQL отвечает', 'PostgreSQL не отвечает.');
  requireFlag(
    remote,
    'database_exists',
    `База ${DATABASE} существует`,
    `База ${DATABASE} не существует.`,
  );
  requireFlag(
    remote,
    'user_exists',
    `Пользователь ${DATABASE_USER} существует`,
    `Пользователь ${DATABASE_USER} не существует.`,
  );
  requireFlag(remote, 'select_one', 'SELECT 1 выполнен', 'Безопасный SELECT 1 не выполнен.');

  const databaseSize = readNumber(remote.database_size);
  const tableCount = readNumber(remote.table_count);
  const usersCount = readNumber(remote.users_count);
  const tasksCount = readNumber(remote.tasks_count);
  const migrationsCount = readNumber(remote.migrations_count);
  info('databaseSizeBytes', databaseSize);
  info('tableCount', tableCount);
  info('usersCount', usersCount);
  info('tasksCount', tasksCount);
  info('migrationsCount', migrationsCount);
  success(`Размер базы: ${formatBytes(databaseSize)}`);
  success(
    `Таблиц: ${tableCount}; пользователей: ${usersCount}; задач: ${tasksCount}; миграций: ${migrationsCount}`,
  );

  requireFlag(
    remote,
    'backup_directory_exists',
    `Каталог ${BACKUP_DIRECTORY} существует`,
    `Каталог ${BACKUP_DIRECTORY} отсутствует.`,
  );
  requireFlag(
    remote,
    'backup_directory_writable',
    'Каталог backup доступен root для записи',
    'Каталог backup недоступен root для записи.',
  );
  const serverFreeBytes = readNumber(remote.server_free_kb) * 1024;
  info('serverFreeBytes', serverFreeBytes);
  checkFreeSpace('сервере', serverFreeBytes);
  requireFlag(
    remote,
    'backup_script_exists',
    `Скрипт ${BACKUP_SCRIPT} существует`,
    `Скрипт ${BACKUP_SCRIPT} отсутствует.`,
  );

  if (remote.cron_exists === '1') success('Cron-задача backup существует');
  else warning('Cron-задача backup отсутствует.');
  info('cronExists', remote.cron_exists === '1');

  if (remote.last_backup_exists !== '1') {
    warning('Последний backup-файл не найден.');
    info('lastBackup', null);
    return;
  }
  const size = readNumber(remote.last_backup_size);
  const mtime = readNumber(remote.last_backup_mtime);
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - mtime);
  const lastBackup = {
    name: remote.last_backup_name,
    sizeBytes: size,
    modifiedAt: new Date(mtime * 1000).toISOString(),
    ageSeconds,
  };
  info('lastBackup', lastBackup);
  success(`Последний backup: ${lastBackup.name}`);
  success(`Размер последнего backup: ${formatBytes(size)}`);
  if (size === 0) critical('Последний backup-файл имеет размер 0 байт.');
  else if (size < SMALL_BACKUP_BYTES)
    warning(
      `Последний backup очень маленький (${formatBytes(size)}); для почти пустой базы это допустимо, но требует проверки.`,
    );
  if (ageSeconds > STALE_BACKUP_SECONDS)
    warning(`Последний backup старше 24 часов (${formatDuration(ageSeconds)}).`);
  else success(`Возраст последнего backup: ${formatDuration(ageSeconds)}`);
}

function requireFlag(remote, key, successMessage, failureMessage) {
  if (remote[key] === '1') success(successMessage);
  else critical(failureMessage);
}

function checkFreeSpace(location, bytes) {
  success(`Свободно на ${location}: ${formatBytes(bytes)}`);
  if (bytes < CRITICAL_FREE_BYTES) critical(`На ${location} свободно меньше 2 GB.`);
  else if (bytes < WARNING_FREE_BYTES) warning(`На ${location} свободно меньше 5 GB.`);
}

function readNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function success(message) {
  if (!jsonMode) console.log(`✓ ${message}`);
}

function critical(message) {
  result.critical.push(message);
}

function warning(message) {
  result.warnings.push(message);
}

function info(key, value) {
  result.info[key] = value;
}

function printSummary() {
  if (result.critical.length > 0) {
    console.log('\nCRITICAL:');
    for (const message of result.critical) console.log(`✗ ${message}`);
  }
  if (result.warnings.length > 0) {
    console.log('\nWARNING:');
    for (const message of result.warnings) console.log(`⚠ ${message}`);
  }
  console.log(`\n${result.ready ? 'PRODUCTION BACKUP READY' : 'PRODUCTION BACKUP NOT READY'}`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function formatDuration(seconds) {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин.`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч.`;
  return `${(seconds / 86400).toFixed(1)} дн.`;
}

function sanitizeSshError(stderr) {
  return stderr
    .replaceAll(/(?:password|token|secret|database_url)\s*[:=]\s*\S+/gi, '[скрыто]')
    .trim()
    .split(/\r?\n/)
    .slice(-2)
    .join(' ');
}

async function findExecutable(command) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = resolve(directory, command);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return null;
}

function capture(command, args, { input, timeoutMs }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(input);
  });
}
