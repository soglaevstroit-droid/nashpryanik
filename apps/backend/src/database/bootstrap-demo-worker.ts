import { Role } from '@prisma/client';
import { PasswordService } from '../auth/password.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { DatabaseService } from './database.service.js';

const demoWorkerName = process.env.DEMO_WORKER_NAME ?? 'Илья';
const demoWorkerEmail = readRequiredEnv('DEMO_WORKER_EMAIL').toLowerCase();
const demoWorkerPassword = readRequiredEnv('DEMO_WORKER_PASSWORD');

assertEmail(demoWorkerEmail);
assertPassword(demoWorkerPassword);

const database = new DatabaseService(new AppConfigService());
const passwords = new PasswordService();

try {
  const existingUser = await database.user.findUnique({
    where: {
      email: demoWorkerEmail,
    },
  });

  if (existingUser) {
    if (existingUser.role !== Role.WORKER || !existingUser.isActive) {
      throw new Error(
        'Demo worker email already exists, but the user is not an active WORKER.',
      );
    }

    const updatedUser = await database.user.update({
      where: {
        email: demoWorkerEmail,
      },
      data: {
        passwordHash: passwords.hashPassword(demoWorkerPassword),
        name: demoWorkerName,
      },
    });

    console.log(
      `Demo worker updated: ${updatedUser.email} (${updatedUser.role}, active=${updatedUser.isActive})`,
    );
  } else {
    const createdUser = await database.user.create({
      data: {
        email: demoWorkerEmail,
        passwordHash: passwords.hashPassword(demoWorkerPassword),
        role: Role.WORKER,
        name: demoWorkerName,
        isActive: true,
      },
    });

    console.log(
      `Demo worker created: ${createdUser.email} (${createdUser.role}, active=${createdUser.isActive})`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Failed to bootstrap demo worker.');
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for demo worker bootstrap.`);
  }

  return value;
}

function assertEmail(value: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('DEMO_WORKER_EMAIL must be a valid email.');
  }
}

function assertPassword(value: string): void {
  if (value.length < 8) {
    throw new Error('DEMO_WORKER_PASSWORD must contain at least 8 characters.');
  }
}
