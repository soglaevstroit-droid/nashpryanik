import { Prisma, PrismaClient, TaskStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Client } from 'minio';
import { loadAppConfig } from '../config/app-config.js';
import {
  assignSequentialClonePositions,
  assertCloneLocalOnly,
  cleanupIsConfirmed,
  cloneOperationId,
  cloneStoragePrefix,
  ILYA_CLONE_MANAGER_LOGIN,
  ILYA_CLONE_TARGET_LOGIN,
  ILYA_SOURCE_LOGIN,
  ILYA_TO_WORK_MARKER,
  normalizeCloneStatus,
  remapJson,
  stableCloneId,
} from './clone-ilya-to-work.definition.js';

const config = loadAppConfig();
const commandArguments = process.argv.slice(2);
const args = new Set(commandArguments);
const productionAuthorized =
  config.environment === 'production' &&
  args.has('--confirm-production') &&
  process.env.PRODUCTION_TESTDATA_CONFIRMATION === ILYA_TO_WORK_MARKER;
assertCloneLocalOnly({
  environment: config.environment,
  databaseUrl: config.databaseUrl,
  minioHost: config.minio.endPoint,
  productionAuthorized,
});

const database = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
const storage = new Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

type SourceTask = Prisma.TaskGetPayload<{
  include: {
    steps: { orderBy: [{ order: 'asc' }, { id: 'asc' }] };
    messages: { orderBy: { createdAt: 'asc' } };
    object: true;
  };
}>;
type SourceArtifact = Prisma.ArtifactGetPayload<{ include: { event: true } }>;

interface CloneContext {
  sourceUserId: string;
  targetUserId: string;
  managerUserId: string;
  sourceTasks: SourceTask[];
  sourceArtifacts: SourceArtifact[];
  sourceEvents: Prisma.EventGetPayload<Record<string, never>>[];
  sourceProcesses: Prisma.ProcessGetPayload<Record<string, never>>[];
  taskIds: Map<string, string>;
  stepIds: Map<string, string>;
  artifactIds: Map<string, string>;
  eventIds: Map<string, string>;
  messageIds: Map<string, string>;
  processIds: Map<string, string>;
  storageKeys: Map<string, string>;
  replacements: Map<string, string>;
  activePositions: Map<string, number>;
  statusByTask: Map<string, TaskStatus>;
  normalized: Array<{ sourceTaskId: string; title: string; before: TaskStatus; after: TaskStatus }>;
  sourceDigestBefore: string;
  extDigestBefore: string;
  existingCloneCount: number;
  sourceBytes: number;
}

try {
  if (args.has('--clean')) await runCleanup(cleanupIsConfirmed(commandArguments));
  else if (args.has('--dry-run')) await runDryRun();
  else await runClone();
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}

async function runDryRun(): Promise<void> {
  const context = await loadContext();
  printPlan(context);
  await preflightSourceFiles(context.sourceArtifacts);
  console.log(
    JSON.stringify(
      {
        marker: ILYA_TO_WORK_MARKER,
        mode: 'dry-run',
        productionAuthorized,
        mutationsPerformed: false,
      },
      null,
      2,
    ),
  );
}

async function runClone(): Promise<void> {
  const context = await loadContext();
  printPlan(context);
  await preflightSourceFiles(context.sourceArtifacts);

  const previousStorageKeys = await cleanCloneDatabase();
  await removeStorageObjects(previousStorageKeys);
  const copiedStorageKeys: string[] = [];

  try {
    for (const artifact of context.sourceArtifacts) {
      const targetKey = required(context.storageKeys, artifact.id);
      const buffer = await readStorageObject(artifact.storageKey);
      assertImageSignature(buffer, artifact.mimeType, artifact.id);
      await storage.putObject(config.minio.bucket, targetKey, buffer, buffer.length, {
        'Content-Type': artifact.mimeType,
        'X-Amz-Meta-Testdata-Marker': ILYA_TO_WORK_MARKER,
      });
      const copied = await readStorageObject(targetKey);
      assertImageSignature(copied, artifact.mimeType, required(context.artifactIds, artifact.id));
      if (copied.length !== buffer.length)
        throw new Error(`Copied photo size mismatch for artifact ${artifact.id}`);
      copiedStorageKeys.push(targetKey);
    }

    await createCloneRecords(context);
    const report = await verifyClone(context);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await cleanCloneDatabase().catch(() => undefined);
    await removeStorageObjects(copiedStorageKeys);
    throw error;
  }
}

async function loadContext(): Promise<CloneContext> {
  const users = await database.user.findMany({
    where: {
      email: { in: [ILYA_SOURCE_LOGIN, ILYA_CLONE_TARGET_LOGIN, ILYA_CLONE_MANAGER_LOGIN] },
    },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  const source = users.find(({ email }) => email === ILYA_SOURCE_LOGIN);
  const target = users.find(({ email }) => email === ILYA_CLONE_TARGET_LOGIN);
  const manager = users.find(({ email }) => email === ILYA_CLONE_MANAGER_LOGIN);
  if (!source || source.role !== 'WORKER')
    throw new Error('Local source WORKER ilya was not found.');
  if (!target || target.role !== 'WORKER')
    throw new Error('Local target WORKER work was not found.');
  if (!manager || manager.role !== 'FOREMAN') throw new Error('Local FOREMAN work2 was not found.');
  if (!source.isActive || !target.isActive || !manager.isActive)
    throw new Error('Source, target and test manager must be active.');

  const sourceTasks = await database.task.findMany({
    where: { assigneeId: source.id },
    include: {
      object: true,
      steps: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
      messages: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  if (!sourceTasks.length) throw new Error('No local tasks assigned to ilya were found.');
  const sourceTaskIds = sourceTasks.map(({ id }) => id);
  const sourceArtifacts = await database.artifact.findMany({
    where: { taskId: { in: sourceTaskIds } },
    include: { event: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const eventIds = [...new Set(sourceArtifacts.map(({ eventId }) => eventId))];
  const sourceEvents = await database.event.findMany({
    where: { OR: [{ taskId: { in: sourceTaskIds } }, { id: { in: eventIds } }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const sourceProcesses = await database.process.findMany({
    where: { id: { in: sourceTasks.map(({ processId }) => processId) } },
  });
  const [existingCloneCount, activeTargetTasks, sourceDigestBefore, extDigestBefore] =
    await Promise.all([
      database.task.count({
        where: { creationOperationId: { startsWith: `${ILYA_TO_WORK_MARKER}:` } },
      }),
      database.task.findMany({
        where: {
          assigneeId: target.id,
          deletedAt: null,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          NOT: { creationOperationId: { startsWith: `${ILYA_TO_WORK_MARKER}:` } },
        },
        select: { id: true, position: true, status: true },
      }),
      digestSource(source.id),
      digestExtendedSet(target.id),
    ]);

  const taskIds = new Map(sourceTasks.map(({ id }) => [id, stableCloneId('task', id)]));
  const stepIds = new Map(
    sourceTasks.flatMap(({ steps }) =>
      steps.map(({ id }) => [id, stableCloneId('step', id)] as const),
    ),
  );
  const artifactIds = new Map(sourceArtifacts.map(({ id }) => [id, stableCloneId('artifact', id)]));
  const sourceEventIds = [...new Set(sourceEvents.map(({ id }) => id))];
  const eventIdsMap = new Map(sourceEventIds.map((id) => [id, stableCloneId('event', id)]));
  const messageIds = new Map(
    sourceTasks.flatMap(({ messages }) =>
      messages.map(({ id }) => [id, stableCloneId('message', id)] as const),
    ),
  );
  const processIds = new Map(
    sourceTasks.map(({ processId }) => [processId, stableCloneId('process', processId)]),
  );
  const storageKeys = new Map(
    sourceArtifacts.map((artifact) => [
      artifact.id,
      `${cloneStoragePrefix}/${stableCloneId('photo', artifact.id)}${photoExtension(artifact)}`,
    ]),
  );
  const replacements = new Map<string, string>([
    [source.id, target.id],
    ...taskIds,
    ...stepIds,
    ...artifactIds,
    ...eventIdsMap,
    ...messageIds,
    ...sourceArtifacts.map(
      ({ id, storageKey }) => [storageKey, required(storageKeys, id)] as const,
    ),
  ]);
  const startPosition = Math.max(0, ...activeTargetTasks.map(({ position }) => position)) + 1;
  const activeSourceTasks = sourceTasks.filter(
    ({ deletedAt, status }) => !deletedAt && status !== 'COMPLETED' && status !== 'CANCELLED',
  );
  const activePositions = assignSequentialClonePositions(activeSourceTasks, startPosition);
  const hasActiveInProgress = activeTargetTasks.some(({ status }) => status === 'IN_PROGRESS');
  const statusByTask = new Map<string, TaskStatus>();
  const normalized: CloneContext['normalized'] = [];
  for (const task of sourceTasks) {
    const result = normalizeCloneStatus(task.status, task.deletedAt, hasActiveInProgress);
    statusByTask.set(task.id, result.status);
    if (result.normalized)
      normalized.push({
        sourceTaskId: task.id,
        title: task.title,
        before: task.status,
        after: result.status,
      });
  }

  return {
    sourceUserId: source.id,
    targetUserId: target.id,
    managerUserId: manager.id,
    sourceTasks,
    sourceArtifacts,
    sourceEvents,
    sourceProcesses,
    taskIds,
    stepIds,
    artifactIds,
    eventIds: eventIdsMap,
    messageIds,
    processIds,
    storageKeys,
    replacements,
    activePositions,
    statusByTask,
    normalized,
    sourceDigestBefore,
    extDigestBefore,
    existingCloneCount,
    sourceBytes: sourceArtifacts.reduce((sum, { fileSize }) => sum + fileSize, 0),
  };
}

function printPlan(context: CloneContext): void {
  const statuses = Object.fromEntries(
    [...new Set(context.sourceTasks.map(({ status }) => status))].map((status) => [
      status,
      context.sourceTasks.filter((task) => task.status === status).length,
    ]),
  );
  console.log(
    JSON.stringify(
      {
        marker: ILYA_TO_WORK_MARKER,
        phase: 'preflight-plan',
        sourceUserId: context.sourceUserId,
        targetUserId: context.targetUserId,
        tasks: context.sourceTasks.length,
        steps: context.sourceTasks.reduce((sum, { steps }) => sum + steps.length, 0),
        photos: context.sourceArtifacts.length,
        bytes: context.sourceBytes,
        statuses,
        activePositions: [...context.activePositions.values()],
        normalization: context.normalized,
        existingCloneCount: context.existingCloneCount,
      },
      null,
      2,
    ),
  );
}

async function preflightSourceFiles(artifacts: SourceArtifact[]): Promise<void> {
  if (!(await storage.bucketExists(config.minio.bucket)))
    throw new Error(`Local MinIO bucket ${config.minio.bucket} does not exist.`);
  for (const artifact of artifacts) {
    const stat = await storage.statObject(config.minio.bucket, artifact.storageKey);
    if (stat.size !== artifact.fileSize)
      throw new Error(`Source artifact size mismatch: ${artifact.id}`);
    const buffer = await readStorageObject(artifact.storageKey);
    assertImageSignature(buffer, artifact.mimeType, artifact.id);
  }
}

async function createCloneRecords(context: CloneContext): Promise<void> {
  const sourceProcessById = new Map(
    context.sourceProcesses.map((process) => [process.id, process]),
  );
  const sourceTaskById = new Map(context.sourceTasks.map((task) => [task.id, task]));
  const sourceArtifactByEvent = new Map<string, SourceArtifact>();
  for (const artifact of context.sourceArtifacts)
    if (!sourceArtifactByEvent.has(artifact.eventId))
      sourceArtifactByEvent.set(artifact.eventId, artifact);

  await database.$transaction(
    async (tx) => {
      for (const sourceTask of context.sourceTasks) {
        const sourceProcess = sourceProcessById.get(sourceTask.processId);
        const processId = required(context.processIds, sourceTask.processId);
        await tx.process.create({
          data: {
            id: processId,
            type: sourceProcess?.type ?? 'TASK',
            status:
              sourceProcess?.status ?? (sourceTask.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE'),
            title: sourceTask.title,
            description: sourceProcess?.description ?? null,
            startedAt: sourceProcess?.startedAt ?? sourceTask.createdAt,
            finishedAt: sourceProcess?.finishedAt ?? sourceTask.completedAt,
            createdAt: sourceProcess?.createdAt ?? sourceTask.createdAt,
            updatedAt: sourceProcess?.updatedAt ?? sourceTask.updatedAt,
          },
        });
        const cloneStatus = required(context.statusByTask, sourceTask.id);
        const clonePosition =
          context.activePositions.get(sourceTask.id) ??
          Math.max(1, ...context.activePositions.values()) + sourceTask.position;
        await tx.task.create({
          data: {
            id: required(context.taskIds, sourceTask.id),
            title: sourceTask.title,
            description: sourceTask.description,
            location: sourceTask.location,
            status: cloneStatus,
            priority: sourceTask.priority,
            accessStatus: sourceTask.accessStatus,
            position: clonePosition,
            creatorId: sourceTask.creatorId,
            assigneeId: context.targetUserId,
            processId,
            objectId: sourceTask.objectId,
            completedAt: sourceTask.completedAt,
            deletedAt: sourceTask.deletedAt,
            deletedByUserId: sourceTask.deletedAt
              ? mapActor(sourceTask.deletedByUserId, context)
              : null,
            deletionReason: sourceTask.deletionReason,
            creationOperationId: cloneOperationId(sourceTask.id),
            isWorkBlocked: sourceTask.isWorkBlocked,
            workBlockedAt: sourceTask.workBlockedAt,
            workBlockedByUserId: mapActor(sourceTask.workBlockedByUserId, context),
            createdAt: sourceTask.createdAt,
            updatedAt: sourceTask.updatedAt,
          },
        });
        for (const sourceStep of sourceTask.steps) {
          await tx.taskStep.create({
            data: {
              id: required(context.stepIds, sourceStep.id),
              taskId: required(context.taskIds, sourceTask.id),
              title: sourceStep.title,
              description: sourceStep.description,
              status: sourceStep.status,
              order: sourceStep.order,
              startedAt: sourceStep.startedAt,
              completedAt: sourceStep.completedAt,
              completedByUserId: mapActor(sourceStep.completedByUserId, context),
              minimumPhotoCount: sourceStep.minimumPhotoCount,
              completionOperationId: sourceStep.completionOperationId
                ? `${ILYA_TO_WORK_MARKER}:STEP:${sourceStep.id}`
                : null,
              deletedAt: sourceStep.deletedAt,
              deletedByUserId: mapActor(sourceStep.deletedByUserId, context),
              deletionReason: sourceStep.deletionReason,
              createdAt: sourceStep.createdAt,
              updatedAt: sourceStep.updatedAt,
            },
          });
        }
      }

      for (const sourceEvent of context.sourceEvents) {
        const artifactFallback = sourceArtifactByEvent.get(sourceEvent.id);
        const sourceTaskId = sourceEvent.taskId ?? artifactFallback?.taskId ?? null;
        const sourceStepId = sourceEvent.taskStepId ?? artifactFallback?.taskStepId ?? null;
        const cloneTaskId = sourceTaskId ? context.taskIds.get(sourceTaskId) : null;
        const cloneStepId = sourceStepId ? context.stepIds.get(sourceStepId) : null;
        await tx.event.create({
          data: {
            id: required(context.eventIds, sourceEvent.id),
            type: sourceEvent.type,
            actorId: mapActor(sourceEvent.actorId, context),
            entityType: sourceEvent.entityType,
            entityId: remapOptionalString(sourceEvent.entityId, context.replacements),
            objectId: sourceEvent.objectId,
            taskId: cloneTaskId,
            taskStepId: cloneStepId,
            workShiftId: null,
            idempotencyKey: `${ILYA_TO_WORK_MARKER}:EVENT:${sourceEvent.id}`,
            payload: remapJson(sourceEvent.payload, context.replacements) as Prisma.InputJsonValue,
            metadata: {
              ...jsonObject(sourceEvent.metadata),
              testdataMarker: ILYA_TO_WORK_MARKER,
              sourceEventId: sourceEvent.id,
              sourceActorId: sourceEvent.actorId,
              sourceTaskStatus: sourceTaskId ? sourceTaskById.get(sourceTaskId)?.status : null,
            },
            createdAt: sourceEvent.createdAt,
          },
        });
      }

      for (const sourceTask of context.sourceTasks) {
        for (const sourceMessage of sourceTask.messages) {
          const senderId = mapActor(sourceMessage.senderId, context) ?? context.managerUserId;
          await tx.taskMessage.create({
            data: {
              id: required(context.messageIds, sourceMessage.id),
              taskId: required(context.taskIds, sourceTask.id),
              taskStepId: sourceMessage.taskStepId
                ? (context.stepIds.get(sourceMessage.taskStepId) ?? null)
                : null,
              senderId,
              recipientId:
                senderId === context.targetUserId ? context.managerUserId : context.targetUserId,
              parentId: sourceMessage.parentId
                ? (context.messageIds.get(sourceMessage.parentId) ?? null)
                : null,
              kind: sourceMessage.kind,
              body: sourceMessage.body,
              decision: sourceMessage.decision,
              readAt: sourceMessage.readAt,
              createdAt: sourceMessage.createdAt,
            },
          });
        }
      }

      for (const sourceArtifact of context.sourceArtifacts) {
        const sourceTaskId = sourceArtifact.taskId;
        if (!sourceTaskId || !context.taskIds.has(sourceTaskId))
          throw new Error(`Artifact ${sourceArtifact.id} has no selected source task.`);
        await tx.artifact.create({
          data: {
            id: required(context.artifactIds, sourceArtifact.id),
            type: sourceArtifact.type,
            eventId: required(context.eventIds, sourceArtifact.eventId),
            taskId: required(context.taskIds, sourceTaskId),
            taskStepId: sourceArtifact.taskStepId
              ? (context.stepIds.get(sourceArtifact.taskStepId) ?? null)
              : null,
            workShiftId: null,
            uploadedBy: mapActor(sourceArtifact.uploadedBy, context) ?? context.managerUserId,
            storageKey: required(context.storageKeys, sourceArtifact.id),
            originalFileName: cloneFileName(sourceArtifact),
            mimeType: sourceArtifact.mimeType,
            fileSize: sourceArtifact.fileSize,
            createdAt: sourceArtifact.createdAt,
          },
        });
      }
    },
    { timeout: 120_000 },
  );
}

async function verifyClone(context: CloneContext) {
  const [
    sourceDigestAfter,
    extDigestAfter,
    cloneTasks,
    cloneArtifacts,
    cloneMessages,
    cloneEvents,
  ] = await Promise.all([
    digestSource(context.sourceUserId),
    digestExtendedSet(context.targetUserId),
    database.task.findMany({
      where: { creationOperationId: { startsWith: `${ILYA_TO_WORK_MARKER}:` } },
      include: { steps: true },
    }),
    database.artifact.findMany({
      where: { storageKey: { startsWith: `${cloneStoragePrefix}/` } },
    }),
    database.taskMessage.findMany({
      where: { id: { startsWith: `${cloneStoragePrefix}-message-` } },
    }),
    database.event.findMany({
      where: { idempotencyKey: { startsWith: `${ILYA_TO_WORK_MARKER}:EVENT:` } },
    }),
  ]);
  if (sourceDigestAfter !== context.sourceDigestBefore)
    throw new Error('Source ilya data changed during cloning. Clone transaction was rejected.');
  if (extDigestAfter !== context.extDigestBefore)
    throw new Error('EXT_TEST_V1 changed during cloning. Clone transaction was rejected.');
  if (cloneTasks.length !== context.sourceTasks.length)
    throw new Error('Clone task count mismatch.');
  if (cloneArtifacts.length !== context.sourceArtifacts.length)
    throw new Error('Clone artifact count mismatch.');
  if (cloneEvents.length !== context.sourceEvents.length)
    throw new Error('Clone event count mismatch.');
  if (cloneTasks.some(({ assigneeId }) => assigneeId !== context.targetUserId))
    throw new Error('A cloned task is assigned to the wrong user.');
  if (
    cloneMessages.some(
      ({ senderId, recipientId }) =>
        ![context.targetUserId, context.managerUserId].includes(senderId) ||
        !recipientId ||
        ![context.targetUserId, context.managerUserId].includes(recipientId),
    )
  )
    throw new Error('A cloned message leaks outside work/work2.');
  const allWorkPositions = await database.task.findMany({
    where: {
      assigneeId: context.targetUserId,
      deletedAt: null,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    select: { position: true },
  });
  if (new Set(allWorkPositions.map(({ position }) => position)).size !== allWorkPositions.length)
    throw new Error('Active work task positions are not unique.');
  const sourceIds = new Set(context.sourceTasks.map(({ id }) => id));
  if (cloneTasks.some(({ id }) => sourceIds.has(id)))
    throw new Error('A clone reused a source task id.');
  const sourceStepIds = new Set(
    context.sourceTasks.flatMap(({ steps }) => steps.map(({ id }) => id)),
  );
  if (cloneTasks.flatMap(({ steps }) => steps).some(({ id }) => sourceStepIds.has(id)))
    throw new Error('A clone reused a source step id.');
  const sourceArtifactIds = new Set(context.sourceArtifacts.map(({ id }) => id));
  if (cloneArtifacts.some(({ id }) => sourceArtifactIds.has(id)))
    throw new Error('A clone reused a source artifact id.');

  const activeCloneCount = cloneTasks.filter(
    ({ deletedAt, status }) => !deletedAt && status !== 'COMPLETED' && status !== 'CANCELLED',
  ).length;
  const completedCloneCount = cloneTasks.filter(({ status }) => status === 'COMPLETED').length;
  const deletedCloneCount = cloneTasks.filter(({ deletedAt }) => deletedAt).length;
  return {
    marker: ILYA_TO_WORK_MARKER,
    result: {
      created: context.existingCloneCount === 0 ? cloneTasks.length : 0,
      updated: Math.min(context.existingCloneCount, cloneTasks.length),
      skipped: Math.max(0, context.existingCloneCount - cloneTasks.length),
    },
    sourceUserId: context.sourceUserId,
    targetUserId: context.targetUserId,
    tasks: cloneTasks.length,
    activeTasks: activeCloneCount,
    completedTasks: completedCloneCount,
    softDeletedTasks: deletedCloneCount,
    steps: cloneTasks.reduce((sum, { steps }) => sum + steps.length, 0),
    photos: cloneArtifacts.length,
    bytes: cloneArtifacts.reduce((sum, { fileSize }) => sum + fileSize, 0),
    messages: cloneMessages.length,
    events: cloneEvents.length,
    normalizedStatuses: context.normalized,
    activePositions: [...context.activePositions.values()],
    sourceDigestBefore: context.sourceDigestBefore,
    sourceDigestAfter,
    extDigestBefore: context.extDigestBefore,
    extDigestAfter,
    isolation: 'verified',
  };
}

async function runCleanup(confirmed: boolean): Promise<void> {
  const cloneTasks = await database.task.findMany({
    where: { creationOperationId: { startsWith: `${ILYA_TO_WORK_MARKER}:` } },
    select: { id: true },
  });
  const cloneTaskIds = cloneTasks.map(({ id }) => id);
  const [steps, artifacts, events, messages] = await Promise.all([
    database.taskStep.count({ where: { taskId: { in: cloneTaskIds } } }),
    database.artifact.findMany({
      where: { taskId: { in: cloneTaskIds } },
      select: { storageKey: true, fileSize: true },
    }),
    database.event.count({
      where: {
        OR: [
          { idempotencyKey: { startsWith: `${ILYA_TO_WORK_MARKER}:` } },
          { taskId: { in: cloneTaskIds } },
        ],
      },
    }),
    database.taskMessage.count({
      where: { taskId: { in: cloneTaskIds } },
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        marker: ILYA_TO_WORK_MARKER,
        mode: confirmed ? 'confirmed-clean' : 'dry-run',
        tasks: cloneTasks.length,
        steps,
        photos: artifacts.length,
        bytes: artifacts.reduce((sum, { fileSize }) => sum + fileSize, 0),
        events,
        messages,
        preserved: ['ilya', 'manager', 'work', 'work2', 'work3', 'EXT_TEST_V1', 'objects'],
      },
      null,
      2,
    ),
  );
  if (!confirmed) {
    console.log('Dry-run only. Repeat with --clean --confirm to remove clone records.');
    return;
  }
  const storageKeys = await cleanCloneDatabase();
  await removeStorageObjects(storageKeys);
  console.log('Only ILYA_TO_WORK_TEST_V1 clone records and independent files were removed.');
}

async function cleanCloneDatabase(): Promise<string[]> {
  const cloneTasks = await database.task.findMany({
    where: { creationOperationId: { startsWith: `${ILYA_TO_WORK_MARKER}:` } },
    select: { id: true, processId: true },
  });
  const cloneTaskIds = cloneTasks.map(({ id }) => id);
  const artifacts = await database.artifact.findMany({
    where: {
      OR: [
        { storageKey: { startsWith: `${cloneStoragePrefix}/` } },
        { taskId: { in: cloneTaskIds } },
      ],
    },
    select: { id: true, eventId: true, storageKey: true },
  });
  await database.$transaction(async (tx) => {
    await tx.artifact.deleteMany({
      where: { id: { in: artifacts.map(({ id }) => id) } },
    });
    await tx.taskMessage.deleteMany({
      where: { taskId: { in: cloneTaskIds } },
    });
    await tx.event.deleteMany({
      where: {
        OR: [
          { idempotencyKey: { startsWith: `${ILYA_TO_WORK_MARKER}:` } },
          { taskId: { in: cloneTaskIds } },
          { id: { in: artifacts.map(({ eventId }) => eventId) } },
        ],
      },
    });
    await tx.task.deleteMany({
      where: { creationOperationId: { startsWith: `${ILYA_TO_WORK_MARKER}:` } },
    });
    await tx.process.deleteMany({
      where: { id: { in: cloneTasks.map(({ processId }) => processId) } },
    });
  });
  return artifacts.map(({ storageKey }) => storageKey);
}

async function removeStorageObjects(keys: string[]): Promise<void> {
  for (const key of keys)
    await storage.removeObject(config.minio.bucket, key).catch((error: unknown) => {
      console.warn(`Could not remove local clone object ${key}: ${String(error)}`);
    });
}

async function digestSource(sourceUserId: string): Promise<string> {
  const tasks = await database.task.findMany({
    where: { assigneeId: sourceUserId },
    include: {
      steps: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
      messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    },
    orderBy: [{ id: 'asc' }],
  });
  const taskIds = tasks.map(({ id }) => id);
  const [artifacts, events] = await Promise.all([
    database.artifact.findMany({ where: { taskId: { in: taskIds } }, orderBy: { id: 'asc' } }),
    database.event.findMany({ where: { taskId: { in: taskIds } }, orderBy: { id: 'asc' } }),
  ]);
  return digest({ tasks, artifacts, events });
}

async function digestExtendedSet(targetUserId: string): Promise<string> {
  const tasks = await database.task.findMany({
    where: { assigneeId: targetUserId, creationOperationId: { startsWith: 'EXT_TEST_V1:' } },
    include: { steps: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
    orderBy: { id: 'asc' },
  });
  const taskIds = tasks.map(({ id }) => id);
  const [artifacts, events, messages] = await Promise.all([
    database.artifact.findMany({ where: { taskId: { in: taskIds } }, orderBy: { id: 'asc' } }),
    database.event.findMany({ where: { taskId: { in: taskIds } }, orderBy: { id: 'asc' } }),
    database.taskMessage.findMany({ where: { taskId: { in: taskIds } }, orderBy: { id: 'asc' } }),
  ]);
  return digest({ tasks, artifacts, events, messages });
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function mapActor(id: string | null, context: CloneContext): string | null {
  if (!id) return null;
  return id === context.sourceUserId ? context.targetUserId : context.managerUserId;
}

function remapOptionalString(value: string | null, replacements: Map<string, string>) {
  return value ? (remapJson(value, replacements) as string) : null;
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function photoExtension(artifact: Pick<SourceArtifact, 'mimeType' | 'storageKey'>): string {
  if (artifact.mimeType === 'image/png') return '.png';
  if (artifact.mimeType === 'image/webp') return '.webp';
  if (artifact.mimeType === 'image/jpeg') return '.jpg';
  const extension = artifact.storageKey.match(/\.[a-zA-Z0-9]+$/)?.[0];
  if (!extension) throw new Error(`Unsupported source photo type: ${artifact.mimeType}`);
  return extension.toLowerCase();
}

function cloneFileName(artifact: SourceArtifact): string {
  return `ilya-clone-${createHash('sha256').update(artifact.id).digest('hex').slice(0, 12)}${photoExtension(artifact)}`;
}

async function readStorageObject(key: string): Promise<Buffer> {
  const stream = await storage.getObject(config.minio.bucket, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function assertImageSignature(buffer: Buffer, mimeType: string, id: string): void {
  const valid =
    (mimeType === 'image/jpeg' &&
      buffer.length > 4 &&
      buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
    (mimeType === 'image/png' &&
      buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
    (mimeType === 'image/webp' &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!valid)
    throw new Error(`Source or clone artifact ${id} has an invalid ${mimeType} signature.`);
}

function required<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing clone mapping for ${String(key)}`);
  return value;
}
