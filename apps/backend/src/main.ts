import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { AppLogger } from './logger/app.logger.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(AppLogger);
  const config = app.get(AppConfigService);

  app.useLogger(logger);
  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  await app.listen(config.port);
  logger.log(`Backend foundation started on port ${config.port}`);
}

void bootstrap();
