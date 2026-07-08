export type AppEnvironment = 'development' | 'test' | 'production';

export interface AppConfig {
  appName: string;
  environment: AppEnvironment;
  port: number;
  databaseUrl: string;
}

const allowedEnvironments = new Set<AppEnvironment>(['development', 'test', 'production']);

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

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    appName: env.APP_NAME ?? 'СТРОИТ.РФ',
    environment: readEnvironment(env.ENVIRONMENT ?? env.NODE_ENV),
    port: readPort(env.BACKEND_PORT),
    databaseUrl:
      env.DATABASE_URL ??
      'postgresql://stroit:stroit_dev_password@localhost:5432/stroit_dev?schema=public',
  };
}
