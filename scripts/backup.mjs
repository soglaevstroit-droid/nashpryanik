import { access, mkdir, readFile } from 'node:fs/promises';
import { delimiter, isAbsolute, relative, resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const envPath = resolve(rootDir, '.env');
const exampleEnvPath = resolve(rootDir, '.env.example');
const allowedArguments = new Set(['--dry-run']);
const argumentsPassed = process.argv.slice(2);

try {
  for (const argument of argumentsPassed) {
    if (!allowedArguments.has(argument)) {
      throw new Error(`Неизвестный аргумент: ${argument}. Поддерживается только --dry-run.`);
    }
  }

  const { env, source } = await loadEnvironment();
  const config = readConfig(env);
  const backupRoot = resolveBackupRoot(config.directory);
  const now = new Date();
  const datePath = [
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ];
  const storageDirectory = resolve(backupRoot, config.databaseName, ...datePath);
  const timestamp = now
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const filename = `${config.databaseName}_${timestamp}.dump`;
  const destination = resolve(storageDirectory, filename);

  console.log('СТРОИТ.РФ — подготовка резервного копирования PostgreSQL');
  console.log(`✓ Конфигурация проверена (${source})`);
  await checkExecutable('ssh');
  await checkExecutable('pg_dump');
  await mkdir(storageDirectory, { recursive: true, mode: 0o700 });
  await access(storageDirectory);
  console.log(`✓ Каталог backup готов: ${relative(rootDir, storageDirectory)}`);
  console.log('○ Сетевая доступность не проверялась: подготовительный режим запрещает подключение');

  const sshTarget = `${config.sshUser}@${config.sshHost}`;
  const pgDumpCommand = [
    'pg_dump',
    `--host=${config.databaseHost}`,
    `--port=${config.databasePort}`,
    `--username=${config.databaseUser}`,
    `--dbname=${config.databaseName}`,
    '--format=custom',
    '--no-password',
    '--file=-',
  ].join(' ');

  console.log('\nПлан будущего backup (команды не выполняются):');
  console.log(`  Сервер: ${sshTarget}:${config.sshPort}`);
  console.log(
    `  База: ${config.databaseName} (${config.databaseUser}@${config.databaseHost}:${config.databasePort})`,
  );
  console.log(`  Каталог: ${relative(rootDir, storageDirectory)}`);
  console.log(`  Файл: ${relative(rootDir, destination)}`);
  console.log(`  pg_dump: ${pgDumpCommand}`);
  console.log(
    `  Транспорт: ssh -p ${config.sshPort} ${sshTarget} '<pg_dump выше>' > ${relative(rootDir, destination)}`,
  );
  console.log('  Восстановление: проверить dump, создать пустую БД, затем выполнить pg_restore');
  console.log('  Статус: подготовка завершена; production-соединение и dump не выполнялись.');
} catch (error) {
  console.error(
    `Ошибка подготовки backup: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

async function loadEnvironment() {
  try {
    return { env: parseEnv(await readFile(envPath, 'utf8')), source: '.env' };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return {
      env: parseEnv(await readFile(exampleEnvPath, 'utf8')),
      source: '.env.example (безопасный шаблон; создайте .env перед будущим запуском)',
    };
  }
}

function parseEnv(contents) {
  const result = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    result[key] = value.replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}

function readConfig(env) {
  const required = [
    'BACKUP_SSH_HOST',
    'BACKUP_SSH_PORT',
    'BACKUP_SSH_USER',
    'BACKUP_DATABASE_HOST',
    'BACKUP_DATABASE_PORT',
    'BACKUP_DATABASE_NAME',
    'BACKUP_DATABASE_USER',
    'BACKUP_DIRECTORY',
  ];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) throw new Error(`Не заданы переменные: ${missing.join(', ')}`);

  validatePort('BACKUP_SSH_PORT', env.BACKUP_SSH_PORT);
  validatePort('BACKUP_DATABASE_PORT', env.BACKUP_DATABASE_PORT);
  for (const name of ['BACKUP_DATABASE_NAME', 'BACKUP_DATABASE_USER']) {
    if (!/^[a-zA-Z0-9_]+$/.test(env[name]))
      throw new Error(`${name} содержит недопустимые символы.`);
  }
  for (const name of ['BACKUP_SSH_HOST', 'BACKUP_SSH_USER', 'BACKUP_DATABASE_HOST']) {
    if (!/^[a-zA-Z0-9._@:-]+$/.test(env[name]))
      throw new Error(`${name} содержит недопустимые символы.`);
  }

  return {
    sshHost: env.BACKUP_SSH_HOST,
    sshPort: env.BACKUP_SSH_PORT,
    sshUser: env.BACKUP_SSH_USER,
    databaseHost: env.BACKUP_DATABASE_HOST,
    databasePort: env.BACKUP_DATABASE_PORT,
    databaseName: env.BACKUP_DATABASE_NAME,
    databaseUser: env.BACKUP_DATABASE_USER,
    directory: env.BACKUP_DIRECTORY,
  };
}

function validatePort(name, value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} должен быть TCP-портом от 1 до 65535.`);
  }
}

function resolveBackupRoot(directory) {
  if (isAbsolute(directory)) throw new Error('BACKUP_DIRECTORY должен быть путём внутри проекта.');
  const result = resolve(rootDir, directory);
  if (result === rootDir || relative(rootDir, result).startsWith('..')) {
    throw new Error('BACKUP_DIRECTORY должен быть отдельным каталогом внутри проекта.');
  }
  return result;
}

async function checkExecutable(command) {
  const executable = await findExecutable(command);
  if (executable) console.log(`✓ ${command} найден: ${executable}`);
  else console.log(`⚠ ${command} не найден; установите его до включения реального backup`);
}

async function findExecutable(command) {
  const paths = (process.env.PATH ?? '').split(delimiter);
  for (const path of paths) {
    const candidate = resolve(path, command);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return null;
}
