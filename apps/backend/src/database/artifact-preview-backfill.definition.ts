export interface PreviewBackfillOptions {
  apply: boolean;
  productionApproved: boolean;
  batchSize: number;
  concurrency: number;
}

export function parsePreviewBackfillOptions(args: readonly string[]): PreviewBackfillOptions {
  return {
    apply: args.includes('--apply'),
    productionApproved: args.includes('--production-approved'),
    batchSize: readPositiveOption(args, '--batch-size', 25, 100),
    concurrency: readPositiveOption(args, '--concurrency', 2, 4),
  };
}

export function assertPreviewBackfillExecution(input: {
  environment: string;
  databaseUrl: string;
  minioHost: string;
  productionApproved: boolean;
}): void {
  const database = new URL(input.databaseUrl);
  const localDatabase = ['localhost', '127.0.0.1'].includes(database.hostname);
  const localMinio = ['localhost', '127.0.0.1'].includes(input.minioHost);
  const developmentDatabase = database.pathname.toLowerCase().includes('dev');
  if (input.environment === 'production') {
    if (!input.productionApproved)
      throw new Error('Production artifact preview backfill requires --production-approved.');
    if (!localDatabase || !localMinio)
      throw new Error('Production artifact preview backfill requires local database and MinIO.');
    return;
  }
  if (!localDatabase || !localMinio || !developmentDatabase)
    throw new Error('Artifact preview backfill is allowed only in local development.');
}

function readPositiveOption(
  args: readonly string[],
  name: string,
  fallback: number,
  maximum: number,
): number {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  return value;
}
