import { spawn } from 'node:child_process';
import {
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers';
import { URL } from 'node:url';

/* global fetch */

const rootDir = resolve(import.meta.dirname, '..');
const runtimeDir = resolve(rootDir, '.runtime');
const pidFile = resolve(runtimeDir, 'dev-processes.json');
const composeFile = 'infra/docker/docker-compose.yml';
const localEnvPath = resolve(rootDir, '.env');
const envFile = existsSync(localEnvPath) ? '.env' : '.env.example';
const env = { ...parseEnvFile(resolve(rootDir, envFile)), ...process.env };
const services = [
  { name: 'postgres', port: readPort('POSTGRES_PORT', 5432) },
  { name: 'redis', port: readPort('REDIS_PORT', 6379) },
  { name: 'minio', port: readPort('MINIO_API_PORT', 9000) },
  { name: 'minio', port: readPort('MINIO_CONSOLE_PORT', 9001) },
];
const appPorts = [
  { name: 'backend', port: readPort('BACKEND_PORT', 3000) },
  { name: 'demo frontend', port: readPort('DEMO_PORT', 3100) },
];
const composeArgs = ['compose', '--env-file', envFile, '-f', composeFile];
const children = new Set();
const initiallyRunning = new Set();
let foregroundChild = null;
let shuttingDown = false;
let exitCode = 0;
let ownsPidFile = false;

installSignalHandlers();

try {
  claimPidFile();
  console.log('СТРОИТ.РФ — запуск локальной среды');
  if (envFile === '.env.example') {
    console.log('ℹ .env не найден: используются безопасные локальные значения из .env.example.');
    console.log('  Для переопределений создайте .env вручную на основе .env.example.');
  } else {
    console.log('✓ Используется локальный .env');
  }

  assertLocalEnvironment();
  await run('docker', ['info', '--format', '{{.ServerVersion}}'], { quiet: true });
  console.log('✓ Docker доступен');

  for (const service of new Set(services.map(({ name }) => name))) {
    const containerId = (await capture('docker', [...composeArgs, 'ps', '-q', service])).trim();
    if (containerId) initiallyRunning.add(service);
  }

  const conflicts = [];
  for (const item of [...appPorts, ...services]) {
    const owner = await findPortOwner(item.port);
    if (owner) {
      if (services.includes(item) && initiallyRunning.has(item.name)) {
        console.log(`✓ Порт ${item.port} уже используется контейнером ${item.name} этого проекта`);
      } else {
        conflicts.push(`${item.name}: порт ${item.port}\n${owner}`);
      }
    }
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Нельзя запустить локальную среду — заняты нужные порты:\n\n${conflicts.join('\n\n')}\n\n` +
        'Скрипт не завершает чужие процессы. Остановите их вручную и повторите npm run dev.',
    );
  }

  console.log('→ Запускаю PostgreSQL, Redis и MinIO…');
  await run('docker', [...composeArgs, 'up', '-d', 'postgres', 'redis', 'minio']);

  await waitForInfrastructure();
  console.log('✓ PostgreSQL, Redis и MinIO готовы');

  console.log('→ Генерирую Prisma Client…');
  await run('npm', ['run', 'prisma:generate']);
  console.log('→ Применяю существующие локальные миграции…');
  await run('npm', ['run', 'prisma:migrate:deploy']);
  console.log('→ Подготавливаю безопасного локального demo worker…');
  await run('npm', ['run', 'backend:bootstrap-demo-worker']);

  await assertAppPortsAvailable();
  console.log('→ Запускаю backend в watch-режиме и demo frontend…');
  startLongRunning('backend', 'npm', ['run', 'backend:dev']);
  startLongRunning('frontend', 'npm', ['run', 'demo:dev']);

  await Promise.all([
    waitForHttp(`http://localhost:${appPorts[0].port}/health/ready`, (body) => {
      const response = JSON.parse(body);
      return response.status === 'ok' && response.database?.connected === true;
    }),
    waitForHttp(`http://localhost:${appPorts[1].port}/`, (body) => body.includes('СТРОИТ.РФ')),
  ]);

  console.log('\n✓ Локальная среда готова');
  console.log(`  backend: http://localhost:${appPorts[0].port}`);
  console.log(`  frontend: http://localhost:${appPorts[1].port}`);
  console.log('  Остановка: npm run stop или Ctrl+C\n');

  await new Promise(() => {});
} catch (error) {
  if (!shuttingDown) {
    console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
    await shutdown();
  }
}

function parseEnvFile(filePath) {
  const result = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    result[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}

function readPort(name, fallback) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} должен быть корректным TCP-портом, получено: ${env[name]}`);
  }
  return value;
}

function assertLocalEnvironment() {
  if ((env.ENVIRONMENT ?? 'development') !== 'development') {
    throw new Error('npm run dev разрешен только при ENVIRONMENT=development.');
  }

  for (const [name, value] of [
    ['POSTGRES_HOST', env.POSTGRES_HOST],
    ['REDIS_HOST', env.REDIS_HOST],
    ['MINIO_HOST', env.MINIO_HOST],
  ]) {
    if (!isLoopback(value)) throw new Error(`${name} должен указывать на localhost.`);
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL отсутствует или имеет неверный формат.');
  }
  if (!isLoopback(databaseUrl.hostname)) {
    throw new Error('DATABASE_URL должен указывать только на локальную PostgreSQL.');
  }

  let demoBackendUrl;
  try {
    demoBackendUrl = new URL(env.DEMO_BACKEND_URL ?? 'http://localhost:3000');
  } catch {
    throw new Error('DEMO_BACKEND_URL имеет неверный формат.');
  }
  if (!isLoopback(demoBackendUrl.hostname)) {
    throw new Error('DEMO_BACKEND_URL должен указывать только на локальный backend.');
  }
  const demoBackendPort = Number(demoBackendUrl.port || 80);
  if (demoBackendUrl.protocol !== 'http:' || demoBackendPort !== appPorts[0].port) {
    throw new Error('DEMO_BACKEND_URL должен использовать http и порт BACKEND_PORT.');
  }
}

function isLoopback(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    foregroundChild = child;
    let stderr = '';
    if (options.quiet) child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (foregroundChild === child) foregroundChild = null;
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `${command} завершился с кодом ${code ?? signal}${stderr ? `: ${stderr.trim()}` : ''}`,
          ),
        );
    });
  });
}

function capture(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: rootDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${command} завершился с кодом ${code}: ${stderr.trim()}`));
    });
  });
}

function findPortOwner(port) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', (error) =>
      reject(new Error(`Не удалось проверить порт ${port}: ${error.message}`)),
    );
    child.once('exit', (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else if (code === 1) resolvePromise(null);
      else reject(new Error(`lsof завершился с кодом ${code}: ${stderr.trim()}`));
    });
  });
}

async function assertAppPortsAvailable() {
  for (const item of appPorts) {
    const owner = await findPortOwner(item.port);
    if (owner) {
      throw new Error(
        `${item.name} не может запуститься: порт ${item.port} был занят во время подготовки.\n${owner}\n` +
          'Скрипт не завершает этот процесс автоматически.',
      );
    }
  }
}

async function waitForInfrastructure() {
  const deadline = Date.now() + 120_000;
  const uniqueServices = [...new Set(services.map(({ name }) => name))];

  while (Date.now() < deadline) {
    let allHealthy = true;
    for (const service of uniqueServices) {
      const id = (await capture('docker', [...composeArgs, 'ps', '-q', service])).trim();
      if (!id) throw new Error(`Контейнер ${service} не запущен.`);
      const status = (
        await capture('docker', [
          'inspect',
          '--format',
          '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
          id,
        ])
      ).trim();
      if (status === 'unhealthy' || status === 'exited' || status === 'dead') {
        throw new Error(
          `Контейнер ${service} перешел в состояние ${status}. Проверьте docker compose logs ${service}.`,
        );
      }
      if (status !== 'healthy') allHealthy = false;
    }
    if (allHealthy) return;
    await delay(1_000);
  }
  throw new Error('PostgreSQL, Redis или MinIO не стали healthy за 120 секунд.');
}

function startLongRunning(name, command, args) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    detached: true,
  });
  child.devName = name;
  child.devCommand = `${command} ${args.join(' ')}`;
  children.add(child);
  writePidFile();
  child.once('error', async (error) => {
    if (!shuttingDown) {
      console.error(`${name} не удалось запустить: ${error.message}`);
      exitCode = 1;
      await shutdown();
    }
  });
  child.once('exit', async (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`${name} неожиданно завершился (${code ?? signal}).`);
      exitCode = code || 1;
      await shutdown();
    }
  });
}

async function waitForHttp(url, validate) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !shuttingDown) {
    try {
      const response = await fetch(url);
      const body = await response.text();
      if (response.ok && validate(body)) return;
    } catch {
      // The watch process may still be compiling.
    }
    await delay(500);
  }
  throw new Error(`Сервис не стал доступен: ${url}`);
}

function installSignalHandlers() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      if (shuttingDown) return;
      console.log(`\nПолучен ${signal}. Останавливаю локальную среду…`);
      exitCode = signal === 'SIGINT' ? 130 : 143;
      await shutdown();
    });
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (foregroundChild && !foregroundChild.killed) foregroundChild.kill('SIGTERM');
  for (const child of children) killProcessGroup(child, 'SIGTERM');

  const deadline = Date.now() + 5_000;
  while (children.size > 0 && Date.now() < deadline) await delay(100);
  for (const child of children) killProcessGroup(child, 'SIGKILL');
  removeOwnedPidFile();
  console.log('✓ Локальные процессы остановлены');
  process.exit(exitCode);
}

function claimPidFile() {
  mkdirSync(runtimeDir, { recursive: true });

  try {
    const descriptor = openSync(pidFile, 'wx');
    writeFileSync(descriptor, '{}');
    closeSync(descriptor);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;

    let existingPid;
    try {
      existingPid = JSON.parse(readFileSync(pidFile, 'utf8')).supervisor?.pid;
    } catch {
      // An invalid file cannot identify a running project process and is safe to replace.
    }

    if (Number.isInteger(existingPid) && isProcessAlive(existingPid)) {
      throw new Error(
        `Найден активный PID-файл (${pidFile}, PID ${existingPid}). ` +
          'Сначала выполните npm run stop.',
      );
    }
    rmSync(pidFile, { force: true });
    const descriptor = openSync(pidFile, 'wx');
    writeFileSync(descriptor, '{}');
    closeSync(descriptor);
  }

  ownsPidFile = true;
  writePidFile();
}

function writePidFile() {
  if (!ownsPidFile) return;
  const data = {
    version: 1,
    rootDir,
    supervisor: {
      pid: process.pid,
      command: 'node scripts/dev.mjs',
    },
    processes: [...children]
      .filter((child) => child.pid)
      .map((child) => ({
        name: child.devName,
        pid: child.pid,
        pgid: child.pid,
        command: child.devCommand,
      })),
  };
  const temporaryFile = `${pidFile}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryFile, pidFile);
}

function removeOwnedPidFile() {
  if (!ownsPidFile) return;
  try {
    const ownerPid = JSON.parse(readFileSync(pidFile, 'utf8')).supervisor?.pid;
    if (ownerPid === process.pid) rmSync(pidFile, { force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Не удалось удалить PID-файл ${pidFile}: ${error.message}`);
      exitCode ||= 1;
    }
  }
  ownsPidFile = false;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function killProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') child.kill(signal);
  }
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
