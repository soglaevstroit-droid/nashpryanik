import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CONFIG } from './lib/backup-config.mjs';
import { capture, findExecutable, sanitizeError, sshArgs } from './lib/process.mjs';
import { createReport, finishReport, saveReport } from './lib/report.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const approved = args.includes('--approved');
const messageIndex = args.indexOf('--message');
const message =
  messageIndex >= 0 ? args[messageIndex + 1] : 'chore: add safe backup and publish workflow';
const report = createReport(dryRun ? 'publish:dry-run' : 'publish');

try {
  if (dryRun) await printDryRun();
  else {
    if (!approved)
      throw new Error(
        'Публикация заблокирована: нужен --approved и точное утверждение пользователя по AGENTS.md.',
      );
    await executePublish();
  }
} catch (error) {
  report.critical.push(sanitizeError(error instanceof Error ? error.message : error));
} finally {
  finishReport(report);
  await saveReport(report, 'publish');
  if (!dryRun)
    console.log(
      report.success ? 'PUBLISH PASSED' : `PUBLISH FAILED\n${report.critical.join('\n')}`,
    );
  process.exitCode = report.success ? 0 : 1;
}

async function printDryRun() {
  const changed = (await run('git', ['status', '--short'])).stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const restoreReport = await latestSuccessfulRestoreReport();
  const plan = {
    success: true,
    dryRun: true,
    files: changed,
    proposedCommitMessage: message,
    branch: 'main',
    remote: 'origin',
    server: CONFIG.sshAlias,
    backup: 'stroit_dev_<UTC>.sql.gz + SHA256 + download + isolated restore-check',
    deploy: [`cd ${CONFIG.projectDirectory}`, 'verify clean production tree', './deploy.sh'],
    healthChecks: [
      'systemctl stroit-backend/stroit-demo',
      'nginx -t',
      'GET /api/health',
      'HEAD /',
      'Docker health',
    ],
    rollback: 'previous production commit; code-only rollback, never automatic migration rollback',
    restoreCheckReport: restoreReport?.name ?? null,
    mutationsPerformed: false,
  };
  report.info.plan = plan;
  report.steps.push({ name: 'dry-run-plan', success: true });
  console.log(JSON.stringify(plan, null, 2));
}

async function executePublish() {
  const check = await run(
    process.execPath,
    [resolve(import.meta.dirname, 'publish-check.mjs'), '--json'],
    CONFIG.timeouts.deploy,
  );
  if (check.code !== 0) throw new Error('publish:check не прошёл.');
  await mustRun('git', ['add', '-A']);
  await mustRun('git', ['commit', '-m', message]);
  await mustRun('git', ['push', 'origin', 'main'], 300_000);
  await mustRun(
    process.execPath,
    [resolve(import.meta.dirname, 'backup-create.mjs'), '--approved'],
    CONFIG.timeouts.backup + CONFIG.timeouts.restore,
  );
  const ssh = await findExecutable('ssh');
  if (!ssh) throw new Error('ssh не найден.');
  const host = CONFIG.sshAlias;
  const previous = (
    await run(ssh, sshArgs(host, `git -C ${CONFIG.projectDirectory} rev-parse HEAD`), 30_000)
  ).stdout.trim();
  report.info.previousProductionCommit = previous;
  const deploy = await run(
    ssh,
    sshArgs(
      host,
      `cd ${CONFIG.projectDirectory} && test -z "$(git status --porcelain)" && ./deploy.sh`,
    ),
    CONFIG.timeouts.deploy,
  );
  if (deploy.code !== 0) {
    report.warnings.push(`Deploy failed: ${sanitizeError(deploy.stderr)}`);
    await rollback(ssh, host, previous);
    throw new Error('Deploy завершился ошибкой; выполнен контролируемый code rollback.');
  }
  const health = await run(
    ssh,
    sshArgs(
      host,
      "systemctl is-active stroit-backend && systemctl is-active stroit-demo && nginx -t && curl -fsS https://stroit.site/api/health && curl -fsSI https://stroit.site/ && docker inspect --format '{{.Name}}={{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' stroit-postgres stroit-redis stroit-minio",
    ),
    CONFIG.timeouts.health,
  );
  if (health.code !== 0 || !health.stdout.includes('"status":"ok"')) {
    await rollback(ssh, host, previous);
    throw new Error('Production health-check не прошёл; выполнен контролируемый code rollback.');
  }
  report.steps.push({ name: 'commit-push-backup-deploy-health', success: true });
}

async function rollback(ssh, host, previous) {
  if (!/^[a-f0-9]{40}$/.test(previous))
    throw new Error('Rollback запрещён: предыдущий commit невалиден.');
  const command = `cd ${CONFIG.projectDirectory} && git reset --hard ${previous} && npm ci && npm run prisma:generate && npm run backend:build && systemctl restart stroit-backend && systemctl restart stroit-demo && curl -fsS https://stroit.site/api/health`;
  const response = await run(ssh, sshArgs(host, command), CONFIG.timeouts.deploy);
  if (response.code !== 0) throw new Error(`Rollback не удался: ${sanitizeError(response.stderr)}`);
  report.steps.push({ name: 'rollback', success: true });
}

async function latestSuccessfulRestoreReport() {
  const directory = resolve(rootDir, '.runtime/reports');
  const names = (await readdir(directory).catch(() => []))
    .filter((name) => name.startsWith('restore-check-'))
    .sort()
    .reverse();
  for (const name of names) {
    const value = JSON.parse(await readFile(resolve(directory, name), 'utf8'));
    if (value.success && value.info?.temporaryDatabaseDeleted) return { name, value };
  }
  return null;
}

async function mustRun(command, commandArgs, timeout = 30_000) {
  const response = await run(command, commandArgs, timeout);
  if (response.code !== 0)
    throw new Error(`${command} ${commandArgs.join(' ')}: ${sanitizeError(response.stderr)}`);
  return response;
}

function run(command, commandArgs, timeoutMs = 30_000) {
  return capture(command, commandArgs, { cwd: rootDir, timeoutMs });
}
