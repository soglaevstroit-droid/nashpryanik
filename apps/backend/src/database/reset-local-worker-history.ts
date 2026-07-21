import { EventType } from '@prisma/client';
import { Client } from 'minio';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppConfigService } from '../config/app-config.service.js';
import { DatabaseService } from './database.service.js';

const targetLogins = ['ilya', 'igor'] as const;
const localConfirmation = '--confirm-local-ilya-igor-cleanup';
const productionBackupDirectory = '/root/backups/postgres';
const productionBackupPattern = /^stroit_dev_\d{8}T\d{6}Z\.(?:dump|sql\.gz)$/;
const options = parseArguments(process.argv.slice(2));
const confirmed = options.apply;
const workEventTypes: EventType[] = [
  'WORK_SHIFT_STARTED',
  'WORK_SHIFT_PAUSED',
  'WORK_SHIFT_RESUMED',
  'WORK_SHIFT_FINISHED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_ASSIGNED',
  'TASK_ACCEPTED',
  'TASK_STARTED',
  'TASK_RESUMED',
  'TASK_PAUSED',
  'TASK_SENT_TO_REVIEW',
  'TASK_COMPLETED',
  'TASK_CANCELLED',
  'TASK_PRIORITY_CHANGED',
  'TASK_ACCESS_OPENED',
  'TASK_ACCESS_CLOSED',
  'TASK_DELETED',
  'STEP_CREATED',
  'STEP_STARTED',
  'STEP_COMPLETED',
  'STEP_REOPENED',
  'STEP_CANCELLED',
  'PHOTO_CAPTURED',
  'PHOTO_UPLOADED',
  'HELP_REQUEST',
  'MANAGER_REPLY',
  'PHOTO_APPROVED',
  'PHOTO_REJECTED',
  'PHOTO_DELETED',
  'COINS_GRANTED',
  'COINS_REVOKED',
  'BONUS_GRANTED',
  'PAYMENT_CREATED',
  'PAYMENT_APPROVED',
  'PAYMENT_COMPLETED',
  'PROCESS_CREATED',
  'PROCESS_STARTED',
  'PROCESS_PAUSED',
  'PROCESS_RESUMED',
  'PROCESS_COMPLETED',
  'PROCESS_CANCELLED',
];
const financialEventTypes: EventType[] = [
  'COINS_GRANTED',
  'COINS_REVOKED',
  'BONUS_GRANTED',
  'PAYMENT_CREATED',
  'PAYMENT_APPROVED',
  'PAYMENT_COMPLETED',
];

const config = new AppConfigService();
const databaseUrl = new URL(config.databaseUrl);
assertEnvironment();
const verifiedBackup = await verifyRequiredBackup();

const database = new DatabaseService(config);
const storage = new Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

try {
  const users = await database.user.findMany({
    where: { email: { in: [...targetLogins], mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      passwordHash: true,
      openingBalanceCoinUnits: true,
    },
    orderBy: { email: 'asc' },
  });
  assertExactUsers(users);
  assertExpectedUserIds(users);
  const userIds = users.map(({ id }) => id);

  const tasks = await database.task.findMany({
    where: { assigneeId: { in: userIds } },
    select: { id: true, processId: true, completedWorkShiftId: true },
  });
  const taskIds = tasks.map(({ id }) => id);
  const shifts = await database.workShift.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, processId: true },
  });
  const shiftIds = shifts.map(({ id }) => id);
  const steps = await database.taskStep.findMany({
    where: { taskId: { in: taskIds } },
    select: { id: true },
  });
  const stepIds = steps.map(({ id }) => id);
  const messages = await database.taskMessage.findMany({
    where: { taskId: { in: taskIds } },
    select: { id: true, senderId: true },
  });
  const messageIds = messages.map(({ id }) => id);
  const processIds = [
    ...new Set(
      [
        ...tasks.map(({ processId }) => processId),
        ...shifts.map(({ processId }) => processId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  const associatedEvents = await database.event.findMany({
    where: {
      OR: [
        { taskId: { in: taskIds } },
        { taskStepId: { in: stepIds } },
        { workShiftId: { in: shiftIds } },
        { actorId: { in: userIds }, type: { in: workEventTypes } },
        { entityType: 'task', entityId: { in: taskIds } },
        { entityType: { in: ['taskStep', 'task_step'] }, entityId: { in: stepIds } },
        { entityType: 'taskMessage', entityId: { in: messageIds } },
        { entityType: 'process', entityId: { in: processIds } },
        {
          entityType: { in: ['user', 'worker'] },
          entityId: { in: userIds },
          type: { in: financialEventTypes },
        },
      ],
    },
    select: { id: true, actorId: true },
  });
  const initialEventIds = associatedEvents.map(({ id }) => id);
  const initialArtifacts = await database.artifact.findMany({
    where: {
      OR: [
        { taskId: { in: taskIds } },
        { taskStepId: { in: stepIds } },
        { workShiftId: { in: shiftIds } },
        { uploadedBy: { in: userIds } },
        { eventId: { in: initialEventIds } },
      ],
    },
    select: { id: true, eventId: true },
  });
  const eventIds = [
    ...new Set([...initialEventIds, ...initialArtifacts.map(({ eventId }) => eventId)]),
  ];
  const artifacts = await database.artifact.findMany({
    where: {
      OR: [{ id: { in: initialArtifacts.map(({ id }) => id) } }, { eventId: { in: eventIds } }],
    },
    select: { id: true, uploadedBy: true, storageKey: true, previewStorageKey: true },
  });
  const artifactIds = artifacts.map(({ id }) => id);
  const workShiftPhotos = await database.workShiftPhoto.findMany({
    where: { OR: [{ workShiftId: { in: shiftIds } }, { artifactId: { in: artifactIds } }] },
    select: { id: true },
  });
  const accruals = await database.shiftAccrual.findMany({
    where: { OR: [{ workerId: { in: userIds } }, { workShiftId: { in: shiftIds } }] },
    select: { id: true },
  });

  const retainedArtifacts = await database.artifact.findMany({
    where: { id: { notIn: artifactIds } },
    select: { storageKey: true, previewStorageKey: true },
  });
  const retainedKeys = new Set(
    retainedArtifacts.flatMap(({ storageKey, previewStorageKey }) =>
      previewStorageKey ? [storageKey, previewStorageKey] : [storageKey],
    ),
  );
  const originalKeys = unique(artifacts.map(({ storageKey }) => storageKey));
  const previewKeys = unique(
    artifacts.flatMap(({ previewStorageKey }) => (previewStorageKey ? [previewStorageKey] : [])),
  );
  const sharedKeys = unique(
    [...originalKeys, ...previewKeys].filter((key) => retainedKeys.has(key)),
  );
  const removableOriginalKeys = originalKeys.filter((key) => !retainedKeys.has(key));
  const removablePreviewKeys = previewKeys.filter((key) => !retainedKeys.has(key));

  const retainedProcesses = await Promise.all([
    database.task.findMany({
      where: { processId: { in: processIds }, id: { notIn: taskIds } },
      select: { processId: true },
    }),
    database.workShift.findMany({
      where: { processId: { in: processIds }, id: { notIn: shiftIds } },
      select: { processId: true },
    }),
  ]);
  const retainedProcessIds = new Set(
    retainedProcesses
      .flat()
      .map(({ processId }) => processId)
      .filter((id): id is string => Boolean(id)),
  );
  const removableProcessIds = processIds.filter((id) => !retainedProcessIds.has(id));
  const relatedUserIds = unique(
    [
      ...messages.map(({ senderId }) => senderId),
      ...associatedEvents.flatMap(({ actorId }) => (actorId ? [actorId] : [])),
      ...artifacts.map(({ uploadedBy }) => uploadedBy),
    ].filter((id) => !userIds.includes(id)),
  );
  const relatedUsers = await database.user.findMany({
    where: { id: { in: relatedUserIds } },
    select: { id: true, email: true, role: true },
  });
  const foreignWorkerIds = new Set(
    relatedUsers.filter(({ role }) => role === 'WORKER').map(({ id }) => id),
  );
  const ambiguities = {
    tasksCompletedInAnotherWorkersShift: tasks
      .filter(
        ({ completedWorkShiftId }) =>
          completedWorkShiftId && !shiftIds.includes(completedWorkShiftId),
      )
      .map(({ id }) => id),
    messagesFromOtherWorkers: messages
      .filter(({ senderId }) => foreignWorkerIds.has(senderId))
      .map(({ id }) => id),
    eventsFromOtherWorkers: associatedEvents
      .filter(({ actorId }) => actorId && foreignWorkerIds.has(actorId))
      .map(({ id }) => id),
    artifactsFromOtherWorkers: artifacts
      .filter(({ uploadedBy }) => foreignWorkerIds.has(uploadedBy))
      .map(({ id }) => id),
  };
  const hasAmbiguities = Object.values(ambiguities).some((ids) => ids.length > 0);

  const plan = {
    mode: options.production ? 'production' : 'local',
    backup: verifiedBackup,
    environment: config.environment,
    databaseHost: databaseUrl.hostname,
    database: databaseUrl.pathname.slice(1),
    minioHost: config.minio.endPoint,
    minioBucket: config.minio.bucket,
    users: users.map(publicUser),
    tasks: taskIds.length,
    steps: stepIds.length,
    messages: messageIds.length,
    shifts: shiftIds.length,
    accruals: accruals.length,
    events: eventIds.length,
    artifacts: artifactIds.length,
    workShiftPhotos: workShiftPhotos.length,
    processes: removableProcessIds.length,
    originalStorageKeys: removableOriginalKeys.length,
    previewStorageKeys: removablePreviewKeys.length,
    sharedStorageKeys: sharedKeys,
    ambiguities,
  };

  if (!confirmed) {
    console.log(JSON.stringify({ dryRun: true, requiredConfirmation: '--apply', plan }, null, 2));
    process.exitCode = 2;
  } else {
    if (hasAmbiguities) {
      throw new Error('Cleanup apply is blocked because related data belongs to another WORKER.');
    }
    const deleted = await database.$transaction(
      async (client) => {
        const deletedShiftPhotos = await client.workShiftPhoto.deleteMany({
          where: { id: { in: workShiftPhotos.map(({ id }) => id) } },
        });
        const deletedArtifacts = await client.artifact.deleteMany({
          where: { id: { in: artifactIds } },
        });
        const deletedMessages = await client.taskMessage.deleteMany({
          where: { id: { in: messageIds } },
        });
        const deletedEvents = await client.event.deleteMany({ where: { id: { in: eventIds } } });
        const deletedSteps = await client.taskStep.deleteMany({ where: { id: { in: stepIds } } });
        const deletedTasks = await client.task.deleteMany({ where: { id: { in: taskIds } } });
        const deletedAccruals = await client.shiftAccrual.deleteMany({
          where: { id: { in: accruals.map(({ id }) => id) } },
        });
        const deletedShifts = await client.workShift.deleteMany({
          where: { id: { in: shiftIds } },
        });
        const deletedProcesses = await client.process.deleteMany({
          where: { id: { in: removableProcessIds } },
        });
        const resetUsers = await client.user.updateMany({
          where: { id: { in: userIds } },
          data: { openingBalanceCoinUnits: 0 },
        });
        return {
          tasks: deletedTasks.count,
          steps: deletedSteps.count,
          messages: deletedMessages.count,
          shifts: deletedShifts.count,
          accruals: deletedAccruals.count,
          events: deletedEvents.count,
          artifacts: deletedArtifacts.count,
          workShiftPhotos: deletedShiftPhotos.count,
          processes: deletedProcesses.count,
          resetUsers: resetUsers.count,
        };
      },
      { timeout: 30_000 },
    );

    const storageResult = await removeExistingObjects(removableOriginalKeys, removablePreviewKeys);
    const finalUsers = await database.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        openingBalanceCoinUnits: true,
      },
      orderBy: { email: 'asc' },
    });
    const final = {
      users: finalUsers.map(publicUser),
      tasks: await database.task.count({ where: { assigneeId: { in: userIds } } }),
      shifts: await database.workShift.count({ where: { userId: { in: userIds } } }),
      accruals: await database.shiftAccrual.count({ where: { workerId: { in: userIds } } }),
      workEvents: await database.event.count({
        where: { actorId: { in: userIds }, type: { in: workEventTypes } },
      }),
      artifacts: await database.artifact.count({ where: { uploadedBy: { in: userIds } } }),
      inProgress: await database.task.count({
        where: { assigneeId: { in: userIds }, status: 'IN_PROGRESS' },
      }),
      paused: await database.task.count({
        where: { assigneeId: { in: userIds }, status: 'PAUSED' },
      }),
      profilesUnchanged: users.every((before) => {
        const after = finalUsers.find(({ id }) => id === before.id);
        return Boolean(
          after &&
          after.email === before.email &&
          after.name === before.name &&
          after.role === before.role &&
          after.isActive === before.isActive &&
          after.passwordHash === before.passwordHash,
        );
      }),
    };
    console.log(JSON.stringify({ dryRun: false, plan, deleted, storageResult, final }, null, 2));
    if (
      storageResult.failed.length ||
      final.tasks ||
      final.shifts ||
      final.accruals ||
      final.workEvents ||
      final.artifacts ||
      final.inProgress ||
      final.paused ||
      !final.profilesUnchanged ||
      final.users.some(({ openingBalanceCoinUnits }) => openingBalanceCoinUnits !== 0)
    ) {
      process.exitCode = 1;
    }
  }
} finally {
  await database.$disconnect();
}

async function removeExistingObjects(originalKeys: string[], previewKeys: string[]) {
  const removedOriginal: string[] = [];
  const removedPreview: string[] = [];
  const missing: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];
  for (const [keys, removed] of [
    [originalKeys, removedOriginal],
    [previewKeys, removedPreview],
  ] as const) {
    for (const key of keys) {
      try {
        await storage.statObject(config.minio.bucket, key);
      } catch (error) {
        if (isMissingObject(error)) {
          missing.push(key);
          continue;
        }
        failed.push({ key, error: error instanceof Error ? error.message : 'stat failed' });
        continue;
      }
      try {
        await storage.removeObject(config.minio.bucket, key);
        removed.push(key);
      } catch (error) {
        failed.push({ key, error: error instanceof Error ? error.message : 'removal failed' });
      }
    }
  }
  return {
    removedOriginal: removedOriginal.length,
    removedPreview: removedPreview.length,
    missing: missing.length,
    missingKeys: missing,
    failed,
  };
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  return code === 'NoSuchKey' || code === 'NotFound' || code === 'NoSuchObject';
}

function assertEnvironment() {
  const loopback = new Set(['localhost', '127.0.0.1', '::1']);
  const commonSafe =
    loopback.has(databaseUrl.hostname) &&
    databaseUrl.pathname.slice(1) === 'stroit_dev' &&
    loopback.has(config.minio.endPoint) &&
    config.minio.bucket === 'stroit-dev' &&
    !config.minio.useSSL;
  if (!commonSafe) {
    throw new Error(
      'Worker history cleanup requires loopback stroit_dev and loopback stroit-dev MinIO.',
    );
  }
  if (
    options.production ? config.environment !== 'production' : config.environment !== 'development'
  ) {
    throw new Error(`Cleanup mode does not match runtime environment ${config.environment}.`);
  }
}

function assertExactUsers(
  users: Array<{ email: string; role: string; isActive: boolean; id: string }>,
) {
  if (
    users.length !== targetLogins.length ||
    targetLogins.some(
      (login) => users.filter((user) => user.email.toLowerCase() === login).length !== 1,
    ) ||
    users.some((user) => user.role !== 'WORKER' || !user.isActive)
  ) {
    throw new Error(
      `Expected exactly active WORKER logins ${targetLogins.join(', ')}; cleanup was cancelled.`,
    );
  }
}

function assertExpectedUserIds(users: Array<{ id: string }>) {
  if (!options.production) return;
  const actual = users.map(({ id }) => id).sort();
  const expected = [...options.expectedUserIds].sort();
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error('Production user ids do not match the explicitly expected ids.');
  }
}

async function verifyRequiredBackup() {
  if (!options.production) return null;
  if (!options.backupName || !options.backupSha256) {
    throw new Error('Production cleanup requires --backup and --backup-sha256.');
  }
  if (!productionBackupPattern.test(options.backupName)) {
    throw new Error('Production backup name is unsafe.');
  }
  const backupPath = resolve(productionBackupDirectory, options.backupName);
  if (!backupPath.startsWith(`${productionBackupDirectory}/`)) {
    throw new Error('Production backup path escaped the backup directory.');
  }
  const file = await stat(backupPath);
  if (!file.isFile() || file.size <= 0) throw new Error('Production backup is missing or empty.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(backupPath)) hash.update(chunk);
  const actualSha256 = hash.digest('hex');
  if (actualSha256 !== options.backupSha256) {
    throw new Error('Production backup SHA-256 does not match the explicit checksum.');
  }
  return { name: options.backupName, sizeBytes: file.size, sha256: actualSha256 };
}

function parseArguments(args: string[]) {
  const result = {
    production: false,
    apply: false,
    logins: [] as string[],
    expectedUserIds: [] as string[],
    backupName: '',
    backupSha256: '',
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--production') result.production = true;
    else if (argument === '--apply') result.apply = true;
    else if (argument === localConfirmation) result.apply = true;
    else if (argument === '--logins') result.logins = readList(args[++index], '--logins');
    else if (argument === '--expected-user-ids')
      result.expectedUserIds = readList(args[++index], '--expected-user-ids');
    else if (argument === '--backup') result.backupName = args[++index] ?? '';
    else if (argument === '--backup-sha256') result.backupSha256 = args[++index] ?? '';
    else throw new Error(`Unknown cleanup argument: ${argument}`);
  }
  if (result.production) {
    const logins = unique(result.logins.map((login) => login.toLowerCase())).sort();
    if (logins.join(',') !== [...targetLogins].sort().join(',')) {
      throw new Error('Production cleanup permits only the exact logins ilya,igor.');
    }
    if (result.expectedUserIds.length !== 2) {
      throw new Error('Production cleanup requires exactly two expected user ids.');
    }
  } else if (result.apply && !args.includes(localConfirmation)) {
    throw new Error(`Local apply requires ${localConfirmation}.`);
  }
  if (result.backupSha256 && !/^[a-f0-9]{64}$/.test(result.backupSha256)) {
    throw new Error('Backup SHA-256 is invalid.');
  }
  return result;
}

function readList(value: string | undefined, name: string): string[] {
  if (!value) throw new Error(`${name} requires a comma-separated value.`);
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function publicUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  openingBalanceCoinUnits: number;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    openingBalanceCoinUnits: user.openingBalanceCoinUnits,
  };
}
