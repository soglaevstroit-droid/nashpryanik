import { EventType } from '@prisma/client';
import { Client } from 'minio';
import { AppConfigService } from '../config/app-config.service.js';
import { DatabaseService } from './database.service.js';

const confirmation = '--confirm-local-task-cleanup';
const confirmed = process.argv.slice(2).includes(confirmation);
const taskEventTypes: EventType[] = [
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
  'HELP_REQUEST',
  'MANAGER_REPLY',
];
const config = new AppConfigService();
const databaseUrl = new URL(config.databaseUrl);
const database = new DatabaseService(config);
const storage = new Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

assertLocalEnvironment();

try {
  const tasks = await database.task.findMany({
    select: { id: true, processId: true },
  });
  const taskIds = tasks.map(({ id }) => id);
  const taskProcesses = await database.process.findMany({
    where: { type: 'TASK' },
    select: { id: true },
  });
  const processIds = [
    ...new Set([
      ...tasks.map(({ processId }) => processId).filter(Boolean),
      ...taskProcesses.map(({ id }) => id),
    ]),
  ];
  const steps = await database.taskStep.findMany({
    where: { taskId: { in: taskIds } },
    select: { id: true },
  });
  const stepIds = steps.map(({ id }) => id);
  const messages = await database.taskMessage.findMany({
    where: { taskId: { in: taskIds } },
    select: { id: true },
  });
  const messageIds = messages.map(({ id }) => id);
  const taskEvents = await database.event.findMany({
    where: {
      OR: [
        { taskId: { in: taskIds } },
        { taskStepId: { in: stepIds } },
        { entityType: 'task', entityId: { in: taskIds } },
        { entityType: 'taskStep', entityId: { in: stepIds } },
        { entityType: 'task_step', entityId: { in: stepIds } },
        { entityType: 'taskMessage', entityId: { in: messageIds } },
        { entityType: 'process', entityId: { in: processIds } },
        { type: { in: taskEventTypes } },
      ],
    },
    select: { id: true },
  });
  const initialEventIds = taskEvents.map(({ id }) => id);
  const initialArtifacts = await database.artifact.findMany({
    where: {
      OR: [
        { taskId: { in: taskIds } },
        { taskStepId: { in: stepIds } },
        { eventId: { in: initialEventIds } },
      ],
    },
    select: { id: true, eventId: true, storageKey: true, previewStorageKey: true },
  });
  const eventIds = [
    ...new Set([...initialEventIds, ...initialArtifacts.map(({ eventId }) => eventId)]),
  ];
  const artifacts = await database.artifact.findMany({
    where: {
      OR: [
        { taskId: { in: taskIds } },
        { taskStepId: { in: stepIds } },
        { eventId: { in: eventIds } },
      ],
    },
    select: { id: true, storageKey: true, previewStorageKey: true },
  });
  const artifactIds = artifacts.map(({ id }) => id);
  const retainedArtifactKeys = await database.artifact.findMany({
    where: { id: { notIn: artifactIds } },
    select: { storageKey: true, previewStorageKey: true },
  });
  const retainedKeys = new Set(
    retainedArtifactKeys.flatMap(({ storageKey, previewStorageKey }) =>
      previewStorageKey ? [storageKey, previewStorageKey] : [storageKey],
    ),
  );
  const originalKeys = [...new Set(artifacts.map(({ storageKey }) => storageKey))].filter(
    (key) => !retainedKeys.has(key),
  );
  const previewKeys = [
    ...new Set(
      artifacts.flatMap(({ previewStorageKey }) => (previewStorageKey ? [previewStorageKey] : [])),
    ),
  ].filter((key) => !retainedKeys.has(key));
  const referencedShiftProcesses = await database.workShift.findMany({
    where: { processId: { in: processIds } },
    select: { processId: true },
  });
  const retainedProcessIds = new Set(
    referencedShiftProcesses.flatMap(({ processId }) => (processId ? [processId] : [])),
  );
  const removableProcessIds = processIds.filter((id) => !retainedProcessIds.has(id));
  const usersBefore = await database.user.count();

  const plan = {
    database: databaseUrl.pathname.slice(1),
    databaseHost: databaseUrl.hostname,
    minioHost: config.minio.endPoint,
    bucket: config.minio.bucket,
    tasks: taskIds.length,
    steps: stepIds.length,
    messages: messageIds.length,
    events: eventIds.length,
    artifacts: artifactIds.length,
    originalObjects: originalKeys.length,
    previewObjects: previewKeys.length,
    processes: removableProcessIds.length,
    usersBefore,
  };

  if (!confirmed) {
    console.log(
      JSON.stringify({ dryRun: true, requiredConfirmation: confirmation, plan }, null, 2),
    );
    process.exitCode = 2;
  } else {
    const deleted = await database.$transaction(
      async (client) => {
        const workShiftPhotos = await client.workShiftPhoto.deleteMany({
          where: { artifactId: { in: artifactIds } },
        });
        const deletedArtifacts = await client.artifact.deleteMany({
          where: { id: { in: artifactIds } },
        });
        const deletedMessages = await client.taskMessage.deleteMany({
          where: { taskId: { in: taskIds } },
        });
        const deletedEvents = await client.event.deleteMany({ where: { id: { in: eventIds } } });
        const deletedSteps = await client.taskStep.deleteMany({
          where: { taskId: { in: taskIds } },
        });
        const deletedTasks = await client.task.deleteMany({ where: { id: { in: taskIds } } });
        const deletedProcesses = await client.process.deleteMany({
          where: { id: { in: removableProcessIds } },
        });
        return {
          tasks: deletedTasks.count,
          steps: deletedSteps.count,
          messages: deletedMessages.count,
          events: deletedEvents.count,
          artifacts: deletedArtifacts.count,
          workShiftPhotos: workShiftPhotos.count,
          processes: deletedProcesses.count,
        };
      },
      { timeout: 30_000 },
    );

    const storageResult = await removeExactObjects(originalKeys, previewKeys);
    const final = {
      tasks: await database.task.count(),
      steps: await database.taskStep.count(),
      messages: await database.taskMessage.count(),
      taskEvents: await database.event.count({ where: { type: { in: taskEventTypes } } }),
      taskArtifacts: await database.artifact.count({
        where: { OR: [{ taskId: { not: null } }, { taskStepId: { not: null } }] },
      }),
      inProgress: await database.task.count({ where: { status: 'IN_PROGRESS' } }),
      paused: await database.task.count({ where: { status: 'PAUSED' } }),
      users: await database.user.count(),
    };
    console.log(JSON.stringify({ dryRun: false, plan, deleted, storageResult, final }, null, 2));
    if (
      storageResult.failed.length > 0 ||
      final.tasks !== 0 ||
      final.steps !== 0 ||
      final.messages !== 0 ||
      final.taskEvents !== 0 ||
      final.taskArtifacts !== 0 ||
      final.inProgress !== 0 ||
      final.paused !== 0
    ) {
      process.exitCode = 1;
    }
  }
} finally {
  await database.$disconnect();
}

async function removeExactObjects(originalKeys: string[], previewKeys: string[]) {
  const removedOriginal: string[] = [];
  const removedPreview: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];
  for (const [kind, keys, removed] of [
    ['original', originalKeys, removedOriginal],
    ['preview', previewKeys, removedPreview],
  ] as const) {
    for (const key of keys) {
      try {
        await storage.removeObject(config.minio.bucket, key);
        removed.push(key);
      } catch (error) {
        failed.push({
          key,
          error: error instanceof Error ? error.message : `${kind} removal failed`,
        });
      }
    }
  }
  return {
    removedOriginal: removedOriginal.length,
    removedPreview: removedPreview.length,
    failed,
  };
}

function assertLocalEnvironment() {
  const loopback = new Set(['localhost', '127.0.0.1', '::1']);
  if (
    config.environment !== 'development' ||
    !loopback.has(databaseUrl.hostname) ||
    databaseUrl.pathname.slice(1) !== 'stroit_dev' ||
    !loopback.has(config.minio.endPoint) ||
    config.minio.bucket !== 'stroit-dev'
  ) {
    throw new Error(
      'Local task cleanup is allowed only for stroit_dev and local stroit-dev MinIO.',
    );
  }
}
