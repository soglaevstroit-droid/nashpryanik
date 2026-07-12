import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CONFIG } from './lib/backup-config.mjs';
import { assertSafeBackupName } from './lib/backup-safety.mjs';
import { capture, findExecutable, sanitizeError, sshArgs } from './lib/process.mjs';
import { createReport, finishReport, saveReport } from './lib/report.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const report = createReport('backup:create');
const args = new Set(process.argv.slice(2));
const json = args.delete('--json');
const approved = args.delete('--approved');
if (args.size > 0) throw new Error(`Неизвестные аргументы: ${[...args].join(', ')}`);

try {
  if (!approved)
    throw new Error(
      'Создание backup заблокировано: требуется --approved и отдельное утверждение по AGENTS.md.',
    );
  await requireSuccessfulRestoreCheck();
  const readiness = await runJsonScript('backup-check.mjs');
  if (!readiness.ready)
    throw new Error(`backup:check NOT READY: ${(readiness.critical ?? []).join('; ')}`);
  const ssh = await findExecutable('ssh');
  const scp = await findExecutable('scp');
  if (!ssh || !scp) throw new Error('Для backup:create требуются ssh и scp.');
  const host = process.env.BACKUP_CHECK_SSH_HOST ?? CONFIG.sshAlias;
  const response = await capture(ssh, sshArgs(host, 'bash -s'), {
    input: buildCreateScript(),
    timeoutMs: CONFIG.timeouts.backup,
  });
  if (response.code !== 0)
    throw new Error(
      `Создание backup не выполнено: ${sanitizeError(response.stderr || response.stdout)}`,
    );
  const remote = parseKeyValues(response.stdout);
  const name = assertSafeBackupName(remote.backup_name);
  const expectedSize = Number(remote.backup_size);
  const localDirectory = resolveLocalDirectory(name);
  await mkdir(localDirectory, { recursive: true, mode: 0o700 });
  const localBackup = resolve(localDirectory, name);
  const localChecksum = `${localBackup}.sha256`;
  for (const [remoteName, localPath] of [
    [name, localBackup],
    [`${name}.sha256`, localChecksum],
  ]) {
    const copied = await capture(
      scp,
      [
        '-o',
        'BatchMode=yes',
        '-o',
        'StrictHostKeyChecking=yes',
        `${host}:${CONFIG.backupDirectory}/${remoteName}`,
        localPath,
      ],
      { timeoutMs: CONFIG.timeouts.backup },
    );
    if (copied.code !== 0)
      throw new Error(`SCP завершился ошибкой: ${sanitizeError(copied.stderr)}`);
  }
  const localSize = (await stat(localBackup)).size;
  if (localSize !== expectedSize) throw new Error('Размер backup на Mac не совпадает с сервером.');
  const checksumText = await readFile(localChecksum, 'utf8');
  const expectedHash = checksumText.match(/^SHA256\s+([a-f0-9]{64})\s+/i)?.[1]?.toLowerCase();
  const actualHash = createHash('sha256')
    .update(await readFile(localBackup))
    .digest('hex');
  if (!expectedHash || expectedHash !== actualHash)
    throw new Error('Checksum скачанного backup не совпадает.');
  const gzip = await capture('gzip', ['-t', localBackup], { timeoutMs: CONFIG.timeouts.readOnly });
  if (gzip.code !== 0) throw new Error('Скачанный gzip повреждён.');
  const restore = await runJsonScript('backup-restore-check.mjs', ['--file', name]);
  if (!restore.success)
    throw new Error('Restore-check нового backup не прошёл; файл сохранён для расследования.');
  report.info = {
    backup: name,
    sizeBytes: localSize,
    checksum: actualHash,
    localPath: localBackup.replace(`${rootDir}/`, ''),
    restoreCheckPassed: true,
  };
  report.steps.push(
    { name: 'atomic-server-backup', success: true },
    { name: 'download-and-checksum', success: true },
    { name: 'restore-check-new-backup', success: true },
  );
} catch (error) {
  report.critical.push(sanitizeError(error instanceof Error ? error.message : error));
} finally {
  finishReport(report);
  await saveReport(report, 'backup-create');
  process.stdout.write(
    json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${report.success ? 'BACKUP CREATE PASSED' : 'BACKUP CREATE FAILED'}\n${report.critical.join('\n')}\n`,
  );
  process.exitCode = report.success ? 0 : 1;
}

async function requireSuccessfulRestoreCheck() {
  const directory = resolve(rootDir, '.runtime/reports');
  const files = (await readdir(directory).catch(() => []))
    .filter((name) => name.startsWith('restore-check-'))
    .sort()
    .reverse();
  for (const file of files) {
    const candidate = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
    if (candidate.success && candidate.info?.temporaryDatabaseDeleted === true) return;
  }
  throw new Error(
    'Нет последнего успешного restore-check с подтверждённым удалением временной базы.',
  );
}

async function runJsonScript(script, extra = []) {
  const response = await capture(
    process.execPath,
    [resolve(import.meta.dirname, script), ...extra, '--json'],
    { cwd: rootDir, timeoutMs: CONFIG.timeouts.restore },
  );
  try {
    return JSON.parse(response.stdout);
  } catch {
    throw new Error(`${script} вернул некорректный JSON: ${sanitizeError(response.stderr)}`);
  }
}

function buildCreateScript() {
  return `set -Eeuo pipefail
dir='${CONFIG.backupDirectory}'
lock="$dir/.backup.lock"
test -d "$dir"
if test -e "$lock"; then
  age=$(( $(date +%s) - $(stat -c %Y "$lock") ))
  printf 'LOCK_EXISTS age=%s\\n' "$age" >&2
  exit 40
fi
( set -o noclobber; printf 'pid=%s started=%s\\n' "$$" "$(date -u +%FT%TZ)" > "$lock" ) || exit 40
partial=''
checksum_partial=''
cleanup() { rm -f "$lock"; test -z "$partial" || test ! -f "$partial" || printf 'PARTIAL_RETAINED=%s\\n' "$partial" >&2; test -z "$checksum_partial" || rm -f "$checksum_partial"; }
trap cleanup EXIT INT TERM HUP
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="stroit_dev_$timestamp.sql.gz"
final="$dir/$name"
partial="$final.partial"
checksum="$final.sha256"
checksum_partial="$checksum.partial"
test ! -e "$final" && test ! -e "$partial"
docker exec ${CONFIG.container} pg_dump -U ${CONFIG.databaseUser} -d ${CONFIG.database} --format=plain --no-owner --no-privileges | gzip -c > "$partial"
test -s "$partial"
gzip -t "$partial"
hash="$(sha256sum "$partial" | awk '{print $1}')"
printf 'SHA256  %s  %s\\n' "$hash" "$name" > "$checksum_partial"
mv "$partial" "$final"
partial=''
mv "$checksum_partial" "$checksum"
checksum_partial=''
printf 'backup_name=%s\\nbackup_size=%s\\nchecksum=%s\\n' "$name" "$(stat -c %s "$final")" "$hash"
`;
}

function parseKeyValues(output) {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.split('='))
      .filter(([key, value]) => key && value),
  );
}

function resolveLocalDirectory(name) {
  const match = name.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) throw new Error('Дата отсутствует в имени backup.');
  return resolve(rootDir, CONFIG.localBackupDirectory, match[1], match[2], match[3]);
}
