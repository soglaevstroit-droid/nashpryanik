import { createHash } from 'node:crypto';
import type { TaskStatus } from '@prisma/client';

export const ILYA_TO_WORK_MARKER = 'ILYA_TO_WORK_TEST_V1';
export const ILYA_SOURCE_LOGIN = 'ilya';
export const ILYA_CLONE_TARGET_LOGIN = 'work';
export const ILYA_CLONE_MANAGER_LOGIN = 'work2';
export const cloneStoragePrefix = 'ilya-to-work-test-v1';

export interface PositionableCloneTask {
  id: string;
  status: TaskStatus;
  deletedAt: Date | null;
}

export function stableCloneId(kind: string, sourceId: string): string {
  return `${cloneStoragePrefix}-${kind}-${createHash('sha256').update(sourceId).digest('hex').slice(0, 24)}`;
}

export function cloneOperationId(sourceTaskId: string): string {
  return `${ILYA_TO_WORK_MARKER}:TASK:${sourceTaskId}`;
}

export function normalizeCloneStatus(
  sourceStatus: TaskStatus,
  sourceDeletedAt: Date | null,
  hasActiveInProgress: boolean,
): { status: TaskStatus; normalized: boolean } {
  if (sourceDeletedAt || sourceStatus !== 'IN_PROGRESS' || !hasActiveInProgress)
    return { status: sourceStatus, normalized: false };
  return { status: 'ACCEPTED', normalized: true };
}

export function assignSequentialClonePositions(
  tasks: readonly PositionableCloneTask[],
  startPosition: number,
): Map<string, number> {
  if (!Number.isInteger(startPosition) || startPosition < 1)
    throw new Error('Clone start position must be a positive integer.');
  const active = tasks.filter(
    ({ deletedAt, status }) => !deletedAt && status !== 'COMPLETED' && status !== 'CANCELLED',
  );
  return new Map(active.map(({ id }, index) => [id, startPosition + index]));
}

export function cleanupIsConfirmed(args: readonly string[]): boolean {
  return args.includes('--clean') && args.includes('--confirm');
}

export function assertCloneLocalOnly(input: {
  environment: string;
  databaseUrl: string;
  minioHost: string;
  productionAuthorized?: boolean;
}): void {
  const url = new URL(input.databaseUrl);
  const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const localMinio = input.minioHost === 'localhost' || input.minioHost === '127.0.0.1';
  const developmentDatabase = url.pathname.toLowerCase().includes('dev');
  if (input.productionAuthorized) {
    if (input.environment !== 'production' || !localHost || !localMinio)
      throw new Error(
        `${ILYA_TO_WORK_MARKER} confirmed production mode requires loopback DB and MinIO.`,
      );
    return;
  }
  if (input.environment === 'production' || !localHost || !localMinio || !developmentDatabase)
    throw new Error(`${ILYA_TO_WORK_MARKER} is allowed only in a local development environment.`);
}

export function remapJson(value: unknown, replacements: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const [source, clone] of replacements) result = result.replaceAll(source, clone);
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => remapJson(item, replacements));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, remapJson(item, replacements)]),
    );
  return value;
}
