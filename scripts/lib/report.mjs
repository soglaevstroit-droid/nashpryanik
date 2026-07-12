import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '../..');
const reportDirectory = resolve(rootDir, '.runtime/reports');

export function createReport(command) {
  const startedAt = new Date();
  return {
    command,
    success: false,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    durationMs: 0,
    critical: [],
    warnings: [],
    info: {},
    steps: [],
    _startedMs: startedAt.getTime(),
  };
}

export function finishReport(report) {
  const finishedAt = new Date();
  report.finishedAt = finishedAt.toISOString();
  report.durationMs = finishedAt.getTime() - report._startedMs;
  report.success = report.critical.length === 0;
  delete report._startedMs;
  return report;
}

export async function saveReport(report, prefix) {
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  const timestamp = report.startedAt.replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const path = resolve(reportDirectory, `${prefix}-${timestamp}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return path;
}
