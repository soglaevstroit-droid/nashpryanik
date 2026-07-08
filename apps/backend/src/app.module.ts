import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { EventModule } from './events/event.module.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from './logger/logger.module.js';
import { ProcessModule } from './processes/process.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    CommonModule,
    DatabaseModule,
    HealthModule,
    EventModule,
    ProcessModule,
  ],
})
export class AppModule {}
