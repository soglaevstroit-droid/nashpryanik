import { Role } from '@prisma/client';
import { PasswordService } from '../auth/password.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { DatabaseService } from './database.service.js';

const demoWorkerName = process.env.DEMO_WORKER_NAME ?? 'Илья Н.';
const demoWorkerEmail = readRequiredEnv('DEMO_WORKER_EMAIL').toLowerCase();
const demoWorkerPassword = readRequiredEnv('DEMO_WORKER_PASSWORD');

assertLoginIdentifier(demoWorkerEmail);
assertPassword(demoWorkerPassword);

const database = new DatabaseService(new AppConfigService());
const passwords = new PasswordService();

try {
  const worker = await ensureUser({
    email: demoWorkerEmail,
    password: demoWorkerPassword,
    name: demoWorkerName,
    role: Role.WORKER,
    openingBalanceCoinUnits: 2_378_000,
  });
  await ensureReviewUsers();
  console.log(`Local users ready: ${worker.email} (${worker.role}, active=${worker.isActive})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Failed to bootstrap local users.');
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}

async function ensureReviewUsers(): Promise<void> {
  for (const user of [
    { email: 'finance', name: 'Локальный финансист', role: Role.FINANCE },
    { email: 'analyst', name: 'Локальный аналитик', role: Role.ANALYST },
    { email: 'manager', name: 'Иван Р.', role: Role.FOREMAN },
  ]) {
    await ensureUser({ ...user, password: demoWorkerPassword });
  }
}

async function ensureUser(input: {
  email: string;
  password: string;
  name: string;
  role: Role;
  openingBalanceCoinUnits?: number;
}) {
  const existing = await database.user.findUnique({ where: { email: input.email } });
  if (existing) return existing;
  return database.user.create({
    data: {
      email: input.email,
      passwordHash: passwords.hashPassword(input.password),
      role: input.role,
      name: input.name,
      isActive: true,
      openingBalanceCoinUnits: input.openingBalanceCoinUnits ?? 0,
    },
  });
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for local user bootstrap.`);
  return value;
}

function assertLoginIdentifier(value: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/^[a-zA-Z0-9._-]{3,64}$/.test(value)) {
    throw new Error('DEMO_WORKER_EMAIL must be a valid email or login.');
  }
}

function assertPassword(value: string): void {
  if (value.length < 8) throw new Error('DEMO_WORKER_PASSWORD must contain at least 8 characters.');
}
