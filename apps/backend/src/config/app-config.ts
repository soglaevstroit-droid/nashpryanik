import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type AppEnvironment = 'development' | 'test' | 'production';

export interface AppConfig {
  appName: string;
  environment: AppEnvironment;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  minio: MinioConfig;
}

export interface MinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

const allowedEnvironments = new Set<AppEnvironment>(['development', 'test', 'production']);
const fallbackDatabaseUrl =
  'postgresql://stroit:stroit_dev_password@localhost:5432/stroit_dev?schema=public';
const fallbackJwtSecret = 'stroit-development-jwt-secret-change-before-production';

function parseEnvFile(filePath: string): NodeJS.ProcessEnv {
  const values: NodeJS.ProcessEnv = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');

    values[key] = value;
  }

  return values;
}

function findEnvFile(fileName: string, startDirectory: string = process.cwd()): string | null {
  let currentDirectory = startDirectory;

  while (true) {
    const candidate = join(currentDirectory, fileName);

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

function loadFileEnvironment(): NodeJS.ProcessEnv {
  const localEnvFile = findEnvFile('.env');

  return localEnvFile ? parseEnvFile(localEnvFile) : {};
}

function readEnvironment(value: string | undefined): AppEnvironment {
  if (value && allowedEnvironments.has(value as AppEnvironment)) {
    return value as AppEnvironment;
  }

  return 'development';
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return 3000;
  }

  return port;
}

function readMinioPort(value: string | undefined): number {
  const port = Number(value ?? 9000);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return 9000;
  }

  return port;
}

function readBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const fileEnv = loadFileEnvironment();
  const runtimeEnv = {
    ...fileEnv,
    ...env,
  };

  return {
    appName: runtimeEnv.APP_NAME ?? 'СТРОИТ.РФ',
    environment: readEnvironment(runtimeEnv.ENVIRONMENT ?? runtimeEnv.NODE_ENV),
    port: readPort(runtimeEnv.BACKEND_PORT),
    databaseUrl: runtimeEnv.DATABASE_URL ?? fallbackDatabaseUrl,
    jwtSecret: runtimeEnv.JWT_SECRET ?? fallbackJwtSecret,
    minio: {
      endPoint: runtimeEnv.MINIO_HOST ?? 'localhost',
      port: readMinioPort(runtimeEnv.MINIO_API_PORT),
      useSSL: readBoolean(runtimeEnv.MINIO_USE_SSL),
      accessKey: runtimeEnv.MINIO_ROOT_USER ?? 'stroit_minio',
      secretKey: runtimeEnv.MINIO_ROOT_PASSWORD ?? 'stroit_minio_password',
      bucket: runtimeEnv.MINIO_DEFAULT_BUCKET ?? 'stroit-dev',
    },
  };
}
