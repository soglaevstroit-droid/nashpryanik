import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CONFIG } from './lib/backup-config.mjs';
import { migrationRisk } from './lib/backup-safety.mjs';
import { capture, sanitizeError } from './lib/process.mjs';
import { createReport, finishReport, saveReport } from './lib/report.mjs';

/* global AbortSignal, fetch */

const rootDir = resolve(import.meta.dirname, '..');
const json = process.argv.slice(2).includes('--json');
const report = createReport('publish:check');
const checks = [
  ['backend:test', 'npm', ['run', 'backend:test'], 600_000],
  ['backend:lint', 'npm', ['run', 'backend:lint'], 300_000],
  ['backend:build', 'npm', ['run', 'backend:build'], 300_000],
  ['eslint', 'npm', ['run', 'lint'], 300_000],
  ['markdownlint', 'npm', ['run', 'lint:md'], 300_000],
  ['yaml', 'npm', ['run', 'lint:yaml'], 300_000],
  [
    'package-lock',
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts', '--dry-run'],
    300_000,
  ],
  ['prisma-generate', 'npm', ['run', 'prisma:generate'], 300_000],
  ['prisma-migrate-local', 'npm', ['run', 'prisma:migrate:deploy'], 300_000],
  ['diff-check', 'git', ['diff', '--check'], 30_000],
];

try {
  await checkGit();
  await checkMigrationRisk();
  for (const [name, command, args, timeout] of checks) await runCheck(name, command, args, timeout);
  await checkLocalHealth();
  const readiness = await runJsonScript('backup-check.mjs');
  if (!readiness.ready)
    throw new Error(`backup:check NOT READY: ${(readiness.critical ?? []).join('; ')}`);
  report.steps.push({ name: 'backup:check', success: true });
  await requireRestoreReport();
} catch (error) {
  report.critical.push(sanitizeError(error instanceof Error ? error.message : error));
} finally {
  finishReport(report);
  await saveReport(report, 'publish-check');
  process.stdout.write(
    json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${report.success ? 'PUBLISH READY' : 'PUBLISH NOT READY'}\n${report.critical.join('\n')}\n`,
  );
  process.exitCode = report.success ? 0 : 1;
}

async function checkGit() {
  const branch = (await git(['branch', '--show-current'])).stdout.trim();
  if (branch !== 'main') throw new Error(`Текущая ветка ${branch}, требуется main.`);
  for (const marker of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD']) {
    const probe = await git(['rev-parse', '--verify', '-q', marker]);
    if (probe.code === 0) throw new Error(`Обнаружена незавершённая Git-операция: ${marker}.`);
  }
  const conflicts = (await git(['diff', '--name-only', '--diff-filter=U'])).stdout.trim();
  if (conflicts) throw new Error(`Обнаружены конфликты: ${conflicts}`);
  const local = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const origin = (await git(['rev-parse', 'origin/main'])).stdout.trim();
  if (local !== origin)
    throw new Error('Локальный HEAD не совпадает с origin/main до публикации изменений.');
  report.info.git = { branch, baseCommit: local };
  report.info.changedFiles = (await git(['status', '--short'])).stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  report.steps.push({ name: 'git-safety', success: true });
}

async function checkMigrationRisk() {
  const files = (await git(['diff', '--name-only', '--', 'apps/backend/prisma/migrations'])).stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const risks = [];
  for (const file of files)
    risks.push(
      ...migrationRisk(await readFile(resolve(rootDir, file), 'utf8')).map(
        (risk) => `${file}: ${risk}`,
      ),
    );
  report.info.migrationRisks = risks;
  if (risks.length > 0)
    throw new Error(`Обнаружены миграции повышенного риска: ${risks.join('; ')}`);
}

async function runCheck(name, command, args, timeoutMs) {
  const response = await capture(command, args, { cwd: rootDir, timeoutMs });
  report.steps.push({ name, success: response.code === 0, durationLimited: response.timedOut });
  if (response.code !== 0)
    throw new Error(
      `${name} завершился ошибкой: ${sanitizeError(response.stderr || response.stdout)}`,
    );
}

async function checkLocalHealth() {
  const endpoints = [
    ['backend', 'http://localhost:3000/health/ready'],
    ['frontend', 'http://localhost:3100/'],
  ];
  const deadline = Date.now() + CONFIG.timeouts.health;
  const pending = new Map(endpoints);
  let lastError = '';
  while (pending.size > 0 && Date.now() < deadline) {
    for (const [name, url] of pending) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        pending.delete(name);
        report.steps.push({ name: `local-${name}-health`, success: true });
      } catch (error) {
        lastError = `${name}: ${error.message}`;
      }
    }
    if (pending.size > 0) await delay(1000);
  }
  if (pending.size > 0) {
    const names = [...pending.keys()].join(', ');
    throw new Error(`Локальные health endpoints недоступны за 60 секунд (${names}): ${lastError}`);
  }
}

async function requireRestoreReport() {
  const directory = resolve(rootDir, '.runtime/reports');
  const files = (await readdir(directory).catch(() => []))
    .filter((name) => name.startsWith('restore-check-'))
    .sort()
    .reverse();
  for (const file of files) {
    const value = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
    if (value.success && value.info?.temporaryDatabaseDeleted === true) {
      report.info.restoreCheckReport = file;
      report.steps.push({ name: 'successful-restore-check', success: true });
      return;
    }
  }
  throw new Error('Нет успешного restore-check с подтверждённой очисткой временной базы.');
}

async function runJsonScript(script) {
  const response = await capture(
    process.execPath,
    [resolve(import.meta.dirname, script), '--json'],
    { cwd: rootDir, timeoutMs: CONFIG.timeouts.readOnly },
  );
  try {
    return JSON.parse(response.stdout);
  } catch {
    throw new Error(`${script} вернул некорректный JSON.`);
  }
}

function git(args) {
  return capture('git', args, { cwd: rootDir, timeoutMs: 30_000 });
}
