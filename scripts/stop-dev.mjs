import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const rootDir = resolve(import.meta.dirname, '..');
const pidFile = resolve(rootDir, '.runtime/dev-processes.json');
const ports = [3000, 3100];
const termTimeoutMs = 5_000;

if (!existsSync(pidFile)) {
  reportMissingPidFile();
  process.exit(0);
}

let runtime;
try {
  runtime = JSON.parse(readFileSync(pidFile, 'utf8'));
} catch (error) {
  failSafe(`PID-файл повреждён: ${error.message}`);
}

if (runtime.version !== 1 || runtime.rootDir !== rootDir) {
  failSafe('PID-файл не принадлежит текущему проекту или имеет неизвестный формат.');
}

const entries = [
  { name: 'dev supervisor', ...runtime.supervisor, type: 'process' },
  ...(Array.isArray(runtime.processes)
    ? runtime.processes.map((entry) => ({ ...entry, type: 'group' }))
    : []),
];
const aliveEntries = entries.filter(
  (entry) =>
    Number.isInteger(entry.pid) &&
    (entry.type === 'group'
      ? Number.isInteger(entry.pgid) && isEntryAlive(entry)
      : isProcessAlive(entry.pid)),
);

if (aliveEntries.length === 0) {
  rmSync(pidFile, { force: true });
  console.log('Локальные процессы уже остановлены');
  process.exit(0);
}

const verifiedEntries = [];
for (const entry of aliveEntries) {
  const verification = verifyEntry(entry);
  if (!verification.ok) {
    failSafe(`PID ${entry.pid} (${entry.name}) не был остановлен: ${verification.reason}`);
  }
  verifiedEntries.push(entry);
}

console.log('Останавливаю локальные backend и demo frontend…');
for (const entry of verifiedEntries) sendSignal(entry, 'SIGTERM');

await waitUntilStopped(verifiedEntries, termTimeoutMs);
const remaining = verifiedEntries.filter(isEntryAlive);
if (remaining.length > 0) {
  console.log('Некоторые процессы не завершились после SIGTERM; отправляю SIGKILL…');
  for (const entry of remaining) sendSignal(entry, 'SIGKILL');
  await waitUntilStopped(remaining, 2_000);
}

const survivors = verifiedEntries.filter(isEntryAlive);
if (survivors.length > 0) {
  failSafe(`Не удалось остановить PID/PGID: ${survivors.map((entry) => entry.pid).join(', ')}.`);
}

rmSync(pidFile, { force: true });
console.log('✓ Локальные процессы остановлены');

function verifyEntry(entry) {
  const details = inspectProcess(entry.pid);
  if (!details && entry.type === 'group') return verifyOrphanedGroup(entry);
  if (!details) return { ok: false, reason: 'не удалось получить сведения о процессе' };
  if (entry.type === 'group' && details.pgid !== entry.pgid) {
    return { ok: false, reason: `PGID ${details.pgid} не совпадает с ожидаемым ${entry.pgid}` };
  }
  if (!details.command.includes(entry.command)) {
    return { ok: false, reason: `команда не совпадает (${details.command})` };
  }
  if (details.cwd !== rootDir) {
    return { ok: false, reason: `рабочий каталог не совпадает (${details.cwd ?? 'неизвестен'})` };
  }
  return { ok: true };
}

function verifyOrphanedGroup(entry) {
  const members = inspectGroup(entry.pgid);
  if (members.length === 0) return { ok: false, reason: 'не удалось получить состав группы' };
  for (const member of members) {
    if (!member.cwd || (member.cwd !== rootDir && !member.cwd.startsWith(`${rootDir}/`))) {
      return {
        ok: false,
        reason: `PID ${member.pid} из PGID ${entry.pgid} имеет чужой рабочий каталог (${member.cwd ?? 'неизвестен'})`,
      };
    }
  }
  return { ok: true };
}

function inspectProcess(pid) {
  const ps = spawnSync('ps', ['-p', String(pid), '-o', 'pgid=', '-o', 'command='], {
    encoding: 'utf8',
  });
  if (ps.status !== 0 || !ps.stdout.trim()) return null;
  const match = ps.stdout.trim().match(/^(\d+)\s+(.+)$/s);
  if (!match) return null;

  const lsof = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
    encoding: 'utf8',
  });
  const cwd = lsof.stdout.match(/^n(.+)$/m)?.[1];
  return { pgid: Number(match[1]), command: match[2].trim(), cwd };
}

function inspectGroup(pgid) {
  const ps = spawnSync('ps', ['-axo', 'pid=', '-o', 'pgid='], { encoding: 'utf8' });
  if (ps.status !== 0) return [];
  return ps.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)$/))
    .filter((match) => match && Number(match[2]) === pgid)
    .map((match) => {
      const pid = Number(match[1]);
      const lsof = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
        encoding: 'utf8',
      });
      return { pid, cwd: lsof.stdout.match(/^n(.+)$/m)?.[1] };
    });
}

function sendSignal(entry, signal) {
  try {
    process.kill(entry.type === 'group' ? -entry.pgid : entry.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function isEntryAlive(entry) {
  const target = entry.type === 'group' ? -entry.pgid : entry.pid;
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function waitUntilStopped(entries, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (entries.some(isEntryAlive) && Date.now() < deadline) await setTimeout(100);
}

function reportMissingPidFile() {
  const owners = ports.flatMap((port) => {
    const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    });
    return result.status === 0 ? [`Порт ${port}:\n${result.stdout.trim()}`] : [];
  });
  if (owners.length === 0) {
    console.log('Локальные процессы уже остановлены');
    return;
  }
  console.log(
    'PID-файл отсутствует. Процессы не остановлены, поскольку их принадлежность проекту не подтверждена.',
  );
  console.log(owners.join('\n\n'));
}

function failSafe(message) {
  console.error(`Ошибка безопасной остановки: ${message}`);
  console.error('Ни один неподтверждённый процесс не был завершён.');
  process.exit(1);
}
