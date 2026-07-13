import {
  EventType,
  Prisma,
  PrismaClient,
  Role,
  ShiftAccrualStatus,
  WorkShiftStatus,
} from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { Client } from 'minio';
import { PasswordService } from '../auth/password.service.js';
import { loadAppConfig } from '../config/app-config.js';
import { calculateFinishedShift } from '../work-shifts/coin-policy.js';
import {
  assertExtendedExecutionEnvironment,
  assertExtendedTestdataDefinition,
  expectedTaskPhotoCount,
  EXTENDED_TESTDATA_MARKER,
  EXTENDED_TESTDATA_PASSWORD,
  extendedTaskSpecs,
  extendedTestObjects,
  extendedTestUsers,
  type ExtendedTaskSpec,
} from './extended-testdata.definition.js';

const config = loadAppConfig();
const database = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
const storage = new Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});
const passwords = new PasswordService();
const suitePrefix = 'ext-test-v1';
const suiteStartedAt = new Date('2026-07-01T06:00:00.000Z');
const commandArguments = process.argv.slice(2);
const args = new Set(commandArguments);
const productionAuthorized =
  config.environment === 'production' &&
  args.has('--confirm-production') &&
  process.env.PRODUCTION_TESTDATA_CONFIRMATION === EXTENDED_TESTDATA_MARKER;

interface GeneratedImage {
  buffer: Buffer;
  fileName: string;
  extension: 'jpg' | 'png';
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

interface SeedContext {
  workerId: string;
  managerId: string;
  analystId: string;
  objects: Map<string, string>;
  images: GeneratedImage[];
}

assertExecutionEnvironment();
assertExtendedTestdataDefinition();

const cleanRequested = args.has('--clean');
const cleanConfirmed = args.has('--confirm');

try {
  if (cleanRequested) {
    const plan = await collectSuiteCounts();
    console.log('Extended testdata cleanup plan:', plan);
    if (!cleanConfirmed) {
      console.log('Dry-run only. Repeat with --clean --confirm to remove the marked dataset.');
    } else {
      await cleanSuite(true);
      console.log('Extended testdata removed. Profiles work/work2/work3 were preserved.');
    }
  } else if (args.has('--users-only')) {
    await preflightProductionUsers();
    const users = await seedUsers();
    console.log(
      JSON.stringify(
        {
          marker: EXTENDED_TESTDATA_MARKER,
          mode: 'users-only',
          productionAuthorized,
          users: [...users.entries()].map(([email, id]) => ({ email, id })),
        },
        null,
        2,
      ),
    );
  } else if (args.has('--dry-run')) {
    await preflightProductionUsers();
    const existing = await collectSuiteCounts();
    console.log(
      JSON.stringify(
        {
          marker: EXTENDED_TESTDATA_MARKER,
          mode: 'dry-run',
          productionAuthorized,
          expected: {
            tasks: extendedTaskSpecs.length,
            steps: extendedTaskSpecs.reduce((sum, task) => sum + task.steps.length, 0),
            taskPhotos: extendedTaskSpecs.reduce(
              (sum, task) => sum + expectedTaskPhotoCount(task),
              0,
            ),
            shiftPhotos: 8,
            messages: 14,
            shifts: 4,
          },
          existing,
        },
        null,
        2,
      ),
    );
  } else {
    await preflightProductionUsers();
    await cleanSuite(true);
    const images = await generateImages();
    const context = await seedBase(images);
    await seedTasks(context);
    await seedMessages(context);
    await seedShifts(context);
    await seedHistory(context);
    const report = await verifySuite(context);
    console.log(JSON.stringify({ ...report, productionAuthorized }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}

function assertExecutionEnvironment(): void {
  assertExtendedExecutionEnvironment({
    environment: config.environment,
    databaseUrl: config.databaseUrl,
    minioHost: config.minio.endPoint,
    productionAuthorized,
  });
}

async function preflightProductionUsers(): Promise<void> {
  if (!productionAuthorized) return;
  for (const user of extendedTestUsers) {
    const existing = await database.user.findUnique({ where: { email: user.email } });
    if (!existing) continue;
    if (
      existing.name !== user.name ||
      existing.role !== user.role ||
      !existing.isActive ||
      !passwords.verifyPassword(EXTENDED_TESTDATA_PASSWORD, existing.passwordHash)
    )
      throw new Error(
        `Safety stop: production login ${user.email} already exists with unexpected data; no update was made.`,
      );
  }
}

async function seedUsers(): Promise<Map<string, string>> {
  const userIds = new Map<string, string>();
  for (const user of extendedTestUsers) {
    const existing = await database.user.findUnique({ where: { email: user.email } });
    const saved =
      existing && productionAuthorized
        ? existing
        : await database.user.upsert({
            where: { email: user.email },
            update: {
              name: user.name,
              role: user.role as Role,
              isActive: true,
              passwordHash: passwords.hashPassword(EXTENDED_TESTDATA_PASSWORD),
              ...(user.email === 'work' ? { openingBalanceCoinUnits: 237_800 } : {}),
            },
            create: {
              email: user.email,
              name: user.name,
              role: user.role as Role,
              isActive: true,
              passwordHash: passwords.hashPassword(EXTENDED_TESTDATA_PASSWORD),
              openingBalanceCoinUnits: user.email === 'work' ? 237_800 : 0,
            },
          });
    userIds.set(user.email, saved.id);
  }
  return userIds;
}

async function seedBase(images: GeneratedImage[]): Promise<SeedContext> {
  const userIds = await seedUsers();

  const objects = new Map<string, string>();
  for (const object of extendedTestObjects) {
    const existing = await database.constructionObject.findFirst({
      where: { name: object.name },
      orderBy: { createdAt: 'asc' },
    });
    const saved =
      existing ??
      (await database.constructionObject.upsert({
        where: { slug: object.slug },
        update: { name: object.name, isActive: true, sortOrder: object.sortOrder },
        create: {
          id: `${suitePrefix}-object-${object.key}`,
          name: object.name,
          slug: object.slug,
          isActive: true,
          sortOrder: object.sortOrder,
        },
      }));
    objects.set(object.key, saved.id);
  }

  return {
    workerId: required(userIds, 'work'),
    managerId: required(userIds, 'work2'),
    analystId: required(userIds, 'work3'),
    objects,
    images,
  };
}

async function seedTasks(context: SeedContext): Promise<void> {
  for (const task of extendedTaskSpecs) {
    const taskId = taskIdFor(task.number);
    const processId = `${suitePrefix}-process-${pad(task.number)}`;
    const createdAt = minutesAfter(suiteStartedAt, task.number * 37);
    await database.process.create({
      data: {
        id: processId,
        type: 'TASK',
        status: task.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
        title: task.title,
        description: `${EXTENDED_TESTDATA_MARKER}: сценарий ${task.number}`,
        startedAt: createdAt,
        finishedAt: task.status === 'COMPLETED' ? minutesAfter(createdAt, 180) : null,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await database.task.create({
      data: {
        id: taskId,
        title: task.title,
        description: task.description ?? null,
        location: task.location,
        status: task.status,
        priority: task.priority,
        accessStatus: task.accessStatus,
        position: task.position,
        creatorId: context.managerId,
        assigneeId: context.workerId,
        processId,
        objectId: required(context.objects, task.objectKey),
        completedAt: task.status === 'COMPLETED' ? minutesAfter(createdAt, 360) : null,
        deletedAt: task.deleted ? minutesAfter(createdAt, 60) : null,
        deletedByUserId: task.deleted ? context.managerId : null,
        deletionReason: task.deleted ? 'Задача создана для неверного помещения' : null,
        creationOperationId: `${EXTENDED_TESTDATA_MARKER}:TASK:${pad(task.number)}`,
        isWorkBlocked: task.blocked ?? false,
        workBlockedAt: task.blocked ? minutesAfter(createdAt, 90) : null,
        workBlockedByUserId: task.blocked ? context.managerId : null,
        createdAt,
        updatedAt: minutesAfter(createdAt, task.number === 18 ? 120 : 1),
      },
    });

    await createEvent({
      key: `task-${pad(task.number)}-created`,
      type: 'TASK_CREATED',
      actorId: context.managerId,
      taskId,
      objectId: required(context.objects, task.objectKey),
      createdAt,
      payload: { action: 'TASK_CREATED', title: task.title, assigneeId: context.workerId },
    });

    for (let index = 0; index < task.steps.length; index += 1) {
      const item = task.steps[index];
      const stepId = stepIdFor(task.number, index + 1);
      const status = item.status ?? 'CREATED';
      await database.taskStep.create({
        data: {
          id: stepId,
          taskId,
          title: item.title,
          description: item.description,
          status,
          order: index + 1,
          startedAt: status !== 'CREATED' ? minutesAfter(createdAt, 15 + index * 20) : null,
          completedAt: status === 'COMPLETED' ? minutesAfter(createdAt, 30 + index * 20) : null,
          completedByUserId: status === 'COMPLETED' ? context.workerId : null,
          minimumPhotoCount: 2,
          completionOperationId:
            status === 'COMPLETED'
              ? `${EXTENDED_TESTDATA_MARKER}:STEP:${task.number}:${index + 1}`
              : null,
          deletedAt: item.deleted ? minutesAfter(createdAt, 80) : null,
          deletedByUserId: item.deleted ? context.managerId : null,
          deletionReason: item.deleted
            ? 'Этап исключён после уточнения технического решения'
            : null,
          createdAt: minutesAfter(createdAt, index + 1),
          updatedAt: minutesAfter(createdAt, index + 2),
        },
      });
      await createEvent({
        key: `task-${pad(task.number)}-step-${pad(index + 1)}-created`,
        type: item.deleted
          ? 'STEP_CANCELLED'
          : status === 'COMPLETED'
            ? 'STEP_COMPLETED'
            : 'STEP_CREATED',
        actorId: item.deleted ? context.managerId : context.workerId,
        taskId,
        taskStepId: stepId,
        createdAt: minutesAfter(createdAt, 4 + index),
        payload: {
          action: item.deleted ? 'TASK_STEP_DELETED' : status,
          title: item.title,
          order: index + 1,
        },
      });
    }

    if (task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS' || task.status === 'PAUSED') {
      await createEvent({
        key: `task-${pad(task.number)}-accepted`,
        type: 'TASK_ACCEPTED',
        actorId: context.workerId,
        taskId,
        createdAt: minutesAfter(createdAt, 10),
        payload: { action: 'TASK_ACCEPTED', title: task.title },
      });
    }
    if (task.status === 'IN_PROGRESS' || task.status === 'PAUSED') {
      await createEvent({
        key: `task-${pad(task.number)}-started`,
        type: 'TASK_STARTED',
        actorId: context.workerId,
        taskId,
        createdAt: minutesAfter(createdAt, 20),
        payload: { action: 'TASK_STARTED', title: task.title },
      });
    }
    if (task.deleted) {
      await createEvent({
        key: `task-${pad(task.number)}-deleted`,
        type: 'TASK_DELETED',
        actorId: context.managerId,
        taskId,
        createdAt: minutesAfter(createdAt, 60),
        payload: { action: 'TASK_DELETED', reason: 'Задача создана для неверного помещения' },
      });
    }
    if (task.status === 'COMPLETED') {
      await createEvent({
        key: `task-${pad(task.number)}-completed`,
        type: 'TASK_COMPLETED',
        actorId: context.workerId,
        taskId,
        createdAt: minutesAfter(createdAt, 360),
        payload: { action: 'TASK_COMPLETED', title: task.title },
      });
    }
    if (task.number === 18) await seedEditedTaskEvents(context, taskId, createdAt);
    await seedTaskPhotos(context, task, createdAt);
  }
}

async function seedTaskPhotos(
  context: SeedContext,
  task: ExtendedTaskSpec,
  createdAt: Date,
): Promise<void> {
  let photoIndex = 0;
  for (let index = 0; index < task.referencePhotos; index += 1) {
    photoIndex += 1;
    await createPhoto(context, {
      key: `task-${pad(task.number)}-reference-${pad(index + 1)}`,
      taskId: taskIdFor(task.number),
      createdAt: minutesAfter(createdAt, 100 + photoIndex),
      imageIndex: imageIndexFor(task.number, index),
      uploaderId: context.managerId,
    });
  }
  for (let stepIndex = 0; stepIndex < task.steps.length; stepIndex += 1) {
    const count = task.steps[stepIndex].photoCount ?? 0;
    for (let index = 0; index < count; index += 1) {
      photoIndex += 1;
      await createPhoto(context, {
        key: `task-${pad(task.number)}-step-${pad(stepIndex + 1)}-${pad(index + 1)}`,
        taskId: taskIdFor(task.number),
        taskStepId: stepIdFor(task.number, stepIndex + 1),
        createdAt: minutesAfter(createdAt, 100 + photoIndex),
        imageIndex: imageIndexFor(task.number, index + stepIndex),
        uploaderId: context.workerId,
      });
    }
  }
}

async function seedMessages(context: SeedContext): Promise<void> {
  const messages = [
    [
      9,
      'HELP_REQUEST',
      'Нужна консультация по выбору профиля для декоративной подсветки.',
      null,
      false,
    ],
    [
      3,
      'HELP_REQUEST',
      'Проверьте, пожалуйста, согласованные места установки оборудования.',
      null,
      true,
    ],
    [
      9,
      'PAUSE_REQUEST',
      'Не утверждён окончательный тип светильника и цветовая температура.',
      null,
      false,
    ],
    [10, 'PAUSE_REQUEST', 'Не совпадает высота установки с последней схемой.', null, true],
    [
      10,
      'MANAGER_REPLY',
      'Использовать отметку 2200 мм от чистого пола. Работу продолжить.',
      'CONTINUE',
      true,
    ],
    [11, 'PAUSE_REQUEST', 'Оборудование не соответствует спецификации.', null, true],
    [11, 'MANAGER_REPLY', 'Работу не продолжать. Ожидать замену оборудования.', 'STOP', false],
    [
      18,
      'TASK_UPDATED',
      'Задача изменена. Ознакомьтесь с обновлённым описанием и этапами.',
      null,
      false,
    ],
    [18, 'TASK_UPDATED', 'Уточнённые технические решения получены и просмотрены.', null, true],
    [4, 'TASK_UPDATED', 'Назначена срочная задача по аварийному освещению.', null, false],
    [5, 'TASK_UPDATED', 'Закрытая задача будет открыта после получения допуска.', null, true],
    [
      12,
      'HELP_REQUEST',
      'Требуется уточнить последовательность работ по кабельным линиям, креплениям, маркировке и передаче помещения, поскольку часть смежных работ выполняется параллельно.',
      null,
      false,
    ],
    [8, 'HELP_REQUEST', 'Проверьте второй этап.', null, true],
    [
      15,
      'TASK_UPDATED',
      'Для завершения текущего этапа необходимо добавить ещё одну фотографию.',
      null,
      false,
    ],
  ] as const;
  for (let index = 0; index < messages.length; index += 1) {
    const [taskNumber, kind, body, decision, read] = messages[index];
    const senderIsManager = kind === 'MANAGER_REPLY' || kind === 'TASK_UPDATED';
    const taskStepId =
      taskNumber === 10 || taskNumber === 11 || taskNumber === 15
        ? stepIdFor(taskNumber, taskNumber === 15 ? 2 : 1)
        : null;
    await database.taskMessage.create({
      data: {
        id: `${suitePrefix}-message-${pad(index + 1)}`,
        taskId: taskIdFor(taskNumber),
        taskStepId,
        senderId: senderIsManager ? context.managerId : context.workerId,
        recipientId: senderIsManager ? context.workerId : context.managerId,
        kind,
        body,
        decision,
        readAt: read ? minutesAfter(suiteStartedAt, 3000 + index) : null,
        createdAt: minutesAfter(suiteStartedAt, 2900 + index * 13),
      },
    });
  }

  await seedPauseHistory(
    context,
    9,
    'Не утверждён окончательный тип светильника и цветовая температура.',
    null,
  );
  await seedPauseHistory(
    context,
    10,
    'Не совпадает высота установки с последней схемой.',
    'Использовать отметку 2200 мм от чистого пола. Работу продолжить.',
  );
  await seedPauseHistory(
    context,
    11,
    'Оборудование не соответствует спецификации.',
    'Работу не продолжать. Ожидать замену оборудования.',
  );
}

async function seedPauseHistory(
  context: SeedContext,
  taskNumber: number,
  reason: string,
  reply: string | null,
): Promise<void> {
  await createEvent({
    key: `task-${pad(taskNumber)}-paused`,
    type: 'TASK_PAUSED',
    actorId: context.workerId,
    taskId: taskIdFor(taskNumber),
    createdAt: minutesAfter(suiteStartedAt, 2600 + taskNumber),
    payload: { action: 'TASK_PAUSED', reason },
  });
  if (reply) {
    await createEvent({
      key: `task-${pad(taskNumber)}-manager-reply`,
      type: 'MANAGER_REPLY',
      actorId: context.managerId,
      taskId: taskIdFor(taskNumber),
      createdAt: minutesAfter(suiteStartedAt, 2650 + taskNumber),
      payload: { action: 'MANAGER_REPLY', reply },
    });
  }
}

async function seedEditedTaskEvents(context: SeedContext, taskId: string, createdAt: Date) {
  const changes = [
    {
      field: 'title',
      before: 'Установить оборудование',
      after: 'Смонтировать оконечное оборудование инженерных систем',
    },
    {
      type: 'STEP_RENAMED',
      before: 'Проверить решения',
      after: 'Проверить уточнённые технические решения',
    },
    { type: 'STEP_ADDED', after: 'Выполнить итоговую проверку' },
    { type: 'STEP_DELETED', before: 'Старый будущий этап' },
    {
      field: 'description',
      before: null,
      after: 'Уточнённое описание монтажа после согласования.',
    },
  ];
  await createEvent({
    key: 'task-18-updated',
    type: 'TASK_UPDATED',
    actorId: context.managerId,
    taskId,
    createdAt: minutesAfter(createdAt, 120),
    payload: {
      action: 'TASK_UPDATED',
      reason:
        'Уточнены технические решения после согласования с заказчиком и генеральным подрядчиком.',
      changes,
    },
  });
  await createEvent({
    key: 'task-18-notification',
    type: 'NOTIFICATION_SENT',
    actorId: context.managerId,
    taskId,
    createdAt: minutesAfter(createdAt, 121),
    payload: { action: 'TASK_UPDATED', recipientId: context.workerId, unread: true, changes },
  });
}

async function seedShifts(context: SeedContext): Promise<void> {
  const shiftSpecs = [
    { hours: 1.25, status: 'APPROVED', overtime: 'PENDING', daysAgo: 12 },
    { hours: 8, status: 'PENDING_APPROVAL', overtime: 'PENDING', daysAgo: 8 },
    { hours: 9.5, status: 'APPROVED', overtime: 'PENDING', daysAgo: 5 },
    { hours: 12, status: 'REJECTED', overtime: 'ADJUSTED', daysAgo: 2 },
  ] as const;
  for (let index = 0; index < shiftSpecs.length; index += 1) {
    const spec = shiftSpecs[index];
    const shiftId = `${suitePrefix}-shift-${pad(index + 1)}`;
    const startedAt = new Date(Date.UTC(2026, 6, 12 - spec.daysAgo, 6, 30));
    const finishedAt = new Date(startedAt.getTime() + spec.hours * 3_600_000);
    const calculation = calculateFinishedShift(startedAt, finishedAt);
    await database.workShift.create({
      data: {
        id: shiftId,
        userId: context.workerId,
        status: WorkShiftStatus.FINISHED,
        startedAt,
        finishedAt,
        createdAt: startedAt,
        updatedAt: finishedAt,
      },
    });
    await database.shiftAccrual.create({
      data: {
        id: `${suitePrefix}-accrual-${pad(index + 1)}`,
        workShiftId: shiftId,
        workerId: context.workerId,
        status: spec.status as ShiftAccrualStatus,
        ...calculation,
        overtimeDecision: spec.overtime,
        analystFinalOvertimeUnits:
          spec.overtime === 'ADJUSTED'
            ? Math.round(calculation.calculatedOvertimeCoinUnits * 0.75)
            : null,
        analystComment:
          spec.overtime === 'ADJUSTED' ? 'Учтена подтверждённая часть переработки.' : null,
        reviewedByUserId: spec.overtime === 'PENDING' ? null : context.analystId,
        reviewedAt: spec.overtime === 'PENDING' ? null : finishedAt,
        approvedByUserId: spec.status === 'APPROVED' ? context.managerId : null,
        approvedAt: spec.status === 'APPROVED' ? minutesAfter(finishedAt, 30) : null,
        rejectionReason: spec.status === 'REJECTED' ? 'Требуется уточнение табеля.' : null,
        createdAt: finishedAt,
        updatedAt: minutesAfter(finishedAt, 30),
      },
    });
    const startEvent = await createEvent({
      key: `shift-${pad(index + 1)}-started`,
      type: 'WORK_SHIFT_STARTED',
      actorId: context.workerId,
      workShiftId: shiftId,
      createdAt: startedAt,
      payload: { action: 'WORK_SHIFT_STARTED', timezone: 'Europe/Moscow' },
    });
    const finishEvent = await createEvent({
      key: `shift-${pad(index + 1)}-finished`,
      type: 'WORK_SHIFT_FINISHED',
      actorId: context.workerId,
      workShiftId: shiftId,
      createdAt: finishedAt,
      payload: { action: 'WORK_SHIFT_FINISHED', durationSeconds: calculation.durationSeconds },
    });
    await createShiftPhoto(context, shiftId, index, 'START', startedAt, startEvent.id);
    await createShiftPhoto(context, shiftId, index, 'FINISH', finishedAt, finishEvent.id);
  }
}

async function seedHistory(context: SeedContext): Promise<void> {
  const types: EventType[] = [
    'USER_LOGGED_IN',
    'TASK_PRIORITY_CHANGED',
    'TASK_ACCESS_CLOSED',
    'TASK_ACCESS_OPENED',
    'HELP_REQUEST',
    'MANAGER_REPLY',
    'NOTIFICATION_READ',
    'COINS_GRANTED',
  ];
  for (let index = 0; index < 32; index += 1) {
    const taskNumber = (index % 18) + 1;
    const type = types[index % types.length];
    await createEvent({
      key: `history-${pad(index + 1)}`,
      type,
      actorId: type === 'MANAGER_REPLY' ? context.managerId : context.workerId,
      taskId: taskIdFor(taskNumber),
      createdAt: minutesAfter(suiteStartedAt, 4000 + index * 7),
      payload: {
        action: type,
        sequence: index + 1,
        workerId: context.workerId,
        note: 'Событие расширенного локального тестового стенда',
      },
    });
  }
}

async function createPhoto(
  context: SeedContext,
  input: {
    key: string;
    taskId?: string;
    taskStepId?: string;
    workShiftId?: string;
    createdAt: Date;
    imageIndex: number;
    uploaderId: string;
    eventId?: string;
  },
): Promise<string> {
  const image = context.images[input.imageIndex % context.images.length];
  const artifactId = `${suitePrefix}-artifact-${input.key}`;
  const storageKey = `${suitePrefix}/${input.key}.${image.extension}`;
  await putObject(storageKey, image.buffer, image.mimeType);
  const event = input.eventId
    ? await database.event.findUniqueOrThrow({ where: { id: input.eventId } })
    : await createEvent({
        key: `photo-${input.key}`,
        type: 'PHOTO_UPLOADED',
        actorId: input.uploaderId,
        taskId: input.taskId,
        taskStepId: input.taskStepId,
        workShiftId: input.workShiftId,
        createdAt: input.createdAt,
        payload: { action: 'PHOTO_UPLOADED', storageKey, fileSize: image.buffer.length },
      });
  await database.artifact.create({
    data: {
      id: artifactId,
      type: 'PHOTO',
      eventId: event.id,
      taskId: input.taskId,
      taskStepId: input.taskStepId,
      workShiftId: input.workShiftId,
      uploadedBy: input.uploaderId,
      storageKey,
      originalFileName: image.fileName,
      mimeType: image.mimeType,
      fileSize: image.buffer.length,
      createdAt: input.createdAt,
    },
  });
  return artifactId;
}

async function createShiftPhoto(
  context: SeedContext,
  shiftId: string,
  shiftIndex: number,
  type: 'START' | 'FINISH',
  capturedAt: Date,
  eventId: string,
): Promise<void> {
  const image =
    context.images[(shiftIndex * 2 + (type === 'START' ? 0 : 1)) % context.images.length];
  const key = `shift-${pad(shiftIndex + 1)}-${type.toLowerCase()}`;
  const artifactId = await createPhoto(context, {
    key,
    workShiftId: shiftId,
    createdAt: capturedAt,
    imageIndex: shiftIndex * 2,
    uploaderId: context.workerId,
    eventId,
  });
  await database.workShiftPhoto.create({
    data: {
      id: `${suitePrefix}-shift-photo-${pad(shiftIndex + 1)}-${type.toLowerCase()}`,
      workShiftId: shiftId,
      artifactId,
      type,
      capturedAt,
      receivedAt: capturedAt,
      source: 'DIRECT_CAMERA_CAPTURE',
      timezone: 'Europe/Moscow',
      width: image.width,
      height: image.height,
      operationId: `${EXTENDED_TESTDATA_MARKER}:SHIFT:${shiftIndex + 1}:${type}`,
      createdAt: capturedAt,
    },
  });
}

async function createEvent(input: {
  key: string;
  type: EventType;
  actorId: string;
  taskId?: string;
  taskStepId?: string;
  workShiftId?: string;
  objectId?: string;
  createdAt: Date;
  payload: Prisma.InputJsonValue;
}) {
  return database.event.create({
    data: {
      id: `${suitePrefix}-event-${input.key}`,
      type: input.type,
      actorId: input.actorId,
      entityType: input.taskStepId
        ? 'task_step'
        : input.taskId
          ? 'task'
          : input.workShiftId
            ? 'work_shift'
            : 'user',
      entityId: input.taskStepId ?? input.taskId ?? input.workShiftId ?? input.actorId,
      objectId: input.objectId,
      taskId: input.taskId,
      taskStepId: input.taskStepId,
      workShiftId: input.workShiftId,
      idempotencyKey: `${EXTENDED_TESTDATA_MARKER}:${input.key}`,
      payload: input.payload,
      metadata: { suite: EXTENDED_TESTDATA_MARKER },
      createdAt: input.createdAt,
    },
  });
}

async function generateImages(): Promise<GeneratedImage[]> {
  const specs = [
    [1200, 800, false, 9],
    [800, 1200, false, 9],
    [900, 900, false, 9],
    [1800, 500, false, 9],
    [500, 1800, false, 9],
    [400, 300, true, 6],
    [800, 650, true, 6],
    [1400, 900, false, 9],
    [1000, 1500, false, 9],
    [1500, 1000, false, 9],
    [1100, 700, true, 6],
    [1500, 1300, true, 0],
  ] as const;
  const images: GeneratedImage[] = [];
  for (let index = 0; index < specs.length; index += 1) {
    const [width, height, noisy, compression] = specs[index];
    const useTrackedJpeg = index === 8 || index === 9;
    const buffer = useTrackedJpeg
      ? await readFile(
          fileURLToPath(
            new URL(
              `../../../demo/public/assets/task-gallery-f0${index === 8 ? '3' : '4'}.jpg`,
              import.meta.url,
            ),
          ),
        )
      : makePng(width, height, index + 1, noisy, compression);
    const extension = useTrackedJpeg ? 'jpg' : 'png';
    if (buffer.length > 8 * 1024 * 1024)
      throw new Error(`Generated image exceeds 8 MiB: ${buffer.length} bytes`);
    images.push({
      buffer,
      fileName: `stroit-test-${pad(index + 1)}.${extension}`,
      extension,
      mimeType: useTrackedJpeg ? 'image/jpeg' : 'image/png',
      width,
      height,
    });
  }
  return images;
}

function makePng(
  width: number,
  height: number,
  seed: number,
  noisy: boolean,
  compression: number,
): Buffer {
  const raw = Buffer.allocUnsafe((width * 4 + 1) * height);
  let random = (0x9e3779b9 ^ seed) >>> 0;
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      const grid =
        (Math.floor(x / Math.max(1, width / 12)) + Math.floor(y / Math.max(1, height / 8))) % 2;
      const noise = noisy ? random & 0xff : 0;
      raw[offset] = (seed * 37 + x / 7 + grid * 55 + noise) & 0xff;
      raw[offset + 1] = (seed * 71 + y / 5 + grid * 20 + (noise >> 1)) & 0xff;
      raw[offset + 2] = (seed * 19 + (x + y) / 9 + grid * 80 + (noise >> 2)) & 0xff;
      raw[offset + 3] = 255;
    }
  }
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: compression })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const exists = await storage.bucketExists(config.minio.bucket);
  if (!exists) await storage.makeBucket(config.minio.bucket);
  await storage.putObject(config.minio.bucket, key, buffer, buffer.length, {
    'Content-Type': contentType,
  });
}

async function cleanSuite(removeObjects: boolean): Promise<void> {
  const [tasks, shifts] = await Promise.all([
    database.task.findMany({
      where: { creationOperationId: { startsWith: `${EXTENDED_TESTDATA_MARKER}:` } },
      select: { id: true, processId: true },
    }),
    database.workShift.findMany({
      where: { id: { startsWith: `${suitePrefix}-shift-` } },
      select: { id: true },
    }),
  ]);
  const taskIds = tasks.map(({ id }) => id);
  const shiftIds = shifts.map(({ id }) => id);
  const artifacts = await database.artifact.findMany({
    where: {
      OR: [
        { storageKey: { startsWith: `${suitePrefix}/` } },
        { taskId: { in: taskIds } },
        { workShiftId: { in: shiftIds } },
      ],
    },
    select: { id: true, eventId: true, storageKey: true },
  });
  if (removeObjects) {
    for (const { storageKey } of artifacts)
      await storage.removeObject(config.minio.bucket, storageKey).catch(() => undefined);
  }
  await database.$transaction(async (tx) => {
    await tx.workShiftPhoto.deleteMany({ where: { workShiftId: { in: shiftIds } } });
    await tx.artifact.deleteMany({ where: { id: { in: artifacts.map(({ id }) => id) } } });
    await tx.taskMessage.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.shiftAccrual.deleteMany({ where: { workShiftId: { in: shiftIds } } });
    await tx.workShift.deleteMany({ where: { id: { in: shiftIds } } });
    await tx.event.deleteMany({
      where: {
        OR: [
          { idempotencyKey: { startsWith: `${EXTENDED_TESTDATA_MARKER}:` } },
          { taskId: { in: taskIds } },
          { workShiftId: { in: shiftIds } },
          { id: { in: artifacts.map(({ eventId }) => eventId) } },
        ],
      },
    });
    await tx.task.deleteMany({
      where: { creationOperationId: { startsWith: `${EXTENDED_TESTDATA_MARKER}:` } },
    });
    await tx.process.deleteMany({ where: { id: { in: tasks.map(({ processId }) => processId) } } });
  });
}

async function collectSuiteCounts() {
  const [tasks, events, messages, shifts, artifacts, objects] = await Promise.all([
    database.task.count({
      where: { creationOperationId: { startsWith: `${EXTENDED_TESTDATA_MARKER}:` } },
    }),
    database.event.count({
      where: { idempotencyKey: { startsWith: `${EXTENDED_TESTDATA_MARKER}:` } },
    }),
    database.taskMessage.count({ where: { id: { startsWith: `${suitePrefix}-` } } }),
    database.workShift.count({ where: { id: { startsWith: `${suitePrefix}-` } } }),
    database.artifact.count({ where: { storageKey: { startsWith: `${suitePrefix}/` } } }),
    database.constructionObject.count({ where: { slug: { startsWith: 'ext-test-' } } }),
  ]);
  return {
    tasks,
    events,
    messages,
    shifts,
    artifacts,
    markedObjectsPreserved: objects,
    usersPreserved: 3,
  };
}

async function verifySuite(context: SeedContext) {
  const counts = await collectSuiteCounts();
  const activeTasks = await database.task.findMany({
    where: {
      assigneeId: context.workerId,
      creationOperationId: { startsWith: `${EXTENDED_TESTDATA_MARKER}:` },
      deletedAt: null,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    select: { position: true },
  });
  if (counts.tasks !== extendedTaskSpecs.length)
    throw new Error(`Expected 18 tasks, found ${counts.tasks}`);
  if (new Set(activeTasks.map(({ position }) => position)).size !== activeTasks.length)
    throw new Error('Active positions are not unique');
  const maximumPhotos = await database.artifact.count({ where: { taskId: taskIdFor(14) } });
  if (maximumPhotos !== 12) throw new Error(`Task 14 must have 12 photos, found ${maximumPhotos}`);
  const heavy = context.images.at(-1);
  if (!heavy || heavy.buffer.length > 8 * 1024 * 1024)
    throw new Error('Heavy image verification failed');
  const stepPhotoCount = await database.artifact.count({ where: { taskStepId: stepIdFor(15, 2) } });
  if (stepPhotoCount !== 1) throw new Error('Task 15 current step must contain exactly one photo');
  const finishedOrDeleted = await database.task.count({
    where: {
      id: { in: [taskIdFor(16), taskIdFor(17)] },
      OR: [{ completedAt: { not: null } }, { deletedAt: { not: null } }],
    },
  });
  if (finishedOrDeleted !== 2) throw new Error('Archive and soft-delete scenarios are incomplete');
  return {
    marker: EXTENDED_TESTDATA_MARKER,
    result: {
      created: counts,
      updated: 3,
      skipped: 0,
      note: 'Marked records were restored to the canonical fixture; only work/work2/work3 profiles were updated.',
    },
    users: extendedTestUsers.map(({ email, role, name }) => ({ email, role, name })),
    ...counts,
    activeTasks: activeTasks.length,
    heavyImageBytes: heavy.buffer.length,
    taskPhotoCounts: extendedTaskSpecs.map((task) => ({
      number: task.number,
      count: expectedTaskPhotoCount(task),
    })),
    status: 'verified',
  };
}

function imageIndexFor(taskNumber: number, photoIndex: number): number {
  if (taskNumber === 13 && photoIndex === 2) return 11;
  return (taskNumber + photoIndex) % 11;
}

function taskIdFor(number: number): string {
  return `${suitePrefix}-task-${pad(number)}`;
}

function stepIdFor(taskNumber: number, stepNumber: number): string {
  return `${suitePrefix}-step-${pad(taskNumber)}-${pad(stepNumber)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function minutesAfter(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function required<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing required map value: ${String(key)}`);
  return value;
}
