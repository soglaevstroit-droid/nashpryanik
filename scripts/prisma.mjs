import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const envFile = existsSync(resolve(rootDir, '.env')) ? '.env' : '.env.example';
const env = { ...parseEnvFile(resolve(rootDir, envFile)), ...process.env };
const prismaArgs = process.argv.slice(2);

if (prismaArgs.length === 0) {
  console.error('Usage: node scripts/prisma.mjs <command> [...arguments]');
  process.exit(1);
}

const child = spawn(
  'npm',
  [
    'exec',
    '--workspace',
    '@stroit/backend',
    '--',
    'prisma',
    ...prismaArgs,
    '--schema',
    'prisma/schema.prisma',
  ],
  {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error(`Failed to start Prisma CLI: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});

function parseEnvFile(filePath) {
  const result = {};

  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');

    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    result[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }

  return result;
}
