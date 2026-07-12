import { Role } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ArtifactStorageService } from '../artifacts/artifact-storage.service.js';
import { PasswordService } from '../auth/password.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { DatabaseService } from './database.service.js';

const demoWorkerName = process.env.DEMO_WORKER_NAME ?? 'Илья Н.';
const demoWorkerEmail = readRequiredEnv('DEMO_WORKER_EMAIL').toLowerCase();
const demoWorkerPassword = readRequiredEnv('DEMO_WORKER_PASSWORD');

assertLoginIdentifier(demoWorkerEmail);
assertPassword(demoWorkerPassword);

const database = new DatabaseService(new AppConfigService());
const artifactStorage = new ArtifactStorageService(new AppConfigService());
const passwords = new PasswordService();

try {
  const existingUser = await database.user.findUnique({
    where: {
      email: demoWorkerEmail,
    },
  });

  const worker = existingUser
    ? await database.user.update({
        where: {
          email: demoWorkerEmail,
        },
        data: {
          passwordHash: passwords.hashPassword(demoWorkerPassword),
          name: demoWorkerName,
          role: Role.WORKER,
          isActive: true,
          openingBalanceCoinUnits: 2_378_000,
        },
      })
    : await database.user.create({
        data: {
          email: demoWorkerEmail,
          passwordHash: passwords.hashPassword(demoWorkerPassword),
          role: Role.WORKER,
          name: demoWorkerName,
          isActive: true,
          openingBalanceCoinUnits: 2_378_000,
        },
      });

  console.log(`Demo worker ready: ${worker.email} (${worker.role}, active=${worker.isActive})`);
  await seedReviewUsers();
  await resetDemoAccruals(worker.id);
  await seedWorkerDemo(worker.id, worker.name ?? 'Илья Н.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Failed to bootstrap demo worker.');
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}

async function resetDemoAccruals(workerId: string): Promise<void> {
  await database.shiftAccrual.updateMany({
    where: { workerId, status: { in: ['PENDING_APPROVAL', 'APPROVED'] } },
    data: {
      status: 'REJECTED',
      rejectionReason: 'Local demo bootstrap reset',
      approvedByUserId: null,
      approvedAt: null,
    },
  });
}

async function seedReviewUsers(): Promise<void> {
  for (const user of [
    { email: 'finance', name: 'Локальный финансист', role: Role.FINANCE },
    { email: 'analyst', name: 'Локальный аналитик', role: Role.ANALYST },
  ]) {
    await database.user.upsert({
      where: { email: user.email },
      update: {
        passwordHash: passwords.hashPassword(demoWorkerPassword),
        name: user.name,
        role: user.role,
        isActive: true,
      },
      create: {
        email: user.email,
        passwordHash: passwords.hashPassword(demoWorkerPassword),
        name: user.name,
        role: user.role,
        isActive: true,
      },
    });
  }
}

async function seedWorkerDemo(workerId: string, actorName: string): Promise<void> {
  const objects = [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Пряник', slug: 'pryanik', sortOrder: 1 },
    {
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Бауманка',
      slug: 'baumanka',
      sortOrder: 2,
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      name: 'Якиманка',
      slug: 'yakimanka',
      sortOrder: 3,
    },
  ];
  for (const object of objects) {
    await database.constructionObject.upsert({
      where: { slug: object.slug },
      update: { name: object.name, sortOrder: object.sortOrder, isActive: true },
      create: object,
    });
  }
  const tasks = [
    [
      '20000000-0000-4000-8000-000000000001',
      0,
      'Подготовить основание стен для последующей обшивки ГКЛ',
      'ASSIGNED',
      5,
    ],
    ['20000000-0000-4000-8000-000000000002', 0, 'Собрать каркас перегородки', 'ACCEPTED', 2],
    ['20000000-0000-4000-8000-000000000003', 1, 'Разметить трассу кабеля', 'ASSIGNED', 2],
    ['20000000-0000-4000-8000-000000000004', 1, 'Установить подрозетники', 'IN_PROGRESS', 3],
    [
      '20000000-0000-4000-8000-000000000005',
      2,
      'Проверить комплектность материалов',
      'ASSIGNED',
      1,
    ],
    ['20000000-0000-4000-8000-000000000006', 2, 'Подготовить крепления', 'ACCEPTED', 2],
  ] as const;
  for (const [id, objectIndex, title, status, stepsCount] of tasks) {
    const processId = id.replace(/^2/, '3');
    await database.process.upsert({
      where: { id: processId },
      update: {},
      create: { id: processId, type: 'TASK', status: 'ACTIVE', title },
    });
    await database.task.upsert({
      where: { id },
      update: {
        objectId: objects[objectIndex].id,
        assigneeId: workerId,
        title,
        description:
          id === tasks[0][0]
            ? 'Подготовить помещение и основание стен, проверить кабельные линии и передать результат для последующей обшивки ГКЛ.'
            : `Выполнить задачу «${title}» согласно рабочему заданию.`,
        location: demoTaskLocation(id, objects[objectIndex].name),
        status,
      },
      create: {
        id,
        objectId: objects[objectIndex].id,
        title,
        description:
          id === tasks[0][0]
            ? 'Подготовить помещение и основание стен, проверить кабельные линии и передать результат для последующей обшивки ГКЛ.'
            : `Выполнить задачу «${title}» согласно рабочему заданию.`,
        location: demoTaskLocation(id, objects[objectIndex].name),
        status,
        priority: 'NORMAL',
        creatorId: workerId,
        assigneeId: workerId,
        processId,
      },
    });
    for (let order = 1; order <= stepsCount; order += 1) {
      const stepId = `demo-step-${id}-${order}`;
      const isCompletedDemoStep =
        (id.endsWith('1') && order === 2) || (id.endsWith('4') && order === 1);
      await database.taskStep.upsert({
        where: { id: stepId },
        update: {
          title: demoStepTitle(id, order),
          description: demoStepDescription(id, order),
          order,
          status: isCompletedDemoStep ? 'COMPLETED' : 'CREATED',
          startedAt: isCompletedDemoStep ? new Date() : null,
          completedAt: isCompletedDemoStep ? new Date() : null,
        },
        create: {
          id: stepId,
          taskId: id,
          title: demoStepTitle(id, order),
          description: demoStepDescription(id, order),
          order,
          status: isCompletedDemoStep ? 'COMPLETED' : 'CREATED',
          startedAt: isCompletedDemoStep ? new Date() : null,
          completedAt: isCompletedDemoStep ? new Date() : null,
        },
      });
    }
  }
  const demoEvents = [
    ['demo-shift-open', 'WORK_SHIFT_STARTED', 'Открыл смену'],
    ['demo-task-accepted', 'TASK_ACCEPTED', 'Принял задачу'],
    ['demo-step-started', 'STEP_STARTED', 'Начал этап'],
    ['demo-photo-added', 'PHOTO_UPLOADED', 'Добавил фотографию'],
    ['demo-step-completed', 'STEP_COMPLETED', 'Завершил этап'],
    ['demo-shift-closed', 'WORK_SHIFT_FINISHED', 'Закрыл смену'],
  ] as const;
  for (let index = 0; index < demoEvents.length; index += 1) {
    const [key, type, action] = demoEvents[index];
    await database.event.upsert({
      where: { idempotencyKey: key },
      update: {},
      create: {
        type,
        actorId: workerId,
        taskId: index > 0 && index < 5 ? tasks[1][0] : null,
        objectId: index > 0 && index < 5 ? objects[0].id : null,
        idempotencyKey: key,
        entityType: 'demo',
        payload: { action },
        metadata: {
          actorName,
          objectName: index > 0 && index < 5 ? objects[0].name : null,
          taskTitle: index > 0 && index < 5 ? tasks[1][2] : null,
        },
        createdAt: new Date(Date.now() - (demoEvents.length - index) * 60_000),
      },
    });
  }
  await seedPhotoSliderDemoData(workerId);
}

async function seedPhotoSliderDemoData(workerId: string): Promise<void> {
  await database.artifact.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'demo-event-' } },
        {
          id: {
            in: [
              'reference-task-photo-1',
              'reference-task-photo-2',
              'reference-task-photo-3',
              'reference-task-photo-portrait',
              'reference-step-photo-1',
            ],
          },
        },
      ],
    },
  });
  const assets = [
    'task-gallery-f03.jpg',
    'task-gallery-f04.jpg',
    'task-gallery-f05.jpg',
    'login-facade.jpg',
  ];
  const assetFiles = [];
  for (const fileName of assets) {
    const buffer = await readFile(resolve(process.cwd(), '../demo/public/assets', fileName));
    const storageKey = `demo/photo-slider/${fileName}`;
    await artifactStorage.uploadPhoto(storageKey, {
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
      originalname: fileName,
    });
    assetFiles.push({ fileName, buffer, storageKey });
  }

  const tasks = await database.task.findMany({
    where: { assigneeId: workerId },
    select: { id: true, title: true, objectId: true, steps: { select: { id: true, title: true } } },
  });
  for (const task of tasks) {
    const event = await database.event.upsert({
      where: { idempotencyKey: `demo-task-gallery-${task.id}` },
      update: {},
      create: {
        type: 'PHOTO_UPLOADED',
        actorId: workerId,
        objectId: task.objectId,
        taskId: task.id,
        idempotencyKey: `demo-task-gallery-${task.id}`,
        entityType: 'task',
        entityId: task.id,
        payload: { action: 'PHOTO_UPLOADED' },
        metadata: { taskTitle: task.title, source: 'demo-photo-slider' },
      },
    });
    await upsertDemoPhotos(
      `task-${task.id}`,
      event.id,
      workerId,
      task.id,
      null,
      assetFiles.slice(0, 2),
    );
    for (const step of task.steps) {
      const stepEvent = await database.event.upsert({
        where: { idempotencyKey: `demo-step-gallery-${step.id}` },
        update: {},
        create: {
          type: 'PHOTO_UPLOADED',
          actorId: workerId,
          objectId: task.objectId,
          taskId: task.id,
          taskStepId: step.id,
          idempotencyKey: `demo-step-gallery-${step.id}`,
          entityType: 'taskStep',
          entityId: step.id,
          payload: { action: 'PHOTO_UPLOADED' },
          metadata: { taskTitle: task.title, stepTitle: step.title, source: 'demo-photo-slider' },
        },
      });
      await upsertDemoPhotos(
        `step-${step.id}`,
        stepEvent.id,
        workerId,
        task.id,
        step.id,
        assetFiles.slice(2, 4),
      );
    }
  }

  const demoEvents = await database.event.findMany({
    where: { actorId: workerId, idempotencyKey: { startsWith: 'demo-' } },
    include: { artifacts: { select: { id: true } } },
  });
  for (const event of demoEvents) {
    if (event.artifacts.length >= 2) continue;
    await upsertDemoPhotos(
      `event-${event.id}`,
      event.id,
      workerId,
      event.taskId,
      event.taskStepId,
      assetFiles.slice(0, 2),
    );
  }
}

async function upsertDemoPhotos(
  prefix: string,
  eventId: string,
  workerId: string,
  taskId: string | null,
  taskStepId: string | null,
  assets: Array<{ fileName: string; buffer: Buffer; storageKey: string }>,
): Promise<void> {
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const id = `demo-${prefix}-photo-${index + 1}`;
    await database.artifact.upsert({
      where: { id },
      update: {
        eventId,
        taskId,
        taskStepId,
        storageKey: asset.storageKey,
        fileSize: asset.buffer.length,
      },
      create: {
        id,
        eventId,
        taskId,
        taskStepId,
        uploadedBy: workerId,
        storageKey: asset.storageKey,
        originalFileName: asset.fileName,
        mimeType: 'image/jpeg',
        fileSize: asset.buffer.length,
      },
    });
  }
}

function demoStepTitle(taskId: string, order: number): string {
  if (!taskId.endsWith('1'))
    return `Этап ${order}: ${order === 1 ? 'осмотреть рабочую зону' : 'выполнить работу'}`;
  return [
    'Уборка помещения',
    'Кабели — стена А',
    'Кабели — стена С',
    'Стекловата — стена А',
    'Передача помещения',
  ][order - 1];
}

function demoTaskLocation(taskId: string, objectName: string): string {
  const index = Number(taskId.at(-1) ?? 1);
  if (objectName === 'Якиманка' && index === 5) return 'Якиманка / Кровля';
  return `${objectName} / Этаж ${2 + index} / Пом. ${310 + index}`;
}

function demoStepDescription(taskId: string, order: number): string {
  if (!taskId.endsWith('1')) return 'Выполнить этап согласно рабочему заданию.';
  return [
    'Выбросить строительный мусор и перенести инструмент аккуратно, без повреждений.',
    'Проверить и подготовить кабельные линии по стене А.',
    'Проверить и подготовить кабельные линии по стене С.',
    'Подготовить основание и уложить материал по стене А.',
    'Проверить результат и передать помещение.',
  ][order - 1];
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for demo worker bootstrap.`);
  }

  return value;
}

function assertLoginIdentifier(value: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/^[a-zA-Z0-9._-]{3,64}$/.test(value)) {
    throw new Error('DEMO_WORKER_EMAIL must be a valid email or login.');
  }
}

function assertPassword(value: string): void {
  if (value.length < 8) {
    throw new Error('DEMO_WORKER_PASSWORD must contain at least 8 characters.');
  }
}
